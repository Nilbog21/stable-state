import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn, BarnMembership, Role } from './types'

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


type MembershipRow = { id: string; user_id: string | null; profile_id: string; invite_token: string | null }
type ProfileRow = { id: string; first_name: string; last_name: string; is_managed: boolean }
type MembershipProfileRow = MembershipRow & { profile: ProfileRow | null }

function baseMembershipQuery(supabase: SupabaseClient) {
  return supabase.from('barn_memberships').select('id, user_id, profile_id, invite_token')
}

// Shared join for getInstructorsByBarn/getActiveMembersWithProfiles/resolveMemberNames —
// callers each supply their own barn_memberships filter and map the joined rows to their
// own return shape/fallback (array vs Map, 'Unknown Instructor' vs 'Unknown Member' vs raw id).
async function joinMembershipsWithProfiles(
  supabase: SupabaseClient,
  applyFilter: (
    query: ReturnType<typeof baseMembershipQuery>
  ) => PromiseLike<{ data: MembershipRow[] | null; error: unknown }>
): Promise<MembershipProfileRow[]> {
  const { data: memberships, error: memError } = await applyFilter(baseMembershipQuery(supabase))
  if (memError) throw memError
  if (!memberships?.length) return []

  const profileIds = [...new Set(memberships.map((m) => m.profile_id).filter(Boolean))]
  const { data: profiles, error: profError } = profileIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name, is_managed').in('id', profileIds)
    : { data: [] as ProfileRow[], error: null }
  if (profError) throw profError

  const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]))
  return memberships.map((m) => ({ ...m, profile: profileMap.get(m.profile_id) ?? null }))
}

export async function getInstructorsByBarn(
  barnId: string
): Promise<{ membershipId: string; userId: string | null; name: string }[]> {
  const supabase = await createClient()

  const rows = await joinMembershipsWithProfiles(supabase, (query) =>
    query.eq('barn_id', barnId).eq('status', 'active').eq('can_instruct', true).order('created_at', { ascending: true })
  )

  return rows.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    name: m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : 'Unknown Instructor',
  }))
}

export async function getActiveMembersWithProfiles(
  barnId: string,
  role: 'manager' | 'trainer' | 'rider',
  client?: SupabaseClient
): Promise<{ membershipId: string; userId: string | null; name: string; isManaged: boolean; inviteToken: string | null }[]> {
  const supabase = client ?? await createClient()

  const rows = await joinMembershipsWithProfiles(supabase, (query) =>
    query.eq('barn_id', barnId).eq('role', role).eq('status', 'active').order('created_at', { ascending: true })
  )

  return rows.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    name: m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : 'Unknown Member',
    isManaged: m.profile?.is_managed ?? false,
    inviteToken: m.invite_token,
  }))
}

export async function getActiveManagerUserIds(
  barnId: string,
  client?: SupabaseClient
): Promise<string[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('user_id')
    .eq('barn_id', barnId)
    .eq('role', 'manager')
    .eq('status', 'active')

  if (error) throw error
  return (data ?? []).map((m) => m.user_id).filter((id): id is string => id !== null)
}

export async function resolveMemberNames(
  membershipIds: string[],
  barnId: string,
  client?: SupabaseClient
): Promise<Map<string, string>> {
  if (!membershipIds.length) return new Map()

  const supabase = client ?? await createClient()

  const rows = await joinMembershipsWithProfiles(supabase, (query) =>
    query.eq('barn_id', barnId).in('id', membershipIds)
  )

  return new Map(rows.map((m) => [m.id, m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : m.id]))
}

export async function resolveMemberNamesByUserId(
  userIds: string[],
  barnId: string,
  client?: SupabaseClient
): Promise<Map<string, { membershipId: string; name: string }>> {
  if (!userIds.length) return new Map()

  const supabase = client ?? await createClient()

  const rows = await joinMembershipsWithProfiles(supabase, (query) =>
    query.eq('barn_id', barnId).in('user_id', userIds)
  )

  return new Map(
    rows
      .filter((m): m is MembershipProfileRow & { user_id: string } => m.user_id !== null)
      .map((m) => [
        m.user_id,
        { membershipId: m.id, name: m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : m.user_id },
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
  role: Role,
  client?: SupabaseClient
): Promise<{ membershipId: string }> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('create_managed_member', {
    p_barn_id: barnId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_role: role,
  })
  if (error) throw error
  return { membershipId: data as string }
}

export async function claimManagedMember(
  token: string,
  userId: string,
  email: string | null,
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

