/**
 * Shared domain and reporting types crossed by the DAL's modules and their callers:
 * role/payment/kind unions, entity row shapes (barns, memberships, horses, lessons,
 * agreements, expenses, documents, notifications, barn events), finance/reporting rows,
 * and schedule/calendar item shapes. No runtime code.
 */

/**
 * A real instant (a `TIMESTAMPTZ`) together with the barn it belongs to. Produced only by
 * the DAL, which is the only layer that knows both — so `formatBarnDateTime(instant)` needs
 * no timezone argument, offers no render-mode choice, behaves identically in Server and
 * Client Components, and cannot be called wrong (#1222, which deleted the viewer frame).
 *
 * Only instants that are rendered or compared carry the brand. Audit columns nobody
 * displays (`submitted_at`, `updated_at`, `read_at`, and every `created_at` except
 * `notifications.created_at`, which the notification dropdown does show) stay plain
 * strings; the formatters accept nothing else, so displaying one later forces branding
 * it at the DAL.
 */
export type Instant = { at: string; tz: string }

/**
 * A zoneless calendar day — a `DATE` column (`agreement_charges.period`,
 * `appointments.expense_date`, `agreements.start_date`, a document's `reminder_date`) or a
 * "YYYY-MM-DD" string the calendar views do arithmetic on. The other half of the timezone
 * work `Instant` above started (#1223): "the July 2026 billing period" is a label on a wall
 * calendar, not a moment on the timeline — it has no timezone and must never acquire one.
 * #923 is what happens when a zoneless value gets rendered through a zoned path.
 *
 * While both frames were plain `string`, a function signed `(date: string)` accepted either
 * and the compiler could not object. The brand closes that in one direction only: a
 * `CalendarDate` still flows anywhere a `string` is wanted, so friction appears only where
 * one is *required*.
 *
 * Three mints, and only three — `local-day.ts`'s `calendarDate` (unchecked, for a value the
 * DB already types as `DATE`) and `isValidDateString` (validating, for user input), plus
 * `barn-timezone.ts`'s `barnDay`/`barnToday`. Those are every *conversion* into this frame,
 * which is not the same as every producer: a DAL reader asserting a whole PostgREST row
 * (`data as Agreement`) mints whatever branded fields that row declares, exactly as it
 * already does for `Instant`. Grep the mints to find where an unbranded value earns the
 * brand; the row casts are where the DB's own `DATE` typing is taken at its word.
 */
export type CalendarDate = string & { __brand: 'CalendarDate' }

export type Role = 'manager' | 'trainer' | 'rider'
// Adding a member here means adding a bullet to the Notifications section of every role guide
// whose members can receive it — USER_GUIDE_MANAGER.md, USER_GUIDE_TRAINER.md, USER_GUIDE_RIDER.md.
// Nothing else enforces this: CLAUDE.md's User Guides rule fires on UI-impacting changes, and a new
// notification type changes no route, so it slips through (#1471 — five bullets were missing).
export type NotificationType =
  | 'outstanding_payment'
  | 'lesson_cancelled'
  | 'rider_participation_cancelled'
  | 'incomplete_profile'
  | 'member_incomplete_profile'
  | 'recurring_series_stopped'
  | 'recurring_lesson_horse_unavailable'
  | 'expense_past_due'
  | 'instructor_lesson_nearby'
export type MembershipStatus = 'active'

export interface Profile {
  id: string
  user_id: string | null
  email: string | null
  is_managed: boolean
  first_name: string
  last_name: string
  phone: string | null
  emergency_contact_name: string | null
  emergency_contact_phone: string | null
  photo_path: string | null
  created_at: string
}

export interface Barn {
  id: string
  name: string
  slug: string
  default_instructor_cut: number
  created_at: string
  default_board_fee: number
  exhaustion_threshold_high: number
  exhaustion_threshold_moderate: number
  timezone: string
  is_demo: boolean
  schedule_buffer_minutes: number
  is_test_barn: boolean
}

export interface BarnMembership {
  id: string
  user_id: string | null
  profile_id: string
  barn_id: string
  role: Role
  status: MembershipStatus
  can_instruct: boolean
  invite_token: string | null
  calendar_feed_token: string | null
  created_at: string
}

export interface LessonTier {
  id: string
  barn_id: string
  name: string
  price: number
  is_default: boolean
  is_active: boolean
  created_at: string
  default_exertion_level: number | null
  default_jumping: boolean | null
  instructor_cut: number
}

export interface Horse {
  id: string
  barn_id: string
  name: string
  registered_name: string | null
  is_active: boolean
  is_available: boolean
  unavailability_reason: string | null
  deactivated_at: string | null
  exhaustion_threshold_high: number | null
  exhaustion_threshold_moderate: number | null
  feed_notes: string | null
  medication_notes: string | null
  owning_member_id: string | null
  photo_path: string | null
  photo_uploaded_by: string | null
  created_at: string
  updated_at: string
}

export interface MemberHorsePrivilege {
  id: string
  barn_id: string
  member_id: string
  horse_id: string
  document_privileges: 'none' | 'read' | 'write'
  lesson_read_privileges: boolean
  created_at: string
}


export type LessonType = 'normal' | 'group'
export type PaymentType = 'venmo' | 'zelle' | 'cash' | 'check' | 'freshbooks'
export type TransactionKind =
  | 'lesson_fee'
  | 'rider_cancellation_fee'
  | 'instructor_payout'
  | 'lease_charge'
  | 'board_charge'
  | 'expense'

export interface Lesson {
  id: string
  barn_id: string
  instructor_id: string | null
  fee: number
  lesson_at: string
  submitted_at: string
  lesson_type: LessonType
  jumping: boolean
  tier_name: string
  cancelled_at: string | null
  cancellation_notes: string | null
  series_id: string | null
  instructor_cut: number
}

export interface LessonSeries {
  id: string
  barn_id: string
  instructor_id: string | null
  fee: number
  lesson_type: LessonType
  jumping: boolean
  tier_name: string
  horse_ids: string[]
  exertion_levels: number[]
  rider_ids: string[]
  is_active: boolean
  created_at: string
  instructor_cut: number
}

// The hydrated display shapes brand `lesson_at`; the raw `Lesson` row above keeps the
// plain string PostgREST returns, which is what the write paths and RPCs still deal in.
export interface LessonWithDetails extends Omit<Lesson, 'lesson_at'> {
  lesson_at: Instant
  payment_type: PaymentType | null
  instructor_name: string | null
  horse_names: string[]
  horse_ids: string[]
  horse_count: number
  rider_names: string[]
  rider_ids: string[]
  rider_count: number
  rider_cancelled_ats: (string | null)[]
  needs_attention: boolean
}

export interface LessonDetail extends Omit<Lesson, 'lesson_at'> {
  lesson_at: Instant
  payment_type: PaymentType | null
  instructor_name: string | null
  instructor_user_id: string | null
  lesson_horses: { exertion_level?: number; horse_notes: string | null; horses: { id: string; name: string; is_active?: boolean; is_available?: boolean; unavailability_reason?: string | null } | null }[]
  lesson_riders: { rider_notes: string | null; private_notes: string | null; cancellation_notes: string | null; cancelled_at: string | null; barn_membership: { id: string; name: string; user_id: string | null } | null }[]
}

export interface OutstandingLesson {
  id: string
  barn_id: string
  lesson_at: string
  instructor_name: string | null
  rider_names: string[]
  fee: number
}

export interface FinancialSummary {
  collectedIncome: number
  pendingIncome: number
  breakdown: { tierName: string; price: number | null; lessonCount: number; subtotal: number; instructorCut: number }[]
}

export interface TrainerIncomeSummary {
  trainerId: string
  trainerName: string
  totalIncome: number
  grossIncome: number | null
}

export interface HorseExertionSummary {
  id: string
  name: string
  registered_name: string | null
  is_active: boolean
  is_available: boolean
  unavailability_reason: string | null
  exhaustion_threshold_high: number | null
  exhaustion_threshold_moderate: number | null
  lessonCount: number
  totalExertion: number
  jumpingCount: number
}

export interface HorseIncomeSummary {
  horseId: string
  horseName: string
  totalIncome: number
}

export interface RiderIncomeSummary {
  riderId: string
  riderName: string
  totalIncome: number
}

export interface OutstandingCharge {
  id: string
  agreementId: string
  period: CalendarDate
  kind: AgreementKind
  riderName: string
  fee: number
}

export interface OutstandingCancellationFee {
  id: string // lesson_rider_id — used for the mark-paid action
  lessonId: string // parent lesson id — used for the Outstanding table's link
  lessonAt: string
  instructorName: string | null
  riderName: string
  fee: number
}

interface OutstandingItemBase {
  id: string
  instructorName: string | null
  riderNames: string[]
  fee: number
  linkId?: string // id to link to, when different from `id` — lesson id for cancellation_fee, agreement id for lease/board
}

/**
 * `date` holds two different frames depending on the row's origin, so `itemType`
 * discriminates them: a lesson-derived row's date is a real `lesson_at` instant, while a
 * lease/board row's is `agreement_charges.period`, a zoneless DATE. The union is what lets
 * `OutstandingTable`'s existing per-type branch narrow to the right formatter for free.
 */
export type OutstandingItem =
  | (OutstandingItemBase & { itemType: 'lesson'; date: Instant })
  | (OutstandingItemBase & { itemType: 'cancellation_fee'; date: Instant })
  | (OutstandingItemBase & { itemType: 'lease'; date: CalendarDate })
  | (OutstandingItemBase & { itemType: 'board'; date: CalendarDate })

export type ScheduleItemType = 'lesson' | 'expense' | 'event'

export interface ScheduleItem {
  id: string
  itemType: ScheduleItemType
  /** Barn-local wall clock "YYYY-MM-DDTHH:mm:ss" — NOT a UTC instant. Do not pass
   *  through new Date()/a barn formatter for display; see docs/architecture/dal/schedule.md. */
  start: string
  durationMinutes: number
  instructorId: string | null
  horseIds: string[]
  /** Non-cancelled `lesson_riders` membership ids; always `[]` for expense/event items. */
  riderIds: string[]
  /** Per-horse `lesson_horses.exertion_level`; always `{}` for expense/event items. */
  exertionByHorseId: Record<string, number>
  /** `appointments.applies_to_all_horses` (#1147) — a barn-wide appointment carries no
   *  `appointment_horses` rows at all, so `horseIds` is `[]` and this flag is the only signal
   *  that it concerns every horse. Always `false` for lesson/event items. */
  appliesToAllHorses: boolean
  /** Display text for expense/event items. `null` for lessons — their callers already
   *  hold horse/rider names and compose their own label from those. */
  label: string | null
}

export interface BarnEvent {
  id: string
  barn_id: string
  title: string
  event_at: Instant
  notes: string | null
  visible_to_roles: Role[]
  created_at: string
}

export interface BarnEventInput {
  title: string
  eventAt: string
  notes?: string | null
  visibleToRoles: Role[]
}

export interface HorseChargeDetailRow {
  chargeId: string
  agreementId: string
  period: CalendarDate
  kind: AgreementKind
  fee: number
}

export interface RiderChargeDetailRow {
  chargeId: string
  agreementId: string
  period: CalendarDate
  kind: AgreementKind
  fee: number
}

export interface HorseIncomeDetailRow {
  lessonId: string
  lessonAt: Instant
  fee: number
  horseCount: number
  splitAmount: number
}

export interface RiderIncomeDetailRow {
  lessonId: string
  lessonAt: Instant
  fee: number
  riderCount: number
  splitAmount: number
}

export interface TrainerIncomeDetailRow {
  lessonId: string
  lessonAt: Instant
  fee: number
}

export interface HorseNetIncomeRow {
  horseId: string
  horseName: string
  gross: number
  expenses: number
  net: number
}

export type HorseDocumentType = 'insurance_binder' | 'coggins' | 'shot_record' | 'contract' | 'other'
export type TrainerDocumentType = 'instructor_contract' | 'other'
export type RiderDocumentType = 'liability_waiver' | 'lease_agreement' | 'boarding_contract' | 'other'

export interface HorseDocument {
  id: string
  barn_id: string
  horse_id: string
  record_type: HorseDocumentType
  storage_path: string
  file_name: string
  file_size: number
  notes: string | null
  reminder_date: CalendarDate | null
  created_at: string
  updated_at: string
}

export interface TrainerDocument {
  id: string
  barn_id: string
  trainer_id: string
  record_type: TrainerDocumentType
  storage_path: string
  file_name: string
  file_size: number
  notes: string | null
  reminder_date: CalendarDate | null
  created_at: string
  updated_at: string
}

export interface RiderDocument {
  id: string
  barn_id: string
  rider_id: string
  record_type: RiderDocumentType
  storage_path: string
  file_name: string
  file_size: number
  notes: string | null
  reminder_date: CalendarDate | null
  created_at: string
  updated_at: string
}

export interface DueDocument {
  id: string
  entity: 'horse' | 'trainer' | 'rider'
  recordType: string
  fileName: string
  reminderDate: CalendarDate
  ownerName: string
  ownerId: string
}

export interface Notification {
  id: string
  user_id: string
  barn_id: string
  type: NotificationType
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  // Branded because `NotificationBell` renders it; `read_at` is never displayed.
  created_at: Instant
}

export type AgreementKind = 'lease' | 'board'
export type AgreementCadence = 'one_time' | 'monthly'

export interface Agreement {
  id: string
  barn_id: string
  rider_id: string
  horse_id: string
  fee: number
  kind: AgreementKind
  cadence: AgreementCadence
  start_date: CalendarDate
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AgreementCharge {
  id: string
  barn_id: string
  agreement_id: string
  period: CalendarDate
  fee: number
  payment_type: PaymentType | null
  created_at: string
}

/** An `agreement_charges` row exactly as the DB holds it — and exactly what the three
 *  charge-writing RPCs (`update_agreement_charge_fee`, `mark_agreement_charge_paid`,
 *  `generate_agreement_charge`, all `RETURNS agreement_charges`) hand back. The rowtype has
 *  had no `payment_type` column since #831; payment type lives on the paired `transactions`
 *  row, which is what `getChargesForAgreement` joins back on to produce a full
 *  `AgreementCharge`. Casting those RPC results to `AgreementCharge` claimed a field the row
 *  never carries, so the first caller to read it would have got `undefined` with no compile
 *  error (#1441). */
export type AgreementChargeRow = Omit<AgreementCharge, 'payment_type'>

/** An `appointments` row exactly as the DB holds it (#1148) — the barn-visible half, with
 *  no money on it. This is what the expense-writing RPCs return. */
export interface Appointment {
  id: string
  barn_id: string
  expense_date: CalendarDate
  expense_time: string | null
  recipient: string
  expense_type: string
  notes: string | null
  applies_to_all_horses: boolean
  created_at: string
  updated_at: string
}

/** An appointment with its `appointment_costs` row flattened back on (#1148). Both fields
 *  are `null` when the appointment isn't priced yet — and also for any caller whose session
 *  can't read `appointment_costs` at all, i.e. a trainer (see `attachCosts` in
 *  `expenses.ts`). The name is unchanged so every manager-facing expense consumer keeps
 *  reading `expense.amount`. */
export interface HorseExpense extends Appointment {
  amount: number | null
  payment_type: PaymentType | null
}

export interface ExpenseWithHorses extends HorseExpense {
  horse_names: string[]
  horse_ids: string[]
}

export interface ScheduledAppointment extends ExpenseWithHorses {
  expense_time: string
}

export interface ExpenseInput {
  // Write inputs stay bare `string` (#1223 scope ruling): a form field is unvalidated text
  // until something checks it, and branding it here would only move the lie earlier.
  expenseDate: string
  expenseTime?: string | null
  amount?: number | null
  recipient: string
  expenseType?: string
  notes?: string | null
  appliesToAllHorses: boolean
  horseIds?: string[]
  paymentType?: PaymentType | null
  occurredAt?: string
}

export interface HorseExpenseSummary {
  horseId: string
  horseName: string
  totalExpenses: number
}

export interface ExpenseFinancialSummary {
  totalExpenses: number
  breakdown: HorseExpenseSummary[]
}

export interface HorseExpenseDetailRow {
  expenseId: string
  expenseDate: CalendarDate
  amount: number
  horseCount: number
  splitAmount: number
}

export interface RecipientExpenseSummary {
  recipient: string
  totalExpenses: number
}

export interface RecipientExpenseDetailRow {
  expenseId: string
  expenseDate: CalendarDate
  expenseType: string
  amount: number
}

export type CalendarFeedItemType = 'lesson' | 'event'

export interface CalendarFeedItem {
  itemType: CalendarFeedItemType
  id: string
  title: string
  startsAt: string // true UTC instant
  durationMinutes: number
  notes: string | null
}

export interface CalendarFeedData {
  valid: boolean
  barnName: string | null
  items: CalendarFeedItem[]
}
