'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { createHorse, updateHorse } from '@/lib/db/horses'
import type { BarnMembership } from '@/lib/db/types'

async function getManagerOrAdminMembership(
  userId: string,
  barnId: string
): Promise<BarnMembership | null> {
  return (await getUserMembership(userId, barnId)) ?? (await getAdminMembership(userId))
}

export async function addHorseAction(barnSlug: string, formData: FormData): Promise<void> {
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

  const name = formData.get('name') as string
  await createHorse(barn.id, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
}

export async function updateHorseAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
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

  const name = formData.get('name') as string
  await updateHorse(horseId, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
}
