/**
 * Membership-id → display-name resolution (`resolveMemberNames`, the module's one
 * export) via a three-step RLS-aware fallback: the direct `joinMembershipsWithProfiles`
 * read, then the column-limited `get_instructor_membership_names` RPC (#739 follow-up),
 * then `get_active_barn_member_summaries` plus `fetchProfilesById` (#779) — each step
 * covering only ids the previous step's RLS scope couldn't see, none of them exposing
 * `invite_token`. Ids no step can see are simply absent from the returned map.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  joinMembershipsWithProfiles,
  fetchProfilesById,
  type ActiveMemberSummaryRow,
} from './barn-memberships'

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

  const nameMap = new Map(rows.map((m) => [m.id, m.profile ? `${m.profile.first_name} ${m.profile.last_name}` : m.id]))

  // The query above returns only the rows the caller's barn_memberships SELECT policies
  // cover: own row, the whole barn for a manager, the barn's active rider rows for a
  // trainer. Anything outside that scope — e.g. a rider resolving their lesson's
  // instructor — stays unresolved here. Resolve those via a column-limited RPC instead of
  // a broad row-level policy, so the fetch can't also expose invite_token (see
  // get_instructor_membership_names, #739 follow-up).
  const unresolvedIds = membershipIds.filter((id) => !nameMap.has(id))
  if (unresolvedIds.length) {
    const { data: instructorRows, error } = await supabase.rpc('get_instructor_membership_names', {
      p_membership_ids: unresolvedIds,
      p_barn_id: barnId,
    })
    if (error) throw error
    for (const row of instructorRows ?? []) {
      nameMap.set(row.id, `${row.first_name} ${row.last_name}`)
    }
  }

  // A co-rider (or any other non-instructor member) is still unresolved here — the RPC
  // above only covers "caller can see them as a lesson instructor". Fall back to the
  // broader any-active-member RPC (#779) for the remainder, same column-limiting rationale
  // as get_instructor_membership_names (never exposes invite_token).
  const stillUnresolvedIds = membershipIds.filter((id) => !nameMap.has(id))
  if (stillUnresolvedIds.length) {
    const { data: summaryRows, error } = await supabase.rpc('get_active_barn_member_summaries', {
      p_barn_id: barnId,
    })
    if (error) throw error
    const summaryById = new Map(((summaryRows ?? []) as ActiveMemberSummaryRow[]).map((r) => [r.id, r]))
    const matched = stillUnresolvedIds
      .map((id) => summaryById.get(id))
      .filter((r): r is ActiveMemberSummaryRow => r != null)
    if (matched.length) {
      const profileMap = await fetchProfilesById(supabase, [...new Set(matched.map((r) => r.profile_id))])
      for (const row of matched) {
        const profile = profileMap.get(row.profile_id)
        nameMap.set(row.id, profile ? `${profile.first_name} ${profile.last_name}` : row.id)
      }
    }
  }

  return nameMap
}
