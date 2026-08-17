'use server'

import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug, createDemoBarn, countDemoBarns, getOldestDemoBarn, deleteBarn } from '@/lib/db/barns'
import { getUserMembership, createActiveMembership } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import { createServiceClient, findOrCreateAuthUser, teardownBarnData } from '@/lib/db/service-role'
import { seedBarn, withEmailDomain, DEV_MANAGER_2 } from '../../../scripts/seed-barn'

const DEMO_BARN_SLUG_COOKIE = 'demo_barn_slug'
// #1579: `profiles.email` is globally unique, so a demo barn seeded on the dev DB was competing
// with `dev-barn` for one roster — silently overwriting its profiles, and failing outright with
// 23505 once `change-user.ts` (a writer of `profiles.user_id` since #1563) moved the developer
// onto a seed identity and `upsertProfile`'s `onConflict: 'user_id'` no longer matched.
const DEMO_EMAIL_DOMAIN = 'demo.local'
const DEMO_COOKIE_MAX_AGE = 60 * 60 * 24 // 24h

function cookieOptions(path: string) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path,
    maxAge: DEMO_COOKIE_MAX_AGE,
  }
}

// This is app runtime code's first use of a service-role client (not just scripts/) —
// barn creation and auth.admin.* (fixture-identity creation) have no RLS path for a
// regular authenticated user, and this route is reachable by unauthenticated visitors.
export async function createOrResumeDemoBarn(): Promise<void> {
  const DEMO_USER_EMAIL = process.env.DEMO_USER_EMAIL
  const DEMO_USER_PASSWORD = process.env.DEMO_USER_PASSWORD
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  const DEMO_BARN_CAP = Number(process.env.DEMO_BARN_CAP ?? '20')

  if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD || !SUPABASE_URL || !SERVICE_ROLE_KEY) {
    redirect('/login?error=demo_unavailable')
  }

  const requestClient = await createClient()
  // Manual auth check rather than requireMembership: an unauthenticated visitor has no
  // barn/membership yet to check against — establishing one is this action's whole job.
  let user = await getAuthenticatedUser()

  if (!user) {
    const { data, error } = await requestClient.auth.signInWithPassword({
      email: DEMO_USER_EMAIL,
      password: DEMO_USER_PASSWORD,
    })
    if (error || !data.user) {
      redirect('/login?error=demo_unavailable')
    }
    user = data.user
  }

  // Checked before any barn is created/seeded so a visitor without a profiles row (e.g.
  // mid /profile/complete) can't leave an orphaned, fully-seeded demo barn behind.
  const profile = await getProfileByUserId(user.id, requestClient)
  if (!profile) {
    redirect('/login?error=demo_unavailable')
  }

  const serviceClient = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const cookieStore = await cookies()
  const existingSlug = cookieStore.get(DEMO_BARN_SLUG_COOKIE)?.value

  if (existingSlug) {
    const barn = await getBarnBySlug(existingSlug, serviceClient)
    if (barn) {
      const membership = await getUserMembership(user.id, barn.id, serviceClient)
      if (membership) {
        cookieStore.set(`barn_session_${barn.slug}`, user.id, cookieOptions(`/barn/${barn.slug}`))
        redirect(`/barn/${barn.slug}/`)
      }
    }
  }

  // ponytail: cap check -> reap -> insert isn't transactional, so concurrent requests at
  // the cap boundary can both reap the same barn and both insert, overshooting the cap by
  // one. Self-healing on the next request; upgrade to a `pg_advisory_xact_lock`-backed RPC
  // if the cap ever needs to be a hard bound. `/api/cron/reset-demo` (#506) runs the same
  // unlocked reap pattern on a daily timer (#1438 — Vercel's Hobby plan allows a cron at
  // most one run per day), racing this check too — still safe, since
  // every delete involved is a plain `WHERE barn_id = ...` with no existence check, so a
  // barn reaped by one caller mid-race is just a no-op for the other.
  if (DEMO_BARN_CAP > 0 && (await countDemoBarns(serviceClient)) >= DEMO_BARN_CAP) {
    const oldest = await getOldestDemoBarn(serviceClient)
    if (oldest) {
      await teardownBarnData(oldest.id, serviceClient)
      await deleteBarn(oldest.id, serviceClient)
    }
  }

  const slug = `demo-${randomUUID().slice(0, 8)}`
  const barn = await createDemoBarn(slug, serviceClient)

  // ponytail: one `*@demo.local` roster shared by every demo barn, not one per barn — so a
  // visitor editing a seeded member's contact info or photo changes it in every concurrent demo
  // barn. Per-barn identities are the upgrade path, but need `teardownBarnData` to delete auth
  // users first: it only removes `user_id IS NULL` profiles (`service-role.ts:116`), so per-barn
  // emails would leak ~9 `auth.users` rows per reaped demo barn.
  const morganUserId = await findOrCreateAuthUser(withEmailDomain(DEV_MANAGER_2.email, DEMO_EMAIL_DOMAIN), serviceClient)
  await seedBarn(serviceClient, barn.id, barn.slug, morganUserId, new Date(), DEMO_EMAIL_DOMAIN)

  await createActiveMembership(user.id, profile.id, barn.id, 'manager', serviceClient)

  cookieStore.set(DEMO_BARN_SLUG_COOKIE, barn.slug, cookieOptions('/'))
  cookieStore.set(`barn_session_${barn.slug}`, user.id, cookieOptions(`/barn/${barn.slug}`))

  redirect(`/barn/${barn.slug}/`)
}
