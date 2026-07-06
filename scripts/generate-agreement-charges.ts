import { fileURLToPath } from 'url'
import { generateChargeForMonth } from '@/lib/db/agreements'
import { createServiceClient, mustSucceed } from './script-utils'

export function formatChargeGenerationSummary(agreementCount: number, errorCount: number): string {
  const base = `Generated charges for ${agreementCount} active monthly agreement(s).`
  return errorCount === 0 ? base : `${base.slice(0, -1)}; ${errorCount} failed.`
}

interface MonthlyAgreementRow {
  id: string
  barn_id: string
}

async function run() {
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  if (!SERVICE_ROLE_KEY) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required')

  const supabase = createServiceClient(SUPABASE_URL, SERVICE_ROLE_KEY)

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

  console.log(formatChargeGenerationSummary(agreements.length, errorCount))
  if (errorCount > 0) process.exit(1)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch((err: Error) => {
    console.error('generate-agreement-charges failed:', err.message)
    process.exit(1)
  })
}
