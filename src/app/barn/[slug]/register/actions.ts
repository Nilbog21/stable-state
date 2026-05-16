'use server'

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, createPendingMembership } from '@/lib/db/barn-memberships'
import { upsertProfile } from '@/lib/db/profiles'
import { redirect } from 'next/navigation'

export async function registerForBarn(
  barnSlug: string,
  _prevState: unknown,
  formData: FormData
) {
  const firstName = (formData.get('firstName') as string | null)?.trim() ?? ''
  const lastName = (formData.get('lastName') as string | null)?.trim() ?? ''
  const role = formData.get('role') as string | null

  if (role !== 'trainer' && role !== 'rider') {
    return { error: 'Please select a valid role.' }
  }

  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) {
    redirect(`/barn/${barnSlug}/login`)
  }

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) {
    redirect('/login?error=auth_callback_failed')
  }

  const existing = await getUserMembership(data.user.id, barn.id)
  if (existing?.status === 'active') {
    redirect(`/barn/${barnSlug}/`)
  }
  if (existing?.status === 'pending') {
    redirect(`/barn/${barnSlug}/pending`)
  }

  await upsertProfile(data.user.id, firstName, lastName)
  await createPendingMembership(data.user.id, barn.id, role)
  redirect(`/barn/${barnSlug}/pending`)
}
