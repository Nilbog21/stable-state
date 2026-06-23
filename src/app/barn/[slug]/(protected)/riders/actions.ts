'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { updateRider, deleteRider } from '@/lib/db/riders'

export async function updateRiderAction(
  barnSlug: string,
  riderId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return
  await updateRider(riderId, barn.id, name)
  revalidatePath(`/barn/${barnSlug}/riders`)
}

export async function deleteRiderAction(
  barnSlug: string,
  riderId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await deleteRider(riderId, barn.id)
  revalidatePath(`/barn/${barnSlug}/riders`)
}
