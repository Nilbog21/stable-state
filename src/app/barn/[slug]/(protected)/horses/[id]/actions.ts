'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'

export async function updateHorseAvailabilityAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const isAvailable = formData.get('is_available') === 'true'
  const rawReason = (formData.get('reason') as string | null)?.trim() || null
  const reason = isAvailable ? null : rawReason

  await setHorseAvailability(horseId, barn.id, isAvailable, reason)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function renameHorseAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  await requireMembership(barnSlug, ['manager'])
  const name = (formData.get('name') as string).trim()
  await updateHorse(horseId, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function setHorseActiveAction(
  barnSlug: string,
  horseId: string,
  isActive: boolean
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await setHorseActive(horseId, barn.id, isActive)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}
