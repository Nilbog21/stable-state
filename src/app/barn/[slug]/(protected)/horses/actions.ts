'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { createHorse } from '@/lib/db/horses'

export async function addHorseAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return
  await createHorse(barn.id, name, membership.id)
  revalidatePath(`/barn/${barnSlug}/horses`)
}
