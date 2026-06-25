import { createClient } from '@/lib/supabase/server'
import { upsertProfile } from './profiles'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from './types'

export async function createSeededAccount(
  email: string,
  firstName: string,
  lastName: string,
  barnId: string,
  role: Role,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.from('seeded_accounts').upsert(
    { email, first_name: firstName, last_name: lastName, barn_id: barnId, role },
    { onConflict: 'email' }
  )
  if (error) throw error
}

export async function activateSeededAccount(
  userId: string,
  email: string,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { data: seeded } = await supabase
    .from('seeded_accounts')
    .select('*')
    .eq('email', email)
    .maybeSingle()

  if (!seeded) return

  await upsertProfile(userId, email, seeded.first_name, seeded.last_name, supabase)

  const { error: memErr } = await supabase.from('barn_memberships').upsert(
    {
      user_id: userId,
      barn_id: seeded.barn_id,
      role: seeded.role,
      status: 'active',
      can_instruct: seeded.role === 'trainer',
    },
    { onConflict: 'user_id,barn_id' }
  )
  if (memErr) throw memErr

  const { error: delErr } = await supabase.from('seeded_accounts').delete().eq('email', email)
  if (delErr) throw delErr
}
