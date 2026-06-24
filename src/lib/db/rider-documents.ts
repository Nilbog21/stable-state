import { createClient } from '@/lib/supabase/server'
import type { RiderDocument, RiderDocumentType } from './types'

export async function getRiderDocuments(riderId: string, barnId: string): Promise<RiderDocument[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rider_documents')
    .select('*')
    .eq('rider_id', riderId)
    .eq('barn_id', barnId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function createRiderDocument(
  barnId: string,
  riderId: string,
  recordType: RiderDocumentType,
  storagePath: string,
  fileName: string,
  fileSize: number,
  notes: string | null
): Promise<RiderDocument> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rider_documents')
    .insert({ barn_id: barnId, rider_id: riderId, record_type: recordType, storage_path: storagePath, file_name: fileName, file_size: fileSize, notes })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function deleteRiderDocument(id: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('rider_documents')
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
