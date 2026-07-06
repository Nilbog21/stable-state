'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import {
  createTier,
  updateTier,
  setDefaultTier,
  getTierById,
  deactivateTier,
  reactivateTier,
} from '@/lib/db/lesson-tiers'
import { updateBarnDefaultBoardFee } from '@/lib/db/barns'

function parsePrice(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

function parseBoolean(raw: string | null): boolean | null {
  if (raw === 'true') return true
  if (raw === 'false') return false
  return null
}

function parseExertion(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseInt(raw, 10)
  return isNaN(n) || n < 1 || n > 5 ? null : n
}

export async function createTierAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  if (!name) return

  const price = parsePrice(formData.get('price') as string | null)
  const defaultJumping = parseBoolean(formData.get('default_jumping') as string | null)
  const defaultExertionLevel = parseExertion(formData.get('default_exertion_level') as string | null)

  await createTier(barn.id, name, price, false, defaultExertionLevel, defaultJumping)
  redirect(`/barn/${barnSlug}/settings`)
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
  const default_jumping = parseBoolean(formData.get('default_jumping') as string | null)
  const default_exertion_level = parseExertion(formData.get('default_exertion_level') as string | null)

  const tier = await updateTier(tierId, barn.id, { name, price, default_jumping, default_exertion_level })

  if (formData.get('set_as_default') === 'on' && tier.is_active) {
    await setDefaultTier(tierId, barn.id)
  }

  redirect(`/barn/${barnSlug}/settings`)
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
  redirect(`/barn/${barnSlug}/settings`)
}

export async function reactivateTierAction(barnSlug: string, tierId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await reactivateTier(tierId, barn.id)
  redirect(`/barn/${barnSlug}/settings`)
}

export async function updateDefaultBoardFeeAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const fee = parsePrice(formData.get('default_board_fee') as string | null)
  if (fee === null) return

  await updateBarnDefaultBoardFee(barn.id, fee)
  redirect(`/barn/${barnSlug}/settings`)
}
