'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import {
  approveMembership,
  deleteMembership,
  getMembershipById,
} from '@/lib/db/barn-memberships'
import { createRider } from '@/lib/db/riders'
import { getProfilesByUserIds } from '@/lib/db/profiles'

export async function approveMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])

  const toApprove = await getMembershipById(membershipId)
  await approveMembership(membershipId)

  if (toApprove?.role === 'rider' && toApprove.barn_id && toApprove.user_id) {
    const profiles = await getProfilesByUserIds([toApprove.user_id])
    const profile = profiles[0]
    if (profile) {
      const name = `${profile.first_name} ${profile.last_name}`.trim()
      try {
        await createRider(toApprove.barn_id, name, toApprove.user_id)
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err
      }
    }
  }

  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function rejectMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])
  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function removeMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])
  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/settings`)
}
