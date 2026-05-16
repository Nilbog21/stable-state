import { createClient } from '@/lib/supabase/server'
import type { BarnMembership, Role } from './types'

export async function getUserMembership(
  userId: string,
  barnId?: string
): Promise<BarnMembership | null> {
  const supabase = await createClient()
  let query = supabase
    .from('barn_memberships')
    .select('*')
    .eq('user_id', userId)

  if (barnId !== undefined) {
    query = query.eq('barn_id', barnId)
  }

  const { data } = await query.maybeSingle()
  return data
}

export async function createPendingMembership(
  userId: string,
  barnId: string,
  role: 'trainer' | 'rider'
): Promise<BarnMembership> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .insert({ user_id: userId, barn_id: barnId, role, status: 'pending' })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function seedManagerAccount(
  email: string,
  barnId: string
): Promise<void> {
  const supabase = await createClient()
  const role: Role = 'manager'
  const { error } = await supabase
    .from('seeded_accounts')
    .insert({ email, role, barn_id: barnId })

  if (error) throw error
}
