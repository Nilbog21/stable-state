'use server'

import { randomUUID } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug, countDemoBarns, getOldestDemoBarn, deleteBarn } from '@/lib/db/barns'
import { createServiceClient, mustSucceed, findOrCreateAuthUser, teardownBarnData } from '@/lib/db/service-role'
import { seedBarn, DEV_MANAGER_2 } from '../../../scripts/seed-barn'
import type { Barn } from '@/lib/db/types'

const DEMO_BARN_SLUG_COOKIE = 'demo_barn_slug'
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
  const DEMO_BARN_CAP = Number(process.env.DEMO_BARN_CAP ?? '20')

  if (!DEMO_USER_EMAIL || !DEMO_USER_PASSWORD) {
    redirect('/login?error=demo_unavailable')
  }

  const requestClient = await createClient()
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

  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const cookieStore = await cookies()
  const existingSlug = cookieStore.get(DEMO_BARN_SLUG_COOKIE)?.value

  if (existingSlug) {
    const barn = await getBarnBySlug(existingSlug, serviceClient)
    if (barn) {
      const membership = mustSucceed(
        await serviceClient
          .from('barn_memberships')
          .select('id')
          .eq('user_id', user.id)
          .eq('barn_id', barn.id)
          .maybeSingle(),
        'check existing demo barn membership'
      )
      if (membership) {
        cookieStore.set(`barn_session_${barn.slug}`, user.id, cookieOptions(`/barn/${barn.slug}/`))
        redirect(`/barn/${barn.slug}/`)
      }
    }
  }

  if (DEMO_BARN_CAP > 0 && (await countDemoBarns(serviceClient)) >= DEMO_BARN_CAP) {
    const oldest = await getOldestDemoBarn(serviceClient)
    if (oldest) {
      await teardownBarnData(oldest.id, serviceClient)
      await deleteBarn(oldest.id, serviceClient)
    }
  }

  const slug = `demo-${randomUUID().slice(0, 8)}`
  const barn = mustSucceed<Barn>(
    await serviceClient.from('barns').insert({ name: 'Demo Barn', slug, is_demo: true }).select().single(),
    'insert demo barn'
  )

  const morganUserId = await findOrCreateAuthUser(DEV_MANAGER_2.email, serviceClient)
  await seedBarn(serviceClient, barn.id, barn.slug, morganUserId)

  const profile = mustSucceed<{ id: string } | null>(
    await serviceClient.from('profiles').select('id').eq('user_id', user.id).maybeSingle(),
    'fetch visitor profile'
  )
  if (!profile) {
    redirect('/login?error=demo_unavailable')
  }

  mustSucceed(
    await serviceClient.from('barn_memberships').insert({
      user_id: user.id,
      profile_id: profile.id,
      barn_id: barn.id,
      role: 'manager',
      status: 'active',
    }),
    'insert visitor manager membership'
  )

  cookieStore.set(DEMO_BARN_SLUG_COOKIE, barn.slug, cookieOptions('/'))
  cookieStore.set(`barn_session_${barn.slug}`, user.id, cookieOptions(`/barn/${barn.slug}/`))

  redirect(`/barn/${barn.slug}/`)
}
