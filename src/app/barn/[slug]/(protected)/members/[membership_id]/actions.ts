'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createTrainerDocument, deleteTrainerDocument } from '@/lib/db/trainer-documents'
import { createRiderDocument, deleteRiderDocument } from '@/lib/db/rider-documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
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
): Promise<void> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) throw new Error('Not found')

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    throw new Error('Forbidden')
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    throw new Error('Forbidden')
  }

  if (!targetMembership.user_id) throw new Error('Target member has no account linked')

  const file = formData.get('file') as File | null
  const ext = validateFile(file)

  const recordType = formData.get('record_type') as string
  const validTypes = targetMembership.role === 'rider' ? RIDER_RECORD_TYPES : TRAINER_RECORD_TYPES
  if (!validTypes.has(recordType as TrainerDocumentType & RiderDocumentType)) throw new Error('Invalid record type')

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null

  const folder =
    targetMembership.role === 'trainer' ? 'trainers'
    : targetMembership.role === 'manager' ? 'managers'
    : 'riders'
  const storagePath = `${barn.id}/${folder}/${targetMembership.user_id}/${Date.now()}.${ext}`

  await uploadFile(storagePath, file!, file!.type)

  try {
    if (targetMembership.role === 'rider') {
      await createRiderDocument(barn.id, targetMembership.user_id, recordType as RiderDocumentType, storagePath, file!.name, file!.size, notes)
    } else {
      await createTrainerDocument(barn.id, targetMembership.user_id, recordType as TrainerDocumentType, storagePath, file!.name, file!.size, notes)
    }
  } catch (dbError) {
    await removeFile(storagePath).catch(() => {})
    throw dbError
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
}

export async function deleteDocumentAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  storagePath: string
): Promise<void> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) throw new Error('Not found')

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    throw new Error('Forbidden')
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    throw new Error('Forbidden')
  }

  if (targetMembership.role === 'rider') {
    await deleteRiderDocument(docId, barn.id)
  } else {
    await deleteTrainerDocument(docId, barn.id)
  }

  await removeFile(storagePath).catch(() => {})

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
}
