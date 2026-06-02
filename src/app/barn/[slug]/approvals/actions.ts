'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  getUserMembership,
  getAdminMembership,
  approveMembership,
  deleteMembership,
  getMembershipById,
} from '@/lib/db/barn-memberships'
import { createRider } from '@/lib/db/riders'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import type { BarnMembership } from '@/lib/db/types'

async function getManagerOrAdminMembership(
  userId: string,
  barnId: string
): Promise<BarnMembership | null> {
  return (await getUserMembership(userId, barnId)) ?? (await getAdminMembership(userId))
}

export async function approveMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getManagerOrAdminMembership(data.user.id, barn.id)
  if (
    !membership ||
    membership.status !== 'active' ||
    (membership.role !== 'manager' && membership.role !== 'admin')
  ) {
    redirect(`/barn/${barnSlug}/login`)
  }

  const toApprove = await getMembershipById(membershipId)
  await approveMembership(membershipId)

  if (toApprove?.role === 'rider' && toApprove.barn_id) {
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

  revalidatePath(`/barn/${barnSlug}/approvals`)
}

export async function rejectMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getManagerOrAdminMembership(data.user.id, barn.id)
  if (
    !membership ||
    membership.status !== 'active' ||
    (membership.role !== 'manager' && membership.role !== 'admin')
  ) {
    redirect(`/barn/${barnSlug}/login`)
  }

  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/approvals`)
}

export async function removeMembershipAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getManagerOrAdminMembership(data.user.id, barn.id)
  if (!membership || membership.status !== 'active' || membership.role !== 'admin') {
    redirect(`/barn/${barnSlug}/login`)
  }

  await deleteMembership(membershipId)
  revalidatePath(`/barn/${barnSlug}/approvals`)
}
