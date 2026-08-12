import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getOldestDemoBarn, countDemoBarns, deleteBarn } from '@/lib/db/barns'
import { createServiceClient, teardownBarnData } from '@/lib/db/service-role'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

// Manual trigger (dev testing):
//   curl -X POST http://localhost:3000/api/cron/reset-demo \
//     -H "Authorization: Bearer <CRON_SECRET>"
export async function POST(request: NextRequest) {
  const CRON_SECRET = process.env.CRON_SECRET
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
  }

  const DEMO_BARN_CAP = Number(process.env.DEMO_BARN_CAP ?? '20')
  const cutoff = Date.now() - SIX_HOURS_MS
  const client = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  let reaped = 0
  while (true) {
    const oldest = await getOldestDemoBarn(client)
    if (!oldest) break

    const expired = new Date(oldest.created_at).getTime() < cutoff
    const overCap = DEMO_BARN_CAP > 0 && (await countDemoBarns(client)) > DEMO_BARN_CAP
    if (!expired && !overCap) break

    // ponytail: a teardown/delete failure on the oldest barn would otherwise throw
    // uncaught, 500ing the whole run with no {reaped} count and re-hitting the same
    // barn first on the next run — stop the run and report partial progress instead.
    // That next run is a day out since #1438 (Vercel's Hobby plan allows a cron at most
    // one run per day), so a stuck barn now blocks this loop for ~24h rather than ~1h.
    // If a barn ever gets permanently stuck here, that needs its own alerting, not this loop.
    try {
      await teardownBarnData(oldest.id, client)
      await deleteBarn(oldest.id, client)
    } catch (error) {
      console.error(`[cron/reset-demo] failed to reap barn ${oldest.id}:`, error)
      break
    }
    reaped++
  }

  return NextResponse.json({ reaped })
}
