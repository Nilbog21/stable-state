/**
 * A non-blocking amber note under a time field, shown when the picked time falls between
 * 8 PM and 8 AM (#1646).
 *
 * Chrome for Android's `<input type="time">` opens the Material clock dialog, whose AM/PM
 * toggle marks the selection with text brightness alone — no chip, no underline, no background.
 * That dialog is drawn by Chrome's own Android UI: no page CSS reaches it, not `accent-color`,
 * not `::-webkit-*`, and `color-scheme` only flips the whole thing light↔dark. There is no
 * styling fix, so this catches the *consequence* instead — an inversion that lands the time in
 * the off-hours window.
 *
 * It is deliberately never a confirm step or a submit block: a legitimate 6 AM farrier entry
 * must not cost an extra tap on mobile. It is also derived purely from the current value, with
 * no "has the user touched this" state, so it shows on an existing off-hours record opened for
 * edit too.
 *
 * Not a `src/components/ui/` primitive — that catalog is for structural primitives, and this is
 * one domain string. The classes are `TierForm`'s existing per-field warning pair.
 */

// 8 PM–8 AM. String comparison is exact on zero-padded "HH:MM" and needs no parse, and it holds
// for the "HH:MM:SS" the expense edit form seeds from a Postgres `time` as well: "20:00:00"
// sorts after "20:00", "08:00:00" after "08:00". One constant each, easy to move if 8 PM proves
// too eager in summer.
const MORNING_BOUNDARY = '08:00'
const EVENING_BOUNDARY = '20:00'

export function AmPmWarning({ value }: { value: string }) {
  if (!value || (value >= MORNING_BOUNDARY && value < EVENING_BOUNDARY)) return null

  // String arithmetic on the wall clock, never a `Date`: a bare "HH:MM" has no instant behind
  // it, so `format-date.ts`'s helpers (which take an `Instant`) don't apply, and going through
  // `Date` would mean reading calendar fields in the host's zone — the thing
  // `eslint.config.mjs`'s fence exists to stop.
  const [hours, minutes] = value.split(':')
  const hour = Number(hours)
  const period = hour < 12 ? 'AM' : 'PM'
  const clock = `${hour % 12 || 12}:${minutes}`

  // Both readings side by side is the whole point — it is the one thing the dialog didn't give
  // the manager. "Outside typical barn hours" was rejected: it reads as a policy complaint and
  // doesn't help spot the swap.
  return (
    <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
      Check AM/PM — this is {clock} {period}, not {clock} {period === 'AM' ? 'PM' : 'AM'}.
    </p>
  )
}
