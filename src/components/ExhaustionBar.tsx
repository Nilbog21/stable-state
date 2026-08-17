'use client'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { getExhaustionBand } from '@/lib/exhaustion-band'
import { BAND_FILL_CLASS } from '@/lib/band-colors'
import { Button } from '@/components/ui/Button'
import { formatBarnDate } from '@/lib/format-date'
import type { Instant } from '@/lib/db/types'

export interface ExhaustionBarRow {
  lessonAt: Instant
  exertionLevel: number
}

interface Props {
  existingRows: ExhaustionBarRow[]
  ghostValue?: number
  thresholds: { high: number; moderate: number }
}

const GHOST_STRIPE = {
  backgroundImage: 'repeating-linear-gradient(45deg, rgba(0,0,0,0.25) 0 4px, transparent 4px 8px)',
}

export function ExhaustionBar({ existingRows, ghostValue, thresholds }: Props) {
  const { open, setOpen, ref } = useOutsideDismiss()

  const existingTotal = existingRows.reduce((sum, row) => sum + row.exertionLevel, 0)
  const hasGhost = ghostValue != null && ghostValue > 0
  const combinedTotal = existingTotal + (ghostValue ?? 0)
  const band = getExhaustionBand(combinedTotal, thresholds)
  const overflow = combinedTotal > thresholds.high

  // thresholds.high=0 is DB-legal (CHECK >= 0); floor to 1 so widths stay finite instead of NaN.
  const safeHigh = Math.max(thresholds.high, 1)
  let existingPct = (Math.min(existingTotal, safeHigh) / safeHigh) * 100
  const combinedPct = (Math.min(combinedTotal, safeHigh) / safeHigh) * 100
  let ghostPct = Math.max(combinedPct - existingPct, 0)

  const MIN_GHOST_PCT = 8
  if (hasGhost && ghostPct === 0 && existingPct >= 100) {
    ghostPct = MIN_GHOST_PCT
    existingPct = 100 - MIN_GHOST_PCT
  }

  return (
    <div ref={ref} className="relative">
      {/* Raw Tailwind, not <Button>: wraps a progress-bar visual, not a
          normal CTA — same reasoning as NotificationBell's bell trigger. */}
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setOpen((o) => !o)
        }}
        aria-expanded={open}
        aria-label={`Exhaustion: ${existingTotal} points from ${existingRows.length} lessons`}
        className="block w-full py-2"
      >
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
          <div data-testid="exhaustion-bar-solid" className={`h-full ${BAND_FILL_CLASS[band]}`} style={{ width: `${existingPct}%` }} />
          {hasGhost && ghostPct > 0 && (
            <div
              data-testid="exhaustion-bar-ghost"
              className={`h-full opacity-60 ${overflow ? 'bg-red-500' : 'bg-zinc-400'}`}
              style={{ width: `${ghostPct}%`, ...GHOST_STRIPE }}
            />
          )}
        </div>
      </button>
      {open && (
        <div className="absolute left-0 top-8 z-10 w-64 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="font-semibold text-zinc-900 dark:text-zinc-50">
              {existingTotal} points from {existingRows.length} lessons (±3-day window)
            </span>
            <Button
              variant="secondary"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(false)
              }}
              aria-label="Close"
              className="shrink-0 px-3 py-1"
            >
              ×
            </Button>
          </div>
          {existingRows.length === 0 ? (
            <p className="text-zinc-500">No lessons in window</p>
          ) : (
            <ul className="space-y-1">
              {existingRows.map((row, i) => (
                <li key={i} data-testid="exhaustion-bar-row" className="flex justify-between text-zinc-700 dark:text-zinc-300">
                  <span>{formatBarnDate(row.lessonAt)}</span>
                  <span>{row.exertionLevel}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
