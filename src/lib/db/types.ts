export type Role = 'admin' | 'manager' | 'trainer' | 'rider'
export type MembershipStatus = 'active' | 'pending'

export interface Barn {
  id: string
  name: string
  slug: string
  created_at: string
}

export interface BarnMembership {
  id: string
  user_id: string
  barn_id: string | null
  role: Role
  status: MembershipStatus
  created_at: string
}

export interface SeededAccount {
  id: string
  email: string
  role: Role
  barn_id: string | null
  created_at: string
}

export interface Horse {
  id: string
  barn_id: string
  name: string
  created_at: string
}

export interface Rider {
  id: string
  barn_id: string
  name: string
  created_at: string
}

export interface Lesson {
  id: string
  barn_id: string
  instructor_id: string | null
  fee: number | null
  lesson_at: string
  submitted_at: string
}

export interface LessonHorse {
  id: string
  lesson_id: string
  horse_id: string
  exertion_level: number
}

export interface LessonRider {
  id: string
  lesson_id: string
  rider_id: string
}
