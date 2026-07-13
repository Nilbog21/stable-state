import { fileURLToPath } from 'url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mustSucceed, runCronJob } from './script-utils'

const RETENTION_DAYS = 30

export function formatPruneSummary(count: number): string {
  return `Deleted ${count} read notification${count === 1 ? '' : 's'} older than ${RETENTION_DAYS} days.`
}

async function run(supabase: SupabaseClient): Promise<{ summary: string; hadErrors: boolean }> {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString()

  const deleted = mustSucceed<{ id: string }[]>(
    await supabase.from('notifications').delete().not('read_at', 'is', null).lt('read_at', cutoff).select('id'),
    'delete old notifications'
  )

  return { summary: formatPruneSummary(deleted.length), hadErrors: false }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCronJob('prune-old-notifications', run)
}
