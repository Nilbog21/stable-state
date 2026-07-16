import Link from 'next/link'
import type { HorseExertionSummary } from '@/lib/db/types'
import { ExhaustionBar, type ExhaustionBarRow } from '@/components/ExhaustionBar'
import { Card } from '@/components/ui/Card'

export function HorseCard({
  horse,
  barnSlug,
  variant,
  exhaustion,
  linkable = true,
}: {
  horse: Pick<HorseExertionSummary, 'id' | 'name' | 'is_active' | 'is_available' | 'unavailability_reason'>
  barnSlug: string
  variant: 'available' | 'unavailable' | 'inactive'
  exhaustion?: { existingRows: ExhaustionBarRow[]; thresholds: { high: number; moderate: number } }
  linkable?: boolean
}) {
  const content = (
    <>
      <span className="font-medium text-zinc-900 dark:text-zinc-50">{horse.name}</span>
      {variant === 'unavailable' && (
        <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
          {horse.unavailability_reason ?? 'No reason given'}
        </span>
      )}
    </>
  )

  return (
    <Card>
      {/* linkable branch: inner Link keeps its own padding/hover classes — ExhaustionBar's
          expand button can't nest inside <Card href>'s anchor (invalid HTML), and this is
          the only call site, so extracting a shared "clickable row" primitive isn't worth
          it yet. !linkable branch has no such constraint (riders never render ExhaustionBar)
          but stays a plain div here rather than <Card className> to keep this single ternary
          as the one place that decides Link vs. non-Link rendering. */}
      {linkable ? (
        <Link
          href={`/barn/${barnSlug}/horses/${horse.id}`}
          className="block p-4 hover:bg-zinc-50 dark:hover:bg-zinc-900"
        >
          {content}
        </Link>
      ) : (
        <div className="p-4">{content}</div>
      )}
      {(variant === 'available' || variant === 'unavailable') && exhaustion && (
        <div className="px-4 pb-3">
          <ExhaustionBar existingRows={exhaustion.existingRows} thresholds={exhaustion.thresholds} />
        </div>
      )}
    </Card>
  )
}
