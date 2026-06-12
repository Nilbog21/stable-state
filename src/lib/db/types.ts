export type Role = 'manager' | 'trainer' | 'rider'
export type MembershipStatus = 'active' | 'pending'

export interface Profile {
  user_id: string
  first_name: string
  last_name: string
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
  created_at: string
  default_fee: number | null
}

export interface SeededAccount {
  id: string
  email: string
  role: Role
  barn_id: string
  created_at: string
}

export interface Horse {
  id: string
  barn_id: string
  name: string
  created_at: string
  updated_at: string
}

export interface Rider {
  id: string
  barn_id: string
  name: string
  user_id: string | null
  created_at: string
  updated_at: string
}

export type LessonType = 'normal' | 'group'

export interface Lesson {
  id: string
  barn_id: string
  instructor_id: string | null
  fee: number | null
  lesson_at: string
  submitted_at: string
  lesson_type: LessonType
  jumping: boolean
}

export interface LessonWithDetails extends Lesson {
  instructor_name: string | null
  horse_names: string[]
  rider_name: string | null
}

export interface LessonDetail extends Lesson {
  profiles: { first_name: string; last_name: string } | null
  lesson_horses: { exertion_level: number; horses: { id: string; name: string } | null }[]
  lesson_riders: { riders: { id: string; name: string } | null }[]
}

export interface LessonHorse {
  id: string
  barn_id: string
  lesson_id: string
  horse_id: string
  exertion_level: number
}

export interface LessonRider {
  id: string
  barn_id: string
  lesson_id: string
  rider_id: string
}

export interface FinancialSummary {
  totalIncome: number
  breakdown: { fee: number; lessonCount: number; subtotal: number }[]
}

export interface HorseExertionSummary {
  id: string
  name: string
  lessonCount: number
  totalExertion: number
}

export interface HorseIncomeSummary {
  horseId: string
  horseName: string
  totalIncome: number
}
