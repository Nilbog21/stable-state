import { createClient } from '@/lib/supabase/server'
import type {
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
  notes: string | null
): Promise<HorseDocument>
export async function createDocument(
  entity: 'rider',
  barnId: string,
  entityId: string,
  recordType: RiderDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
): Promise<RiderDocument>
export async function createDocument(
  entity: 'trainer',
  barnId: string,
  entityId: string,
  recordType: TrainerDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
): Promise<TrainerDocument>
export async function createDocument(
  entity: Entity,
  barnId: string,
  entityId: string,
  recordType: HorseDocumentType | RiderDocumentType | TrainerDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
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
