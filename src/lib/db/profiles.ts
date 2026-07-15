import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './types'

export async function upsertProfile(
  userId: string,
  email: string,
  firstName: string,
  lastName: string,
  client?: SupabaseClient
): Promise<Profile> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, email, first_name: firstName, last_name: lastName },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) throw error
  if (!data) throw new Error('upsert returned no row')
  return data
}


export async function getProfileByUserId(userId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getProfileById(profileId: string): Promise<Profile | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', profileId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function updateProfile(
  profileId: string,
  fields: {
    first_name: string
    last_name: string
    phone?: string | null
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
  }
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', profileId)

  if (error) throw error
}

export async function updateContactInfo(
  profileId: string,
  fields: {
    phone?: string | null
    emergency_contact_name?: string | null
    emergency_contact_phone?: string | null
  },
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase
    .from('profiles')
    .update(fields)
    .eq('id', profileId)

  if (error) throw error
}

export async function getProfilesByUserIds(
  userIds: string[]
): Promise<Profile[]> {
  if (userIds.length === 0) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .in('user_id', userIds)

  if (error) throw error
  return data ?? []
}
