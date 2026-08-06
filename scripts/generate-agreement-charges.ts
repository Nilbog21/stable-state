import { fileURLToPath } from 'url'
import type { SupabaseClient } from '@supabase/supabase-js'
import { generateChargeForMonth } from '@/lib/db/agreements'
import { mustSucceed, runCronJob } from './script-utils'

export function formatChargeGenerationSummary(agreementCount: number, errorCount: number): string {
  const base = `Generated charges for ${agreementCount} active monthly agreement(s).`
  return errorCount === 0 ? base : `${base.slice(0, -1)}; ${errorCount} failed.`
}

interface MonthlyAgreementRow {
  id: string
  barn_id: string
  // #1361: the month "now" falls in is the barn's, not this cron host's — embedded so the
  // period is resolved per agreement rather than from a single server-clock month.
  barns: { timezone: string }
}

async function run(supabase: SupabaseClient): Promise<{ summary: string; hadErrors: boolean }> {
  // `agreements` has exactly one FK to `barns`, so the embed needs no FK hint (unlike
  // agreement-finances.ts:163). PostgREST types a to-one embed as an array while the
  // runtime shape is the object — same `as unknown as` cast that file uses at :181.
  const agreements = mustSucceed(
    await supabase
      .from('agreements')
      .select('id, barn_id, barns!inner(timezone)')
      .eq('is_active', true)
      .eq('cadence', 'monthly'),
    'select active monthly agreements'
  ) as unknown as MonthlyAgreementRow[]

  let errorCount = 0
  const now = new Date()

  for (const agreement of agreements) {
    try {
      await generateChargeForMonth(agreement.id, agreement.barn_id, agreement.barns.timezone, now, supabase)
    } catch (err) {
      errorCount++
      console.error(`Failed to generate charge for agreement ${agreement.id}:`, (err as Error).message)
    }
  }

  return { summary: formatChargeGenerationSummary(agreements.length, errorCount), hadErrors: errorCount > 0 }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runCronJob('generate-agreement-charges', run)
}
