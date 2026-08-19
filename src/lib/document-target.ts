/**
 * Resolves whether the caller may manage another member's documents, shared by the member
 * detail page, the add-document flow, and their actions: the pure `canManage` (a manager
 * always; a trainer only on their own page) and the async `resolveManageableTarget`, which
 * fetches the target membership, requires it to belong to the caller's barn (`Not found`
 * otherwise), applies `canManage` (`Forbidden`), and maps the target's real DB role onto the
 * document `entity` discriminator (`'rider'`, else `'trainer'` — a manager target files under
 * staff) that `documents.ts`'s entity-keyed CRUD dispatches on.
 */
import { getMembershipById } from '@/lib/db/barn-memberships'
import type { Barn, BarnMembership } from '@/lib/db/types'

export function canManage(callerRole: string, isOwnPage: boolean): boolean {
  if (callerRole === 'manager') return true
  return callerRole === 'trainer' && isOwnPage
}

export async function resolveManageableTarget(
  barn: Barn,
  callerMembership: BarnMembership,
  membershipId: string,
  callerUserId: string
): Promise<
  | { error: string }
  | { targetMembership: BarnMembership; entity: 'rider' | 'trainer' }
> {
  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    return { error: 'Forbidden' }
  }

  const isOwnPage = targetMembership.user_id === callerUserId
  if (!canManage(callerMembership.role, isOwnPage)) {
    return { error: 'Forbidden' }
  }

  return {
    targetMembership,
    entity: targetMembership.role === 'rider' ? 'rider' : 'trainer',
  }
}
