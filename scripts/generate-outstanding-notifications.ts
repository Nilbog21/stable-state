import { fileURLToPath } from 'url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getOutstandingLessons } from '@/lib/db/lesson-finances'
import { getOutstandingCharges } from '@/lib/db/agreements'
import { deleteNotificationByType, upsertNotificationsForRecipients } from '@/lib/db/notifications'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { mustSucceed, runCronJob } from './script-utils'

export function formatOutstandingNotification(count: number, total: number): { title: string; body: string } {
  return {
    title: `${count} outstanding payment${count === 1 ? '' : 's'}`,
    body: `${total.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} total`,
  }
}

async function run(supabase: SupabaseClient): Promise<{ summary: string; hadErrors: boolean }> {
  const barns = mustSucceed<{ id: string; slug: string }[]>(await supabase.from('barns').select('id, slug'), 'select barns')

  let hadErrors = false
  let totalManagers = 0
  let barnsProcessed = 0

  for (const barn of barns) {
    try {
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
    } catch (err) {
      hadErrors = true
      console.error(`Failed to process barn ${barn.id}:`, (err as Error).message)
    }
  }

  return { summary: `Processed ${totalManagers} manager(s) across ${barnsProcessed} barn(s).`, hadErrors }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCronJob('generate-outstanding-notifications', run)
}
