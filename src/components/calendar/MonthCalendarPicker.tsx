'use client'

import { useState, type ReactNode } from 'react'
import { getMonthGrid, shiftMonth, type DayDecoration } from '@/lib/month-calendar'
import { calendarDate, formatCalendarDate, formatMonthHeading, formatItemTime } from '@/lib/local-day'
import { BAND_TINT_CLASS } from '@/lib/band-colors'
import { useOutsideDismiss } from '@/components/useOutsideDismiss'
import { Button } from '@/components/ui/Button'
import { dateNavButtonClass } from '@/components/ui/date-nav'
import type { CalendarDate, ScheduleItem } from '@/lib/db/types'

/**
 * Month grid used as a form date field (#1019): each cell is tinted from the caller's
 * precomputed `decorations`, so this component holds no scheduling logic of its own —
 * see `src/lib/month-calendar.ts` for the model. Tapping a day both selects it and opens
 * that day's schedule.
 */

const SCHEDULED_CLASS = 'bg-blue-100 dark:bg-blue-900/40'

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const NEUTRAL_DAY: DayDecoration = { past: false, band: null, scheduled: false, conflict: false }

export function MonthCalendarPicker({
  value,
  onChange,
  month,
  onMonthChange,
  decorations,
  items,
  describeItem,
  label,
  dayPanel,
  dayPanelAlwaysOpen = false,
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
  /** Extra content for the day panel, below that day's schedule — #1021's lesson start-time
   *  field. Omitted by ExpenseForm, which wants the schedule alone. */
  dayPanel?: ReactNode
  /** Makes the day panel a permanent part of the form rather than a transient popup: open on
   *  `value` from first render, and no Close button (#1021). The lesson form needs this because
   *  the panel hosts a required field — behind a tap, a lesson's own start time would be
   *  invisible on the edit form until its day was tapped. Off for ExpenseForm. */
  dayPanelAlwaysOpen?: boolean
}) {
  const { open, setOpen, ref } = useOutsideDismiss()
  const [popupDate, setPopupDate] = useState(calendarDate(dayPanelAlwaysOpen ? value : ''))

  const days = getMonthGrid(month)
  const popupItems = items.filter((item) => item.start.slice(0, 10) === popupDate)
  const panelOpen = dayPanelAlwaysOpen || open

  function handleDayTap(date: CalendarDate) {
    onChange(date)
    setPopupDate(date)
    setOpen(true)
  }

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>

      <div ref={ref} className="rounded-lg border border-zinc-200 p-2 dark:border-zinc-700">
        <div className="mb-2 flex items-center justify-between gap-2">
          <button type="button" aria-label="Previous month" onClick={() => onMonthChange(shiftMonth(month, -1))} className={dateNavButtonClass}>
            &lt;
          </button>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{formatMonthHeading(month)}</span>
          <button type="button" aria-label="Next month" onClick={() => onMonthChange(shiftMonth(month, 1))} className={dateNavButtonClass}>
            &gt;
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1">
          {WEEKDAY_INITIALS.map((initial, i) => (
            <span key={i} aria-hidden className="pb-1 text-center text-xs font-medium text-zinc-500 dark:text-zinc-400">
              {initial}
            </span>
          ))}
          {/* An outside-month day is de-emphasised by one step only (zinc-600/zinc-300, not
              zinc-400/zinc-500): a spill-over day can still carry a band tint, and dimmer grey
              on those tints falls to ~1.6:1 -- the dark tints sit at almost exactly zinc-500's
              luminance, so the number vanishes. Keep any future change above 4.5:1 on
              BAND_TINT_CLASS's darkest tint, not just on the page background. */}
          {days.map((date) => {
            const decoration = decorations[date] ?? NEUTRAL_DAY
            const outside = date.slice(0, 7) !== month
            const tint = decoration.past
              ? ''
              : decoration.band
                ? BAND_TINT_CLASS[decoration.band]
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
                  decoration.past ? 'text-zinc-300 dark:text-zinc-600' : outside ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-900 dark:text-zinc-50'
                } ${date === value ? 'ring-2 ring-blue-500' : ''}`}
              >
                {Number(date.slice(8, 10))}
                {decoration.conflict && (
                  /* `bg-current`, not a literal pair (#1554): red read as an alert on a grid where
                     red already means "heavily worked", and a literal would need its own copy of the
                     text-colour conditional above -- wrong on a spill-over day, whose number is
                     deliberately one step dimmer. currentColor tracks all of it, and inherits that
                     comment's contrast audit against every tint the dot can sit on. */
                  <span
                    data-testid={`conflict-dot-${date}`}
                    aria-hidden
                    className="absolute bottom-1 h-1.5 w-1.5 rounded-full bg-current"
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* In normal flow below the grid, not an overlay: anchored at a fixed `top` it covered
            the first two rows, so tapping a day near the start of the month hid the very day
            just tapped. Pushing the rest of the form down is the better trade on mobile. */}
        {panelOpen && popupDate && (
          <div className="mt-2 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-md dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatCalendarDate(popupDate)}</span>
              {/* `primary`, not `ghost`, even though Close is logically the secondary action here:
                  CLAUDE.md's rule is that ghost's subtle border reads as non-interactive when it is
                  the only button in view, and this popup has no other control to defer to.
                  Absent entirely in always-open mode — a form field you can dismiss but not
                  restore is worse than one that simply stays put. */}
              {!dayPanelAlwaysOpen && (
                <Button onClick={() => setOpen(false)} aria-label="Close" className="shrink-0 px-3 py-1">
                  ×
                </Button>
              )}
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
            {dayPanel}
          </div>
        )}
      </div>
    </div>
  )
}
