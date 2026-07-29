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
import { createTier } from '@/lib/db/lesson-tiers'
import { createHorse, replaceHorsePhoto } from '@/lib/db/horses'
import { replaceProfilePhoto } from '@/lib/db/profiles'
import { upsertNotification } from '@/lib/db/notifications'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createExpense } from '@/lib/db/expenses'
import { createAgreement } from '@/lib/db/agreements'
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import type {
  Agreement,
  Barn,
  BarnEvent,
  Horse,
  HorseDocumentType,
  HorseExpense,
  Lesson,
  LessonTier,
  Notification,
  NotificationType,
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

export type SeededBarn = { id: string; slug: string; name: string; timezone: string }
export type SeededMember = { membershipId: string; userId: string | null; profileId: string }
export type SeededMembers = Record<E2eRole, SeededMember> & { rider2: SeededMember }

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

/**
 * Day 15 of the UTC month `monthsAgo` back from `now` — Finances is month-scoped, so fixtures
 * are placed by explicit month anchor rather than by day offset. A `past(5)`-style offset
 * silently lands in the previous month whenever the suite runs in the first days of a month,
 * which would read as a once-a-month phantom flake against every month-bucketed assertion.
 *
 * UTC rather than the local calendar (#1151), because that is the framing the thing being
 * asserted against uses: resolveFinancesMonth buckets on getUTCMonth() and formatMonthParam
 * formats from UTC. A local-calendar anchor and the `?month=` a spec navigates to name
 * *different* months for the |UTC offset| hours either side of a month boundary, so the seed
 * lands in one bucket while every navigation asks for another.
 *
 * Don't retry fixing this by pinning a timezone instead. Playwright's `timezoneId` isn't even
 * a candidate — it sets the *browser context's* zone, while these helpers run in the Node
 * runner process during beforeAll seeding, off process.env.TZ. Exporting TZ=UTC from
 * scripts/run-checklist-suite.sh would work, but only for runs that go through that script: a
 * bare `npx playwright test` or an IDE runner would silently get the skew back. Framing the
 * anchors in UTC fixes it at the source, for every caller and every entry point.
 */
export function monthAnchor(monthsAgo: 0 | 1 | 2, now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - monthsAgo, 15))
}

/**
 * An instant inside the UTC month `monthsAgo` back that is guaranteed to already be in the
 * past — day 15 for a prior month, and an hour ago for the current one. Same UTC framing as
 * monthAnchor above, and for the same reason; its month-start clamp is UTC too, so the
 * clamped instant can't land in the previous bucket.
 *
 * ponytail: an hour before `now` can precede the month start when the suite runs within the
 * first hour of a month, so it clamps to the month start instead. That clamped instant is
 * *not* strictly in the past, so a fixture placed there can miss a `< now` filter in that
 * one-hour window. Upgrade path if that ever bites: seed the current-month fixture at the
 * previous month's end and widen the assertion, rather than adding retry logic.
 */
export function pastInstantInMonth(monthsAgo: 0 | 1 | 2, now: Date = new Date()): Date {
  if (monthsAgo > 0) return monthAnchor(monthsAgo, now)
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
  const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  return anHourAgo > startOfMonth ? anHourAgo : startOfMonth
}

/**
 * Schedule-shaped placement (dashboard day navigation), where a month anchor says nothing.
 * Deliberately runner-relative, unlike the two UTC anchors above — day placement is a
 * separate axis, and `goToDaysAhead` navigates barn-relative.
 */
export function daysFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Exactly one of `at`/`monthsAgo`; `monthsAgo` is the month-scoped Finances path. */
export type When = { at: Date; monthsAgo?: never } | { monthsAgo: 0 | 1 | 2; at?: never }

export function resolveWhen(when: When): Date {
  return when.at ?? pastInstantInMonth(when.monthsAgo!)
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
      .insert({ first_name: 'Test', last_name: 'Rider2', is_managed: true })
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
 */
export async function addHorse(
  supabase: SupabaseClient,
  barnId: string,
  name: string,
  opts: HorseOptions = {}
): Promise<Horse> {
  const horse = await createHorse(barnId, name, opts.owningMemberId, supabase)

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
 * That makes this the first caller anywhere to hand wallClockToInstant a non-midnight time,
 * and its single correction is exact only outside a DST transition window: a `time` inside a
 * skipped or repeated hour (e.g. '02:30' on a US spring-forward date) silently resolves an
 * hour off. Harmless for the times fixtures actually pin — don't pin one near a transition.
 *
 * ponytail: this pins the time of day, not the day. goToDaysAhead navigates the dashboard
 * barn-relative while daysFromNow places the instant runner-relative, and the two self-cancel
 * except across a DST transition within an hour of midnight. Upgrade path if that ever bites:
 * give daysFromNow the barn timezone too, rather than special-casing the fixtures.
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
  const when = resolveWhen(opts)
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
  mustSucceed(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', barn.id)
      .eq('lesson_id', lesson.id)
      .in('kind', ['lesson_fee', 'instructor_payout']),
    'mark lesson paid'
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
  mustSucceed(
    await supabase.from('lessons').update(lessonUpdate).eq('id', opts.lessonId).eq('barn_id', barn.id),
    'cancel lesson'
  )
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ cancelled_at: new Date().toISOString(), cancellation_notes: opts.notes ?? null })
      .eq('lesson_id', opts.lessonId)
      .eq('barn_id', barn.id)
      .is('cancelled_at', null),
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
  if (!isLate) {
    mustSucceed(await supabase.from('lessons').update({ fee: 0 }).eq('id', opts.lessonId), 'zero cancelled lesson fee')
  }

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
    mustSucceed(
      await supabase.from('lessons').update({ cancelled_at: new Date().toISOString() }).eq('id', opts.lessonId),
      'cascade lesson cancellation'
    )
  }

  await syncCancellationFee(supabase, barn.id, opts.lessonId, lesson.lesson_type, isLate)
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
  /** Barn-local HH:MM. Omit for a date-only planned expense, which the dashboard excludes. */
  time?: string
  amount?: number
  horseIds?: string[]
}

export async function addExpense(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: ExpenseOptions
): Promise<HorseExpense> {
  // horse_expenses.expense_date is DATE-only and is compared against a barn-timezone
  // wall-clock window (see barns.timezone in docs/architecture/schema.md), so it has to land
  // on the barn's own calendar day, not UTC's.
  const expenseDate = instantToLocalWallClock(resolveWhen(opts), barn.timezone).slice(0, 10)
  return createExpense(
    barn.id,
    {
      expenseDate,
      expenseTime: opts.time,
      recipient: opts.recipient,
      expenseType: opts.expenseType ?? 'Farrier',
      amount: opts.amount,
      appliesToAllHorses: !opts.horseIds,
      horseIds: opts.horseIds,
    },
    supabase
  )
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
  const when = resolveWhen(opts)
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
    mustSucceed(
      await supabase
        .from('transactions')
        .update({ occurred_at: `${period}T00:00:00Z` })
        .eq('agreement_charge_id', charge.id),
      'backdate board charge transaction'
    )
  }

  if (opts.paid) {
    // Looked up rather than threaded out of the board branch above, so this block reads
    // the same for both kinds and stays independent of that branch's own update.
    const charge = mustSucceed<{ id: string }>(
      await supabase.from('agreement_charges').select('id').eq('agreement_id', agreement.id).single(),
      'look up agreement charge to mark paid'
    )
    mustSucceed(
      await supabase
        .from('transactions')
        .update({ collected: true, payment_type: 'venmo' })
        .eq('agreement_charge_id', charge.id),
      'mark agreement charge paid'
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
  barnId: string,
  opts: When & { title: string; notes?: string; visibleToRoles?: Role[] }
): Promise<BarnEvent> {
  return mustSucceed<BarnEvent>(
    await supabase
      .from('barn_events')
      .insert({
        barn_id: barnId,
        title: opts.title,
        event_at: resolveWhen(opts).toISOString(),
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
 * docs/architecture/rpc.md).
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
