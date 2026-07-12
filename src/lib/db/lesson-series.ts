import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Lesson, LessonSeries, LessonType, PaymentType } from './types'

export async function createLessonSeries(params: {
  barnId: string
  instructorId: string | null
  lessonAt: string
  fee: number
  horseIds: string[]
  exertionLevels: number[]
  riderIds: string[]
  lessonType: LessonType
  jumping?: boolean
  tierName?: string
  paymentType?: PaymentType | null
  /** @deprecated ignored by the RPC — instructor_cut is now re-derived server-side from the tier/barn config (#776 review fix) */
  instructorCut?: number
}, client?: SupabaseClient): Promise<Lesson> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('create_lesson_series_with_participants', {
    p_barn_id: params.barnId,
    p_instructor_id: params.instructorId,
    p_lesson_at: params.lessonAt,
    p_fee: params.fee,
    p_horse_ids: params.horseIds,
    p_exertion_levels: params.exertionLevels,
    p_rider_ids: params.riderIds,
    p_lesson_type: params.lessonType,
    p_jumping: params.jumping ?? false,
    p_tier_name: params.tierName ?? 'Custom',
    p_payment_type: params.paymentType ?? null,
    p_instructor_cut: params.instructorCut ?? 0,
  })
  if (error) throw error
  return data as Lesson
}

export async function getSeriesById(seriesId: string, barnId: string, client?: SupabaseClient): Promise<LessonSeries | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('lesson_series')
    .select()
    .eq('id', seriesId)
    .eq('barn_id', barnId)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function generateNextLessonForSeries(seriesId: string, barnId: string, lessonAt: string, client?: SupabaseClient): Promise<Lesson> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('generate_lesson_for_series', {
    p_series_id: seriesId,
    p_barn_id: barnId,
    p_lesson_at: lessonAt,
  })
  if (error) throw error
  return data as Lesson
}

export async function stopLessonSeries(seriesId: string, barnId: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase
    .from('lesson_series')
    .update({ is_active: false })
    .eq('id', seriesId)
    .eq('barn_id', barnId)
  if (error) throw error
}
