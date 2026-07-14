import { fileURLToPath } from 'url'
import * as readline from 'readline'
import { createClient } from '@supabase/supabase-js'
import { assertDevProject } from './script-utils'

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

export function formatBarnLine(barn: { name: string; slug: string }, index: number): string {
  return `${index + 1}. ${barn.name} (${barn.slug})`
}

export function mergeMembersWithProfiles<M extends { profile_id: string }, P extends { id: string }>(
  memberships: M[],
  profiles: P[]
): P[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  return memberships.map((m) => profileMap.get(m.profile_id)).filter((p): p is P => p !== undefined)
}

// Vacating the dev's own row must null it (not restore devUserId) since the target row is about
// to take devUserId — barn_memberships' UNIQUE(user_id, barn_id) forbids both holding it at once.
export function resolveRevertUserId(
  currentRowProfileId: string,
  devProfileId: string,
  ownerUserId: string | null
): string | null {
  return currentRowProfileId === devProfileId ? null : ownerUserId
}

async function promptSelection(max: number): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve, reject) => {
    rl.once('close', () => reject(new Error('input closed before a selection was made')))
    rl.question(`Select a profile [1-${max}]: `, (answer) => {
      const n = parseInt(answer, 10)
      if (isNaN(n) || n < 1 || n > max) {
        reject(new Error(`Invalid selection: "${answer}"`))
      } else {
        resolve(n)
      }
      rl.close()
    })
  })
}

async function promptConfirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve, reject) => {
    rl.once('close', () => reject(new Error('input closed before an answer was given')))
    rl.question(`${question} (y/N): `, (answer) => {
      resolve(answer.trim().toLowerCase() === 'y')
      rl.close()
    })
  })
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const DEV_EMAIL = process.env.DEV_EMAIL
  const DEV_NAME = process.env.DEV_NAME

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (!DEV_EMAIL) throw new Error('DEV_EMAIL is required')
  if (!DEV_NAME) throw new Error('DEV_NAME is required')
  assertDevProject(SUPABASE_URL)

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const barns = mustSucceed(
    await supabase.from('barns').select('id, name, slug').order('name', { ascending: true }),
    'fetch barns'
  )
  if (barns.length === 0) {
    console.error('no barns found')
    process.exit(1)
  }

  barns.forEach((b: { name: string; slug: string }, i: number) => console.log(formatBarnLine(b, i)))
  const barnSelection = await promptSelection(barns.length)
  const barnId: string = barns[barnSelection - 1].id

  const devProfile = mustSucceed<{ id: string; user_id: string | null }>(
    await supabase.from('profiles').select('id, user_id').eq('email', DEV_EMAIL).single(),
    'fetch dev profile'
  )

  if (!devProfile.user_id) {
    console.error('sign in to the app first, then run this script')
    process.exit(1)
  }

  const devUserId: string = devProfile.user_id
  const devProfileId: string = devProfile.id

  const ownRow = mustSucceed<{ id: string } | null>(
    await supabase.from('barn_memberships').select('id').eq('profile_id', devProfileId).eq('barn_id', barnId).maybeSingle(),
    'fetch dev membership'
  )

  if (!ownRow) {
    console.error(`${DEV_EMAIL} is not a member of this barn — pick a different barn`)
    process.exit(1)
  }

  const memberships = mustSucceed(
    await supabase
      .from('barn_memberships')
      .select('profile_id, status')
      .eq('barn_id', barnId)
      .in('status', ['active', 'pending'])
      .order('created_at', { ascending: true }),
    'fetch barn memberships'
  )

  const profileIds = memberships.map((m: { profile_id: string }) => m.profile_id)
  const allProfiles = profileIds.length
    ? mustSucceed(
        await supabase.from('profiles').select('id, user_id, email, first_name, last_name').in('id', profileIds),
        'fetch profiles'
      )
    : []
  const profiles = mergeMembersWithProfiles(memberships, allProfiles)

  if (profiles.length === 0) {
    console.error('no members found for this barn')
    process.exit(1)
  }

  profiles.forEach((p: { user_id: string | null; email: string; first_name: string; last_name: string }, i: number) => {
    console.log(formatProfileLine(p, i))
  })

  const selection = await promptSelection(profiles.length)
  const target = profiles[selection - 1] as {
    id: string
    user_id: string | null
    email: string
    first_name: string
    last_name: string
  }

  if (!target.user_id) {
    console.error(`${target.email} has not signed in yet — cannot switch to this profile`)
    process.exit(1)
  }

  const isSelf = isSelfSelect(DEV_EMAIL, target.email)

  const targetRow = mustSucceed<{ id: string; status: string }>(
    await supabase
      .from('barn_memberships')
      .select('id, status')
      .eq('profile_id', target.id)
      .eq('barn_id', barnId)
      .single(),
    'fetch target membership'
  )

  if (targetRow.status === 'pending') {
    const label = isSelf ? 'Your own membership in this barn' : `${target.first_name} ${target.last_name}'s membership`
    const activate = await promptConfirm(`${label} is pending — activate it?`)
    if (!activate) {
      console.error('cannot switch to a pending membership without activating it')
      process.exit(1)
    }
    mustSucceed(
      await supabase.from('barn_memberships').update({ status: 'active' }).eq('id', targetRow.id),
      'activate target membership'
    )
  }

  const currentRow = mustSucceed<{ id: string; profile_id: string } | null>(
    await supabase.from('barn_memberships').select('id, profile_id').eq('user_id', devUserId).eq('barn_id', barnId).maybeSingle(),
    'fetch currently inhabited membership'
  )

  if (currentRow && currentRow.id !== targetRow.id) {
    const ownerProfile = mustSucceed<{ user_id: string | null }>(
      await supabase.from('profiles').select('user_id').eq('id', currentRow.profile_id).single(),
      'fetch rightful owner profile'
    )
    const revertUserId = resolveRevertUserId(currentRow.profile_id, devProfileId, ownerProfile.user_id)
    mustSucceed(
      await supabase.from('barn_memberships').update({ user_id: revertUserId }).eq('id', currentRow.id),
      'revert previous membership'
    )
  }

  mustSucceed(
    await supabase.from('barn_memberships').update({ user_id: devUserId }).eq('id', targetRow.id),
    'become target membership'
  )

  console.log('Refresh your preview page.')
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('change-user failed:', err.message)
    process.exit(1)
  })
}
