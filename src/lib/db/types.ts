export type Role = 'manager' | 'trainer' | 'rider'
export type NotificationType =
  | 'outstanding_payment'
  | 'pending_approval'
  | 'lesson_cancelled'
  | 'rider_participation_cancelled'
  | 'incomplete_profile'
  | 'member_incomplete_profile'
  | 'recurring_series_stopped'
  | 'recurring_lesson_horse_unavailable'
  | 'expense_past_due'
export type MembershipStatus = 'active' | 'pending'

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
  is_active: boolean
  is_available: boolean
  unavailability_reason: string | null
  deactivated_at: string | null
  exhaustion_threshold_high: number | null
  exhaustion_threshold_moderate: number | null
  created_at: string
  updated_at: string
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

export interface LessonWithDetails extends Lesson {
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

export interface LessonDetail extends Lesson {
  payment_type: PaymentType | null
  instructor_name: string | null
  instructor_user_id: string | null
  lesson_horses: { exertion_level: number; horse_notes: string | null; horses: { id: string; name: string; is_active?: boolean; is_available?: boolean; unavailability_reason?: string | null } | null }[]
  lesson_riders: { rider_notes: string | null; private_notes: string | null; cancellation_notes: string | null; cancelled_at: string | null; barn_membership: { id: string; name: string; user_id: string | null } | null }[]
}

export interface LessonHorse {
  id: string
  barn_id: string
  lesson_id: string
  horse_id: string
  exertion_level: number
  horse_notes: string | null
}

export interface LessonRider {
  id: string
  barn_id: string
  lesson_id: string
  rider_id: string
  rider_notes: string | null
  private_notes: string | null
  cancellation_notes: string | null
  cancelled_at: string | null
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
  period: string
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

export interface OutstandingItem {
  id: string
  itemType: 'lesson' | 'lease' | 'board' | 'cancellation_fee'
  date: string
  instructorName: string | null
  riderNames: string[]
  fee: number
  linkId?: string // lesson id to link to, when different from `id` (cancellation_fee only)
}

export interface HorseChargeDetailRow {
  chargeId: string
  agreementId: string
  period: string
  kind: AgreementKind
  fee: number
}

export interface RiderChargeDetailRow {
  chargeId: string
  agreementId: string
  period: string
  kind: AgreementKind
  fee: number
}

export interface HorseIncomeDetailRow {
  lessonId: string
  lessonAt: string
  fee: number
  horseCount: number
  splitAmount: number
}

export interface RiderIncomeDetailRow {
  lessonId: string
  lessonAt: string
  fee: number
  riderCount: number
  splitAmount: number
}

export interface TrainerIncomeDetailRow {
  lessonId: string
  lessonAt: string
  fee: number
}

export interface HorseNetIncomeRow {
  horseId: string
  horseName: string
  income: number
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
  reminder_date: string | null
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
  reminder_date: string | null
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
  reminder_date: string | null
  created_at: string
  updated_at: string
}

export interface DueDocument {
  id: string
  entity: 'horse' | 'trainer' | 'rider'
  recordType: string
  fileName: string
  reminderDate: string
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
  created_at: string
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
  start_date: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AgreementCharge {
  id: string
  barn_id: string
  agreement_id: string
  period: string
  fee: number
  payment_type: PaymentType | null
  created_at: string
}

export interface HorseExpense {
  id: string
  barn_id: string
  expense_date: string
  expense_time: string | null
  amount: number | null
  recipient: string
  expense_type: string
  notes: string | null
  applies_to_all_horses: boolean
  payment_type: PaymentType | null
  created_at: string
  updated_at: string
}

export interface ExpenseWithHorses extends HorseExpense {
  horse_names: string[]
  horse_ids: string[]
}

export interface ScheduledExpense extends ExpenseWithHorses {
  expense_time: string
}

export interface ExpenseInput {
  expenseDate: string
  expenseTime?: string | null
  amount?: number | null
  recipient: string
  expenseType?: string
  notes?: string | null
  appliesToAllHorses: boolean
  horseIds?: string[]
  paymentType?: PaymentType | null
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
  expenseDate: string
  amount: number
  horseCount: number
  splitAmount: number
}
