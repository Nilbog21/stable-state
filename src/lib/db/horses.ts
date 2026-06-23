import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Horse, HorseExertionSummary } from './types'

export async function getHorsesByBarn(barnId: string): Promise<Horse[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .select()
    .eq('barn_id', barnId)
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data
}

export async function createHorse(barnId: string, name: string, client?: SupabaseClient): Promise<Horse> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('horses')
    .insert({ barn_id: barnId, name })
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateHorse(horseId: string, name: string): Promise<Horse> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horses')
    .update({ name })
    .eq('id', horseId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function deleteHorse(horseId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('horses')
    .update({ is_active: false })
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
}

export async function getHorseExertionSummary(
  barnId: string,
  since: Date
): Promise<HorseExertionSummary[]> {
  const supabase = await createClient()

  const { data: horses, error: horsesError } = await supabase
    .from('horses')
    .select('id, name')
    .eq('barn_id', barnId)
    .order('name')

  if (horsesError) throw horsesError
  if (!horses.length) return []

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('id, jumping')
    .eq('barn_id', barnId)
    .gte('lesson_at', since.toISOString())

  if (lessonsError) throw lessonsError

  if (!lessons.length) {
    return horses.map((h) => ({ id: h.id, name: h.name, lessonCount: 0, totalExertion: 0, jumpingCount: 0 }))
  }

  const lessonIds = lessons.map((l) => l.id)
  const jumpingLessonIds = new Set(lessons.filter((l) => l.jumping).map((l) => l.id))

  const { data: lessonHorses, error: lessonHorsesError } = await supabase
    .from('lesson_horses')
    .select('lesson_id, horse_id, exertion_level')
    .in('lesson_id', lessonIds)

  if (lessonHorsesError) throw lessonHorsesError

  return horses.map((h) => {
    const entries = (lessonHorses ?? []).filter((lh) => lh.horse_id === h.id)
    return {
      id: h.id,
      name: h.name,
      lessonCount: entries.length,
      totalExertion: entries.reduce((sum, e) => sum + e.exertion_level, 0),
      jumpingCount: entries.filter((e) => jumpingLessonIds.has(e.lesson_id)).length,
    }
  })
}
