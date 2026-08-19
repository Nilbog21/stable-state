import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/db/service-role'

export {
  mustSucceed,
  createServiceClient,
  findAuthUserIdsByEmails,
  findOrCreateAuthUser,
  teardownBarnData,
  teardownAllData,
} from '@/lib/db/service-role'

export async function runCronJob(
  name: string,
  fn: (supabase: SupabaseClient) => Promise<{ summary: string; hadErrors: boolean }>
): Promise<void> {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
    const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
    if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

    const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)
    const { summary, hadErrors } = await fn(supabase)
    console.log(summary)
    if (hadErrors) process.exit(1)
  } catch (err) {
    console.error(`${name} failed:`, (err as Error).message)
    process.exit(1)
  }
}

export function assertDevProject(supabaseUrl: string): void {
  const devSupabaseUrl = process.env.DEV_SUPABASE_URL
  if (!devSupabaseUrl) {
    throw new Error('DEV_SUPABASE_URL is not set — refusing to run against an unverified Supabase project')
  }
  if (supabaseUrl !== devSupabaseUrl) {
    throw new Error(
      `NEXT_PUBLIC_SUPABASE_URL (${supabaseUrl}) does not match DEV_SUPABASE_URL (${devSupabaseUrl}) — refusing to run against a non-dev Supabase project`
    )
  }
}
