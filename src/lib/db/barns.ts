import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn } from './types'

export const getBarnBySlug = cache(async function getBarnBySlug(slug: string, client?: SupabaseClient): Promise<Barn | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (error) throw error
  return data
})
