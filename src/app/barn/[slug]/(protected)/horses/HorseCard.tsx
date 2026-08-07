import Link from 'next/link'
import type { HorseExertionSummary } from '@/lib/db/types'
import { ExhaustionBar, type ExhaustionBarRow } from '@/components/ExhaustionBar'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'

function ownedStatusBadge(horse: Pick<HorseExertionSummary, 'is_active' | 'is_available'>) {
  if (!horse.is_active) return <Badge tone="gray">Inactive</Badge>
  if (!horse.is_available) return <Badge tone="amber">Unavailable</Badge>
  return <Badge tone="green">Active</Badge>
}

export function HorseCard({
  horse,
  barnSlug,
  variant,
  exhaustion,
  linkable = true,
}: {
  horse: Pick<HorseExertionSummary, 'id' | 'name' | 'registered_name' | 'is_active' | 'is_available' | 'unavailability_reason'>
  barnSlug: string
  variant: 'available' | 'unavailable' | 'inactive' | 'owned'
  exhaustion?: { existingRows: ExhaustionBarRow[]; thresholds: { high: number; moderate: number } }
  linkable?: boolean
}) {
  const content = (
    <>
      <span className="font-medium text-zinc-900 dark:text-zinc-50">{horse.name}</span>
      {horse.registered_name && (
        <span className="ml-1 text-sm text-zinc-500 dark:text-zinc-400">({horse.registered_name})</span>
      )}
      {variant === 'unavailable' && (
        <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
          {horse.unavailability_reason ?? 'No reason given'}
        </span>
      )}
      {variant === 'owned' && (
        <>
          <span className="ml-2">{ownedStatusBadge(horse)}</span>
          {horse.is_active && !horse.is_available && (
            <span className="mt-1 block text-sm text-zinc-500 dark:text-zinc-400">
              {horse.unavailability_reason ?? 'No reason given'}
            </span>
          )}
        </>
      )}
    </>
  )

  return (
    <Card>
      {/* linkable branch: inner Link keeps its own padding/hover classes — ExhaustionBar's
          expand button can't nest inside <Card href>'s anchor (invalid HTML), and this is
          the only call site, so extracting a shared "clickable row" primitive isn't worth
          it yet. !linkable is unused by any current caller (#1002 made rider cards linkable
          too, so a horse's photo — the reason a rider would open the detail page — is
          reachable) but stays supported and its own tested prop, since a future card variant
          may still need a non-navigable rendering. Stays a plain div here rather than
          <Card className> to keep this single ternary as the one place that decides Link vs.
          non-Link rendering. */}
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
      {/* The prop alone decides — page.tsx never hands an `inactive` card one, and since #1391
          put the bar on `owned` too, a variant list here would only restate the call site's
          choice for three of the four variants. */}
      {exhaustion && (
        <div className="px-4 pb-3">
          <ExhaustionBar existingRows={exhaustion.existingRows} thresholds={exhaustion.thresholds} />
        </div>
      )}
    </Card>
  )
}
