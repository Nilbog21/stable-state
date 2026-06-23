import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Rider } from './types'

export async function getRidersByBarn(barnId: string): Promise<Rider[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('riders')
    .select()
    .eq('barn_id', barnId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data
}

export async function createRider(barnId: string, name: string, userId?: string, client?: SupabaseClient): Promise<Rider> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
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

export async function deleteRider(riderId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('riders')
    .update({ is_active: false })
    .eq('id', riderId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
}

export async function updateRider(riderId: string, barnId: string, name: string): Promise<Rider> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('riders')
    .update({ name })
    .eq('id', riderId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}
