import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { getBarnBySlug } from '@/lib/db/barns'
import { seedManagerProfile } from '@/lib/db/profiles'

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

  const barn = await getBarnBySlug(barnSlug, supabase)
  if (!barn) throw new Error(`Barn slug not found: "${barnSlug}"`)

  await seedManagerProfile(email, firstName, lastName, barn.id, 'manager', supabase)

  console.log(`\nSeeded ${firstName} ${lastName} <${email}> as manager for barn "${barnSlug}".`)
  console.log('Log in with Google to activate your account.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-account failed:', err.message)
    process.exit(1)
  })
}
