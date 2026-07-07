import Link from 'next/link'
import type { HorseExertionSummary } from '@/lib/db/types'
import { ExhaustionBar, type ExhaustionBarRow } from '@/components/ExhaustionBar'

export function HorseCard({
  horse,
  barnSlug,
  variant,
  exhaustion,
}: {
  horse: HorseExertionSummary
  barnSlug: string
  variant: 'available' | 'unavailable' | 'inactive'
  exhaustion?: { existingRows: ExhaustionBarRow[]; thresholds: { high: number; moderate: number } }
}) {
  return (
    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700">
      <Link
        href={`/barn/${barnSlug}/horses/${horse.id}`}
        className="block p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
      >
        <span className="font-medium text-zinc-900 dark:text-zinc-50">{horse.name}</span>
        {variant === 'unavailable' && (
          <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
            {horse.unavailability_reason ?? 'No reason given'}
          </span>
        )}
      </Link>
      {(variant === 'available' || variant === 'unavailable') && exhaustion && (
        <div className="px-4 pb-3">
          <ExhaustionBar existingRows={exhaustion.existingRows} thresholds={exhaustion.thresholds} />
        </div>
      )}
    </div>
  )
}
