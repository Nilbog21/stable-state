'use server'

import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, updateHorseDetails, updateHorseNotes, replaceHorsePhoto, removeHorsePhoto } from '@/lib/db/horses'
import {
  grantHorsePrivilege,
  updateHorsePrivilegeDocumentAccess,
  updateHorsePrivilegeLessonAccess,
  revokeHorsePrivilege,
  elevateOwnerPrivileges,
} from '@/lib/db/member-horse-privileges'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { removeFile, validateFile, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { parseNonNegativeInt } from '@/lib/parse-amount'

export async function updateHorseAction(
  barnSlug: string,
  horseId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const horse = await getHorseById(horseId, barn.id)
  if (!horse) return { error: 'Horse not found' }

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
  const registeredName = (formData.get('registered_name') as string | null)?.trim() || null

  try {
    await updateHorseDetails(horseId, barn.id, {
      ...(name ? { name } : {}),
      is_active: isActive,
      is_available: isAvailable,
      unavailability_reason: reason,
      exhaustion_thresholds: thresholds,
      feed_notes: feedNotes,
      medication_notes: medicationNotes,
      registered_name: registeredName,
      owning_member_id: horse.owning_member_id,
    })
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
  return { error: null }
}

export async function updateHorseNotesAction(
  barnSlug: string,
  horseId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const feedNotes = (formData.get('feed_notes') as string | null)?.trim() || null
  const medicationNotes = (formData.get('medication_notes') as string | null)?.trim() || null

  try {
    await updateHorseNotes(horseId, barn.id, { feed_notes: feedNotes, medication_notes: medicationNotes })
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
  return { error: null }
}

export async function uploadHorsePhotoAction(
  barnSlug: string,
  horseId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const file = formData.get('file') as File | null
  let ext: string
  try {
    ext = validateFile(file, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  try {
    await replaceHorsePhoto(horseId, barn.id, file!, ext)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
  redirect(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function deleteHorsePhotoAction(
  barnSlug: string,
  horseId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])
  try {
    await removeHorsePhoto(horseId, barn.id)
  } catch {
    // The UI already hides this control once locked; this guards a stale-page race
    // (owner uploads between page render and a locked-out manager's click) instead of
    // crashing — revalidate so the page reflects the current true state.
  }
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function grantHorseAccessAction(
  barnSlug: string,
  horseId: string,
  memberId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await grantHorsePrivilege(horseId, barn.id, memberId)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function updateHorseAccessDocumentAction(
  barnSlug: string,
  horseId: string,
  privilegeId: string,
  value: 'none' | 'read' | 'write'
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await updateHorsePrivilegeDocumentAccess(privilegeId, barn.id, value)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function updateHorseAccessLessonAction(
  barnSlug: string,
  horseId: string,
  privilegeId: string,
  value: boolean
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await updateHorsePrivilegeLessonAccess(privilegeId, barn.id, value)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function revokeHorseAccessAction(
  barnSlug: string,
  horseId: string,
  privilegeId: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await revokeHorsePrivilege(privilegeId, barn.id)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

// Owner is now set exclusively from the Access table (a member must already
// have a privilege row to be selected), so this always passes through the
// horse's other current fields unchanged, changing only owning_member_id.
export async function setHorseOwnerAction(
  barnSlug: string,
  horseId: string,
  memberId: string | null
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const horse = await getHorseById(horseId, barn.id)
  if (!horse) notFound()

  await updateHorseDetails(horseId, barn.id, {
    name: horse.name,
    is_active: horse.is_active,
    is_available: horse.is_available,
    unavailability_reason: horse.unavailability_reason,
    exhaustion_thresholds: horse.exhaustion_threshold_moderate != null && horse.exhaustion_threshold_high != null
      ? { moderate: horse.exhaustion_threshold_moderate, high: horse.exhaustion_threshold_high }
      : null,
    feed_notes: horse.feed_notes,
    medication_notes: horse.medication_notes,
    registered_name: horse.registered_name,
    owning_member_id: memberId,
  })
  if (memberId !== null) {
    await elevateOwnerPrivileges(horseId, barn.id, memberId)
  }
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
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
