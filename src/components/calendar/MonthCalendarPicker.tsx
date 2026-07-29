'use client'

import { useState } from 'react'
import { getMonthGrid, shiftMonth, type DayDecoration } from '@/lib/month-calendar'
import { formatCalendarDate } from '@/lib/local-day'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { Button } from '@/components/ui/Button'
import type { ScheduleItem } from '@/lib/db/types'

/**
 * Month grid used as a form date field (#1019): each cell is tinted from the caller's
 * precomputed `decorations`, so this component holds no scheduling logic of its own —
 * see `src/lib/month-calendar.ts` for the model. Tapping a day both selects it and opens
 * that day's schedule.
 */

// Icon-only Prev/Next controls have no good structural fit with the shared Button component
// (ARCHITECTURE.md's documented exception) -- raw Tailwind instead, reusing the finances
// month-nav classes verbatim so every date pager in the app reads as one pattern. The glyphs
// are part of that: &lt;/&gt; and not the guillemets, which render visibly smaller at the same
// font size.
const navButtonClass =
  'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'

// 'low' deliberately gets no background: with a horse selected most of the month is low, and
// painting all of it green drowns out the moderate/high cells that actually need attention
// (Refactoring UI's "emphasize by de-emphasizing"). Same hues as ExhaustionBar's bands.
//
// Dark mode uses ExhaustionBar's own -500 hues at low alpha rather than the -900 shades: at
// 900 both orange and red collapse to the same muddy brown against a zinc page, so a moderate
// day was indistinguishable from a high one -- and with 'low' untinted there is no third
// colour to calibrate against, so moderate simply read as "red".
const BAND_CLASS: Record<NonNullable<DayDecoration['band']>, string> = {
  low: '',
  moderate: 'bg-orange-200 dark:bg-orange-500/30',
  high: 'bg-red-200 dark:bg-red-500/30',
}

const SCHEDULED_CLASS = 'bg-blue-100 dark:bg-blue-900/40'

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const NEUTRAL_DAY: DayDecoration = { past: false, band: null, scheduled: false, conflict: false }

function formatMonthHeading(month: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${month}-01T00:00:00Z`)
  )
}

// `start` is barn-local wall clock, so it is parsed as UTC and formatted in UTC — the same
// no-conversion-on-display rule the rest of the calendar components follow.
function formatItemTime(start: string): string {
  return new Intl.DateTimeFormat('en-US', { timeStyle: 'short', timeZone: 'UTC' }).format(new Date(`${start}Z`))
}

export function MonthCalendarPicker({
  value,
  onChange,
  month,
  onMonthChange,
  decorations,
  items,
  describeItem,
  label,
}: {
  /** Currently selected day, "YYYY-MM-DD". */
  value: string
  onChange: (date: string) => void
  /** Displayed month, "YYYY-MM" — owned by the caller so it survives re-decoration. */
  month: string
  onMonthChange: (month: string) => void
  decorations: Record<string, DayDecoration>
  items: ScheduleItem[]
  describeItem: (item: ScheduleItem) => string
  label: string
}) {
  const { open, setOpen, ref } = useOutsideDismiss()
  const [popupDate, setPopupDate] = useState('')

  const days = getMonthGrid(month)
  const popupItems = items.filter((item) => item.start.slice(0, 10) === popupDate)

  function handleDayTap(date: string) {
    onChange(date)
    setPopupDate(date)
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>

      <div ref={ref} className="relative rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))} className={navButtonClass}>
            &lt;
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{formatMonthHeading(month)}</span>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))} className={navButtonClass}>
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} aria-hidden className="pb-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {initial}
            </span>
          ))}
          {days.map((date) => {
            const decoration = decorations[date] ?? NEUTRAL_DAY
            const outside = date.slice(0, 7) !== month
            const tint = decoration.past
              ? ''
              : decoration.band
                ? BAND_CLASS[decoration.band]
                : decoration.scheduled
                  ? SCHEDULED_CLASS
                  : ''
            return (
              <button
                key={date}
                type="button"
                aria-label={date}
                aria-pressed={date === value}
                data-past={String(decoration.past)}
                data-band={decoration.band}
                data-scheduled={String(decoration.scheduled)}
                data-outside={String(outside)}
                onClick={() => handleDayTap(date)}
                className={`relative flex min-h-[44px] items-center justify-center rounded text-sm ${tint} ${
                  decoration.past ? 'text-zinc-300 dark:text-zinc-600' : outside ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-50'
                } ${date === value ? 'ring-2 ring-blue-500' : ''}`}
              >
                {Number(date.slice(8, 10))}
                {decoration.conflict && (
                  <span
                    data-testid={`conflict-dot-${date}`}
                    aria-hidden
                    className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-400"
                  />
                )}
              </button>
            )
          })}
        </div>

        {open && popupDate && (
          <div className="absolute inset-x-2 top-14 z-10 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatCalendarDate(popupDate)}</span>
              {/* `primary`, not `ghost`, even though Close is logically the secondary action here:
                  CLAUDE.md's rule is that ghost's subtle border reads as non-interactive when it is
                  the only button in view, and this popup has no other control to defer to. */}
              <Button onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 px-3 py-1">
                ×
              </Button>
            </div>
            {popupItems.length === 0 ? (
              <p className="text-zinc-500 dark:text-zinc-400">Nothing scheduled for this day.</p>
            ) : (
              <ul className="space-y-1">
                {popupItems.map((item) => (
                  <li key={`${item.itemType}-${item.id}`} className="flex justify-between gap-3 text-zinc-700 dark:text-zinc-300">
                    <span>{formatItemTime(item.start)}</span>
                    <span className="text-right">{describeItem(item)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
