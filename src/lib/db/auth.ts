/**
 * Session-user lookup: `getAuthenticatedUser` returns the current Supabase auth user,
 * or `null` when no session exists — the DAL's only auth concern. Barn-membership/role
 * enforcement is built on top of it in `src/lib/auth/guard.ts`'s `requireMembership`.
 */
import { createClient } from '@/lib/supabase/server'
import type { User } from '@supabase/supabase-js'

export async function getAuthenticatedUser(): Promise<User | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
