import { getExhaustionBand, type ExhaustionBand } from '@/lib/exhaustion-band'
import { addDays, calendarDate } from '@/lib/local-day'
import type { CalendarDate, ScheduleItem } from '@/lib/db/types'

/**
 * Pure month-grid + day-decoration model behind #1019's lesson-form conflict picker.
 * No React, no Supabase — every calendar cell's appearance is derived here from one
 * already-fetched `ScheduleItem[]` plus the form's current horse/rider selection, so
 * changing the selection re-renders without another round trip.
 *
 * Three signals, checked in this order. A barn-wide *selection* (#1020; labelled "All" on the
 * appointment form, rendered as "Entire Barn" on cards)
 * outranks everything: it reaches every horse, so the dot marks any booking that names a
 * horse and there is no heatmap to draw. Otherwise horse selection dominates: with at least
 * one horse selected the day background is the projected-exertion heatmap and the dot marks
 * real bookings. The rider-only flat tint applies only when neither of those holds.
 */

/** Fixed 6 rows × 7 days. A short month would fit in 4–5 rows, but a variable row count
 *  makes the grid jump height as you page through months. */
const GRID_DAYS = 42

// Mirrors get_horse_projected_exhaustion's `lesson_at BETWEEN p_target_date - INTERVAL
// '3 days' AND p_target_date + INTERVAL '3 days'` — inclusive on both ends.
const EXERTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

const BAND_SEVERITY: Record<ExhaustionBand, number> = { low: 0, moderate: 1, high: 2 }

export interface DayDecoration {
  /** Earlier than today in the barn's own timezone. Suppresses every other signal. */
  past: boolean
  /** Projected-exertion band; non-null only when at least one horse is selected. */
  band: ExhaustionBand | null
  /** Rider-only flat "something scheduled" tint. */
  scheduled: boolean
  /** Something already booked collides with the current selection on this exact day. Three
   *  ways in: a selected horse has a lesson or appointment; a barn-wide appointment (#1147) is
   *  booked, which names no horse but concerns every one; or the *selection* is barn-wide
   *  (#1020's barn-wide selection), which collides with anything holding a horse. */
  conflict: boolean
}

export interface DayDecorationOptions {
  selectedHorseIds: string[]
  selectedRiderIds: string[]
  /** Hour-of-day the form currently has chosen — the ±3-day window is centred on it, not
   *  on midnight, so the heatmap tracks the Hour dropdown the way ExhaustionBar does. */
  hour: number
  thresholdsByHorseId: Record<string, { high: number; moderate: number }>
  /** Today in the barn's own timezone (#1149, `barnToday`) — the same frame every other date
   *  on this grid is in, which #1223's brand now makes the compiler's problem. */
  todayStr: CalendarDate
  /** The appointment form's barn-wide selection (#1020, labelled "All") — the mirror of #1147's
   *  barn-wide *item*.
   *  It normally ticks no horses, so without this the horse branch below is skipped and the grid
   *  goes blank exactly when the appointment reaches the most horses. Don't reorder it after that
   *  branch on the assumption the two are mutually exclusive: `ExpenseForm` only *disables* the
   *  horse checkboxes when this is checked, so a selection made first survives in state. Barn-wide
   *  has to win outright anyway — it covers those horses and every other one. */
  selectionAppliesToAllHorses?: boolean
  /** In edit mode, the lesson or appointment being edited — it must not count against itself. */
  excludeItemId?: string | null
}

/** All 42 dates of `month`'s ("YYYY-MM") Sunday-start grid, spilling into the
 *  neighbouring months at both ends. */
export function getMonthGrid(month: string): CalendarDate[] {
  const first = calendarDate(`${month}-01`)
  const gridStart = addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay())
  return Array.from({ length: GRID_DAYS }, (_, i) => addDays(gridStart, i))
}

export function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number)
  const zeroBased = (year * 12 + (monthNumber - 1)) + delta
  return `${Math.floor(zeroBased / 12)}-${String((zeroBased % 12) + 1).padStart(2, '0')}`
}

// ponytail: both operands are barn-local wall clock parsed as if UTC — the same idiom
// intervalsOverlap uses (schedule.ts). Consistent, so a plain distance comparison is exact
// except across a DST transition inside the 7-day window, where the boundary can shift by an
// hour. Upgrade path if that ever matters: carry the real instant alongside `start` and
// convert the target with wallClockToInstant.
function windowTotal(items: ScheduleItem[], horseId: string, date: string, hour: number): number {
  const target = new Date(`${date}T${String(hour).padStart(2, '0')}:00:00Z`).getTime()
  let total = 0
  for (const item of items) {
    if (item.itemType !== 'lesson') continue
    const exertion = item.exertionByHorseId[horseId]
    if (exertion === undefined) continue
    if (Math.abs(new Date(`${item.start}Z`).getTime() - target) > EXERTION_WINDOW_MS) continue
    total += exertion
  }
  return total
}

function worstBand(
  items: ScheduleItem[],
  selectedHorseIds: string[],
  date: string,
  opts: DayDecorationOptions
): ExhaustionBand | null {
  let worst: ExhaustionBand | null = null
  for (const horseId of selectedHorseIds) {
    const thresholds = opts.thresholdsByHorseId[horseId]
    // A horse with no resolved thresholds can't be banded — skip rather than guess. In
    // practice the form supplies one per horse; this guards the runtime boundary.
    if (!thresholds) continue
    const band = getExhaustionBand(windowTotal(items, horseId, date, opts.hour), thresholds)
    if (worst === null || BAND_SEVERITY[band] > BAND_SEVERITY[worst]) worst = band
  }
  return worst
}

export function computeDayDecorations(
  dates: string[],
  items: ScheduleItem[],
  opts: DayDecorationOptions
): Record<string, DayDecoration> {
  const relevant = opts.excludeItemId ? items.filter((i) => i.id !== opts.excludeItemId) : items
  const horseIds = new Set(opts.selectedHorseIds)
  const riderIds = new Set(opts.selectedRiderIds)
  const hasHorse = opts.selectedHorseIds.length > 0
  const hasRider = opts.selectedRiderIds.length > 0

  const result: Record<string, DayDecoration> = {}
  for (const date of dates) {
    if (date < opts.todayStr) {
      result[date] = { past: true, band: null, scheduled: false, conflict: false }
      continue
    }

    const onThisDay = relevant.filter((i) => i.start.slice(0, 10) === date)

    // Checked before the horse branch: barn-wide covers every horse, including any left checked
    // in state (see the option's doc). No band: an appointment carries no exertion_level, so
    // there is nothing to heat-map.
    // Events stay excluded for the same reason they are below — a barn event names no horse
    // in either direction, so it is not a scheduling conflict.
    if (opts.selectionAppliesToAllHorses) {
      result[date] = {
        past: false,
        band: null,
        scheduled: false,
        conflict: onThisDay.some((i) => i.itemType !== 'event'),
      }
      continue
    }

    if (hasHorse) {
      result[date] = {
        past: false,
        band: worstBand(relevant, opts.selectedHorseIds, date, opts),
        scheduled: false,
        // A barn-wide appointment (#1147) has no appointment_horses rows to match against, so it
        // conflicts with whichever horses are selected — the fan-out lives here rather than in
        // materialized junction rows, which would also miss horses added to the barn since.
        conflict: onThisDay.some((i) => i.appliesToAllHorses || i.horseIds.some((h) => horseIds.has(h))),
      }
      continue
    }

    result[date] = {
      past: false,
      band: null,
      scheduled: hasRider && onThisDay.some((i) => i.riderIds.some((r) => riderIds.has(r))),
      conflict: false,
    }
  }
  return result
}
