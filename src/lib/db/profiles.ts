import { createClient } from '@/lib/supabase/server'
import type { Profile, Role } from './types'

export async function upsertProfile(
  userId: string,
  email: string,
  firstName: string,
  lastName: string
): Promise<Profile> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, email, first_name: firstName, last_name: lastName },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}

export async function seedManagerProfile(
  email: string,
  firstName: string,
  lastName: string,
  barnId: string,
  role: Role
): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase.from('profiles').insert({
    email,
    first_name: firstName,
    last_name: lastName,
    barn_id: barnId,
    role,
  })

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
