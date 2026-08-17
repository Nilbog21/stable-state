/**
 * Interactive dev tool (the `change-user.sh`-wrapped half): reassigns the developer's
 * own auth `user_id` between a barn's members so a local session can act as any one of
 * them. The move covers **both** columns that carry that identity — `barn_memberships.user_id`
 * (what `requireMembership` and the barn-scoped RLS policies read) and `profiles.user_id`
 * (what `profiles_own_*` and the `documents` storage policies read). Moving only the
 * membership half left the dev in a state no real user occupies, so a manual checklist walk
 * exercised profile/document behaviour nobody would ever see (#1563).
 *
 * Resolves the barn (`CHANGE_USER_BARN_SLUG` via `getBarnBySlug`, else a numbered prompt
 * over all barns), refuses unless the developer already holds a membership row there, lists
 * the barn's active members, then vacates the currently-inhabited rows — restoring their
 * rightful owner's `user_id`, or `null` for the dev's own rows — before taking over the
 * selected member's rows. `planUserIdMoves` owns that ordering and its UNIQUE-constraint
 * rationale. Because `profiles.user_id` is now a column this script *writes*, it can no
 * longer be read as the answer to "whose auth user is this really?" — `auth.users`, via
 * `findAuthUserIdsByEmails`, is that source of truth instead.
 *
 * Gated by `assertDevProject` unless `CHANGE_USER_ALLOW_PROD` is set, which in turn requires
 * an explicit barn slug (#986). The pure formatters and the move planner are the module's
 * test surface (`change-user.test.ts`).
 */
import { fileURLToPath } from 'url'
import * as readline from 'readline'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  mustSucceed,
  createServiceClient,
  assertDevProject,
  findAuthUserIdsByEmails,
} from './script-utils'

export function formatProfileLine(
  profile: { first_name: string; last_name: string; email: string },
  index: number
): string {
  return `${index + 1}. ${profile.first_name} ${profile.last_name} <${profile.email}>`
}

export function formatBarnLine(barn: { name: string; slug: string }, index: number): string {
  return `${index + 1}. ${barn.name} (${barn.slug})`
}

export function assertSlugRequiredForProd(barnSlug: string | undefined, allowProd: boolean): void {
  if (allowProd && !barnSlug) {
    throw new Error('CHANGE_USER_BARN_SLUG is required when CHANGE_USER_ALLOW_PROD is true')
  }
}

export function mergeMembersWithProfiles<M extends { profile_id: string }, P extends { id: string }>(
  memberships: M[],
  profiles: P[]
): P[] {
  const profileMap = new Map(profiles.map((p) => [p.id, p]))
  return memberships.map((m) => profileMap.get(m.profile_id)).filter((p): p is P => p !== undefined)
}

export type UserIdMove = {
  table: 'barn_memberships' | 'profiles'
  id: string
  userId: string | null
}

// Both columns must be vacated before the takeover writes devUserId: barn_memberships carries
// UNIQUE(user_id, barn_id) and profiles carries the single-column profiles_user_id_unique, so
// devUserId cannot sit on two rows of either table at once. Vacating the dev's own rows nulls
// them rather than restoring devUserId, for the same reason — the target rows are about to take it.
export function planUserIdMoves(args: {
  devUserId: string
  devProfileId: string
  target: { membershipId: string; profileId: string }
  current: { membershipId: string; profileId: string } | null
  currentOwnerUserId: string | null
}): UserIdMove[] {
  const { devUserId, devProfileId, target, current, currentOwnerUserId } = args
  const moves: UserIdMove[] = []
  if (current && current.membershipId !== target.membershipId) {
    const revertUserId = current.profileId === devProfileId ? null : currentOwnerUserId
    moves.push({ table: 'barn_memberships', id: current.membershipId, userId: revertUserId })
    moves.push({ table: 'profiles', id: current.profileId, userId: revertUserId })
  }
  moves.push({ table: 'barn_memberships', id: target.membershipId, userId: devUserId })
  moves.push({ table: 'profiles', id: target.profileId, userId: devUserId })
  return moves
}

async function promptSelection(max: number, label: string): Promise<number> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve, reject) => {
    rl.once('close', () => reject(new Error('input closed before a selection was made')))
    rl.question(`${label} [1-${max}]: `, (answer) => {
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
  const allowProd = process.env.CHANGE_USER_ALLOW_PROD === 'true'
  assertSlugRequiredForProd(BARN_SLUG, allowProd)
  if (!allowProd) assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let barnId: string
  if (BARN_SLUG) {
    const barn = await getBarnBySlug(BARN_SLUG, supabase)
    if (!barn) {
      console.error(`no barn found for slug "${BARN_SLUG}"`)
      process.exit(1)
    }
    barnId = barn.id
  } else {
    const barns = mustSucceed(
      await supabase.from('barns').select('id, name, slug').order('name', { ascending: true }),
      'fetch barns'
    )
    if (barns.length === 0) {
      console.error('no barns found')
      process.exit(1)
    }
    barns.forEach((b: { name: string; slug: string }, i: number) => console.log(formatBarnLine(b, i)))
    const barnSelection = await promptSelection(barns.length, 'Select a barn')
    barnId = barns[barnSelection - 1].id
  }

  const devProfile = mustSucceed<{ id: string }>(
    await supabase.from('profiles').select('id').eq('email', DEV_EMAIL).single(),
    'fetch dev profile'
  )

  // Not profiles.user_id: this script moves that column, so while the dev is inhabiting
  // someone else their own row reads null.
  const [devAuthUserId] = await findAuthUserIdsByEmails([DEV_EMAIL], supabase)

  if (!devAuthUserId) {
    console.error('sign in to the app first, then run this script')
    process.exit(1)
  }

  const devUserId: string = devAuthUserId
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
      .eq('status', 'active')
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

  const selection = await promptSelection(profiles.length, 'Select a profile')
  const target = profiles[selection - 1] as {
    id: string
    user_id: string | null
    email: string
    first_name: string
    last_name: string
  }

  // The dev's own row is exempt: switching back to yourself is a restore, and its user_id is
  // null precisely because a previous run vacated it.
  if (!target.user_id && target.id !== devProfileId) {
    console.error(`${target.email} has not signed in yet — cannot switch to this profile`)
    process.exit(1)
  }

  const targetRow = mustSucceed<{ id: string }>(
    await supabase
      .from('barn_memberships')
      .select('id')
      .eq('profile_id', target.id)
      .eq('barn_id', barnId)
      .single(),
    'fetch target membership'
  )

  const currentRow = mustSucceed<{ id: string; profile_id: string } | null>(
    await supabase.from('barn_memberships').select('id, profile_id').eq('user_id', devUserId).eq('barn_id', barnId).maybeSingle(),
    'fetch currently inhabited membership'
  )

  let currentOwnerUserId: string | null = null
  if (currentRow && currentRow.profile_id !== devProfileId) {
    const ownerProfile = mustSucceed<{ email: string }>(
      await supabase.from('profiles').select('email').eq('id', currentRow.profile_id).single(),
      'fetch rightful owner profile'
    )
    const [ownerAuthUserId] = await findAuthUserIdsByEmails([ownerProfile.email], supabase)
    currentOwnerUserId = ownerAuthUserId ?? null
  }

  // Both vacates precede both takeovers. Two known ceilings, both acceptable for a dev tool aimed
  // at a single-barn dev project (dev-barn), neither reachable from one barn:
  //
  // 1. The profile vacate is barn-scoped only because it mirrors the membership one, so a dev
  //    holding memberships in two barns and swapping in both ends up with the columns disagreeing.
  //    With different target profiles the profiles takeover trips profiles_user_id_unique — but
  //    only after the membership takeover of the same run has already committed. With one profile
  //    shared across both barns it writes the value already there and raises nothing at all, and
  //    reverting one barn then restores that profile while the other barn's membership still holds
  //    devUserId. Upgrade path: scope both vacates by user_id across barns rather than by the
  //    selected barn.
  // 2. PostgREST gives no transaction, so these updates land one at a time and a failure mid-loop
  //    leaves the two columns torn; the currentRow probe above reads barn_memberships only, so it
  //    won't see a stale profiles row on the next run. The failing update names its table and id.
  //    Upgrade path: a SECURITY DEFINER RPC applying the whole plan in one statement.
  const moves = planUserIdMoves({
    devUserId,
    devProfileId,
    target: { membershipId: targetRow.id, profileId: target.id },
    current: currentRow ? { membershipId: currentRow.id, profileId: currentRow.profile_id } : null,
    currentOwnerUserId,
  })

  for (const move of moves) {
    mustSucceed(
      await supabase.from(move.table).update({ user_id: move.userId }).eq('id', move.id),
      `update ${move.table} ${move.id}`
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
