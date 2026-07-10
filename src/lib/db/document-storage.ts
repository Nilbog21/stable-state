import { createClient } from '@/lib/supabase/server'

export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
export const ALLOWED_EXTENSIONS = new Set(['pdf', 'jpg', 'jpeg', 'png', 'docx'])
export const MAX_FILE_SIZE = 10 * 1024 * 1024

export function validateFile(file: File | null): string {
  if (!file || file.size === 0) throw new Error('No file provided')
  if (file.size > MAX_FILE_SIZE) throw new Error('File exceeds 10 MB limit')
  if (!ALLOWED_MIME_TYPES.has(file.type)) throw new Error('Unsupported file type')
  const nameParts = file.name.split('.')
  const ext = (nameParts.length > 1 ? nameParts.pop() : '') || ''
  if (!ALLOWED_EXTENSIONS.has(ext.toLowerCase())) throw new Error('Unsupported file type')
  return ext.toLowerCase()
}

export async function uploadFile(storagePath: string, file: File, contentType: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.storage.from('documents').upload(storagePath, file, { contentType })
  if (error) throw error
}

export async function removeFile(storagePath: string): Promise<void> {
  const supabase = await createClient()
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
