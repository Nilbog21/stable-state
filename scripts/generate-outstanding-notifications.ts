import { fileURLToPath } from 'url'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { deleteNotificationByType, upsertNotification } from '@/lib/db/notifications'
import { createServiceClient, mustSucceed } from './script-utils'

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
      await upsertNotification(supabase, {
        userId: manager.user_id,
        barnId: manager.barn_id,
        type: 'outstanding_payment',
        title,
        body,
        link: `/barn/${slug}/finances/outstanding`,
      })
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
