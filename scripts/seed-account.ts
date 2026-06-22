import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { seedManagerProfile } from '@/lib/db/profiles'
import type { SupabaseClient } from '@supabase/supabase-js'

export function mustSucceed<T>(result: { data: T | null; error: unknown }, label: string): T {
  const err = result.error as { message?: string } | null
  if (err) throw new Error(`${label}: ${err.message}`)
  return result.data as T
}

export async function resolveBarnId(supabase: SupabaseClient, slug: string): Promise<string> {
  const { data, error } = await supabase.from('barns').select('id').eq('slug', slug).single()
  if (error || !data) throw new Error(`Barn slug not found: "${slug}"`)
  return (data as { id: string }).id
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const email = process.env.SEED_EMAIL
  const firstName = process.env.SEED_FIRST_NAME
  const lastName = process.env.SEED_LAST_NAME
  const barnSlug = process.env.SEED_BARN_SLUG

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!email) throw new Error('SEED_EMAIL is required')
  if (!firstName) throw new Error('SEED_FIRST_NAME is required')
  if (!lastName) throw new Error('SEED_LAST_NAME is required')
  if (!barnSlug) throw new Error('SEED_BARN_SLUG is required')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const barnId = await resolveBarnId(supabase, barnSlug)
  await seedManagerProfile(email, firstName, lastName, barnId, 'manager', supabase)

  console.log(`\nSeeded ${firstName} ${lastName} <${email}> as manager for barn "${barnSlug}".`)
  console.log('Log in with Google to activate your account.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-account failed:', err.message)
    process.exit(1)
  })
}
