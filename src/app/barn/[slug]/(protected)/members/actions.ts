'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { createManagedMember, revokeInviteToken } from '@/lib/db/barn-memberships'

export async function createManagedMemberAction(
  barnSlug: string,
  formData: FormData
): Promise<void> {
  const firstName = (formData.get('first_name') as string | null)?.trim() ?? ''
  const lastName = (formData.get('last_name') as string | null)?.trim() ?? ''

  if (!firstName || !lastName) return

  const phone = (formData.get('phone') as string | null)?.trim() || undefined
  const emergencyName = (formData.get('emergency_contact_name') as string | null)?.trim() || undefined
  const emergencyPhone = (formData.get('emergency_contact_phone') as string | null)?.trim() || undefined

  const { barn } = await requireMembership(barnSlug, ['manager'])

  await createManagedMember(barn.id, firstName, lastName, {
    phone,
    emergency_contact_name: emergencyName,
    emergency_contact_phone: emergencyPhone,
  })

  revalidatePath(`/barn/${barnSlug}/members`)
}

export async function revokeInviteTokenAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await revokeInviteToken(membershipId, barn.id)
  revalidatePath(`/barn/${barnSlug}/members`)
}
