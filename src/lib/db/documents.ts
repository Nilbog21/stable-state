import { createClient } from '@/lib/supabase/server'
import { resolveHorseNames } from './horses'
import type {
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
  trainer: { table: 'trainer_documents', idColumn: 'trainer_id' },
}

export async function getDocuments(entity: 'horse', entityId: string, barnId: string): Promise<HorseDocument[]>
export async function getDocuments(entity: 'rider', entityId: string, barnId: string): Promise<RiderDocument[]>
export async function getDocuments(entity: 'trainer', entityId: string, barnId: string): Promise<TrainerDocument[]>
export async function getDocuments(entity: Entity, entityId: string, barnId: string) {
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

export async function getDueDocuments(barnId: string, today: string): Promise<DueDocument[]> {
  const supabase = await createClient()

  const { data: horseDocs, error: horseError } = await supabase
    .from('horse_documents')
    .select('*')
    .eq('barn_id', barnId)
    .lte('reminder_date', today)
  if (horseError) throw horseError

  const { data: trainerDocs, error: trainerError } = await supabase
    .from('trainer_documents')
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

  const horseIds = [...new Set((horseDocs ?? []).map((d) => d.horse_id as string))]
  const horseNames = await resolveHorseNames(horseIds, barnId, supabase)

  const ownerUserIds = [
    ...new Set([
      ...(trainerDocs ?? []).map((d) => d.trainer_id as string),
      ...(riderDocs ?? []).map((d) => d.rider_id as string),
    ]),
  ]

  const membershipByUserId = new Map<string, string>()
  const nameByUserId = new Map<string, string>()

  if (ownerUserIds.length) {
    const { data: memberships, error: membershipsError } = await supabase
      .from('barn_memberships')
      .select('id, user_id')
      .eq('barn_id', barnId)
      .in('user_id', ownerUserIds)
    if (membershipsError) throw membershipsError
    for (const m of memberships ?? []) membershipByUserId.set(m.user_id, m.id)

    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('user_id, first_name, last_name')
      .in('user_id', ownerUserIds)
    if (profilesError) throw profilesError
    for (const p of profiles ?? []) nameByUserId.set(p.user_id, `${p.first_name} ${p.last_name}`)
  }

  const results: DueDocument[] = [
    ...(horseDocs ?? []).map((d) => ({
      id: d.id,
      entity: 'horse' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: d.reminder_date as string,
      ownerName: horseNames.get(d.horse_id) ?? d.horse_id,
      ownerId: d.horse_id,
    })),
    ...(trainerDocs ?? []).map((d) => ({
      id: d.id,
      entity: 'trainer' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: d.reminder_date as string,
      ownerName: nameByUserId.get(d.trainer_id) ?? 'Unknown Member',
      ownerId: membershipByUserId.get(d.trainer_id) ?? d.trainer_id,
    })),
    ...(riderDocs ?? []).map((d) => ({
      id: d.id,
      entity: 'rider' as const,
      recordType: d.record_type,
      fileName: d.file_name,
      reminderDate: d.reminder_date as string,
      ownerName: nameByUserId.get(d.rider_id) ?? 'Unknown Member',
      ownerId: membershipByUserId.get(d.rider_id) ?? d.rider_id,
    })),
  ]

  return results.sort((a, b) => a.reminderDate.localeCompare(b.reminderDate))
}
