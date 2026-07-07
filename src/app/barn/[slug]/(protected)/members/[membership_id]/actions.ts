'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createDocument, deleteDocument } from '@/lib/db/documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import type { TrainerDocumentType, RiderDocumentType } from '@/lib/db/types'

const TRAINER_RECORD_TYPES = new Set<TrainerDocumentType>(['instructor_contract', 'other'])
const RIDER_RECORD_TYPES = new Set<RiderDocumentType>(['liability_waiver', 'lease_agreement', 'boarding_contract', 'other'])

function canManage(callerRole: string, isOwnPage: boolean): boolean {
  if (callerRole === 'manager') return true
  if (callerRole === 'trainer' && isOwnPage) return true
  if (callerRole === 'rider' && isOwnPage) return true
  return false
}

export async function uploadDocumentAction(
  barnSlug: string,
  membershipId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    return { error: 'Forbidden' }
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    return { error: 'Forbidden' }
  }

  if (!targetMembership.user_id) return { error: 'Target member has no account linked' }

  const file = formData.get('file') as File | null
  let ext: string
  try {
    ext = validateFile(file)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  const recordType = formData.get('record_type') as string
  const validTypes = targetMembership.role === 'rider' ? RIDER_RECORD_TYPES : TRAINER_RECORD_TYPES
  if (!validTypes.has(recordType as TrainerDocumentType & RiderDocumentType)) {
    return { error: 'Invalid record type' }
  }

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null

  const folder =
    targetMembership.role === 'trainer' ? 'trainers'
    : targetMembership.role === 'manager' ? 'managers'
    : 'riders'
  const storagePath = `${barn.id}/${folder}/${targetMembership.user_id}/${Date.now()}.${ext}`

  try {
    await uploadFile(storagePath, file!, file!.type)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  try {
    if (targetMembership.role === 'rider') {
      await createDocument('rider', barn.id, targetMembership.user_id, recordType as RiderDocumentType, storagePath, file!.name, file!.size, notes)
    } else {
      await createDocument('trainer', barn.id, targetMembership.user_id, recordType as TrainerDocumentType, storagePath, file!.name, file!.size, notes)
    }
  } catch (dbError) {
    await removeFile(storagePath).catch(() => {})
    return { error: getErrorMessage(dbError) }
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}

export async function deleteDocumentAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  storagePath: string
): Promise<{ error: string | null }> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    return { error: 'Forbidden' }
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    return { error: 'Forbidden' }
  }

  if (!targetMembership.user_id) return { error: 'Target member has no account linked' }

  try {
    if (targetMembership.role === 'rider') {
      await deleteDocument('rider', docId, targetMembership.user_id, barn.id)
    } else {
      await deleteDocument('trainer', docId, targetMembership.user_id, barn.id)
    }
  } catch (dbError) {
    return { error: getErrorMessage(dbError) }
  }

  await removeFile(storagePath).catch(() => {})

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}
