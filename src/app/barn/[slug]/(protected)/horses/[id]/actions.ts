'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { createHorseDocument, deleteHorseDocument } from '@/lib/db/horse-documents'
import { validateFile, uploadFile, removeFile } from '@/lib/db/document-storage'
import type { HorseDocumentType } from '@/lib/db/types'

const HORSE_RECORD_TYPES = new Set<HorseDocumentType>(['insurance_binder', 'coggins', 'shot_record', 'contract', 'other'])

export async function updateHorseDetailsAction(
  barnSlug: string,
  horseId: string,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const name = (formData.get('name') as string | null)?.trim() ?? ''
  if (!name) return

  const status = formData.get('status') as string

  await updateHorse(horseId, barn.id, name)

  if (status === 'active') {
    await setHorseActive(horseId, barn.id, true)
    await setHorseAvailability(horseId, barn.id, true, null)
  } else if (status === 'unavailable') {
    await setHorseActive(horseId, barn.id, true)
    const rawReason = (formData.get('reason') as string | null)?.trim() || null
    await setHorseAvailability(horseId, barn.id, false, rawReason)
  } else if (status === 'inactive') {
    await setHorseActive(horseId, barn.id, false)
  }

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
