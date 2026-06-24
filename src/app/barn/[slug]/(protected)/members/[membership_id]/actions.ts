'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createTrainerDocument, deleteTrainerDocument, uploadDocumentFile, removeDocumentFile } from '@/lib/db/trainer-documents'
import { createRiderDocument, deleteRiderDocument } from '@/lib/db/rider-documents'
import type { TrainerDocumentType, RiderDocumentType } from '@/lib/db/types'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx'])
const MAX_FILE_SIZE = 5 * 1024 * 1024
const TRAINER_RECORD_TYPES = new Set<TrainerDocumentType>(['instructor_contract'])
const RIDER_RECORD_TYPES = new Set<RiderDocumentType>(['liability_waiver', 'lease_agreement', 'boarding_contract'])

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

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider') {
    throw new Error('Forbidden')
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    throw new Error('Forbidden')
  }

  if (!targetMembership.user_id) throw new Error('Target member has no account linked')

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 5 MB limit')
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error('Unsupported file type')

  const recordType = formData.get('record_type') as string
  const validTypes = targetMembership.role === 'trainer' ? TRAINER_RECORD_TYPES : RIDER_RECORD_TYPES
  if (!validTypes.has(recordType as TrainerDocumentType & RiderDocumentType)) throw new Error('Invalid record type')

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null

  const nameParts = file.name.split('.')
  const ext = (nameParts.length > 1 ? nameParts.pop() : '') || ''
  if (!ALLOWED_EXTENSIONS.has(ext.toLowerCase())) throw new Error('Unsupported file type')

  const folder = targetMembership.role === 'trainer' ? 'trainers' : 'riders'
  const storagePath = `${barn.id}/${folder}/${targetMembership.user_id}/${Date.now()}.${ext}`

  await uploadDocumentFile(storagePath, file, file.type)

  try {
    if (targetMembership.role === 'trainer') {
      await createTrainerDocument(barn.id, targetMembership.user_id, recordType as TrainerDocumentType, storagePath, file.name, file.size, notes)
    } else {
      await createRiderDocument(barn.id, targetMembership.user_id, recordType as RiderDocumentType, storagePath, file.name, file.size, notes)
    }
  } catch (dbError) {
    await removeDocumentFile(storagePath).catch(() => {})
    throw dbError
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
}

export async function deleteDocumentAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  docType: 'trainer' | 'rider',
  storagePath: string
): Promise<void> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) throw new Error('Not found')

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider') {
    throw new Error('Forbidden')
  }

  const isOwnPage = targetMembership.user_id === user.id
  if (!canManage(callerMembership.role, isOwnPage)) {
    throw new Error('Forbidden')
  }

  if (docType === 'trainer') {
    await deleteTrainerDocument(docId, barn.id)
  } else {
    await deleteRiderDocument(docId, barn.id)
  }

  await removeDocumentFile(storagePath)

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
}
