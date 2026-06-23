'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { createHorse, updateHorse } from '@/lib/db/horses'

export async function addHorseAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return
  await createHorse(barn.id, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
}

export async function updateHorseAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return
  await updateHorse(horseId, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
}
