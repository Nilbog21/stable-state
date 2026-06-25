import { createClient } from '@/lib/supabase/server'
import type { HorseDocument, HorseDocumentType } from './types'

export async function getHorseDocuments(horseId: string, barnId: string): Promise<HorseDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_documents')
    .select('*')
    .eq('horse_id', horseId)
    .eq('barn_id', barnId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createHorseDocument(
  barnId: string,
  horseId: string,
  recordType: HorseDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
): Promise<HorseDocument> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_documents')
    .insert({ barn_id: barnId, horse_id: horseId, record_type: recordType, storage_path: storagePath, file_name: fileName, file_size: fileSize, notes })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteHorseDocument(id: string, horseId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horse_documents')
    .delete()
    .eq('id', id)
    .eq('horse_id', horseId)
    .eq('barn_id', barnId)
  if (error) throw error
}

