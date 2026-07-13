'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { createDocument } from '@/lib/db/documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { resolveManageableTarget } from '@/lib/document-target'
import type { HorseDocumentType, TrainerDocumentType, RiderDocumentType } from '@/lib/db/types'

export type DocumentEntity = 'horse' | 'trainer' | 'rider'

const RECORD_TYPES: Record<DocumentEntity, Set<string>> = {
  horse: new Set(['insurance_binder', 'coggins', 'shot_record', 'contract', 'other']),
  trainer: new Set(['instructor_contract', 'other']),
  rider: new Set(['liability_waiver', 'lease_agreement', 'boarding_contract', 'other']),
}

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
  let entityId = routeId
  let folder = 'horses'
  let redirectPath = `/barn/${barnSlug}/horses/${routeId}`

  if (entity !== 'horse') {
    const resolved = await resolveManageableTarget(barn, callerMembership, routeId, user.id)
    if ('error' in resolved) return { error: resolved.error }
    const { targetMembership, entity: resolvedEntity } = resolved

    documentEntity = resolvedEntity
    entityId = targetMembership.user_id
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
  if (!RECORD_TYPES[documentEntity].has(recordType)) return { error: 'Invalid record type' }

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null
  const reminderDate = ((formData.get('reminder_date') as string | null) ?? '').trim() || null
  const storagePath = `${barn.id}/${folder}/${entityId}/${Date.now()}.${ext}`

  try {
    await uploadFile(storagePath, file!, file!.type)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  try {
    if (documentEntity === 'horse') {
      await createDocument('horse', barn.id, entityId, recordType as HorseDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    } else if (documentEntity === 'rider') {
      await createDocument('rider', barn.id, entityId, recordType as RiderDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    } else {
      await createDocument('trainer', barn.id, entityId, recordType as TrainerDocumentType, storagePath, file!.name, file!.size, notes, reminderDate)
    }
  } catch (dbError) {
    await removeFile(storagePath).catch(() => {})
    return { error: getErrorMessage(dbError) }
  }

  redirect(redirectPath)
}
