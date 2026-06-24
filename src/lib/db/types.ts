export type Role = 'manager' | 'trainer' | 'rider'
export type NotificationType =
  | 'outstanding_payment'
  | 'pending_approval'
  | 'lesson_cancelled'
  | 'incomplete_profile'
  | 'member_incomplete_profile'
export type MembershipStatus = 'active' | 'pending'

export interface Profile {
  id: string
  user_id: string | null
  email: string
  barn_id: string | null
  role: Role | null
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
  created_at: string
}

export interface BarnMembership {
  id: string
  user_id: string
  barn_id: string
  role: Role
  status: MembershipStatus
  can_instruct: boolean
  created_at: string
}

export interface LessonTier {
  id: string
  barn_id: string
  name: string
  price: number | null
  is_default: boolean
  is_active: boolean
  created_at: string
  default_exertion_level: number | null
  default_jumping: boolean | null
}

export interface Horse {
  id: string
  barn_id: string
  name: string
  is_active: boolean
  is_available: boolean
  unavailability_reason: string | null
  created_at: string
  updated_at: string
}

export interface Rider {
  id: string
  barn_id: string
  name: string
  user_id: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export type LessonType = 'normal' | 'group'
export type PaymentType = 'venmo' | 'zelle' | 'cash' | 'check' | 'freshbooks'

export interface Lesson {
  id: string
  barn_id: string
  instructor_id: string | null
  fee: number | null
  lesson_at: string
  submitted_at: string
  lesson_type: LessonType
  jumping: boolean
  payment_type: PaymentType | null
  tier_name: string
}

export interface LessonWithDetails extends Lesson {
  instructor_name: string | null
  horse_names: string[]
  horse_count: number
  rider_names: string[]
  rider_count: number
}

export interface LessonDetail extends Lesson {
  instructor_name: string | null
  lesson_horses: { exertion_level: number; horse_notes: string | null; horses: { id: string; name: string } | null }[]
  lesson_riders: { rider_notes: string | null; private_notes: string | null; riders: { id: string; name: string; user_id: string | null } | null }[]
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
}

export interface OutstandingLesson {
  id: string
  barn_id: string
  lesson_at: string
  instructor_name: string | null
  rider_names: string[]
  fee: number | null
}

export interface FinancialSummary {
  collectedIncome: number
  pendingIncome: number
  breakdown: { tierName: string; price: number | null; lessonCount: number; subtotal: number }[]
}

export interface TrainerIncomeSummary {
  trainerId: string
  trainerName: string
  totalIncome: number
}

export interface HorseExertionSummary {
  id: string
  name: string
  is_active: boolean
  is_available: boolean
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

export interface HorseIncomeDetailRow {
  lessonId: string
  lessonAt: string
  fee: number
  horseCount: number
  splitAmount: number
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
