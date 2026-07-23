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
import { updateBarnDefaultBoardFee, setInstructorCut, updateExhaustionThresholds, updateBarnTimezone } from '@/lib/db/barns'
import { createEvent, updateEvent, deleteEvent } from '@/lib/db/barn-events'
import { buildDocumentsBackupZip } from '@/lib/db/document-backup'
import { uploadFile, getSignedUrl } from '@/lib/db/document-storage'
import { parseNonNegativeAmount, parseNonNegativeInt } from '@/lib/parse-amount'
import { BARN_TIMEZONES } from '@/lib/barn-timezone'
import type { Role } from '@/lib/db/types'

const VALID_EVENT_ROLES: Role[] = ['manager', 'trainer', 'rider']

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
  const price = parseNonNegativeAmount(formData.get('price') as string | null)
  const instructorCut = parseNonNegativeAmount(formData.get('instructor_cut') as string | null)

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
  const price = parseNonNegativeAmount(formData.get('price') as string | null)
  const instructor_cut = parseNonNegativeAmount(formData.get('instructor_cut') as string | null)

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

  const fee = parseNonNegativeAmount(formData.get('default_board_fee') as string | null)
  if (fee === null) return

  await updateBarnDefaultBoardFee(barn.id, fee)
  redirect(`/barn/${barnSlug}/settings`)
}

export async function updateInstructorCutAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const value = parseNonNegativeAmount(formData.get('instructor_cut') as string | null)
  if (value === null) return

  await setInstructorCut(barn.id, value)
  redirect(`/barn/${barnSlug}/settings`)
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

export async function updateBarnTimezoneAction(barnSlug: string, formData: FormData): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const timezone = (formData.get('timezone') as string | null) ?? ''
  if (!BARN_TIMEZONES.some((tz) => tz.value === timezone)) return

  await updateBarnTimezone(barn.id, timezone)
  redirect(`/barn/${barnSlug}/settings`)
}

function validateEventFields(title: string | undefined, eventAt: string | undefined): string | null {
  const errors: string[] = []
  if (!title) errors.push('Title is required')
  if (!eventAt) errors.push('Date is required')
  return errors.length > 0 ? errors.join(', ') : null
}

function parseVisibleToRoles(formData: FormData): Role[] {
  return (formData.getAll('visible_to_roles') as string[]).filter((r): r is Role =>
    (VALID_EVENT_ROLES as string[]).includes(r)
  )
}

export async function createEventAction(
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const title = (formData.get('title') as string | null)?.trim()
  const eventAt = (formData.get('event_at') as string | null)?.trim()

  const fieldErrors = validateEventFields(title, eventAt)
  if (fieldErrors) return { error: fieldErrors }

  const notes = (formData.get('notes') as string | null)?.trim() || null
  const visibleToRoles = parseVisibleToRoles(formData)

  await createEvent(barn.id, { title: title!, eventAt: eventAt!, notes, visibleToRoles })
  redirect(`/barn/${barnSlug}/settings`)
}

export async function updateEventAction(
  barnSlug: string,
  eventId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const title = (formData.get('title') as string | null)?.trim()
  const eventAt = (formData.get('event_at') as string | null)?.trim()

  const fieldErrors = validateEventFields(title, eventAt)
  if (fieldErrors) return { error: fieldErrors }

  const notes = (formData.get('notes') as string | null)?.trim() || null
  const visibleToRoles = parseVisibleToRoles(formData)

  await updateEvent(eventId, barn.id, { title: title!, eventAt: eventAt!, notes, visibleToRoles })
  redirect(`/barn/${barnSlug}/settings`)
}

export async function deleteEventAction(barnSlug: string, eventId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await deleteEvent(eventId, barn.id)
  redirect(`/barn/${barnSlug}/settings`)
}

export async function downloadAllDocumentsAction(
  barnSlug: string,
  _prevState: { error: string | null; url: string | null },
  _formData: FormData
): Promise<{ error: string | null; url: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const buffer = await buildDocumentsBackupZip(barn.id)
  if (!buffer) return { error: 'No documents to download yet', url: null }

  const storagePath = `${barn.id}/backup-archive/all-documents.zip`
  await uploadFile(
    storagePath,
    new File([new Uint8Array(buffer)], 'all-documents.zip', { type: 'application/zip' }),
    'application/zip',
    undefined,
    true
  )
  const url = await getSignedUrl(storagePath)
  return { error: null, url }
}
