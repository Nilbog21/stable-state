import { createClient } from '@/lib/supabase/server'
import type { Horse } from './types'

export async function getHorsesByBarn(barnId: string): Promise<Horse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)
    .order('name')

  if (error) throw error
  return data
}

export async function createHorse(barnId: string, name: string): Promise<Horse> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .insert({ barn_id: barnId, name })
    .select()
    .single()

  if (error) throw error
  return data
}
