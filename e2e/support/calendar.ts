// The month-calendar grid's shared drive vocabulary (`MonthCalendarPicker`), extracted 2026-08-14
// from the three phase-3 calendar specs plus `checklist-phase3-exhaustion-bars.spec.ts` and
// `checklist-phase5-lessons-new.spec.ts` that had been carrying byte-identical copies.
// `checklist-phase3-calendar-shading.spec.ts` (#1462) is the canonical body source for every
// export; each docstring is that copy's own rationale moved verbatim. The per-file variants stayed
// put: each spec's `readGrid`/`GridCell` projection, `goToFixtureMonth` (closes over the file's
// `beforeAll`-set `fixtureMonth`), and `waitForScheduleShading` with its file-measured
// `SCHEDULE_FETCH_BUDGET`.
import type { Page } from '@playwright/test'
import { calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'

/** `getMonthGrid`'s fixed 6 rows × 7 days. Each spec's `readGrid` guards on it. */
export const GRID_CELLS = 42

/** Every day button in the month grid — `data-past` is unique to `MonthCalendarPicker`'s cells. */
export function dayCells(page: Page) {
  return page.locator('button[aria-label][data-past]')
}

/** One day button, by the "YYYY-MM-DD" that is its own accessible name. */
export function dayCell(page: Page, date: string) {
  return page.getByRole('button', { name: date, exact: true })
}

/** The cell `readGrid` reported for `date`. Throws rather than returning undefined, so a day
 *  that fell off the grid names itself instead of failing as a mismatched `undefined`. */
export function cellFor<T extends { date: string }>(cells: T[], date: string): T {
  const cell = cells.find((c) => c.date === date)
  if (!cell) throw new Error(`day ${date} is not on the rendered grid`)
  return cell
}

/**
 * Pages the grid one month in `direction`, and settles on `target`'s heading.
 *
 * A plain click, deliberately NOT `hydrateByDriving`: the month buttons are *monotonic*, not
 * idempotent, so a retry loop whose read merely lagged one successful click would advance a
 * second month and then never satisfy its own predicate. `openNewLessonForm`'s barrier has
 * already proved React is listening, which is what makes one click enough.
 *
 * `target` IS A PARAMETER, and must stay one. Deriving it here as "one month either side of
 * `barnToday`" — which is what #1462's copy did first — silently assumes the grid is sitting on the
 * barn's current month, and breaks two ways once it isn't. A second call in one test would
 * click through to month+2 while waiting on month+1's heading, and `waitFor` is unbounded, so
 * it burns the whole `test.slow()`-tripled budget instead of failing fast. And it re-reads the
 * barn's day per test while `fixtureMonth` is frozen at `beforeAll`, so a run that crosses
 * midnight into a new month would wait on a heading that IS displayed and fail much later, in
 * `cellFor`, as a confusing "day … is not on the rendered grid". Passing the month the caller
 * actually means keeps the failure at the navigation that caused it.
 *
 * `exact: true` on the arrows to match every other spec that drives them
 * (checklist-phase4-barn-timezone / -expenses-form / -settings-fields).
 */
export async function goToMonth(page: Page, direction: 'Previous' | 'Next', target: string): Promise<void> {
  await page.getByRole('button', { name: `${direction} month`, exact: true }).click()
  await page.getByText(formatMonthHeading(target), { exact: true }).waitFor()
}

/**
 * Taps a day, and settles on the day panel's own heading changing to that day.
 *
 * The settle is not `aria-pressed`: React 19 does not reconcile an attribute that mismatched at
 * hydration, and #1252 measured exactly that on these cells — the grid's `aria-pressed` keeps
 * the server's value through hydration and through later re-renders alike. The panel heading is
 * rendered text, so it moves.
 */
export async function pickDay(page: Page, date: string): Promise<void> {
  await dayCell(page, date).click()
  await page.getByText(formatCalendarDate(calendarDate(date)), { exact: true }).waitFor()
}
