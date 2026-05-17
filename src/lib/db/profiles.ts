import { createClient } from '@/lib/supabase/server'
import type { Profile } from './types'

export async function upsertProfile(
  userId: string,
  firstName: string,
  lastName: string
): Promise<Profile> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .upsert(
      { user_id: userId, first_name: firstName, last_name: lastName },
      { onConflict: 'user_id' }
    )
    .select()
    .single()

  if (error) throw error
  return data
}
