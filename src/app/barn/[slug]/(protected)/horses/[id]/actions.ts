'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { uploadDocumentFile, removeDocumentFile, createHorseDocument, deleteHorseDocument } from '@/lib/db/horse-documents'
import type { HorseDocumentType } from '@/lib/db/types'

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx'])
const MAX_FILE_SIZE = 5 * 1024 * 1024
const HORSE_RECORD_TYPES = new Set<HorseDocumentType>(['insurance_binder', 'coggins', 'shot_record', 'contract'])

export async function updateHorseAvailabilityAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const isAvailable = formData.get('is_available') === 'true'
  const rawReason = (formData.get('reason') as string | null)?.trim() || null
  const reason = isAvailable ? null : rawReason

  await setHorseAvailability(horseId, barn.id, isAvailable, reason)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function renameHorseAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  const name = (formData.get('name') as string | null)?.trim() ?? ''
  if (!name) return
  await updateHorse(horseId, barn.id, name)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function setHorseActiveAction(
  barnSlug: string,
  horseId: string,
  isActive: boolean
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])
  await setHorseActive(horseId, barn.id, isActive)
  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function uploadHorseDocumentAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const file = formData.get('file') as File | null
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 5 MB limit')
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error('Unsupported file type')

  const recordType = formData.get('record_type') as string
  if (!HORSE_RECORD_TYPES.has(recordType as HorseDocumentType)) throw new Error('Invalid record type')

  const nameParts = file.name.split('.')
  const ext = (nameParts.length > 1 ? nameParts.pop() : '') || ''
  if (!ALLOWED_EXTENSIONS.has(ext.toLowerCase())) throw new Error('Unsupported file type')

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null
  const storagePath = `${barn.id}/horses/${horseId}/${Date.now()}.${ext}`

  await uploadDocumentFile(storagePath, file, file.type)

  try {
    await createHorseDocument(barn.id, horseId, recordType as HorseDocumentType, storagePath, file.name, file.size, notes)
  } catch (dbError) {
    await removeDocumentFile(storagePath).catch(() => {})
    throw dbError
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
  await deleteHorseDocument(docId, barn.id)
  await removeDocumentFile(storagePath)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}
