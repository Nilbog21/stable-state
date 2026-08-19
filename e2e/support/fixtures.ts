// Shared fixture builders for the checklist e2e suite.
//
// Every domain table is barn_id-scoped under RLS, so each Playwright job — one (spec file ×
// project) pairing — gets total isolation by seeding its own barn (see support/test.ts) rather
// than by coordinating access to a shared one. These builders are the vocabulary those seeds are
// written in, and are also what scripts/seed-test-barn.ts calls — one implementation, two entry
// points.
//
// Every builder takes an injected service-role client, same convention as scripts/.

import { randomUUID } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { type SupabaseClient } from '@supabase/supabase-js'
import { mustSucceed, teardownBarnData } from '@/lib/db/service-role'
import { mustAffect } from './must-affect'
import { createTier } from '@/lib/db/lesson-tiers'
import { getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createHorse, replaceHorsePhoto } from '@/lib/db/horses'
import { replaceProfilePhoto } from '@/lib/db/profiles'
import { upsertNotification } from '@/lib/db/notifications'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createExpense } from '@/lib/db/expenses'
import { createAgreement } from '@/lib/db/agreements'
import { barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import type {
  Agreement,
  Barn,
  BarnEvent,
  Horse,
  HorseDocumentType,
  Appointment,
  Lesson,
  LessonTier,
  Notification,
  NotificationType,
  PaymentType,
  RiderDocumentType,
  Role,
  TrainerDocumentType,
} from '@/lib/db/types'

export const E2E_PASSWORD = 'TestPass123!'

/**
 * The three long-lived auth logins the suite runs as — created once per Supabase project by
 * scripts/e2e-auth-users.ts, never per barn. Per-barn auth users would mean 3+
 * auth.admin.createUser calls per seeded barn per run (the operation most likely to trip
 * Supabase's auth rate limits), and Playwright resolves each project's storageState from a
 * static path before any beforeAll hook runs, so the emails have to be knowable up front.
 */
export const E2E_USERS = {
  manager: { role: 'manager', email: 'manager@e2e.test', firstName: 'Test', lastName: 'Manager' },
  trainer: { role: 'trainer', email: 'trainer@e2e.test', firstName: 'Test', lastName: 'Trainer' },
  rider: { role: 'rider', email: 'rider@e2e.test', firstName: 'Test', lastName: 'Rider' },
} as const

export type E2eRole = keyof typeof E2E_USERS

/**
 * The fourth seeded member — a managed stub, not a login (addMemberships explains why below).
 * Named here rather than inline at its insert so the collision constraint every seeded name is
 * held to can actually be asserted: see fixtures.test.ts's `seeded member names` block.
 *
 * That constraint has two halves, and the second is the one that keeps getting missed (#1284,
 * the third independent report):
 *
 * - **No name may contain another.** Playwright's `hasText`, `getByText` and
 *   `getByRole({ name })` are all substring matchers, so a filter for the shorter of two
 *   overlapping names silently selects both rows.
 * - **No two may share a first-initial-derived form.** `get_calendar_feed` renders
 *   `first_name || ' ' || left(last_name, 1) || '.'`, and no boundary-safe locator defends
 *   against *that* collapse — an expectation derived from one fixture matches the other by
 *   coincidence rather than by derivation, which is an assertion that is true, falsifiable,
 *   mutation-proof, and pointed at the wrong fixture.
 *
 * Both halves bind any name added here or passed to `addManagedMember`. `Sutton` rather than the
 * `Rider2` this was until #1284 — a surname echoing the fixture key reads well and failed *both*
 * halves against the `rider` login at once. Don't name it after the key again; `S` in particular
 * is load-bearing only in that it keeps `Test Rider` < `Test Sutton` < `Test Trainer`, the name
 * ordering checklist-phase4-finances-by-rider.spec.ts's three-way sort table is written against.
 */
export const E2E_STUB_RIDER = { firstName: 'Test', lastName: 'Sutton' } as const

export type SeededBarn = { id: string; slug: string; name: string; timezone: string }
export type SeededMember = { membershipId: string; userId: string | null; profileId: string }
export type SeededMembers = Record<E2eRole, SeededMember> & { rider2: SeededMember }

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Day 15 of the *barn's* month `monthsAgo` back from `now` — Finances is month-scoped, so
 * fixtures are placed by explicit month anchor rather than by day offset. A `past(5)`-style
 * offset silently lands in the previous month whenever the suite runs in the first days of a
 * month, which would read as a once-a-month phantom flake against every month-bucketed
 * assertion.
 *
 * Barn-framed since #1360, when resolveFinancesMonth stopped resolving "now" from the host's
 * UTC clock and started resolving it through barnToday — same reasoning as daysFromNow below:
 * the anchor is placed in the frame the thing being asserted against resolves in, so the two
 * agree outright rather than by cancellation. Every zone in BARN_TIMEZONES is behind UTC, so a
 * UTC-framed anchor names *next* month for the 4-5 hours each month after UTC rolls over and
 * the barn hasn't, while resolveFinancesMonth's upper bound clamps the matching `?month=` back
 * down to the barn's — the seed lands in one bucket and every navigation asks for another.
 *
 * The returned Date is still a UTC midnight, and deliberately so: its *digits* are the barn's
 * month, which is the frame formatMonthParam reads and resolveFinancesMonth's
 * startDate/endDate are in. Only the choice of month moved.
 *
 * Don't retry fixing this by pinning the runner's zone instead. Playwright's `timezoneId`
 * isn't even a candidate — it sets the *browser context's* zone, while these helpers run in
 * the Node runner process during beforeAll seeding, off process.env.TZ. Exporting TZ from
 * scripts/run-checklist-suite.sh would work, but only for runs that go through that script: a
 * bare `npx playwright test` or an IDE runner would silently get the skew back. Taking the
 * barn's zone as an argument fixes it at the source, for every caller and every entry point.
 */
export function monthAnchor(monthsAgo: 0 | 1 | 2, timezone: string, now: Date = new Date()): Date {
  const [year, month] = barnToday(timezone, now).split('-').map(Number)
  return new Date(Date.UTC(year, month - 1 - monthsAgo, 15))
}

/**
 * An instant inside the barn's month `monthsAgo` back that is guaranteed to already be in the
 * past — day 15 for a prior month, and an hour ago for the current one. Same barn framing as
 * monthAnchor above, and for the same reason.
 *
 * Its two clamps are framed differently on purpose, because a fixture placed here is read
 * through two different windows and has to sit in the intersection: lesson and charge
 * transactions bucket on `occurred_at` against the raw UTC-digit month range
 * (lesson-finance-queries.ts, agreement-finances.ts), while addExpense decodes to a barn-local
 * calendar day (expense-finances.ts). So the floor is the barn-local month start — a UTC-digit
 * midnight decodes to the *previous* barn day — and the ceiling is one second before the
 * UTC-digit month end, since the barn-local month end falls outside the transaction range.
 *
 * The ceiling is what the rollover window needs: at 02:00Z on the 1st the barn is still on the
 * 31st, and an unclamped "an hour ago" would be an August instant seeding a July page.
 */
export function pastInstantInMonth(monthsAgo: 0 | 1 | 2, timezone: string, now: Date = new Date()): Date {
  if (monthsAgo > 0) return monthAnchor(monthsAgo, timezone, now)
  const today = barnToday(timezone, now)
  const [year, month] = today.split('-').map(Number)
  const monthStart = wallClockToInstant(`${today.slice(0, 8)}01T00:00:00`, timezone).getTime()
  const monthEnd = Date.UTC(year, month, 1) - 1000
  return new Date(Math.max(monthStart, Math.min(now.getTime() - 60 * 60 * 1000, monthEnd)))
}

/**
 * Schedule-shaped placement (dashboard day navigation), where a month anchor says nothing.
 * Barn-relative, unlike the two UTC anchors above — day placement is a separate axis, and
 * `goToDaysAhead` navigates the dashboard by clicking "Next day" from the *barn's* today, so
 * the seed has to be placed in that same frame (#1221). Was runner-relative until then, which
 * agreed with the dashboard only by cancellation, and stopped agreeing across a DST transition.
 *
 * Lands at barn-local noon rather than carrying the runner's own time of day: noon exists on
 * every calendar day in every zone (a DST transition can skip midnight, never noon), and it
 * keeps a fixture without an explicit `time` well clear of the 23:00-barn-local ordering
 * hazard that forced #1150's callers to pin one.
 *
 * Day arithmetic goes through Date.UTC on the barn's own calendar digits, so a `days` that
 * crosses a transition still names the right calendar day — adding `days × 24h` to an instant
 * would drift by the transition's offset change.
 */
export function daysFromNow(days: number, timezone: string, now: Date = new Date()): Date {
  const [year, month, day] = barnToday(timezone, now).split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
  return wallClockToInstant(`${target}T12:00:00`, timezone)
}

/** Exactly one of `at`/`monthsAgo`; `monthsAgo` is the month-scoped Finances path. */
export type When = { at: Date; monthsAgo?: never } | { monthsAgo: 0 | 1 | 2; at?: never }

export function resolveWhen(when: When, timezone: string): Date {
  return when.at ?? pastInstantInMonth(when.monthsAgo!, timezone)
}

// ---------------------------------------------------------------------------
// Committed test assets
// ---------------------------------------------------------------------------

/**
 * Resolves one of the shared test files committed in scripts/data/ (#1135).
 *
 * Module-relative rather than cwd-relative: a spec's cwd is whatever the runner was invoked
 * from, and `__dirname` (not `import.meta.url`, which Playwright's CJS transform rejects —
 * see teardownBarn's note below) is the only anchor all three consumers agree on.
 *
 * Throws rather than skipping, deliberately unlike seed-barn.ts's existsSync guard — that
 * script runs in production via /demo, where a skipped photo is cosmetic; here a silently
 * skipped upload assertion is a false green, which is strictly worse than no test.
 */
export function assetPath(name: string): string {
  const path = join(__dirname, '..', '..', 'scripts', 'data', name)
  if (!existsSync(path)) {
    throw new Error(`missing test asset scripts/data/${name} — it should be committed; see scripts/data.test.ts`)
  }
  return path
}

// ---------------------------------------------------------------------------
// Run-scoped slugs
// ---------------------------------------------------------------------------

/**
 * Prefix shared by every barn one suite run creates, so run-checklist-suite.sh's exit trap
 * can tear down exactly its own barns and a concurrent run in another worktree is unaffected.
 * The fallback covers a bare `npx playwright test`, which has no runner to set it.
 */
export function runPrefix(): string {
  return process.env.E2E_RUN_PREFIX || `e2e-${process.pid}`
}

/**
 * Playwright's unit of parallel dispatch is (spec file × project), not spec file — a spec greped
 * by more than one project is dispatched once per project — so the project name has to be part
 * of the slug or two jobs race the same `barns_slug_key` insert. `prefix` stays leading so
 * teardown-test-barn.ts's `${prefix}-%` sweep still matches.
 */
export function barnSlugFor(prefix: string, key: string, project: string): string {
  return `${prefix}-${key}-${project}`
}

/**
 * The key a two-barn spec's *second* barn is seeded under (support/test.ts's withSecondBarn).
 *
 * The suffix goes on the key rather than on barn A's finished slug, and that is the whole point
 * of the function. `barnSlugFor` composes `prefix-key-project`, so keying it yields
 * `…-isolation-b-manager` beside `…-isolation-manager` — neither slug contains the other, and
 * neither does the barn *name* createBarn derives from it by capitalising the segments. A
 * `${slugA}-b` suffix would produce exactly the containment hazard E2E_STUB_RIDER states for
 * person names: every Playwright text matcher is substring-based, so a locator for barn A's nav
 * name would select barn B's as well. The run prefix stays leading either way, which is what
 * keeps teardown-test-barn.ts's `${prefix}-%` sweep able to reach a leaked second barn.
 */
export function secondBarnKey(key: string): string {
  return `${key}-b`
}

// ---------------------------------------------------------------------------
// Auth logins
// ---------------------------------------------------------------------------

/** The shape Playwright's `storageState` option takes, and the shape global-setup.ts writes. */
export type AuthStorageState = {
  cookies: {
    name: string
    value: string
    domain: string
    path: string
    expires: number
    httpOnly: boolean
    secure: boolean
    sameSite: 'Lax'
  }[]
  origins: never[]
}

/**
 * A signed-in browser session for `email`, as the `sb-<ref>-auth-token` cookie `@supabase/ssr`
 * reads — global-setup.ts writes one per shared login before any test runs, and #1425's spec
 * mints one for its throwaway login inside a `beforeAll`. One definition, two callers: a second
 * copy of this would produce subtly-wrong auth (a plain-JSON value, standard base64 rather than
 * base64url, the wrong host) that presents as "the app thinks I'm signed out" a long way from
 * the copy that caused it.
 *
 * `authFailureHint` is the caller's own guidance, appended only to a rejected grant. It is a
 * parameter rather than a constant because the two callers' failures have different fixes: a
 * missing *shared* login is repaired by the bootstrap script, and a throwaway login the caller
 * created moments ago is not. The email is always named, which is what makes either actionable.
 */
export async function authStorageState(
  email: string,
  password: string,
  authFailureHint?: string
): Promise<AuthStorageState> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')
  const baseUrl = process.env.E2E_BASE_URL ?? 'http://localhost:3000'

  const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: anonKey },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`auth failed for ${email}: ${await res.text()}${authFailureHint ? `\n${authFailureHint}` : ''}`)
  }
  const session = await res.json()
  // A 200 carrying no user id is what a misconfigured project answers with, and the cookie built
  // from it is one the app silently treats as signed-out rather than rejecting.
  if (!session?.user?.id) throw new Error(`missing user.id in auth response for ${email}`)

  const projectRef = new URL(supabaseUrl).hostname.split('.')[0]

  return {
    cookies: [
      {
        name: `sb-${projectRef}-auth-token`,
        value: 'base64-' + Buffer.from(JSON.stringify(session)).toString('base64url'),
        domain: new URL(baseUrl).hostname,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  }
}

/**
 * The address of a spec file's own throwaway login (#1425). Takes the same three parts
 * `barnSlugFor` does, and for the same reason: Playwright dispatches one job per (spec file ×
 * project), so an address keyed on less than that has two jobs creating and deleting the same
 * auth user underneath each other. `key` is the spec file's own — pass what that file passes
 * `withBarn`. Dropping it and keying on the project alone would make this collide the moment a
 * *second* spec wanted a throwaway login, which the note on `createThrowawayAuthUser` explicitly
 * contemplates.
 *
 * The project name is deliberately not the last token. Local parts are rendered — the nav bar's
 * user menu shows `user.email` — and every Playwright text matcher is substring-based, so a
 * `…-manager@e2e.test` address would contain the `manager@e2e.test` shared login outright. Same
 * containment rule `E2E_STUB_RIDER` states for person names, reaching addresses.
 */
export function throwawayAuthEmail(prefix: string, key: string, project: string): string {
  return `${prefix}-${key}-${project}-invite@e2e.test`
}

/**
 * One auth login, created and destroyed inside a single spec file (#1425).
 *
 * **Why this exists.** Phase 1's invite-claim story needs a user whose profile has *blank*
 * contact fields, so that `/profile/complete` has something to complete. The three shared logins
 * cannot be that user: `scripts/e2e-auth-users.ts` fills `phone` and `emergency_contact_*` on all
 * three, and `profiles` is one global row per `user_id` rather than one per barn — so blanking a
 * shared login's row would race every other spec across the suite's workers and leave the
 * project dirty on a failed run.
 *
 * **Why per-barn auth users still do not exist.** `E2E_USERS`' comment states the constraint and
 * it is unchanged: a login per role per barn would be 3+ `auth.admin.createUser` calls on every
 * seeded barn on every run — the operation most likely to trip Supabase's auth rate limits — and
 * Playwright resolves each project's `storageState` from a static path before any `beforeAll`
 * runs, so the shared addresses have to be knowable up front regardless. One login for one spec
 * file is a different order of magnitude from that, and the distinction is the whole licence for
 * this helper. Reach for it when a spec genuinely needs an identity the shared three cannot be;
 * seeding a managed stub through `addManagedMember` covers everything else and costs no auth call.
 *
 * Creates **no** profile row, and that omission is load-bearing: `claim_managed_member` converts
 * the *stub* profile in place when the claiming user has none — setting `user_id`/`email` and
 * clearing `is_managed`, leaving the contact fields blank. A profile row here would send the
 * claim down its other branch, which deletes the stub and keeps this row's fields instead.
 */
export async function createThrowawayAuthUser(supabase: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password: E2E_PASSWORD,
    email_confirm: true,
  })
  if (error) throw new Error(`create throwaway auth user ${email}: ${error.message}`)
  if (!data?.user) throw new Error(`create throwaway auth user ${email}: no user returned`)
  return data.user.id
}

/**
 * Hands a throwaway login back. Profile row first, then the auth user: `profiles.user_id`
 * cascades from `auth.users`, so deleting the user first would take the profile row with it
 * silently, and a `barn_memberships.profile_id` still pointing at that row would fail the delete
 * from underneath the cascade rather than name it.
 *
 * Both deletes therefore require the claiming membership to be gone already — which is why the
 * caller registers this *after* `withBarn`, whose `afterAll` runs first (support/test.ts states
 * that hooks run in registration order, not reversed).
 *
 * The profile delete matches nothing when the login never claimed an invite, which is the
 * ordinary shape of a run that failed before the claim; a zero-row delete is not an error. That is
 * why it stays on `mustSucceed` rather than `mustAffect` (spec-maintenance rule 5) — and it is the
 * case that keeps the row-count check opt-in at the call site instead of folded into `mustSucceed`.
 */
export async function deleteThrowawayAuthUser(supabase: SupabaseClient, userId: string): Promise<void> {
  mustSucceed(
    await supabase.from('profiles').delete().eq('user_id', userId),
    `delete throwaway profile for ${userId}`
  )
  const { error } = await supabase.auth.admin.deleteUser(userId)
  if (error) throw new Error(`delete throwaway auth user ${userId}: ${error.message}`)
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

export async function createBarn(supabase: SupabaseClient, slug: string): Promise<SeededBarn> {
  const name = slug
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')

  // is_test_barn is what teardown-test-barn.ts requires before it will delete a barn.
  return mustSucceed<SeededBarn>(
    await supabase
      .from('barns')
      .insert({ name, slug, is_test_barn: true })
      .select('id, slug, name, timezone')
      .single(),
    'insert barn'
  )
}

/**
 * Deletes a test barn and everything under it. Nothing here touches auth users — the e2e
 * logins are per project, not per barn, so deleting them would break every other barn on the
 * project, including a concurrent suite run's.
 *
 * Lives here rather than in scripts/teardown-test-barn.ts because that module's
 * `import.meta.url` entry-point guard can't be loaded by Playwright's CJS transform; the
 * script wraps this instead.
 */
export async function teardownBarn(supabase: SupabaseClient, slug: string): Promise<void> {
  // The error is checked, not discarded: a failed lookup and a missing barn are both falsy
  // `data`, and swallowing the former would report a successful teardown while leaking the barn.
  const { data: barn, error } = await supabase
    .from('barns')
    .select('id, is_test_barn')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error(`look up barn "${slug}": ${error.message}`)
  if (!barn) return

  if (!barn.is_test_barn) {
    throw new Error(`barn "${slug}" is not marked as a test barn (is_test_barn=false) — refusing to delete`)
  }
  await teardownBarnData(barn.id, supabase)
  // Stays on mustSucceed (spec-maintenance rule 5): the row's absence is this call's whole goal,
  // so a concurrent teardown of the same slug having got there first is the desired end state and
  // not a defect — nothing downstream depends on *this* call being the one that removed it.
  mustSucceed(await supabase.from('barns').delete().eq('id', barn.id), 'delete barn')
}

/**
 * Gives the three long-lived logins an active membership in this barn, plus a managed-stub
 * second rider (a profile with no auth user). The stub exists so a spec can put barn-wide
 * state — an unpaid lesson, a lease charge — on a rider that the `rider` login can't see,
 * without a fourth auth account to create and rate-limit against.
 */
export async function addMemberships(supabase: SupabaseClient, barnId: string): Promise<SeededMembers> {
  const emails = Object.values(E2E_USERS).map((u) => u.email)
  const profiles = mustSucceed<{ id: string; user_id: string; email: string }[]>(
    await supabase.from('profiles').select('id, user_id, email').in('email', emails),
    'fetch e2e profiles'
  )

  const rows = Object.values(E2E_USERS).map((user) => {
    const profile = profiles.find((p) => p.email === user.email)
    if (!profile) throw new Error(formatMissingProfileError(user.email))
    return {
      user_id: profile.user_id,
      profile_id: profile.id,
      barn_id: barnId,
      role: user.role,
      status: 'active',
      can_instruct: user.role !== 'rider',
    }
  })

  const rider2Profile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: E2E_STUB_RIDER.firstName, last_name: E2E_STUB_RIDER.lastName, is_managed: true })
      .select('id')
      .single(),
    'insert stub rider profile'
  )
  rows.push({
    user_id: null as unknown as string,
    profile_id: rider2Profile.id,
    barn_id: barnId,
    role: 'rider',
    status: 'active',
    can_instruct: false,
  })

  const inserted = mustSucceed<{ id: string; profile_id: string }[]>(
    await supabase.from('barn_memberships').insert(rows).select('id, profile_id'),
    'insert memberships'
  )

  const memberFor = (profileId: string, userId: string | null): SeededMember => {
    const membership = inserted.find((m) => m.profile_id === profileId)
    if (!membership) throw new Error(`insert memberships returned no row for profile ${profileId}`)
    return { membershipId: membership.id, userId, profileId }
  }

  return {
    manager: memberFor(rows[0].profile_id, rows[0].user_id),
    trainer: memberFor(rows[1].profile_id, rows[1].user_id),
    rider: memberFor(rows[2].profile_id, rows[2].user_id),
    rider2: memberFor(rider2Profile.id, null),
  }
}

export function formatMissingProfileError(email: string): string {
  return `no profile for ${email} — run: bash scripts/e2e-auth-users.sh create`
}

export async function addTier(
  supabase: SupabaseClient,
  barnId: string,
  opts: { name: string; price: number; isDefault?: boolean; instructorCut?: number }
): Promise<LessonTier> {
  return createTier(barnId, opts.name, opts.price, opts.isDefault ?? false, null, null, opts.instructorCut ?? 25, supabase)
}

/** The barn's manager membership — every seeded barn has exactly one, created before any horse. */
async function barnManagerMembershipId(supabase: SupabaseClient, barnId: string): Promise<string> {
  const managers = await getActiveMembersWithProfiles(barnId, 'manager', supabase)
  if (managers.length === 0) throw new Error(`barn ${barnId} has no manager to own a horse`)
  return managers[0].membershipId
}

export type HorseOptions = {
  registeredName?: string
  /** false plants the inactive-horse "Needs Attention" path; pair it with a reason. */
  isAvailable?: boolean
  unavailabilityReason?: string
  owningMemberId?: string
  /** Per-horse overrides of the barn defaults — set both or neither (DB CHECK: moderate < high). */
  exhaustionThresholdHigh?: number
  exhaustionThresholdModerate?: number
  feedNotes?: string
  medicationNotes?: string
}

/**
 * `opts` is applied as a second write rather than folded into the insert — createHorse owns
 * the insert (and #997's owner handling), so this stays a thin layer over it rather than a
 * parallel implementation that drifts.
 *
 * `owningMemberId` defaults to the barn's manager (#1549 made `horses.owning_member_id` NOT NULL).
 * That is the owner the app itself would assign — `addHorseAction` passes the acting membership,
 * and only a manager reaches that form — so a spec that doesn't care about ownership gets the
 * state the UI would have produced, and the specs that do care keep overriding it.
 */
export async function addHorse(
  supabase: SupabaseClient,
  barnId: string,
  name: string,
  opts: HorseOptions = {}
): Promise<Horse> {
  const owningMemberId = opts.owningMemberId ?? (await barnManagerMembershipId(supabase, barnId))
  const horse = await createHorse(barnId, name, owningMemberId, supabase)

  const updates: Record<string, unknown> = {}
  if (opts.registeredName !== undefined) updates.registered_name = opts.registeredName
  if (opts.isAvailable !== undefined) updates.is_available = opts.isAvailable
  if (opts.unavailabilityReason !== undefined) updates.unavailability_reason = opts.unavailabilityReason
  if (opts.exhaustionThresholdHigh !== undefined) updates.exhaustion_threshold_high = opts.exhaustionThresholdHigh
  if (opts.exhaustionThresholdModerate !== undefined) updates.exhaustion_threshold_moderate = opts.exhaustionThresholdModerate
  if (opts.feedNotes !== undefined) updates.feed_notes = opts.feedNotes
  if (opts.medicationNotes !== undefined) updates.medication_notes = opts.medicationNotes
  if (Object.keys(updates).length === 0) return horse

  return mustSucceed<Horse>(
    await supabase.from('horses').update(updates).eq('id', horse.id).select().single(),
    'update horse details'
  )
}

/**
 * Pre-seeds a horse's identification photo from a committed asset, so the read-only and
 * replace/remove flows start from real state. Real bytes through the same DAL path the UI
 * uses, so the resulting photo_path survives a createSignedUrl call.
 */
export async function setHorsePhoto(
  supabase: SupabaseClient,
  barn: SeededBarn,
  horseId: string,
  assetName: string
): Promise<{ photoPath: string }> {
  await replaceHorsePhoto(horseId, barn.id, assetFile(assetName), assetExtension(assetName), supabase)
  const horse = mustSucceed<{ photo_path: string }>(
    await supabase.from('horses').select('photo_path').eq('id', horseId).single(),
    'read back horse photo path'
  )
  return { photoPath: horse.photo_path }
}

/** The member-photo mirror of setHorsePhoto — profiles.photo_path, same asset source. */
export async function setMemberPhoto(
  supabase: SupabaseClient,
  barn: SeededBarn,
  profileId: string,
  assetName: string
): Promise<{ photoPath: string }> {
  await replaceProfilePhoto(profileId, barn.id, assetFile(assetName), assetExtension(assetName), supabase)
  const profile = mustSucceed<{ photo_path: string }>(
    await supabase.from('profiles').select('photo_path').eq('id', profileId).single(),
    'read back profile photo path'
  )
  return { photoPath: profile.photo_path }
}

function assetExtension(assetName: string): string {
  return assetName.slice(assetName.lastIndexOf('.') + 1).toLowerCase()
}

function assetFile(assetName: string): File {
  const ext = assetExtension(assetName)
  const type = ext === 'png' ? 'image/png' : ext === 'pdf' ? 'application/pdf' : 'image/jpeg'
  return new File([readFileSync(assetPath(assetName))], assetName, { type })
}

export type LessonOptions = When & {
  instructorId: string | null
  horseIds: string[]
  riderIds: string[]
  fee: number
  /**
   * Barn-local HH:MM, the mirror of ExpenseOptions.time. Omit to keep the seed instant's own
   * time of day — which is the *runner's* clock, so any fixture whose assertion depends on
   * intra-day ordering against an expense has to set this or the two sides are read in
   * different clocks (#1150).
   */
  time?: string
  exertionLevels?: number[]
  tierName?: string
  lessonType?: 'normal' | 'group'
  jumping?: boolean
}

/**
 * The barn-local calendar day of `instant`, recombined with `time`. addExpense derives
 * expense_date the same way — instantToLocalWallClock, sliced to the day — but stops there,
 * because expense_time is a literal wall-clock column while lesson_at is a timestamptz, so
 * only this side has to convert back with wallClockToInstant.
 *
 * Its single correction is exact only outside a DST transition window: a `time` inside a
 * skipped or repeated hour (e.g. '02:30' on a US spring-forward date) silently resolves an
 * hour off. Harmless for the times fixtures actually pin — don't pin one near a transition.
 *
 * This pins the time of day, not the day; daysFromNow above owns the day, and since #1221 it
 * owns it barn-relative, so the two agree outright rather than by cancellation.
 */
function atBarnLocalTime(instant: Date, timezone: string, time: string): Date {
  const day = instantToLocalWallClock(instant, timezone).slice(0, 10)
  return wallClockToInstant(`${day}T${time}:00`, timezone)
}

export async function addUnpaidLesson(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: LessonOptions
): Promise<Lesson> {
  const when = resolveWhen(opts, barn.timezone)
  const lessonAt = opts.time ? atBarnLocalTime(when, barn.timezone, opts.time) : when

  return createLessonWithParticipants(
    {
      barnId: barn.id,
      instructorId: opts.instructorId,
      lessonAt: lessonAt.toISOString(),
      fee: opts.fee,
      horseIds: opts.horseIds,
      exertionLevels: opts.exertionLevels ?? opts.horseIds.map(() => 3),
      riderIds: opts.riderIds,
      lessonType: opts.lessonType ?? 'normal',
      jumping: opts.jumping ?? false,
      tierName: opts.tierName ?? 'Custom',
    },
    supabase
  )
}

/**
 * A lesson whose fee and instructor payout are already collected. Marked after creation
 * rather than at it — create_lesson_with_participants owns transaction creation, so
 * collection is a separate update over the rows it wrote.
 */
export async function addPaidLesson(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: LessonOptions
): Promise<Lesson> {
  const lesson = await addUnpaidLesson(supabase, barn, opts)
  // Exactly two: sync_lesson_transactions upserts a lesson_fee row *and* an instructor_payout row
  // unconditionally, whatever the tier's instructor cut (a zero cut still writes the payout row at
  // amount 0), and each is unique per lesson. A one here means the payout row stopped being written.
  mustAffect(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', barn.id)
      .eq('lesson_id', lesson.id)
      .in('kind', ['lesson_fee', 'instructor_payout'])
      .select('id'),
    'mark lesson paid',
    2
  )
  return lesson
}

/**
 * Cancelled state, planted rather than driven through the UI, so a spec can start from it.
 *
 * The table writes are replayed here rather than delegated to cancel_lesson_with_transactions
 * / cancel_rider_participation: both RPCs authorize inline (manager or instructing trainer,
 * plus self for cancel_rider_participation only) and raise `not_authorized` for a service-role
 * caller, whose auth.uid() is NULL — they have no service-role exception (unlike
 * sync_rider_cancellation_fee, which does, and which still owns the ledger half below so the
 * fee policy isn't reimplemented here).
 */
export async function cancelLesson(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: { lessonId: string; notes?: string; isLate?: boolean }
): Promise<void> {
  const isLate = opts.isLate ?? false
  const lesson = mustSucceed<{ lesson_type: string }>(
    await supabase.from('lessons').select('lesson_type').eq('id', opts.lessonId).eq('barn_id', barn.id).single(),
    'look up lesson to cancel'
  )

  const lessonUpdate: Record<string, unknown> = { cancelled_at: new Date().toISOString(), cancellation_notes: opts.notes ?? null }
  if (!isLate) lessonUpdate.fee = 0
  mustAffect(
    await supabase.from('lessons').update(lessonUpdate).eq('id', opts.lessonId).eq('barn_id', barn.id).select('id'),
    'cancel lesson',
    1
  )
  // No exact count: a normal lesson has one rider and a group lesson has several, and the
  // `cancelled_at IS NULL` filter narrows it further on a lesson a spec already part-cancelled.
  mustAffect(
    await supabase
      .from('lesson_riders')
      .update({ cancelled_at: new Date().toISOString(), cancellation_notes: opts.notes ?? null })
      .eq('lesson_id', opts.lessonId)
      .eq('barn_id', barn.id)
      .is('cancelled_at', null)
      .select('id'),
    'cancel lesson riders'
  )
  await syncCancellationFee(supabase, barn.id, opts.lessonId, lesson.lesson_type, isLate)
}

/**
 * One rider's participation, for the per-rider cancel and group-lesson flows. Returns whether
 * cancelling this rider cascaded the whole lesson to Cancelled — the #741 behavior
 * cancel_rider_participation implements when no active rider is left.
 */
export async function cancelLessonRider(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: { lessonId: string; riderId: string; notes?: string; isLate?: boolean }
): Promise<{ cascaded: boolean }> {
  const isLate = opts.isLate ?? false
  const lesson = mustSucceed<{ lesson_type: string }>(
    await supabase.from('lessons').select('lesson_type').eq('id', opts.lessonId).eq('barn_id', barn.id).single(),
    'look up lesson for rider cancellation'
  )

  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ cancelled_at: new Date().toISOString(), cancellation_notes: opts.notes ?? null })
      .eq('lesson_id', opts.lessonId)
      .eq('barn_id', barn.id)
      .eq('rider_id', opts.riderId)
      .is('cancelled_at', null)
      .select('id')
      .single(),
    'cancel rider participation'
  )
  const remaining = mustSucceed<{ id: string }[]>(
    await supabase
      .from('lesson_riders')
      .select('id')
      .eq('lesson_id', opts.lessonId)
      .eq('barn_id', barn.id)
      .is('cancelled_at', null),
    'count remaining active riders'
  )
  const cascaded = remaining.length === 0
  if (cascaded) {
    mustAffect(
      await supabase
        .from('lessons')
        .update({ cancelled_at: new Date().toISOString() })
        .eq('id', opts.lessonId)
        .select('id'),
      'cascade lesson cancellation',
      1
    )
  }

  // Fee handling is whole-lesson-scoped, so it only fires when this cancellation ends the
  // lesson: a normal lesson always has exactly one rider, and a group lesson qualifies only
  // once the last active one is gone (#1278 — before it, both writes fired for any rider of
  // any lesson type, wiping the fee of a group lesson the remaining riders still rode).
  if (lesson.lesson_type === 'normal' || cascaded) {
    if (!isLate) {
      mustAffect(
        await supabase.from('lessons').update({ fee: 0 }).eq('id', opts.lessonId).select('id'),
        'zero cancelled lesson fee',
        1
      )
    }
    await syncCancellationFee(supabase, barn.id, opts.lessonId, lesson.lesson_type, isLate)
  }
  return { cascaded }
}

async function syncCancellationFee(
  supabase: SupabaseClient,
  barnId: string,
  lessonId: string,
  lessonType: string,
  isLate: boolean
): Promise<void> {
  const { error } = await supabase.rpc('sync_rider_cancellation_fee', {
    p_barn_id: barnId,
    p_lesson_id: lessonId,
    p_lesson_type: lessonType,
    p_is_late: isLate,
  })
  if (error) throw new Error(`sync cancellation fee: ${error.message}`)
}

export type ExpenseOptions = When & {
  recipient: string
  expenseType?: string
  /**
   * Barn-local HH:MM. Omit for a date-only planned expense, which the dashboard excludes
   * unless `showsOnCalendar` is passed `true` — see that field for the all-day case.
   */
  time?: string
  amount?: number
  /**
   * Omit for an expense that is still outstanding: `getOutstandingExpenses` and the card's own
   * Past Due badge both treat a missing payment type as owed, whatever the amount says (#1481).
   * Pass one on any amounted fixture whose amount line is asserted with full-string equality.
   */
  paymentType?: PaymentType
  horseIds?: string[]
  /** The one appointment field a trainer can only see on the detail page, not the card (#1148). */
  notes?: string
  /**
   * #1640 — whether the appointment reaches the dashboard, the month calendar and the `.ics`
   * feed. Defaults to "ticked iff a time was given", which is both the migration's backfill
   * rule and the `expense_time IS NOT NULL` proxy the flag replaced — so every fixture written
   * before the flag existed keeps its old visibility. Pass `true` with no `time` for the
   * all-day case, which nothing could express before.
   */
  showsOnCalendar?: boolean
}

/**
 * What addExpense hands back: the `appointments` row the RPC returned, plus the amount the
 * caller asked for. The amount is echoed rather than read back, because #1148 moved it off
 * the appointment onto `appointment_costs` — and a spec asserting against a seeded figure
 * wants the figure it seeded, not a second round-trip that could only ever agree.
 */
export type SeededAppointment = Appointment & { amount: number | null }

export async function addExpense(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: ExpenseOptions
): Promise<SeededAppointment> {
  // appointments.expense_date is DATE-only and is compared against a barn-timezone
  // wall-clock window (see barns.timezone in docs/architecture/schema.md), so it has to land
  // on the barn's own calendar day, not UTC's.
  const expenseDate = instantToLocalWallClock(resolveWhen(opts, barn.timezone), barn.timezone).slice(0, 10)
  const appointment = await createExpense(
    barn.id,
    {
      expenseDate,
      expenseTime: opts.time,
      recipient: opts.recipient,
      expenseType: opts.expenseType ?? 'Farrier',
      amount: opts.amount,
      paymentType: opts.paymentType,
      notes: opts.notes,
      appliesToAllHorses: !opts.horseIds,
      horseIds: opts.horseIds,
      showsOnCalendar: opts.showsOnCalendar ?? opts.time !== undefined,
    },
    supabase
  )
  return { ...appointment, amount: opts.amount ?? null }
}

/**
 * An unpaid lease charge. `one_time` cadence backdates the charge to the given month — a
 * monthly agreement's first charge is always for the *current* month (see
 * create_agreement_with_first_charge), so it would never read as outstanding.
 *
 * `kind` defaults to `'lease'`; pass `'board'` for a boarding charge. The two are the same
 * `agreement_charges` row shape and differ only in the parent agreement's `kind`, which is
 * what the Outstanding tables render as the row's Type — so a spec that has to distinguish
 * "leases/boarding charges" needs both, and doesn't need a second builder to get one.
 * `'board'` takes a different route to the same place: `CHECK(kind <> 'board' OR cadence =
 * 'monthly')` rules out the `one_time` backdating trick, so the charge is generated for the
 * current month as usual and then has its `period` moved back afterwards.
 *
 * Note for callers placing one of these in Outstanding: `getOutstandingCharges` filters
 * `period < firstOfCurrentMonth`, so a `monthsAgo: 0` charge never reads as outstanding
 * however unpaid it is — use `monthsAgo: 1` or `2`.
 *
 * `paid` marks the charge collected, the mirror of the above: `getPaidCharges` filters
 * `collected = true`, so an unpaid charge is invisible to every income breakdown and
 * drill-down. Marked after creation rather than at it, and by updating the ledger row
 * directly, for the same reasons `addPaidLesson` does — the creating RPC owns transaction
 * creation, and `updateChargePaymentType` takes no injectable client.
 */
export async function addLeaseCharge(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: When & { riderId: string; horseId: string; fee: number; kind?: 'lease' | 'board'; paid?: boolean }
): Promise<Agreement> {
  const isBoard = opts.kind === 'board'
  const when = resolveWhen(opts, barn.timezone)
  const agreement = await createAgreement(
    {
      barnId: barn.id,
      riderId: opts.riderId,
      horseId: opts.horseId,
      fee: opts.fee,
      kind: opts.kind ?? 'lease',
      cadence: isBoard ? 'monthly' : 'one_time',
      startDate: when.toISOString().slice(0, 10),
    },
    supabase
  )

  if (isBoard) {
    // agreement_charges.period is CHECK-pinned to the 1st of its month.
    const period = `${when.toISOString().slice(0, 7)}-01`
    const charge = mustSucceed<{ id: string }>(
      await supabase
        .from('agreement_charges')
        .update({ period })
        .eq('agreement_id', agreement.id)
        .select('id')
        .single(),
      'backdate board charge period'
    )
    // The paired ledger row has to move with it. create_agreement_with_first_charge derives
    // both the charge's period and the transaction's occurred_at from one value, and the
    // income breakdowns bucket by occurred_at while getOutstandingCharges filters on period
    // — leaving occurred_at behind would make this charge read as outstanding in the month
    // it was backdated to but land in the *current* month's income once collected.
    mustAffect(
      await supabase
        .from('transactions')
        .update({ occurred_at: `${period}T00:00:00Z` })
        .eq('agreement_charge_id', charge.id)
        .select('id'),
      'backdate board charge transaction',
      1
    )
  }

  if (opts.paid) {
    // Looked up rather than threaded out of the board branch above, so this block reads
    // the same for both kinds and stays independent of that branch's own update.
    const charge = mustSucceed<{ id: string }>(
      await supabase.from('agreement_charges').select('id').eq('agreement_id', agreement.id).single(),
      'look up agreement charge to mark paid'
    )
    mustAffect(
      await supabase
        .from('transactions')
        .update({ collected: true, payment_type: 'venmo' })
        .eq('agreement_charge_id', charge.id)
        .select('id'),
      'mark agreement charge paid',
      1
    )
  }

  return agreement
}

export type HorseDocumentOptions = {
  recordType: string
  fileName: string
  /** Omit for an undated document — the dashboard's Document Reminders card ignores those. */
  reminderDate?: string
  content?: Buffer
}

/** Mirrors documents.ts's own CONFIG, plus the folder segment documents/new/actions.ts uses. */
const DOCUMENT_ENTITIES = {
  horse: { table: 'horse_documents', idColumn: 'horse_id', folder: 'horses' },
  rider: { table: 'rider_documents', idColumn: 'rider_id', folder: 'riders' },
  trainer: { table: 'staff_documents', idColumn: 'trainer_id', folder: 'trainers' },
} as const

/**
 * The storage object is a real (if tiny) upload, not just a DB row: the detail pages sign a
 * URL for every document row they render, and createSignedUrl errors on a path with nothing
 * stored there. The path shape mirrors documents/new/actions.ts's
 * `${barn_id}/${folder}/${entityId}/…` convention, which storage RLS keys off.
 */
async function addDocument(
  supabase: SupabaseClient,
  barn: SeededBarn,
  entity: keyof typeof DOCUMENT_ENTITIES,
  dbEntityId: string,
  storageEntityId: string,
  opts: HorseDocumentOptions
): Promise<{ storagePath: string }> {
  const { table, idColumn, folder } = DOCUMENT_ENTITIES[entity]
  const storagePath = `${barn.id}/${folder}/${storageEntityId}/${opts.fileName}`
  const content = opts.content ?? Buffer.from('test document')
  mustSucceed(
    await supabase.storage.from('documents').upload(storagePath, content, { contentType: 'application/pdf' }),
    `upload ${entity} document file`
  )
  mustSucceed(
    await supabase.from(table).insert({
      barn_id: barn.id,
      [idColumn]: dbEntityId,
      record_type: opts.recordType,
      storage_path: storagePath,
      file_name: opts.fileName,
      file_size: content.length,
      notes: null,
      reminder_date: opts.reminderDate ?? null,
    }),
    `insert ${entity} document`
  )
  return { storagePath }
}

export async function addHorseDocument(
  supabase: SupabaseClient,
  barn: SeededBarn,
  horseId: string,
  opts: HorseDocumentOptions & { recordType: HorseDocumentType }
): Promise<{ storagePath: string }> {
  return addDocument(supabase, barn, 'horse', horseId, horseId, opts)
}

/**
 * A staff (trainer) document, for Members' Documents section. The DB row keys on the
 * membership id while the storage path keys on the member's own user_id when they have one
 * — the split documents/new/actions.ts makes, so a claimed member's files stay reachable
 * under the self-service storage RLS that checks auth.uid().
 */
export async function addStaffDocument(
  supabase: SupabaseClient,
  barn: SeededBarn,
  member: SeededMember,
  opts: HorseDocumentOptions & { recordType: TrainerDocumentType }
): Promise<{ storagePath: string }> {
  return addDocument(supabase, barn, 'trainer', member.membershipId, member.userId ?? member.membershipId, opts)
}

/** The rider_documents mirror of addStaffDocument. */
export async function addRiderDocument(
  supabase: SupabaseClient,
  barn: SeededBarn,
  member: SeededMember,
  opts: HorseDocumentOptions & { recordType: RiderDocumentType }
): Promise<{ storagePath: string }> {
  return addDocument(supabase, barn, 'rider', member.membershipId, member.userId ?? member.membershipId, opts)
}

/**
 * A managed member stub (a profile with no auth user) plus its invite token — the
 * unclaimed-member pages, and the clickable invite link seed-test-barn makes.
 */
export async function addManagedMember(
  supabase: SupabaseClient,
  barnId: string,
  opts: { firstName: string; lastName: string; role: Role; canInstruct?: boolean }
): Promise<{ membershipId: string; profileId: string; inviteToken: string }> {
  const profile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: opts.firstName, last_name: opts.lastName, is_managed: true })
      .select('id')
      .single(),
    'insert managed stub profile'
  )
  const inviteToken = randomUUID()
  const membership = mustSucceed<{ id: string }>(
    await supabase
      .from('barn_memberships')
      .insert({
        barn_id: barnId,
        profile_id: profile.id,
        role: opts.role,
        status: 'active',
        // create_managed_member sets can_instruct = (p_role = 'trainer'); match it so a
        // managed trainer stub is instructor-capable the way the app's own stubs are.
        can_instruct: opts.canInstruct ?? opts.role === 'trainer',
        invite_token: inviteToken,
      })
      .select('id')
      .single(),
    'insert managed stub membership'
  )
  return { membershipId: membership.id, profileId: profile.id, inviteToken }
}

/**
 * A barn event, for Manage Barn's Barn Events list and the dashboard calendar's interleaving
 * of events with lessons and expenses. Inserted directly rather than through
 * barn-events.ts's createEvent, which takes no injectable client.
 */
export async function addBarnEvent(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: When & { title: string; notes?: string; visibleToRoles?: Role[] }
): Promise<BarnEvent> {
  return mustSucceed<BarnEvent>(
    await supabase
      .from('barn_events')
      .insert({
        barn_id: barn.id,
        title: opts.title,
        event_at: resolveWhen(opts, barn.timezone).toISOString(),
        notes: opts.notes ?? null,
        visible_to_roles: opts.visibleToRoles ?? ['manager', 'trainer', 'rider'],
      })
      .select()
      .single(),
    'insert barn event'
  )
}

/**
 * An unread in-app notification, for the Notifications subsection's badge and list —
 * upsertNotification always writes read_at: null, so there is no already-read variant here.
 * It is the service-role write path — the create_or_update_notification RPC checks
 * auth.uid(), which a service-role client doesn't have (see its entry in
 * docs/architecture/rpc/notifications.md).
 */
export async function addNotification(
  supabase: SupabaseClient,
  opts: { userId: string; barnId: string; type: NotificationType; title: string; body?: string; link?: string }
): Promise<Notification> {
  await upsertNotification(supabase, {
    userId: opts.userId,
    barnId: opts.barnId,
    type: opts.type,
    title: opts.title,
    body: opts.body ?? '',
    link: opts.link ?? '',
  })
  // upsertNotification returns void, so read the row back on the (user_id, barn_id, type)
  // key it upserts on rather than widening the DAL's signature for a fixture's benefit.
  return mustSucceed<Notification>(
    await supabase
      .from('notifications')
      .select()
      .eq('user_id', opts.userId)
      .eq('barn_id', opts.barnId)
      .eq('type', opts.type)
      .single(),
    'read back notification'
  )
}

/** Manage Barn's settings form, planted rather than driven through the UI. */
export async function updateBarnSettings(
  supabase: SupabaseClient,
  barnId: string,
  opts: {
    defaultInstructorCut?: number
    defaultBoardFee?: number
    exhaustionThresholdHigh?: number
    exhaustionThresholdModerate?: number
    scheduleBufferMinutes?: number
    timezone?: string
  }
): Promise<Barn> {
  const updates: Record<string, unknown> = {}
  if (opts.defaultInstructorCut !== undefined) updates.default_instructor_cut = opts.defaultInstructorCut
  if (opts.defaultBoardFee !== undefined) updates.default_board_fee = opts.defaultBoardFee
  if (opts.exhaustionThresholdHigh !== undefined) updates.exhaustion_threshold_high = opts.exhaustionThresholdHigh
  if (opts.exhaustionThresholdModerate !== undefined) updates.exhaustion_threshold_moderate = opts.exhaustionThresholdModerate
  if (opts.scheduleBufferMinutes !== undefined) updates.schedule_buffer_minutes = opts.scheduleBufferMinutes
  if (opts.timezone !== undefined) updates.timezone = opts.timezone

  return mustSucceed<Barn>(
    await supabase.from('barns').update(updates).eq('id', barnId).select().single(),
    'update barn settings'
  )
}
