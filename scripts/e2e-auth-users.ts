// The three long-lived auth logins the checklist e2e suite runs as. They are per *project*,
// not per barn — see E2E_USERS in e2e/support/fixtures.ts for why — so creating them is a
// one-time bootstrap rather than part of any seed.
//
// Modes:
//   create  — idempotent; reset-db.ts calls this after wiping the dev project
//   verify  — reports which are missing; seed-test-barn.ts calls this before seeding
//   delete  — removes them again; the password is published in this repo, so a project that
//             isn't dev (POST_RELEASE_TEST_CHECKLIST.md's prod run) must not keep them around
//
// Email/password provider must be enabled in the Supabase dashboard:
// Authentication → Providers → Email (one-time manual step per project).

import { fileURLToPath } from 'url'
import { type SupabaseClient } from '@supabase/supabase-js'
import { upsertProfile } from '@/lib/db/profiles'
import { E2E_USERS, E2E_PASSWORD } from '../e2e/support/fixtures'
import { mustSucceed, createServiceClient, findAuthUserIdsByEmails, assertDevProject } from './script-utils'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MODE = process.env.E2E_AUTH_USERS_MODE

export function formatMissingUsersError(missing: string[]): string {
  return `e2e auth users missing (${missing.join(', ')}) — run: bash scripts/e2e-auth-users.sh create`
}

/** Returns the emails that have no auth user on this project. */
export async function verifyE2eAuthUsers(supabase: SupabaseClient): Promise<string[]> {
  const missing: string[] = []
  for (const user of Object.values(E2E_USERS)) {
    const [existing] = await findAuthUserIdsByEmails([user.email], supabase)
    if (!existing) missing.push(user.email)
  }
  return missing
}

/**
 * Idempotent: an existing login has its password reset rather than being recreated, so a
 * project seeded before the password was known still ends up usable.
 */
export async function createE2eAuthUsers(supabase: SupabaseClient): Promise<void> {
  for (const user of Object.values(E2E_USERS)) {
    const [existingId] = await findAuthUserIdsByEmails([user.email], supabase)

    let userId = existingId
    if (userId) {
      const { error } = await supabase.auth.admin.updateUserById(userId, { password: E2E_PASSWORD })
      if (error) throw new Error(`reset password for ${user.email}: ${error.message}`)
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: user.email,
        password: E2E_PASSWORD,
        email_confirm: true,
      })
      if (error) throw new Error(`create ${user.email}: ${error.message}`)
      if (!data?.user) throw new Error(`create ${user.email}: no user returned`)
      userId = data.user.id
    }

    await upsertProfile(userId, user.email, user.firstName, user.lastName, supabase)

    // These three profile rows are per project and outlive every barn, so teardownBarnData can
    // never reach them — anything a spec writes here persists until something puts it back
    // (#1282: trainer@e2e.test was found holding a photo_path into a barn deleted a week
    // earlier, with the storage object orphaned behind it). This is the one place that resets
    // them to a known state, so the reset covers the photo too, object first: nulling the column
    // alone is what strands the object.
    const current = mustSucceed<{ photo_path: string | null }[]>(
      await supabase.from('profiles').select('photo_path').eq('user_id', userId),
      `read ${user.email} photo path`
    )
    const stalePhotos = current.map((p) => p.photo_path).filter((p): p is string => !!p)
    if (stalePhotos.length > 0) {
      const { error } = await supabase.storage.from('documents').remove(stalePhotos)
      if (error) throw new Error(`remove ${user.email} photo object: ${(error as { message?: string }).message}`)
    }

    // Contact fields filled in so the profile is complete — an incomplete profile redirects
    // to /profile/complete, which would derail every spec on its first navigation.
    mustSucceed(
      await supabase
        .from('profiles')
        .update({
          phone: '555-0100',
          emergency_contact_name: `${user.firstName} Emergency`,
          emergency_contact_phone: '555-0199',
          photo_path: null,
        })
        .eq('user_id', userId),
      `update ${user.email} contact fields`
    )
  }
}

export function formatBlockingMembershipsError(slugs: string[]): string {
  return (
    `e2e auth users are still members of ${slugs.length} barn(s) (${slugs.join(', ')}) — ` +
    'tear those down first: bash scripts/teardown-test-barn.sh --all'
  )
}

/**
 * Every barn slug the three logins still hold a membership in. Checked before any delete
 * because `barn_memberships` FKs to `profiles`, and clearing the memberships instead isn't a
 * fix: cascading `lesson_riders` leaves a lesson with zero riders and trips
 * assert_lesson_participant_counts. Deleting the barns from here would be too blunt — this is
 * a "remove three logins" command, not a "wipe barns" one — so it fail-closes and names them.
 */
async function blockingBarnSlugs(supabase: SupabaseClient, userIds: string[]): Promise<string[]> {
  const res = await supabase.from('barn_memberships').select('barns(slug)').in('user_id', userIds)
  mustSucceed(res, 'look up blocking barn memberships')
  // The generated types call an embedded relation an array; PostgREST actually sends a bare
  // object for a to-one FK like this one. Normalised rather than cast to either shape alone.
  type Embed = { slug: string } | { slug: string }[] | null
  const rows = (res.data ?? []) as unknown as { barns: Embed }[]
  const slugs = rows.flatMap((r) => (Array.isArray(r.barns) ? r.barns : r.barns ? [r.barns] : []))
  return [...new Set(slugs.map((b) => b.slug))]
}

/** Returns the emails that had an auth user to delete. */
export async function deleteE2eAuthUsers(supabase: SupabaseClient): Promise<string[]> {
  // Resolved up front so the membership check covers all three before anything is mutated —
  // a mid-loop throw used to leave some logins deleted and others live, with no report of which.
  const ids = new Map<string, string>()
  for (const user of Object.values(E2E_USERS)) {
    const [userId] = await findAuthUserIdsByEmails([user.email], supabase)
    if (userId) ids.set(user.email, userId)
  }
  const blocking = await blockingBarnSlugs(supabase, [...ids.values()])
  if (blocking.length > 0) throw new Error(formatBlockingMembershipsError(blocking))

  const deleted: string[] = []
  for (const user of Object.values(E2E_USERS)) {
    const userId = ids.get(user.email)
    if (!userId) continue
    mustSucceed(await supabase.from('profiles').delete().eq('user_id', userId), `delete ${user.email} profile`)
    const { error } = await supabase.auth.admin.deleteUser(userId)
    if (error) throw new Error(`delete auth user ${user.email}: ${error.message}`)
    deleted.push(user.email)
  }
  return deleted
}

async function run() {
  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')
  if (MODE !== 'create' && MODE !== 'verify' && MODE !== 'delete') {
    throw new Error('mode must be "create", "verify", or "delete"')
  }
  if (process.env.E2E_AUTH_USERS_ALLOW_PROD !== 'true') assertDevProject(SUPABASE_URL)

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  if (MODE === 'verify') {
    const missing = await verifyE2eAuthUsers(supabase)
    if (missing.length > 0) throw new Error(formatMissingUsersError(missing))
    console.log(`All e2e auth users present: ${Object.values(E2E_USERS).map((u) => u.email).join(', ')}`)
    return
  }

  if (MODE === 'delete') {
    const deleted = await deleteE2eAuthUsers(supabase)
    console.log(deleted.length ? `Done. Removed: ${deleted.join(', ')}` : 'No e2e auth users found.')
    return
  }

  await createE2eAuthUsers(supabase)
  console.log('Done. e2e auth users ready:')
  for (const user of Object.values(E2E_USERS)) {
    console.log(`  ${user.role.padEnd(8)} ${user.email} / ${E2E_PASSWORD}`)
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('e2e-auth-users failed:', err.message)
    process.exit(1)
  })
}
