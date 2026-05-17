import { createClient } from '@/lib/supabase/server'
import type { Horse } from './types'

export async function getHorsesByBarn(barnId: string): Promise<Horse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)

  if (error) throw error
  return data
}
