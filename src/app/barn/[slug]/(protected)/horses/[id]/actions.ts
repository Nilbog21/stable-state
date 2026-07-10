'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { updateHorseDetails } from '@/lib/db/horses'
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

  const status = formData.get('status')
  if (status !== 'active' && status !== 'unavailable' && status !== 'inactive') return

  const name = (formData.get('name') as string | null)?.trim() || null
  const isActive = status !== 'inactive'
  const isAvailable = status === 'active'
  const reason = status === 'unavailable'
    ? ((formData.get('reason') as string | null)?.trim() || null)
    : null

  await updateHorseDetails(horseId, barn.id, {
    ...(name ? { name } : {}),
    is_active: isActive,
    is_available: isAvailable,
    unavailability_reason: reason,
  })

  revalidatePath(`/barn/${barnSlug}/horses`)
  revalidatePath(`/barn/${barnSlug}/horses/${horseId}`)
}

export async function uploadHorseDocumentAction(
  barnSlug: string,
  horseId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer'])

  try {
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
    return { error: null }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Upload failed' }
  }
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
