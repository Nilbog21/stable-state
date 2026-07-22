'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { updateHorseDetails } from '@/lib/db/horses'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { removeFile } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { parseNonNegativeInt } from '@/lib/parse-amount'

export async function updateHorseAction(
  barnSlug: string,
  horseId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const status = formData.get('status')
  if (status !== 'active' && status !== 'unavailable' && status !== 'inactive') {
    return { error: 'invalid status' }
  }

  const name = (formData.get('name') as string | null)?.trim() || null
  const isActive = status !== 'inactive'
  const isAvailable = status === 'active'
  const reason = status === 'unavailable'
    ? ((formData.get('reason') as string | null)?.trim() || null)
    : null

  let thresholds: { moderate: number; high: number } | null = null
  if (formData.get('use_barn_defaults') !== 'true') {
    const moderate = parseNonNegativeInt(formData.get('moderate') as string | null)
    const high = parseNonNegativeInt(formData.get('high') as string | null)
    if (moderate === null || high === null) return { error: 'Thresholds must be numbers ≥ 0' }
    if (moderate >= high) return { error: 'Moderate threshold must be less than high threshold' }
    thresholds = { moderate, high }
  }

  const feedNotes = (formData.get('feed_notes') as string | null)?.trim() || null
  const medicationNotes = (formData.get('medication_notes') as string | null)?.trim() || null

  try {
    await updateHorseDetails(horseId, barn.id, {
      ...(name ? { name } : {}),
      is_active: isActive,
      is_available: isAvailable,
      unavailability_reason: reason,
      exhaustion_thresholds: thresholds,
      feed_notes: feedNotes,
      medication_notes: medicationNotes,
    })
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
  return { error: null }
}

export async function deleteHorseDocumentAction(
  barnSlug: string,
  horseId: string,
  docId: string,
  storagePath: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await deleteDocument('horse', docId, horseId, barn.id)
  await removeFile(storagePath).catch(() => {})
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function updateHorseDocumentReminderDateAction(
  barnSlug: string,
  horseId: string,
  docId: string,
  reminderDate: string | null
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  try {
    await updateDocumentReminderDate('horse', docId, horseId, barn.id, reminderDate)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
  return { error: null }
}
