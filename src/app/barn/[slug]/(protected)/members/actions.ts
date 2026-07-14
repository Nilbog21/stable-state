'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { createManagedMember } from '@/lib/db/member-invites'
import type { Role } from '@/lib/db/types'

export async function createManagedMemberAction(
  barnSlug: string,
  role: Role,
  formData: FormData
): Promise<void> {
  const firstName = (formData.get('first_name') as string | null)?.trim() ?? ''
  const lastName = (formData.get('last_name') as string | null)?.trim() ?? ''

  if (!firstName || !lastName) return

  const { barn } = await requireMembership(barnSlug, ['manager'])

  await createManagedMember(barn.id, firstName, lastName, role)

  revalidatePath(`/barn/${barnSlug}/members`)
}
