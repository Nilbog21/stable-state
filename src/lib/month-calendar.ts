import { getExhaustionBand, type ExhaustionBand } from '@/lib/exhaustion-band'
import { addDays } from '@/lib/local-day'
import type { ScheduleItem } from '@/lib/db/types'

/**
 * Pure month-grid + day-decoration model behind #1019's lesson-form conflict picker.
 * No React, no Supabase — every calendar cell's appearance is derived here from one
 * already-fetched `ScheduleItem[]` plus the form's current horse/rider selection, so
 * changing the selection re-renders without another round trip.
 *
 * Horse selection is the dominant signal: with at least one horse selected the day
 * background is the projected-exertion heatmap and the dot marks real bookings; the
 * rider-only flat tint applies only when no horse is selected.
 */

/** Fixed 6 rows × 7 days. A short month would fit in 4–5 rows, but a variable row count
 *  makes the grid jump height as you page through months. */
const GRID_DAYS = 42

// Mirrors get_horse_projected_exhaustion's `lesson_at BETWEEN p_target_date - INTERVAL
// '3 days' AND p_target_date + INTERVAL '3 days'` — inclusive on both ends.
const EXERTION_WINDOW_MS = 3 * 24 * 60 * 60 * 1000

const BAND_SEVERITY: Record<ExhaustionBand, number> = { low: 0, moderate: 1, high: 2 }

export interface DayDecoration {
  /** Earlier than today in the viewer's own timezone. Suppresses every other signal. */
  past: boolean
  /** Projected-exertion band; non-null only when at least one horse is selected. */
  band: ExhaustionBand | null
  /** Rider-only flat "something scheduled" tint. */
  scheduled: boolean
  /** A selected horse already has a lesson or expense on this exact day, or a barn-wide
   *  appointment (#1147) is booked that day — those name no horse but concern every horse. */
  conflict: boolean
}

export interface DayDecorationOptions {
  selectedHorseIds: string[]
  selectedRiderIds: string[]
  /** Hour-of-day the form currently has chosen — the ±3-day window is centred on it, not
   *  on midnight, so the heatmap tracks the Hour dropdown the way ExhaustionBar does. */
  hour: number
  thresholdsByHorseId: Record<string, { high: number; moderate: number }>
  // ponytail: known limitation — this is the viewer's own day (local-day.ts's localToday),
  // while every other date here is a barn-local day, so a viewer whose device timezone differs
  // from barns.timezone can see the past/future cutoff land a day off near midnight. Accepted
  // for now on the assumption that users are in the barn's timezone; the app makes the same
  // viewer-local assumption in several other places, so the fix is a cross-app audit rather
  // than a one-line change here. Upgrade path: pass a barn-local todayStr computed server-side
  // with instantToLocalWallClock(new Date(), barn.timezone), as the dashboard Day view does.
  /** "YYYY-MM-DD" for today, viewer-local. */
  todayStr: string
  /** In edit mode, the lesson being edited — it must not count against itself. */
  excludeLessonId?: string | null
}

/** All 42 dates of `month`'s ("YYYY-MM") Sunday-start grid, spilling into the
 *  neighbouring months at both ends. */
export function getMonthGrid(month: string): string[] {
  const first = `${month}-01`
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
  const relevant = opts.excludeLessonId ? items.filter((i) => i.id !== opts.excludeLessonId) : items
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
