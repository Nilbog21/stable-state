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
} from '@/lib/db/barn-memberships'
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

  await approveMembership(membershipId)
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
