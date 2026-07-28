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
import { type SupabaseClient } from '@supabase/supabase-js'
import { mustSucceed, teardownBarnData } from '@/lib/db/service-role'
import { createTier } from '@/lib/db/lesson-tiers'
import { createHorse } from '@/lib/db/horses'
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createExpense } from '@/lib/db/expenses'
import { createAgreement } from '@/lib/db/agreements'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import type { Horse, Lesson, LessonTier, HorseExpense, Agreement } from '@/lib/db/types'

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
 * Day 15 of the month `monthsAgo` back from `now` — Finances is month-scoped, so fixtures
 * are placed by explicit month anchor rather than by day offset. A `past(5)`-style offset
 * silently lands in the previous month whenever the suite runs in the first days of a month,
 * which would read as a once-a-month phantom flake against every month-bucketed assertion.
 */
export function monthAnchor(monthsAgo: 0 | 1 | 2, now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth() - monthsAgo, 15)
}

/**
 * An instant inside the month `monthsAgo` back that is guaranteed to already be in the past
 * — day 15 for a prior month, and an hour ago for the current one.
 *
 * ponytail: an hour before `now` can precede the month start when the suite runs within the
 * first hour of a month, so it clamps to the month start instead. That clamped instant is
 * *not* strictly in the past, so a fixture placed there can miss a `< now` filter in that
 * one-hour window. Upgrade path if that ever bites: seed the current-month fixture at the
 * previous month's end and widen the assertion, rather than adding retry logic.
 */
export function pastInstantInMonth(monthsAgo: 0 | 1 | 2, now: Date = new Date()): Date {
  if (monthsAgo > 0) return monthAnchor(monthsAgo, now)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const anHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
  return anHourAgo > startOfMonth ? anHourAgo : startOfMonth
}

/** Schedule-shaped placement (dashboard day navigation), where a month anchor says nothing. */
export function daysFromNow(days: number, now: Date = new Date()): Date {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000)
}

/** Exactly one of `at`/`monthsAgo`; `monthsAgo` is the month-scoped Finances path. */
export type When = { at: Date; monthsAgo?: never } | { monthsAgo: 0 | 1 | 2; at?: never }

export function resolveWhen(when: When): Date {
  return when.at ?? pastInstantInMonth(when.monthsAgo!)
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
 * Playwright's unit of parallel dispatch is (spec file × project), not spec file — four of the
 * five specs are greped by more than one project — so the project name has to be part of the
 * slug or two jobs race the same `barns_slug_key` insert. `prefix` stays leading so
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

export async function addHorse(supabase: SupabaseClient, barnId: string, name: string): Promise<Horse> {
  return createHorse(barnId, name, undefined, supabase)
}

export type LessonOptions = When & {
  instructorId: string | null
  horseIds: string[]
  riderIds: string[]
  fee: number
  exertionLevels?: number[]
  tierName?: string
  lessonType?: 'normal' | 'group'
  jumping?: boolean
}

export async function addUnpaidLesson(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: LessonOptions
): Promise<Lesson> {
  return createLessonWithParticipants(
    {
      barnId: barn.id,
      instructorId: opts.instructorId,
      lessonAt: resolveWhen(opts).toISOString(),
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
 */
export async function addLeaseCharge(
  supabase: SupabaseClient,
  barn: SeededBarn,
  opts: When & { riderId: string; horseId: string; fee: number; kind?: 'lease' | 'board' }
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
    mustSucceed(
      await supabase.from('agreement_charges').update({ period }).eq('agreement_id', agreement.id),
      'backdate board charge period'
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

/**
 * The storage object is a real (if tiny) upload, not just a DB row: the horse detail page
 * signs a URL for every document row it renders, and createSignedUrl errors on a path with
 * nothing stored there. The path shape mirrors documents/new/actions.ts's
 * `${barn_id}/${folder}/${entityId}/…` convention, which storage RLS keys off.
 */
export async function addHorseDocument(
  supabase: SupabaseClient,
  barn: SeededBarn,
  horseId: string,
  opts: HorseDocumentOptions
): Promise<{ storagePath: string }> {
  const storagePath = `${barn.id}/horses/${horseId}/${opts.fileName}`
  const content = opts.content ?? Buffer.from('test document')
  mustSucceed(
    await supabase.storage.from('documents').upload(storagePath, content, { contentType: 'application/pdf' }),
    'upload horse document file'
  )
  mustSucceed(
    await supabase.from('horse_documents').insert({
      barn_id: barn.id,
      horse_id: horseId,
      record_type: opts.recordType,
      storage_path: storagePath,
      file_name: opts.fileName,
      file_size: content.length,
      notes: null,
      reminder_date: opts.reminderDate ?? null,
    }),
    'insert horse document'
  )
  return { storagePath }
}

/** A managed-manager stub plus its invite token, for the clickable barn seed-test-barn makes. */
export async function addManagedManagerInvite(
  supabase: SupabaseClient,
  barnId: string,
  firstName: string,
  lastName: string
): Promise<string> {
  const profile = mustSucceed<{ id: string }>(
    await supabase
      .from('profiles')
      .insert({ first_name: firstName, last_name: lastName, is_managed: true })
      .select('id')
      .single(),
    'insert managed-manager stub profile'
  )
  const inviteToken = randomUUID()
  mustSucceed(
    await supabase.from('barn_memberships').insert({
      barn_id: barnId,
      profile_id: profile.id,
      role: 'manager',
      status: 'active',
      can_instruct: false,
      invite_token: inviteToken,
    }),
    'insert managed-manager stub membership'
  )
  return inviteToken
}
