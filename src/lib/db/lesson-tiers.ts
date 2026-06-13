import { createClient } from '@/lib/supabase/server'
import type { LessonTier } from './types'

export async function getTiersByBarn(barnId: string): Promise<LessonTier[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_tiers')
    .select('*')
    .eq('barn_id', barnId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data ?? []
}

export async function createTier(
  barnId: string,
  name: string,
  price: number | null,
  isDefault = false
): Promise<LessonTier> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_tiers')
    .insert({ barn_id: barnId, name, price, is_default: isDefault })
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('No data returned')
  return data
}

export async function updateTier(
  tierId: string,
  barnId: string,
  updates: { name?: string; price?: number | null }
): Promise<LessonTier> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('lesson_tiers')
    .update(updates)
    .eq('id', tierId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('No data returned')
  return data
}

export async function deactivateTier(tierId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('lesson_tiers')
    .update({ is_active: false })
    .eq('id', tierId)
    .eq('barn_id', barnId)

  if (error) throw error
}

export async function setDefaultTier(tierId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.rpc('set_default_tier', { p_tier_id: tierId, p_barn_id: barnId })
  if (error) throw error
}
