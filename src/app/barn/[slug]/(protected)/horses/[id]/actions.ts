'use server'

/**
 * Horse detail page Server Actions: the manager-only Horse Settings save (`updateHorseAction` —
 * maps the status radio to `is_active`/`is_available`/`unavailability_reason`,
 * validates threshold overrides, and forwards everything through the atomic
 * `updateHorseDetails` RPC wrapper, preserving the current owner and notes), the notes save
 * (`updateHorseNotesAction` — any active role may call; the `update_horse_notes` RPC
 * authorizes the owning member or a barn manager), photo upload/delete
 * (`uploadHorsePhotoAction`/`deleteHorsePhotoAction` — photo-only file validation here,
 * owner-vs-manager write arbitration inside the `update_horse_photo` RPC; delete
 * swallows the stale-page lock race and revalidates), manager-only Access-table
 * privilege CRUD (`grantHorseAccessAction`,
 * `updateHorseAccessDocumentAction`/`updateHorseAccessLessonAction`,
 * `revokeHorseAccessAction`, and `setHorseOwnerAction` — owner picked from existing
 * privilege rows, set atomically via `setHorseOwner`), and the horse-document row actions
 * (`deleteHorseDocumentAction` — any active role, with the manager-or-owner arbitration left to
 * the `horse_documents` DELETE policies since #1547; `updateHorseDocumentReminderDateAction` —
 * manager-only).
 */
import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getHorseById, updateHorseDetails, updateHorseNotes, replaceHorsePhoto, removeHorsePhoto } from '@/lib/db/horses'
import {
  grantHorsePrivilege,
  updateHorsePrivilegeDocumentAccess,
  updateHorsePrivilegeLessonAccess,
  revokeHorsePrivilege,
  setHorseOwner,
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

  const registeredName = (formData.get('registered_name') as string | null)?.trim() || null

  try {
    await updateHorseDetails(horseId, barn.id, {
      ...(name ? { name } : {}),
      is_active: isActive,
      is_available: isAvailable,
      unavailability_reason: reason,
      exhaustion_thresholds: thresholds,
      // Re-sent unchanged, like owning_member_id below: #1390 moved feed/medication onto their
      // own Feed & Medication section, which saves through update_horse_notes. This form no
      // longer carries the fields, and update_horse_details writes every column it takes, so
      // reading them off the FormData would null them on every settings save.
      feed_notes: horse.feed_notes,
      medication_notes: horse.medication_notes,
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

// #1390: this takes FormData rather than a typed argument because its value comes from a <select>
// of barn members in the Access table's own form -- unknown at render time, so it can't be
// `.bind()`'d, and a closure over client state is what defeats progressive enhancement (#1385).
// The other four Access actions bind their next value and keep their signatures.
export async function grantHorseAccessAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const memberId = (formData.get('member_id') as string | null)?.trim() || null
  // The placeholder option submits an empty value, and pre-hydration there's no
  // disabled-until-chosen button to stop it reaching the server.
  if (memberId === null) return
  await grantHorsePrivilege(horseId, barn.id, memberId)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

const DOCUMENT_PRIVILEGES = ['none', 'read', 'write'] as const

// The value is bound at render time by whichever of the row's three buttons was pressed, but a
// Server Action argument is still deserialized from whatever the client posted -- the union type
// is a compile-time claim, not a runtime one, so the enum check stays.
export async function updateHorseAccessDocumentAction(
  barnSlug: string,
  horseId: string,
  privilegeId: string,
  value: (typeof DOCUMENT_PRIVILEGES)[number]
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  if (!DOCUMENT_PRIVILEGES.includes(value)) return
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
// have a privilege row to be selected). setHorseOwner atomically sets
// owning_member_id and elevates the new owner's privileges in one RPC call.
export async function setHorseOwnerAction(
  barnSlug: string,
  horseId: string,
  memberId: string | null
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const horse = await getHorseById(horseId, barn.id)
  if (!horse) notFound()

  await setHorseOwner(horseId, barn.id, memberId)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

// #1547: any active role may call, because the caller may be the horse's owning member whatever
// their role. `horse_documents_delete_ownership` and its `storage.objects` counterpart are the
// boundary -- a caller who neither manages the barn nor owns the horse deletes zero rows and
// removes no object, which is why neither call needs a role branch here.
export async function deleteHorseDocumentAction(
  barnSlug: string,
  horseId: string,
  docId: string,
  storagePath: string
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])
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
