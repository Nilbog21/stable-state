'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'

function hourLabel(h: number) {
  const period = h < 12 ? 'AM' : 'PM'
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${display}:00 ${period}`
}

export function DateHourPicker({
  timezone,
  initialDate,
  initialHour,
  onChange,
  dateLabel = 'Date',
  renderDate,
}: {
  /** The barn's `barns.timezone`. Required, and the only frame this control works in: the
   *  date and hour a user picks mean that wall clock *at the barn*, so both the defaults and
   *  the instant they combine into resolve here rather than in the viewer's zone (#1222). */
  timezone: string
  initialDate?: string
  initialHour?: number
  onChange?: (lessonAt: string) => void
  dateLabel?: string
  /** Replaces the native date input with a caller-supplied control — #1019's month conflict
   *  calendar. Omitted by EventForm, which keeps the plain input. */
  renderDate?: (value: string, setValue: (date: string) => void) => ReactNode
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
    // A month calendar needs the full width; the native input sits beside the hour select.
    <div className={renderDate ? 'flex flex-col gap-4' : 'flex gap-2'}>
      {renderDate ? (
        renderDate(date, setDate)
      ) : (
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
      )}
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
