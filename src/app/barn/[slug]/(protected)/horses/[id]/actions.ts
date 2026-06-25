'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { createHorseDocument, deleteHorseDocument } from '@/lib/db/horse-documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
import type { HorseDocumentType } from '@/lib/db/types'

const HORSE_RECORD_TYPES = new Set<HorseDocumentType>(['insurance_binder', 'coggins', 'shot_record', 'contract', 'other'])

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
  const ext = validateFile(file)

  const recordType = formData.get('record_type') as string
  if (!HORSE_RECORD_TYPES.has(recordType as HorseDocumentType)) throw new Error('Invalid record type')

  const notes = ((formData.get('notes') as string | null) ?? '').trim() || null
  const storagePath = `${barn.id}/horses/${horseId}/${Date.now()}.${ext}`

  await uploadFile(storagePath, file!, file!.type)

  try {
    await createHorseDocument(barn.id, horseId, recordType as HorseDocumentType, storagePath, file!.name, file!.size, notes)
  } catch (dbError) {
    await removeFile(storagePath).catch(() => {})
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
  await deleteHorseDocument(docId, horseId, barn.id)
  await removeFile(storagePath).catch(() => {})
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}
