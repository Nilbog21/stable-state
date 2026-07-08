'use server'

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, createPendingMembership } from '@/lib/db/barn-memberships'
import { upsertProfile } from '@/lib/db/profiles'
import { redirect } from 'next/navigation'

export type RegisterState = { error: string } | null

// This is the pre-membership existence check that decides whether to
// create the membership requireMembership would otherwise require, so it
// can't use requireMembership itself.
export async function registerForBarn(
  barnSlug: string,
  _prevState: RegisterState,
  formData: FormData
): Promise<RegisterState> {
  const firstName = (formData.get('firstName') as string | null)?.trim() ?? ''
  const lastName = (formData.get('lastName') as string | null)?.trim() ?? ''
  const role = formData.get('role') as string | null

  if (!firstName) return { error: 'First name is required.' }
  if (!lastName) return { error: 'Last name is required.' }
  if (role !== 'trainer' && role !== 'rider') {
    return { error: 'Please select a valid role.' }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    redirect(`/barn/${barnSlug}/login`)
  }

  if (!user.email) {
    return { error: 'Account email is required.' }
  }

  const barn = await getBarnBySlug(barnSlug)
  if (!barn) {
    redirect('/login?error=auth_callback_failed')
  }

  const existing = await getUserMembership(user.id, barn.id)
  if (existing?.status === 'active') {
    redirect(`/barn/${barnSlug}/`)
  }
  if (existing?.status === 'pending') {
    redirect(`/barn/${barnSlug}/pending`)
  }

  try {
    const profile = await upsertProfile(user.id, user.email, firstName, lastName)
    await createPendingMembership(user.id, barn.id, role, profile.id)
  } catch {
    return { error: 'Something went wrong. Please try again.' }
  }

  redirect(`/barn/${barnSlug}/pending`)
}
