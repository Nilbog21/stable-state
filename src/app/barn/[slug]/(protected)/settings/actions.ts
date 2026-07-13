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
  reactivateTier,
} from '@/lib/db/lesson-tiers'
import { updateBarnDefaultBoardFee, setInstructorCut, updateExhaustionThresholds } from '@/lib/db/barns'

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

function validateTierFields(
  name: string | undefined,
  price: number | null,
  instructorCut: number | null
): string | null {
  const errors: string[] = []
  if (!name) errors.push('Name is required')
  if (price == null) errors.push('Price is required')
  if (instructorCut == null) errors.push('Instructor cut is required')
  return errors.length > 0 ? errors.join(', ') : null
}

export async function createTierAction(
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  const price = parsePrice(formData.get('price') as string | null)
  const instructorCut = parseNonNegativeNumber(formData.get('instructor_cut') as string | null)

  const fieldErrors = validateTierFields(name, price, instructorCut)
  if (fieldErrors) return { error: fieldErrors }

  const defaultJumping = parseBoolean(formData.get('default_jumping') as string | null)
  const defaultExertionLevel = parseExertion(formData.get('default_exertion_level') as string | null)

  await createTier(barn.id, name!, price!, false, defaultExertionLevel, defaultJumping, instructorCut!)
  redirect(`/barn/${barnSlug}/settings`)
}

export async function updateTierAction(
  barnSlug: string,
  tierId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim()
  const price = parsePrice(formData.get('price') as string | null)
  const instructor_cut = parseNonNegativeNumber(formData.get('instructor_cut') as string | null)

  const fieldErrors = validateTierFields(name, price, instructor_cut)
  if (fieldErrors) return { error: fieldErrors }

  const default_jumping = parseBoolean(formData.get('default_jumping') as string | null)
  const default_exertion_level = parseExertion(formData.get('default_exertion_level') as string | null)

  const tier = await updateTier(tierId, barn.id, { name: name!, price: price!, default_jumping, default_exertion_level, instructor_cut: instructor_cut! })

  if (formData.get('set_as_default') === 'on' && tier.is_active) {
    await setDefaultTier(tierId, barn.id)
  }

  redirect(`/barn/${barnSlug}/settings`)
}

export async function deactivateTierAction(
  barnSlug: string,
  tierId: string,
  _prevState: { error: string | null },
  _formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const tier = await getTierById(tierId, barn.id)
  if (!tier) redirect(`/barn/${barnSlug}/login`)

  if (tier.is_default) {
    return { error: 'Cannot deactivate the default tier — set another tier as default first.' }
  }

  await deactivateTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
  revalidatePath(`/barn/${barnSlug}/settings/tiers/${tierId}`)
  return { error: null }
}

export async function reactivateTierAction(barnSlug: string, tierId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await reactivateTier(tierId, barn.id)
  revalidatePath(`/barn/${barnSlug}/settings`)
  revalidatePath(`/barn/${barnSlug}/settings/tiers/${tierId}`)
}

export async function updateDefaultBoardFeeAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const fee = parsePrice(formData.get('default_board_fee') as string | null)
  if (fee === null) return

  await updateBarnDefaultBoardFee(barn.id, fee)
  redirect(`/barn/${barnSlug}/settings`)
}

function parseNonNegativeNumber(raw: string | null): number | null {
  if (raw === null || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) || n < 0 ? null : n
}

export async function updateInstructorCutAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const value = parseNonNegativeNumber(formData.get('instructor_cut') as string | null)
  if (value === null) return

  await setInstructorCut(barn.id, value)
  redirect(`/barn/${barnSlug}/settings`)
}

function parseNonNegativeInt(raw: string | null): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null
  return parseInt(raw, 10)
}

export async function updateExhaustionThresholdsAction(
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const moderate = parseNonNegativeInt(formData.get('moderate') as string | null)
  const high = parseNonNegativeInt(formData.get('high') as string | null)
  if (moderate === null || high === null) return { error: 'Thresholds must be numbers ≥ 0' }

  if (moderate >= high) {
    return { error: 'Moderate threshold must be less than high threshold' }
  }

  await updateExhaustionThresholds(barn.id, { moderate, high })
  redirect(`/barn/${barnSlug}/settings`)
}
