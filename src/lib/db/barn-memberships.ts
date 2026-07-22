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

// No longer called from the app (self-registration is closed, #777) — kept for
// scripts/reset-db.ts, which still seeds a baseline pending row for testing approve/reject.
export async function createPendingMembership(
  userId: string,
  barnId: string,
  role: 'trainer' | 'rider',
  profileId: string,
  client?: SupabaseClient
): Promise<BarnMembership> {
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

export async function deleteMembership(membershipId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('barn_memberships')
    .delete()
    .eq('id', membershipId)

  if (error) throw error
}

export async function getMembershipById(id: string, client?: SupabaseClient): Promise<BarnMembership | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barn_memberships')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return data
}

export type ActiveMemberSummaryRow = {
  id: string
  user_id: string | null
  profile_id: string
  role: Role
  can_instruct: boolean
  created_at: string
}

// Reads any active member's row within a barn, including ones the narrow direct-query
// policies (own-row/manager-full-barn/trainer-reads-riders) don't cover — broadened per
// #779 via the same column-limited RPC used by getActiveMembersWithProfiles, so this can
// never surface invite_token either. Kept separate from getMembershipById (used elsewhere
// by write-gated actions that don't need the broadened read) to keep blast radius minimal.
export async function getMembershipByIdForBarn(
  membershipId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<BarnMembership | null> {
  const supabase = client ?? await createClient()

  const direct = await getMembershipById(membershipId, supabase)
  if (direct) return direct

  const { data: summaryRows, error } = await supabase.rpc('get_active_barn_member_summaries', {
    p_barn_id: barnId,
  })
  if (error) throw error

  const row = ((summaryRows ?? []) as ActiveMemberSummaryRow[]).find((r) => r.id === membershipId)
  if (!row) return null

  return {
    id: row.id,
    user_id: row.user_id,
    profile_id: row.profile_id,
    barn_id: barnId,
    role: row.role,
    status: 'active',
    can_instruct: row.can_instruct,
    invite_token: null,
    created_at: row.created_at,
  }
}


export type MembershipRow = { id: string; user_id: string | null; profile_id: string; invite_token: string | null }
export type ProfileRow = { id: string; first_name: string; last_name: string; is_managed: boolean }
export type MembershipProfileRow = MembershipRow & { profile: ProfileRow | null }

function baseMembershipQuery(supabase: SupabaseClient) {
  return supabase.from('barn_memberships').select('id, user_id, profile_id, invite_token')
}

export async function fetchProfilesById(supabase: SupabaseClient, profileIds: string[]): Promise<Map<string, ProfileRow>> {
  const { data: profiles, error } = profileIds.length
    ? await supabase.from('profiles').select('id, first_name, last_name, is_managed').in('id', profileIds)
    : { data: [] as ProfileRow[], error: null }
  if (error) throw error
  return new Map((profiles ?? []).map((p) => [p.id, p]))
}

// Shared join for getInstructorsByBarn/getActiveMembersWithProfiles (here) and
// resolveMemberNames (member-names.ts) — callers each supply their own barn_memberships
// filter and map the joined rows to their own return shape/fallback (array vs Map,
// 'Unknown Instructor' vs 'Unknown Member' vs raw id).
export async function joinMembershipsWithProfiles(
  supabase: SupabaseClient,
  applyFilter: (
    query: ReturnType<typeof baseMembershipQuery>
  ) => PromiseLike<{ data: MembershipRow[] | null; error: unknown }>
): Promise<MembershipProfileRow[]> {
  const { data: memberships, error: memError } = await applyFilter(baseMembershipQuery(supabase))
  if (memError) throw memError
  if (!memberships?.length) return []

  const profileMap = await fetchProfilesById(supabase, [...new Set(memberships.map((m) => m.profile_id).filter(Boolean))])
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
  const direct = rows.map((m) => ({
    membershipId: m.id,
    userId: m.user_id,
    name: m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : 'Unknown Member',
    isManaged: m.profile?.is_managed ?? false,
    inviteToken: m.invite_token,
  }))

  // A caller-supplied client is always a service-role script (reset-db.ts/seed-test-barn.ts)
  // — service-role already bypasses barn_memberships' RLS on the direct query above, so
  // there are no narrow-RLS gap rows to backfill; the RPC below is simply never reached
  // in that case (#930 added a service_role grant to get_active_barn_member_summaries, but
  // that's for other callers — this early return still skips it here regardless).
  if (client) return direct

  // Rows not returned above fall outside barn_memberships' narrow SELECT policies (e.g. a
  // rider viewing managers/trainers/other riders, or a trainer viewing managers/other
  // trainers) — broadened per #779 via a column-limited RPC that never selects
  // invite_token, mirroring resolveMemberNames' RPC fallback (member-names.ts).
  const seenIds = new Set(rows.map((m) => m.id))
  const { data: summaryRows, error } = await supabase.rpc('get_active_barn_member_summaries', {
    p_barn_id: barnId,
  })
  if (error) throw error

  const gapRows = ((summaryRows ?? []) as ActiveMemberSummaryRow[]).filter(
    (r) => r.role === role && !seenIds.has(r.id)
  )
  const profileMap = await fetchProfilesById(supabase, [...new Set(gapRows.map((r) => r.profile_id))])
  const fallback = gapRows.map((r) => {
    const profile = profileMap.get(r.profile_id)
    return {
      membershipId: r.id,
      userId: r.user_id,
      name: profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown Member',
      isManaged: profile?.is_managed ?? false,
      inviteToken: null,
    }
  })

  return [...direct, ...fallback]
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
    .filter(({ barns }) => barns !== null && !(barns as Barn).is_demo)
    .map(({ barns, ...membership }) => ({
      barn: barns as Barn,
      membership: membership as BarnMembership,
    }))
})

export async function setCanInstruct(
  membershipId: string,
  barnId: string,
  value: boolean,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('set_can_instruct', {
    p_membership_id: membershipId,
    p_barn_id: barnId,
    p_value: value,
  })
  if (error) throw error
}

