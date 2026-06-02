'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { updateRider } from '@/lib/db/riders'
import type { BarnMembership } from '@/lib/db/types'

async function getAuthorizedMembership(
  userId: string,
  barnId: string
): Promise<BarnMembership | null> {
  return (await getUserMembership(userId, barnId)) ?? (await getAdminMembership(userId))
}

export async function updateRiderAction(
  barnSlug: string,
  riderId: string,
  formData: FormData
): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect(`/barn/${barnSlug}/login`)

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) redirect(`/barn/${barnSlug}/login`)

  const membership = await getAuthorizedMembership(data.user.id, barn.id)
  if (
    !membership ||
    membership.status !== 'active' ||
    (membership.role !== 'manager' && membership.role !== 'admin' && membership.role !== 'trainer')
  ) {
    redirect(`/barn/${barnSlug}/login`)
  }

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return
  await updateRider(riderId, barn.id, name)
  revalidatePath(`/barn/${barnSlug}/riders`)
}
