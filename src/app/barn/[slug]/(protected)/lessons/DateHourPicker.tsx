'use client'

import { useEffect, useState } from 'react'
import { barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'

function hourLabel(h: number) {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${period}`
}

/**
 * Date + whole-hour picker. **`EventForm` is its only consumer** since #1021 moved the lesson
 * form to `LessonStartTime`'s minute-granular control; the `renderDate` render-prop that existed
 * solely for the lesson form's month calendar went with it. A barn event is an all-day-ish marker
 * rather than a scheduled slot, so whole hours are the right granularity here.
 *
 * It still emits its hidden input as `lesson_at`; `EventForm` ignores that and reads the value
 * through `onChange` into its own `event_at` field. Pre-existing, and harmless (an unread
 * FormData key), but see this issue's follow-ups.
 */
export function DateHourPicker({
  timezone,
  initialDate,
  initialHour,
  onChange,
  dateLabel = 'Date',
}: {
  /** The barn's `barns.timezone`. Required, and the only frame this control works in: the
   *  date and hour a user picks mean that wall clock *at the barn*, so both the defaults and
   *  the instant they combine into resolve here rather than in the viewer's zone (#1222). */
  timezone: string
  initialDate?: string
  initialHour?: number
  onChange?: (lessonAt: string) => void
  dateLabel?: string
}) {
  const [date, setDate] = useState(initialDate ?? (() => barnToday(timezone)))
  const [hour, setHour] = useState(
    initialHour ?? (() => Number(instantToLocalWallClock(new Date(), timezone).slice(11, 13)))
  )

  const combinedValue = date
    ? wallClockToInstant(`${date}T${String(hour).padStart(2, '0')}:00:00`, timezone).toISOString()
    : ''

  useEffect(() => {
    onChange?.(date ? combinedValue : '')
  }, [date, hour, combinedValue, onChange])

  return (
    <div className="flex gap-2">
      <div className="flex flex-col gap-1 flex-1">
        <label htmlFor="dh-date" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {dateLabel}
        </label>
        <input
          id="dh-date"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          required
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="dh-hour" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Hour
        </label>
        <select
          id="dh-hour"
          value={hour}
          onChange={(e) => setHour(Number(e.target.value))}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {Array.from({ length: 24 }, (_, i) => (
            <option key={i} value={i}>{hourLabel(i)}</option>
          ))}
        </select>
      </div>
      {date && <input type="hidden" name="lesson_at" value={combinedValue} />}
    </div>
  )
}
