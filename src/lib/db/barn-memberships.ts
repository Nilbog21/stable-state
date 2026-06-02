import { createClient } from '@/lib/supabase/server'
import type { BarnMembership, Role } from './types'

export async function getUserMembership(
  userId: string,
  barnId: string
): Promise<BarnMembership | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('user_id', userId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
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

export async function getAdminMembership(
  userId: string
): Promise<BarnMembership | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('user_id', userId)
    .is('barn_id', null)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getPendingMemberships(
  barnId: string
): Promise<BarnMembership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('barn_id', barnId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getActiveMemberships(
  barnId: string
): Promise<BarnMembership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('barn_id', barnId)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function approveMembership(membershipId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('barn_memberships')
    .update({ status: 'active' })
    .eq('id', membershipId)

  if (error) throw error
}

export async function getActiveTrainerMembershipsByBarn(
  barnId: string
): Promise<BarnMembership[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('barn_id', barnId)
    .eq('role', 'trainer')
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function deleteMembership(membershipId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('barn_memberships')
    .delete()
    .eq('id', membershipId)

  if (error) throw error
}

export async function applySeededMembership(
  userId: string,
  email: string
): Promise<void> {
  const supabase = await createClient()

  const { data: seeded } = await supabase
    .from('seeded_accounts')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (!seeded) return

  const { error } = await supabase
    .from('barn_memberships')
    .upsert(
      { user_id: userId, barn_id: seeded.barn_id, role: seeded.role, status: 'active' },
      { onConflict: 'user_id,barn_id' }
    )
  if (error) throw error
}
