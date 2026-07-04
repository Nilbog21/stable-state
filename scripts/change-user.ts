import { fileURLToPath } from 'url'
import * as readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import { getBarnBySlug } from '@/lib/db/barns'

export function mustSucceed<T>(result: { data: T | null; error: unknown }, label: string): T {
  const err = result.error as { message?: string } | null
  if (err) throw new Error(`${label}: ${err.message}`)
  return result.data as T
}

export function isSelfSelect(devEmail: string, targetEmail: string): boolean {
  return devEmail === targetEmail
}

export function formatProfileLine(
  profile: { first_name: string; last_name: string; email: string },
  index: number
): string {
  return `${index + 1}. ${profile.first_name} ${profile.last_name} <${profile.email}>`
}

async function promptSelection(max: number): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve, reject) => {
    rl.question(`Select a profile [1-${max}]: `, (answer) => {
      rl.close()
      const n = parseInt(answer, 10)
      if (isNaN(n) || n < 1 || n > max) {
        reject(new Error(`Invalid selection: "${answer}"`))
      } else {
        resolve(n)
      }
    })
  })
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const DEV_EMAIL = process.env.DEV_EMAIL
  const DEV_NAME = process.env.DEV_NAME
  const BARN_SLUG = process.env.CHANGE_USER_BARN_SLUG

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!DEV_EMAIL) throw new Error('DEV_EMAIL is required')
  if (!DEV_NAME) throw new Error('DEV_NAME is required')
  if (!BARN_SLUG) throw new Error('CHANGE_USER_BARN_SLUG is required')

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const barn = await getBarnBySlug(BARN_SLUG, supabase)
  if (!barn) throw new Error(`barn not found: ${BARN_SLUG}`)
  const barnId: string = barn.id

  const profiles = mustSucceed(
    await supabase
      .from('profiles')
      .select('user_id, email, first_name, last_name')
      .order('created_at', { ascending: true }),
    'fetch profiles'
  )

  profiles.forEach((p: { user_id: string | null; email: string; first_name: string; last_name: string }, i: number) => {
    console.log(formatProfileLine(p, i))
  })

  const selection = await promptSelection(profiles.length)
  const target = profiles[selection - 1] as { user_id: string | null; email: string; first_name: string; last_name: string }

  const devProfile = mustSucceed<{ user_id: string | null }>(
    await supabase.from('profiles').select('user_id').eq('email', DEV_EMAIL).single(),
    'fetch dev profile'
  )

  if (!devProfile.user_id) {
    console.error('sign in to the app first, then run this script')
    process.exit(1)
  }

  const devUserId: string = devProfile.user_id

  if (isSelfSelect(DEV_EMAIL, target.email)) {
    mustSucceed(
      await supabase
        .from('barn_memberships')
        .update({ role: 'manager', can_instruct: false })
        .eq('user_id', devUserId)
        .eq('barn_id', barnId),
      'restore manager membership'
    )
    console.log('Refresh your preview page.')
    return
  }

  if (!target.user_id) {
    console.error(`${target.email} has not signed in yet — cannot switch to this profile`)
    process.exit(1)
  }

  const targetUserId: string = target.user_id

  const targetMembership = mustSucceed<{ role: string; can_instruct: boolean }>(
    await supabase
      .from('barn_memberships')
      .select('role, can_instruct')
      .eq('user_id', targetUserId)
      .eq('barn_id', barnId)
      .single(),
    'fetch target membership'
  )

  mustSucceed(
    await supabase
      .from('barn_memberships')
      .update({ role: targetMembership.role, can_instruct: targetMembership.can_instruct })
      .eq('user_id', devUserId)
      .eq('barn_id', barnId),
    'update dev membership'
  )

  const targetBm = mustSucceed<{ id: string }>(
    await supabase.from('barn_memberships').select('id').eq('user_id', targetUserId).eq('barn_id', barnId).single(),
    'fetch target barn membership'
  )
  const devBm = mustSucceed<{ id: string }>(
    await supabase.from('barn_memberships').select('id').eq('user_id', devUserId).eq('barn_id', barnId).single(),
    'fetch dev barn membership'
  )

  if (targetMembership.can_instruct) {
    mustSucceed(
      await supabase
        .from('lessons')
        .update({ instructor_id: devBm.id })
        .eq('instructor_id', targetBm.id)
        .eq('barn_id', barnId),
      'reassign lessons'
    )
  }

  if (targetMembership.role === 'rider') {
    mustSucceed(
      await supabase
        .from('lesson_riders')
        .update({ rider_id: devBm.id })
        .eq('rider_id', targetBm.id)
        .eq('barn_id', barnId),
      'reassign lesson riders'
    )
  }

  console.log('Refresh your preview page.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('change-user failed:', err.message)
    process.exit(1)
  })
}
