import { createClient } from '@/lib/supabase/server'
import type { BarnEvent, BarnEventInput } from './types'

export async function getEventsByBarn(barnId: string): Promise<BarnEvent[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_events')
    .select('*')
    .eq('barn_id', barnId)
    .order('event_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function getEventById(eventId: string, barnId: string): Promise<BarnEvent | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_events')
    .select('*')
    .eq('id', eventId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  return data
}

// Hydrates a set of getScheduleForRange event ids into display data, same idiom as
// getLessonsByIds/getExpensesByIds. No extra hydration needed -- BarnEvent has no derived
// display fields.
export async function getEventsByIds(barnId: string, ids: string[]): Promise<BarnEvent[]> {
  if (!ids.length) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_events')
    .select('*')
    .eq('barn_id', barnId)
    .in('id', ids)

  if (error) throw error
  return data ?? []
}

export async function createEvent(barnId: string, input: BarnEventInput): Promise<BarnEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_events')
    .insert({
      barn_id: barnId,
      title: input.title,
      event_at: input.eventAt,
      notes: input.notes ?? null,
      visible_to_roles: input.visibleToRoles,
    })
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('No data returned')
  return data
}

export async function updateEvent(eventId: string, barnId: string, input: BarnEventInput): Promise<BarnEvent> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('barn_events')
    .update({
      title: input.title,
      event_at: input.eventAt,
      notes: input.notes ?? null,
      visible_to_roles: input.visibleToRoles,
    })
    .eq('id', eventId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('No data returned')
  return data
}

export async function deleteEvent(eventId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('barn_events')
    .delete()
    .eq('id', eventId)
    .eq('barn_id', barnId)

  if (error) throw error
}
