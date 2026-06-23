'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability } from '@/lib/db/horses'

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
