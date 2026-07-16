'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import {
  approveMembership,
  deleteMembership,
  getMembershipById,
} from '@/lib/db/barn-memberships'

export async function approveMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const toApprove = await getMembershipById(membershipId)
  if (!toApprove || toApprove.barn_id !== barn.id) return
  await approveMembership(membershipId)

  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function rejectMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const target = await getMembershipById(membershipId)
  if (!target || target.barn_id !== barn.id) return
  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/settings`)
}
