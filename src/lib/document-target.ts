import { getMembershipById } from '@/lib/db/barn-memberships'
import type { Barn, BarnMembership } from '@/lib/db/types'

export function canManage(callerRole: string, isOwnPage: boolean): boolean {
  if (callerRole === 'manager') return true
  return (callerRole === 'trainer' || callerRole === 'rider') && isOwnPage
}

export async function resolveManageableTarget(
  barn: Barn,
  callerMembership: BarnMembership,
  membershipId: string,
  callerUserId: string
): Promise<
  | { error: string }
  | { targetMembership: BarnMembership & { user_id: string }; entity: 'rider' | 'trainer' }
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

  if (!targetMembership.user_id) return { error: 'Target member has no account linked' }

  return {
    targetMembership: targetMembership as BarnMembership & { user_id: string },
    entity: targetMembership.role === 'rider' ? 'rider' : 'trainer',
  }
}
