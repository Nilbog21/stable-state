import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn, BarnMembership } from './types'

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
  role: 'trainer' | 'rider',
  client?: SupabaseClient
): Promise<BarnMembership> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .insert({ user_id: userId, barn_id: barnId, role, status: 'pending' })
    .select()
    .single()

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

export async function getMembershipById(id: string): Promise<BarnMembership | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function applyPreAuthProfile(userId: string, email: string): Promise<void> {
  const supabase = await createClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, user_id, barn_id, role')
    .eq('email', email)
    .maybeSingle()

  if (!profile?.barn_id || !profile?.role) return

  if (!profile.user_id) {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ user_id: userId })
      .eq('id', profile.id)
    if (updateError) throw updateError
  }

  const { error } = await supabase
    .from('barn_memberships')
    .upsert(
      { user_id: userId, barn_id: profile.barn_id, role: profile.role, status: 'active', can_instruct: profile.role === 'trainer' },
      { onConflict: 'user_id,barn_id' }
    )
  if (error) throw error
}

export async function getInstructorsByBarn(
  barnId: string
): Promise<{ userId: string; name: string }[]> {
  const supabase = await createClient()

  const { data: memberships, error: memError } = await supabase
    .from('barn_memberships')
    .select('user_id')
    .eq('barn_id', barnId)
    .eq('status', 'active')
    .eq('can_instruct', true)
    .order('created_at', { ascending: true })

  if (memError) throw memError
  if (!memberships?.length) return []

  const userIds = memberships.map((m) => m.user_id)

  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('user_id, first_name, last_name')
    .in('user_id', userIds)

  if (profError) throw profError

  return memberships.map((m) => {
    const p = (profiles ?? []).find((pr) => pr.user_id === m.user_id)
    return { userId: m.user_id, name: p ? `${p.first_name} ${p.last_name}` : 'Unknown Instructor' }
  })
}

export const getBarnMembershipsForUser = cache(async (
  userId: string
): Promise<{ barn: Barn; membership: BarnMembership }[]> => {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*, barns(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  if (error) throw error

  return (data ?? [])
    .filter(({ barns }) => barns !== null)
    .map(({ barns, ...membership }) => ({
      barn: barns as Barn,
      membership: membership as BarnMembership,
    }))
})

