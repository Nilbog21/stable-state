import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Role } from './types'

export async function createManagedMember(
  barnId: string,
  firstName: string,
  lastName: string,
  role: Role,
  client?: SupabaseClient
): Promise<{ membershipId: string }> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('create_managed_member', {
    p_barn_id: barnId,
    p_first_name: firstName,
    p_last_name: lastName,
    p_role: role,
  })
  if (error) throw error
  return { membershipId: data as string }
}

export async function claimManagedMember(
  token: string,
  userId: string,
  email: string | null,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('claim_managed_member', {
    p_token: token,
    p_user_id: userId,
    p_email: email,
  })
  if (error) throw error
}

export async function revokeInviteToken(
  membershipId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<string> {
  const supabase = client ?? await createClient()
  const newToken = crypto.randomUUID()
  const { data, error } = await supabase
    .from('barn_memberships')
    .update({ invite_token: newToken })
    .eq('id', membershipId)
    .eq('barn_id', barnId)
    .select('invite_token')
    .single()

  if (error) throw error
  return data.invite_token
}
