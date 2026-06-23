'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import {
  createTier,
  updateTier,
  setDefaultTier,
  getTierById,
  deactivateTier,
} from '@/lib/db/lesson-tiers'

function parsePrice(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

export async function createTierAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return

  const price = parsePrice(formData.get('price') as string | null)

  await createTier(barn.id, name, price)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function updateTierAction(
  barnSlug: string,
  tierId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return

  const price = parsePrice(formData.get('price') as string | null)

  await updateTier(tierId, barn.id, { name, price })
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function setDefaultTierAction(barnSlug: string, tierId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await setDefaultTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
}

export async function deactivateTierAction(barnSlug: string, tierId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const tier = await getTierById(tierId, barn.id)
  if (!tier) redirect(`/barn/${barnSlug}/login`)

  if (tier.is_default) {
    redirect(
      `/barn/${barnSlug}/settings?error=cannot_deactivate_default&errorTierId=${tierId}`
    )
  }

  await deactivateTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
}
