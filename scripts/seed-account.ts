import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { getBarnBySlug } from '@/lib/db/barns'

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

  const { error: profileError } = await supabase.from('profiles').upsert(
    { email, first_name: firstName, last_name: lastName, barn_id: barn.id, role: 'manager' },
    { onConflict: 'email' }
  )
  if (profileError) throw new Error(`upsert profile: ${profileError.message}`)

  // If the dev already has an auth user (logged in before), link the profile and
  // create the membership directly so change-user.sh works without another login.
  let authUserId: string | null = null
  let page = 1
  let hasMore = true
  while (hasMore && !authUserId) {
    const { data: listData, error: listErr } = await supabase.auth.admin.listUsers({ page, perPage: 50 })
    if (listErr) throw new Error(`list auth users: ${listErr.message}`)
    if (!listData) break
    for (const user of listData.users) {
      if (user.email === email) { authUserId = user.id; break }
    }
    hasMore = listData.users.length === 50
    page++
  }

  if (authUserId) {
    const { error: linkError } = await supabase.from('profiles').update({ user_id: authUserId }).eq('email', email)
    if (linkError) throw new Error(`link profile: ${linkError.message}`)

    const { error: memberError } = await supabase.from('barn_memberships').upsert(
      { user_id: authUserId, barn_id: barn.id, role: 'manager', status: 'active', can_instruct: false },
      { onConflict: 'user_id,barn_id' }
    )
    if (memberError) throw new Error(`upsert membership: ${memberError.message}`)

    console.log(`\nLinked ${firstName} ${lastName} <${email}> as manager for barn "${barnSlug}".`)
  } else {
    console.log(`\nSeeded ${firstName} ${lastName} <${email}> as manager for barn "${barnSlug}".`)
    console.log('Log in with Google to activate your account.')
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('seed-account failed:', err.message)
    process.exit(1)
  })
}
