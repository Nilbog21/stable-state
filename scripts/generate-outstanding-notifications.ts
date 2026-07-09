import { fileURLToPath } from 'url'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { deleteNotificationByType, upsertNotificationsForRecipients } from '@/lib/db/notifications'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { createServiceClient, mustSucceed } from './script-utils'

export function formatOutstandingNotification(count: number, total: number): { title: string; body: string } {
  return {
    title: `${count} outstanding payment${count === 1 ? '' : 's'}`,
    body: `${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} total`,
  }
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

  const barns = mustSucceed<{ id: string; slug: string }[]>(await supabase.from('barns').select('id, slug'), 'select barns')

  let hadErrors = false
  let totalManagers = 0
  let barnsProcessed = 0

  for (const barn of barns) {
    const managerUserIds = await getActiveManagerUserIds(barn.id, supabase)
    if (managerUserIds.length === 0) continue
    barnsProcessed++
    totalManagers += managerUserIds.length

    const [lessons, charges] = await Promise.all([
      getOutstandingLessons(barn.id, undefined, 'manager', supabase),
      getOutstandingCharges(barn.id, undefined, 'manager', supabase),
    ])
    const count = lessons.length + charges.length
    const total = lessons.reduce((sum, l) => sum + (l.fee ?? 0), 0) + charges.reduce((sum, c) => sum + c.fee, 0)

    if (count === 0) {
      for (const userId of managerUserIds) {
        try {
          await deleteNotificationByType(userId, barn.id, 'outstanding_payment', supabase)
        } catch (err) {
          hadErrors = true
          console.error(`Failed to clear outstanding notification for ${userId} in barn ${barn.id}:`, (err as Error).message)
        }
      }
      continue
    }

    const recipients = new Map(
      managerUserIds.map((userId) => [`${userId}:${barn.id}`, { userId, barnId: barn.id, payload: { count, total } }])
    )
    const errorCount = await upsertNotificationsForRecipients(
      supabase,
      recipients,
      ({ count, total }) => formatOutstandingNotification(count, total),
      'outstanding_payment',
      () => `/barn/${barn.slug}/finances/outstanding`
    )
    if (errorCount > 0) hadErrors = true
  }

  console.log(`Processed ${totalManagers} manager(s) across ${barnsProcessed} barn(s).`)
  if (hadErrors) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('generate-outstanding-notifications failed:', err.message)
    process.exit(1)
  })
}
