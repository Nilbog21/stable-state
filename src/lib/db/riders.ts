import { createClient } from '@/lib/supabase/server'
import type { Rider } from './types'

export async function getRidersByBarn(barnId: string): Promise<Rider[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('riders')
    .select()
    .eq('barn_id', barnId)
    .order('name')

  if (error) throw error
  return data
}

export async function createRider(barnId: string, name: string, userId?: string): Promise<Rider> {
  const supabase = await createClient()
  const payload: Record<string, unknown> = { barn_id: barnId, name }
  if (userId !== undefined) payload.user_id = userId
  const { data, error } = await supabase
    .from('riders')
    .insert(payload)
    .select()
    .single()

  if (error) throw error
  return data
}
