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
