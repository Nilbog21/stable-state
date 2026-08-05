'use client'

import { useEffect, useState } from 'react'
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'

/**
 * The lesson form's start-time field (#1021), replacing `DateHourPicker`'s hour `<select>`.
 *
 * Start times are hour *and* minute. The old hour-only control didn't just prevent entering
 * 4:30 — it silently rewrote one: the edit form seeded itself from `lesson_at`'s hour alone and
 * recombined at `:00`, so any lesson with non-zero minutes lost them on any save, even one that
 * never touched the time. A native `<input type="time">` is minute-granular by construction, so
 * there is no truncation left to reintroduce.
 *
 * The date lives with the calendar that owns it, not here — this component is handed the
 * selected day and is responsible only for the time half and for combining the two.
 */
export function LessonStartTime({
  timezone,
  date,
  initialTime,
  onChange,
}: {
  /** The barn's `barns.timezone`. The entered wall clock means that time *at the barn* (#1222),
   *  so the combination resolves here and never in the viewer's or the host's zone. */
  timezone: string
  /** The selected day, "YYYY-MM-DD", owned by the calendar above. Empty clears the field. */
  date: string
  /** "HH:MM", barn-local. Defaults to the top of the barn's current hour. */
  initialTime?: string
  /** Reports the combined instant as an ISO string — `''` while no date is selected. */
  onChange?: (lessonAt: string) => void
}) {
  const [time, setTime] = useState(
    // Minutes default to :00 rather than the barn's current minute: a lesson starting at
    // "14:37 because that is when the form was opened" would be a worse default than the top
    // of the hour, and this keeps the pre-#1021 default instant exactly.
    initialTime ?? (() => `${instantToLocalWallClock(new Date(), timezone).slice(11, 13)}:00`)
  )

  const combinedValue = date
    ? wallClockToInstant(`${date}T${time}:00`, timezone).toISOString()
    : ''

  useEffect(() => {
    onChange?.(combinedValue)
  }, [combinedValue, onChange])

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="lesson-start-time" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Start Time
      </label>
      <input
        id="lesson-start-time"
        type="time"
        // Seconds are not part of a lesson start time; this pins the native control to
        // minute steps rather than letting a browser offer a seconds field.
        step={60}
        value={time}
        onChange={(e) => setTime(e.target.value)}
        required
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {date && <input type="hidden" name="lesson_at" value={combinedValue} />}
    </div>
  )
}
