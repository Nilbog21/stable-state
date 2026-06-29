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
  profileId: string,
  client?: SupabaseClient
): Promise<BarnMembership> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .insert({ user_id: userId, profile_id: profileId, barn_id: barnId, role, status: 'pending' })
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

export async function getActiveMembersWithProfiles(
  barnId: string,
  role: 'manager' | 'trainer' | 'rider',
  client?: SupabaseClient
): Promise<{ membershipId: string; userId: string | null; name: string; isManaged: boolean; inviteToken: string | null }[]> {
  const supabase = client ?? await createClient()

  const { data: memberships, error: memError } = await supabase
    .from('barn_memberships')
    .select('id, user_id, profile_id, invite_token')
    .eq('barn_id', barnId)
    .eq('role', role)
    .eq('status', 'active')
    .order('created_at', { ascending: true })

  if (memError) throw memError
  if (!memberships?.length) return []

  const profileIds = memberships.map((m) => m.profile_id)

  const { data: profiles, error: profError } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, is_managed')
    .in('id', profileIds)

  if (profError) throw profError

  return memberships.map((m) => {
    const p = (profiles ?? []).find((pr) => pr.id === m.profile_id)
    return {
      membershipId: m.id,
      userId: m.user_id,
      name: p ? `${p.first_name} ${p.last_name}` : 'Unknown Member',
      isManaged: p?.is_managed ?? false,
      inviteToken: m.invite_token,
    }
  })
}

export async function resolveMemberNames(
  membershipIds: string[],
  barnId: string,
  client?: SupabaseClient
): Promise<Map<string, string>> {
  if (!membershipIds.length) return new Map()

  const supabase = client ?? await createClient()

  type MemberRow = { id: string; profile_id: string }
  const { data: members, error: membersError } = await supabase
    .from('barn_memberships')
    .select('id, profile_id')
    .eq('barn_id', barnId)
    .in('id', membershipIds) as { data: MemberRow[] | null; error: Error | null }

  if (membersError) throw membersError

  const profileIds = [...new Set((members ?? []).map((m) => m.profile_id).filter(Boolean))]

  const { data: profiles, error: profilesError } = profileIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name').in('id', profileIds)
    : { data: [] as { id: string; first_name: string; last_name: string }[], error: null }

  if (profilesError) throw profilesError

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))

  return new Map(
    (members ?? []).map((m) => [
      m.id,
      profileMap.has(m.profile_id)
        ? `${profileMap.get(m.profile_id)!.first_name} ${profileMap.get(m.profile_id)!.last_name}`
        : m.id,
    ])
  )
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

export async function createManagedMember(
  barnId: string,
  firstName: string,
  lastName: string,
  contactInfo?: { phone?: string; emergency_contact_name?: string; emergency_contact_phone?: string },
  client?: SupabaseClient
): Promise<{ membershipId: string }> {
  const supabase = client ?? await createClient()

  const { data: profile, error: profError } = await supabase
    .from('profiles')
    .insert({ first_name: firstName, last_name: lastName, is_managed: true, ...contactInfo })
    .select('id')
    .single()

  if (profError) throw profError

  const inviteToken = crypto.randomUUID()

  const { data: membership, error: memError } = await supabase
    .from('barn_memberships')
    .insert({
      barn_id: barnId,
      profile_id: profile.id,
      role: 'rider',
      status: 'active',
      invite_token: inviteToken,
    })
    .select('id')
    .single()

  if (memError) throw memError

  return { membershipId: membership.id }
}

export async function claimManagedMember(
  token: string,
  userId: string,
  email: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('claim_managed_member', {
    p_token: token,
    p_user_id: userId,
    p_email: email,
  })
  if (error) throw error
}

export async function revokeInviteToken(
  membershipId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<string> {
  const supabase = client ?? await createClient()
  const newToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('barn_memberships')
    .update({ invite_token: newToken })
    .eq('id', membershipId)
    .eq('barn_id', barnId)
    .select('invite_token')
    .single()

  if (error) throw error
  return data.invite_token
}

