import { fileURLToPath } from 'url'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { deleteNotificationByType } from '@/lib/db/notifications'
import { createServiceClient, mustSucceed } from './script-utils'
import type { SupabaseClient } from '@supabase/supabase-js'

export function formatOutstandingNotification(count: number, total: number): { title: string; body: string } {
  return {
    title: `${count} outstanding payment${count === 1 ? '' : 's'}`,
    body: `${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} total`,
  }
}

interface ManagerRow {
  user_id: string | null
  barn_id: string
  barns: { slug: string } | { slug: string }[] | null
}

function resolveSlug(row: ManagerRow): string | null {
  const barn = Array.isArray(row.barns) ? row.barns[0] : row.barns
  return barn?.slug ?? null
}

// createNotification goes through the create_or_update_notification RPC, which requires
// auth.uid() to match an active barn member -- a service-role client has no auth.uid()
// and would always get rejected. Upsert directly against the table instead, matching
// scripts/CLAUDE.md's guidance for RPCs with auth checks that block service-role callers.
async function upsertOutstandingNotification(
  supabase: SupabaseClient,
  userId: string,
  barnId: string,
  title: string,
  body: string,
  link: string
): Promise<void> {
  const { error } = await supabase.from('notifications').upsert(
    { user_id: userId, barn_id: barnId, type: 'outstanding_payment', title, body, link, read_at: null },
    { onConflict: 'user_id,barn_id,type' }
  )
  if (error) throw error
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const managers = mustSucceed<ManagerRow[]>(
    await supabase
      .from('barn_memberships')
      .select('user_id, barn_id, barns(slug)')
      .eq('role', 'manager')
      .eq('status', 'active'),
    'select active managers'
  )

  const outstandingByBarn = new Map<string, { count: number; total: number }>()
  let hadErrors = false

  for (const manager of managers) {
    if (!manager.user_id) continue
    const slug = resolveSlug(manager)
    if (!slug) continue

    try {
      let outstanding = outstandingByBarn.get(manager.barn_id)
      if (!outstanding) {
        const [lessons, charges] = await Promise.all([
          getOutstandingLessons(manager.barn_id, undefined, 'manager', supabase),
          getOutstandingCharges(manager.barn_id, undefined, 'manager', supabase),
        ])
        const count = lessons.length + charges.length
        const total = lessons.reduce((sum, l) => sum + (l.fee ?? 0), 0) + charges.reduce((sum, c) => sum + c.fee, 0)
        outstanding = { count, total }
        outstandingByBarn.set(manager.barn_id, outstanding)
      }

      if (outstanding.count === 0) {
        await deleteNotificationByType(manager.user_id, manager.barn_id, 'outstanding_payment', supabase)
        continue
      }

      const { title, body } = formatOutstandingNotification(outstanding.count, outstanding.total)
      await upsertOutstandingNotification(
        supabase,
        manager.user_id,
        manager.barn_id,
        title,
        body,
        `/barn/${slug}/finances/outstanding`
      )
    } catch (err) {
      hadErrors = true
      console.error(`Failed to process manager ${manager.user_id} in barn ${manager.barn_id}:`, (err as Error).message)
    }
  }

  console.log(`Processed ${managers.length} manager(s) across ${outstandingByBarn.size} barn(s).`)
  if (hadErrors) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('generate-outstanding-notifications failed:', err.message)
    process.exit(1)
  })
}
