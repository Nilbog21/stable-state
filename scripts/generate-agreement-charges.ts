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
}

async function run(supabase: SupabaseClient): Promise<{ summary: string; hadErrors: boolean }> {
  const agreements = mustSucceed<MonthlyAgreementRow[]>(
    await supabase
      .from('agreements')
      .select('id, barn_id')
      .eq('is_active', true)
      .eq('cadence', 'monthly'),
    'select active monthly agreements'
  )

  let errorCount = 0
  const now = new Date()

  for (const agreement of agreements) {
    try {
      await generateChargeForMonth(agreement.id, agreement.barn_id, now, supabase)
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
