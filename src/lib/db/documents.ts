/**
 * Unified horse/trainer/rider document CRUD keyed by an `entity` discriminator:
 * fetch-then-sign reads (`getDocumentsWithUrls`, pairing each row with a 300s signed URL
 * via `document-storage.ts`), create, delete, reminder-date update, and the dashboard's
 * due-reminder read `getDueDocuments`. `getDocumentsWithUrls` and `createDocument` each
 * carry one TS overload per entity so callers need no casting; `deleteDocument` and
 * `updateDocumentReminderDate` return `void` and carry none.
 */
import { createClient } from '@/lib/supabase/server'
import { getSignedUrl } from './document-storage'
import { resolveHorseNames } from './horses'
import { resolveMemberNames } from './member-names'
import { calendarDate } from '../local-day'
import type {
  CalendarDate,
  DueDocument,
  HorseDocument,
  HorseDocumentType,
  RiderDocument,
  RiderDocumentType,
  TrainerDocument,
  TrainerDocumentType,
} from './types'

type Entity = 'horse' | 'rider' | 'trainer'

const CONFIG: Record<Entity, { table: string; idColumn: string }> = {
  horse: { table: 'horse_documents', idColumn: 'horse_id' },
  rider: { table: 'rider_documents', idColumn: 'rider_id' },
  trainer: { table: 'staff_documents', idColumn: 'trainer_id' },
}

async function getDocuments(entity: Entity, entityId: string, barnId: string) {
  const { table, idColumn } = CONFIG[entity]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq(idColumn, entityId)
    .eq('barn_id', barnId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

/**
 * Documents for display, each paired with a 300s signed URL — consolidated from the
 * horse/member detail pages' previously hand-rolled fetch-then-sign copies.
 */
export async function getDocumentsWithUrls(
  entity: 'horse',
  entityId: string,
  barnId: string
): Promise<Array<{ doc: HorseDocument; signedUrl: string }>>
export async function getDocumentsWithUrls(
  entity: 'rider',
  entityId: string,
  barnId: string
): Promise<Array<{ doc: RiderDocument; signedUrl: string }>>
export async function getDocumentsWithUrls(
  entity: 'trainer',
  entityId: string,
  barnId: string
): Promise<Array<{ doc: TrainerDocument; signedUrl: string }>>
export async function getDocumentsWithUrls(entity: Entity, entityId: string, barnId: string) {
  const docs = await getDocuments(entity, entityId, barnId)
  return Promise.all(
    docs.map(async (doc) => ({
      doc,
      signedUrl: await getSignedUrl(doc.storage_path),
    }))
  )
}

export async function createDocument(
  entity: 'horse',
  barnId: string,
  entityId: string,
  recordType: HorseDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null,
  reminderDate: string | null
): Promise<HorseDocument>
export async function createDocument(
  entity: 'rider',
  barnId: string,
  entityId: string,
  recordType: RiderDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null,
  reminderDate: string | null
): Promise<RiderDocument>
export async function createDocument(
  entity: 'trainer',
  barnId: string,
  entityId: string,
  recordType: TrainerDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null,
  reminderDate: string | null
): Promise<TrainerDocument>
export async function createDocument(
  entity: Entity,
  barnId: string,
  entityId: string,
  recordType: HorseDocumentType | RiderDocumentType | TrainerDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null,
  reminderDate: string | null
) {
  const { table, idColumn } = CONFIG[entity]
  const supabase = await createClient()
  const { data, error } = await supabase
    .from(table)
    .insert({
      barn_id: barnId,
      [idColumn]: entityId,
      record_type: recordType,
      storage_path: storagePath,
      file_name: fileName,
      file_size: fileSize,
      notes,
      reminder_date: reminderDate,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteDocument(entity: Entity, id: string, entityId: string, barnId: string): Promise<void> {
  const { table, idColumn } = CONFIG[entity]
  const supabase = await createClient()
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq(idColumn, entityId)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function updateDocumentReminderDate(
  entity: Entity,
  id: string,
  entityId: string,
  barnId: string,
  reminderDate: string | null
): Promise<void> {
  const { table, idColumn } = CONFIG[entity]
  const supabase = await createClient()
  const { error } = await supabase
    .from(table)
    .update({ reminder_date: reminderDate })
    .eq('id', id)
    .eq(idColumn, entityId)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function getDueDocuments(barnId: string, today: CalendarDate): Promise<DueDocument[]> {
  const supabase = await createClient()

  const { data: horseDocs, error: horseError } = await supabase
    .from('horse_documents')
    .select('*')
    .eq('barn_id', barnId)
    .lte('reminder_date', today)
  if (horseError) throw horseError

  const { data: trainerDocs, error: trainerError } = await supabase
    .from('staff_documents')
    .select('*')
    .eq('barn_id', barnId)
    .lte('reminder_date', today)
  if (trainerError) throw trainerError

  const { data: riderDocs, error: riderError } = await supabase
    .from('rider_documents')
    .select('*')
    .eq('barn_id', barnId)
    .lte('reminder_date', today)
  if (riderError) throw riderError

  const horseDocsList = horseDocs ?? []
  const trainerDocsList = trainerDocs ?? []
  const riderDocsList = riderDocs ?? []

  const horseIds = [...new Set(horseDocsList.map((d) => d.horse_id as string))]
  const horseNames = await resolveHorseNames(horseIds, barnId, supabase)

  // trainer_id/rider_id are barn_memberships ids (the FK's ON DELETE CASCADE guarantees a
  // document can't outlive its owning membership, so no "membership removed" fallback is needed).
  const membershipIds = [
    ...new Set([
      ...trainerDocsList.map((d) => d.trainer_id as string),
      ...riderDocsList.map((d) => d.rider_id as string),
    ]),
  ]

  const namesByMembershipId = await resolveMemberNames(membershipIds, barnId, supabase)

  const results: DueDocument[] = [
    ...horseDocsList.map((d) => ({
      id: d.id,
      entity: 'horse' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: calendarDate(d.reminder_date as string),
      ownerName: horseNames.get(d.horse_id) ?? d.horse_id,
      ownerId: d.horse_id,
    })),
    ...trainerDocsList.map((d) => ({
      id: d.id,
      entity: 'trainer' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: calendarDate(d.reminder_date as string),
      ownerName: namesByMembershipId.get(d.trainer_id) ?? 'Unknown Member',
      ownerId: d.trainer_id,
    })),
    ...riderDocsList.map((d) => ({
      id: d.id,
      entity: 'rider' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: calendarDate(d.reminder_date as string),
      ownerName: namesByMembershipId.get(d.rider_id) ?? 'Unknown Member',
      ownerId: d.rider_id,
    })),
  ]

  return results.sort((a, b) => a.reminderDate.localeCompare(b.reminderDate))
}
