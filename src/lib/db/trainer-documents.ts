import { createClient } from '@/lib/supabase/server'
import type { TrainerDocument, TrainerDocumentType } from './types'

export async function getTrainerDocuments(trainerId: string, barnId: string): Promise<TrainerDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trainer_documents')
    .select('*')
    .eq('trainer_id', trainerId)
    .eq('barn_id', barnId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createTrainerDocument(
  barnId: string,
  trainerId: string,
  recordType: TrainerDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
): Promise<TrainerDocument> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('trainer_documents')
    .insert({ barn_id: barnId, trainer_id: trainerId, record_type: recordType, storage_path: storagePath, file_name: fileName, file_size: fileSize, notes })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteTrainerDocument(id: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('trainer_documents')
    .delete()
    .eq('id', id)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function getDocumentSignedUrl(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 300)
  if (error) throw error
  return data.signedUrl
}
