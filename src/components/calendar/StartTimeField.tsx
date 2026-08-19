'use client'

import { useEffect, useState } from 'react'
import { wallClockToInstant } from '@/lib/barn-timezone'

/**
 * The start-time field of a form whose date half is a `MonthCalendarPicker` (#1021), replacing
 * `DateHourPicker`'s hour `<select>`. Shared by `LessonForm` and `EventForm` since #1645, which
 * is also when `DateHourPicker` — the barn-event form's last consumer — was deleted outright.
 *
 * Start times are hour *and* minute. The old hour-only control didn't just prevent entering
 * 4:30 — it silently rewrote one: the edit form seeded itself from the stored instant's hour
 * alone and recombined at `:00`, so anything with non-zero minutes lost them on any save, even
 * one that never touched the time. A native `<input type="time">` is minute-granular by
 * construction, so there is no truncation left to reintroduce.
 *
 * The date lives with the calendar that owns it, not here — this component is handed the
 * selected day and is responsible only for the time half and for combining the two.
 */
export function StartTimeField({
  timezone,
  date,
  initialTime,
  onChange,
  id,
  name,
}: {
  /** The barn's `barns.timezone`. The entered wall clock means that time *at the barn* (#1222),
   *  so the combination resolves here and never in the viewer's or the host's zone. */
  timezone: string
  /** The selected day, "YYYY-MM-DD", owned by the calendar above. Empty clears the field. */
  date: string
  /** "HH:MM", barn-local — the edit form's stored time. Absent (the create form) opens the field
   *  empty, which is #1578: the pre-#1578 fallback to the top of the barn's current hour was a
   *  value the user never chose and had no reason to look at, so a wrong one was invisible, and
   *  `required` could not catch it because the field was never empty. */
  initialTime?: string
  /** Reports the combined instant as an ISO string — `''` while either half is unset. Only
   *  `LessonForm` needs it: the hidden input below is the submitted value in both forms, and the
   *  lesson form additionally drives its exhaustion fetch off the instant. */
  onChange?: (startAt: string) => void
  /** The time input's own id, and its label's `htmlFor`. */
  id: string
  /** The submitted field name — `lesson_at` or `event_at` (#1645). */
  name: string
}) {
  const [time, setTime] = useState(initialTime ?? '')

  // Both halves are guarded, and `time` is not the redundant one it looks like: a native time
  // input reports '' whenever the user clears it, which the hour `<select>` this replaced could
  // never do. Unguarded, that empty string builds an Invalid Date inside `wallClockToInstant`
  // and throws RangeError out of `formatToParts` *during render* — unmounting the form and
  // taking every other field the user had filled in with it. `required` on the input blocks the
  // submit; it does nothing about the render.
  const combinedValue = date && time
    ? wallClockToInstant(`${date}T${time}:00`, timezone).toISOString()
    : ''

  useEffect(() => {
    onChange?.(combinedValue)
  }, [combinedValue, onChange])

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Start Time
      </label>
      <input
        id={id}
        type="time"
        // Seconds are not part of a start time; this pins the native control to minute steps
        // rather than letting a browser offer a seconds field.
        step={60}
        value={time}
        onChange={(e) => setTime(e.target.value)}
        required
        className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
      />
      {combinedValue && <input type="hidden" name={name} value={combinedValue} />}
    </div>
  )
}
