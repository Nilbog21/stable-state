import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
export const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx'])
// Vercel hard-caps request bodies at 4.5 MB at the edge, independent of next.config.ts's bodySizeLimit.
export const MAX_FILE_SIZE = 4500000

export const PHOTO_MIME_TYPES = new Set(['image/jpeg', 'image/png'])
export const PHOTO_EXTENSIONS = new Set(['jpg', 'jpeg', 'png'])

export function validateFile(
  file: File | null,
  allowedMimeTypes: Set<string> = ALLOWED_MIME_TYPES,
  allowedExtensions: Set<string> = ALLOWED_EXTENSIONS
): string {
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 4.5 MB limit')
  if (!allowedMimeTypes.has(file.type)) throw new Error('Unsupported file type')
  const nameParts = file.name.split('.')
  const ext = (nameParts.length > 1 ? nameParts.pop() : '') || ''
  if (!allowedExtensions.has(ext.toLowerCase())) throw new Error('Unsupported file type')
  return ext.toLowerCase()
}

export async function uploadFile(storagePath: string, file: File, contentType: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.storage.from('documents').upload(storagePath, file, { contentType })
  if (error) throw error
}

export async function removeFile(storagePath: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.storage.from('documents').remove([storagePath])
  if (error) throw error
}

export async function getSignedUrl(storagePath: string): Promise<string> {
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from('documents').createSignedUrl(storagePath, 300)
  if (error) throw error
  if (!data?.signedUrl) throw new Error('No signed URL returned')
  return data.signedUrl
}
