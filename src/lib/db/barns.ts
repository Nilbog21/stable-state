import { createClient } from '@/lib/supabase/server'
import type { Barn } from './types'

export async function getBarnBySlug(slug: string): Promise<Barn | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barns')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  return data
}
