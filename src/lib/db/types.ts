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
