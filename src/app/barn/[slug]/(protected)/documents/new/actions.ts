'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { createDocument } from '@/lib/db/documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { resolveManageableTarget } from '@/lib/document-target'
import type { HorseDocumentType, TrainerDocumentType, RiderDocumentType } from '@/lib/db/types'
import { RECORD_TYPE_VALUES, type DocumentEntity } from '@/lib/document-record-types'

export async function uploadDocumentAction(
  barnSlug: string,
  entity: DocumentEntity,
  routeId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { user, barn, membership: callerMembership } = await requireMembership(
    barnSlug,
    entity === 'horse' ? ['manager', 'trainer'] : ['manager', 'trainer', 'rider']
  )

  // entity is only trusted to pick the branch below (horse vs. member) — for the
  // trainer/rider branch, the table actually written to is re-derived from the
  // target's real DB role, never from this caller-suppliable value.
  let documentEntity: DocumentEntity = entity
  let dbEntityId = routeId
  let storageEntityId = routeId
  let folder = 'horses'
  let redirectPath = `/barn/${barnSlug}/horses/${routeId}`

  if (entity !== 'horse') {
    const resolved = await resolveManageableTarget(barn, callerMembership, routeId, user.id)
    if ('error' in resolved) return { error: resolved.error }
    const { targetMembership, entity: resolvedEntity } = resolved

    documentEntity = resolvedEntity
    // rider_documents/staff_documents key off the membership id (supports managed/unclaimed
    // members with no auth.users row). The storage bucket path keeps using the member's own
    // user_id when they have one, so already-uploaded files for claimed members stay reachable
    // under the existing self-service storage RLS (which still checks auth.uid()); a managed
    // member with no user_id falls back to the membership id there too — that path segment is
    // only ever written/read by a manager, who bypasses the folder-owner check entirely.
    dbEntityId = targetMembership.id
    storageEntityId = targetMembership.user_id ?? targetMembership.id
    folder =
      targetMembership.role === 'trainer' ? 'trainers'
      : targetMembership.role === 'manager' ? 'managers'
      : 'riders'
    redirectPath = `/barn/${barnSlug}/members/${routeId}`
  }

  const file = formData.get('file') as File | null
  let ext: string
  try {
    ext = validateFile(file)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  const recordType = formData.get('record_type') as string
  if (!RECORD_TYPE_VALUES[documentEntity].has(recordType)) return { error: 'Invalid record type' }

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null
  const reminderDate = ((formData.get('reminder_date') as string | null) ?? '').trim() || null
  const storagePath = `${barn.id}/${folder}/${storageEntityId}/${Date.now()}.${ext}`

  try {
    await uploadFile(storagePath, file!, file!.type)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  try {
    if (documentEntity === 'horse') {
      await createDocument('horse', barn.id, dbEntityId, recordType as HorseDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    } else if (documentEntity === 'rider') {
      await createDocument('rider', barn.id, dbEntityId, recordType as RiderDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    } else {
      await createDocument('trainer', barn.id, dbEntityId, recordType as TrainerDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    }
  } catch (dbError) {
    await removeFile(storagePath).catch(() => {})
    return { error: getErrorMessage(dbError) }
  }

  redirect(redirectPath)
}
