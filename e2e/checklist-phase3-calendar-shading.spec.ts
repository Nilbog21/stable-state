// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/lib/month-calendar.ts
// covers: src/lib/band-colors.ts
// covers: src/lib/exhaustion-band.ts
// covers: src/app/actions/lessons.ts
// covers: src/lib/db/schedule.ts
//
// #1019's month conflict calendar on the manager's New Lesson form
// (checklists/pre-release/phase-3-manager-lesson-entry.md, from "The Date field renders as a
// month calendar grid, not a native date box" through "Check a second horse alongside Apple —
// a day loaded for either horse takes the heavier of the two shadings"): the grid itself, the
// greyed past, the flat rider tint, the exertion shading that replaces it, and the conflict dot.
//
// Adjacent prior art. checklist-phase5-lessons-new.spec.ts drives the same calendar as a
// *trainer* and owns phase 5's claims about it (one exertion-shading day, one appointment dot,
// the locked instructor field, the nearby-instructor notification); the two files seed different
// barns. The month-navigation, day-panel and start-time-shift lines of this same checklist block
// belong to two later slices (#1463, #1464) and are deliberately untouched.
//
// THREE TESTS ELSEWHERE OVERLAP, and it is worth naming them rather than claiming this file is
// disjoint — an earlier draft of this comment did claim that, and it was wrong:
//
//   - phase 5's `trainer_new_lesson_form_renders_the_month_calendar_as_its_date_field` makes the
//     same 42-cells-and-no-native-input equality as the grid test below. Phase 5's own header
//     explains why it can only assert the *trainer's* rendering: one spec file runs as one role,
//     so neither file can observe the other's. The duplication is the price of that, not an
//     oversight, and phase 3's checklist line is a separate claim about the manager's form.
//   - checklist-phase4-settings-fields.spec.ts's `new_lesson_calendar_greys_out_the_devices_day_as_past`
//     drives this very form and also asserts the greyed past, and
//     checklist-phase4-expenses-form.spec.ts's `days_before_today_are_greyed_out` asserts it on
//     `MonthCalendarPicker` via the expense form. The greyed-past test below is deliberately
//     stronger than either — it reads two grids so the partition cannot hold vacuously, and it
//     compares *computed colours* rather than class tokens.
//
// That last point is not stylistic. checklist-phase4-expenses-form.spec.ts's `PAST_DAY_TINT`
// records the trap a class-token check walks into here: `text-zinc-300` is the past cell's light
// value AND the *outside-month* cell's dark value, so matching tokens conflates two states that
// the light/dark pair inverts. Reading the computed colour sidesteps it in both schemes, which is
// why `distinctGreyedColours: 1` and `coloursSharedWithLiveDays: []` hold either way. Do not
// "simplify" that test to a className check.
//
// `src/components/ui/date-nav.ts` is NOT declared above even though the month arrows are clicked
// here. Phase 5's spec owns the claim that those arrows share the Finances page's class and is
// the only file that asserts anything about the constant; this one uses the arrows purely as
// navigation, so declaring it would widen every date-nav change's blast radius for no assertion.
//
// ## This file mutates nothing
//
// Every test is a read of a form the barn's seed already determined, so there is no
// `test.describe.serial` here and no ordering between tests: each opens its own New Lesson form
// and drives it from scratch. That is also why the checklist's chain ("select rider Dana… now
// also check horse Apple… check a second horse") is reproduced *within* the tests that need a
// transition rather than *across* tests — a cross-test chain would make each checkbox's
// assertion depend on the previous checkbox having run.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row result would go
// unnoticed. The seed callback below contains neither directly, and its three builders each
// raise rather than return empty by a different route: `addTier` and `addHorse` bottom out in
// inserts whose `.single()` fails a zero-row match with PGRST116, while `addUnpaidLesson` bottoms
// out in the `create_lesson_with_participants` RPC, which raises server-side. `addHorse`'s
// threshold write IS an `.update(` — but it lives inside the builder, is guarded there by
// `mustSucceed`, and matches the row `createHorse` just returned.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { openNewLessonForm, selectHorse } from './support/lesson-form'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { shiftMonth } from '@/lib/month-calendar'
import { BAND_TINT_CLASS } from '@/lib/band-colors'
import { calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import type { Horse } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn this grid is a picture of
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const BUTTER = 'Butter'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

/** The checklist's "Dana" — the rider login, whose name this barn's rider picker offers. */
const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`

// Both horses carry per-horse thresholds rather than the barn defaults, so every band below is
// arithmetic rather than coincidence. `getExhaustionBand` is `total <= moderate -> low;
// total <= high -> moderate; else high`, so against { moderate: 2, high: 4 }:
//   0 -> low      3 -> moderate      5 -> high
const THRESHOLD_MODERATE = 2
const THRESHOLD_HIGH = 4
const HIGH_EXERTION = 5
const MODERATE_EXERTION = 3

// Barn-local wall clocks for the seeded lessons. Two times only so that a day carrying two
// lessons has them at distinct hours; the ±3-day exertion window is bucketed to the hour, so an
// hour's difference is nowhere near any window edge.
const FIRST_LESSON_TIME = '10:00'
const SECOND_LESSON_TIME = '11:00'

/*
 * Do not "simplify" BARRIER_TIME to `10:00` to match FIRST_LESSON_TIME. The two are unrelated: the band
 * arithmetic below does not depend on the form's hour at all (see the fixture-day table).
 */

/**
 * `expect.poll` and web-first matchers run on expect's own 5s default, which `test.slow()` does
 * not raise — so unlike every `waitFor*` in this file, a number here *loosens* rather than
 * tightens (e2e/CLAUDE.md fact 1). Every consumer below waits on the form's one-per-displayed-
 * month schedule Server Action behind a `next dev` compile of a route the run may be touching
 * for the first time; 5s is not reliably enough for that under load (#1372 measured exactly
 * that).
 *
 * 30s rather than the 20s checklist-phase5-lessons-new.spec.ts uses for the same round trip, and
 * the extra 10s is #1482's measurement rather than padding: a cold `next dev` compiles the routes
 * a test visits *inside that test's budget*, measured at ~16.6s of pure compile, and under
 * full-suite worker contention the two costs compound. This file's every band read settles
 * through `waitForScheduleShading`, which is doing double duty as the schedule-fetch barrier (see
 * there), so it is the one assertion here that a cold first paint is positioned to break — and it
 * is where this spec will eventually run, since a full-suite selection is not this slice's to
 * choose. Warm, these settles resolve in well under a second, so the headroom costs a passing run
 * nothing; a genuinely broken fetch never resolves and still fails the test.
 */
const SCHEDULE_FETCH_BUDGET = 30_000

/**
 * Chromium's computed `background-color` for an element with no background painted — the value
 * `background-color: transparent` resolves to. A platform constant, not a design colour: no
 * palette change can move it, which is what makes "this day is not tinted" assertable without
 * freezing a hex anywhere.
 *
 * A *painted* cell's computed value is not comparable to this by shape — Tailwind 4's palette is
 * `oklch()` and Chromium returns that format verbatim (see `dotShape`). That does not reach here:
 * every use below is an inequality against this one string, and `transparent` is the CSS-wide
 * keyword rather than a palette entry, so no theme change routes it through `oklch()`.
 */
const UNTINTED = 'rgba(0, 0, 0, 0)'

/** `getMonthGrid`'s fixed 6 rows × 7 days. Named because `readGrid` guards on it as well as the
 *  month-grid test asserting it. */
const GRID_CELLS = 42

// "YYYY-MM" of the month every fixture sits in, and the days within it. Next month, for the
// reason checklist-phase5-lessons-new.spec.ts states: the current month's grid can hold as few
// as ~5 future cells when the suite runs at month end, which cannot hold separated fixture days,
// while next month is entirely future, entirely inside one grid, and one `Next month` click away
// on every calendar day of the year.
//
// Resolved in the seed callback because the barn's timezone — the only frame `barnToday` may be
// asked in — is not knowable at module scope.
let fixtureMonth: string
/** Dana's one lesson, on APPLE. Rider-tinted; `high` for APPLE and dotted once APPLE is checked. */
let riderDay: string
/** Nothing booked. Shaded `high` purely by `riderDay` one day earlier — the no-dot control. */
let neighbourDay: string
/** APPLE `high` (5), BUTTER `moderate` (3) — the day APPLE is the heavier of the two. */
let appleHeavierDay: string
/** APPLE `moderate` (3), BUTTER `high` (5) — the day BUTTER is the heavier of the two. */
let butterHeavierDay: string

let apple: Horse
let butter: Horse

/**
 * The fixture layout, and why each day is where it is.
 *
 *   day 08  riderDay          APPLE 5, rider Dana
 *   day 09  neighbourDay      nothing
 *   day 14  appleHeavierDay   APPLE 5 + BUTTER 3, rider Sutton
 *   day 20  butterHeavierDay  APPLE 3 + BUTTER 5, rider Sutton
 *
 * Clusters are ≥5 days apart and the days within a cluster ≤1 day apart, so every ±3-day window
 * sum below is exact at whatever hour the suite happens to run — the window is centred on the
 * form's chosen hour, so only the *day* separation has to clear 3, and 5 clears it with a day to
 * spare in both directions while 1 stays comfortably inside.
 *
 *   riderDay's window (05–11) holds riderDay alone           -> APPLE 5      -> high
 *   neighbourDay's window (06–12) holds riderDay alone       -> APPLE 5      -> high, no booking
 *   appleHeavierDay's window (11–17) holds day 14 alone      -> APPLE 5 / BUTTER 3 -> high / moderate
 *   butterHeavierDay's window (17–23) holds day 20 alone     -> APPLE 3 / BUTTER 5 -> moderate / high
 *
 * The last two are asymmetric in *both* directions on purpose: with only one lopsided day, a
 * heatmap that took the first selected horse's band, or the last one's, or the lighter of the
 * two, would still render the expected colour there and the checkbox would pass while claiming
 * nothing.
 *
 * Dana rides on `riderDay` and nowhere else, which is what lets the rider-tint test assert an
 * exact set over the whole grid rather than a containment. Every other lesson is Sutton's.
 *
 * One horse per lesson, deliberately: `assert_lesson_participant_counts` constrains a normal
 * lesson's participants, and a day needing two horses' load gets two lessons rather than an
 * argument about that constraint.
 */
const barn = withBarn('phase3-calendar', async ({ supabase, barn: seededBarn, members }) => {
  // Not decoration: LessonForm short-circuits its entire render to "No lesson tiers have been
  // configured…" when `tiers` is empty, so on a tier-less barn there is no form at all and every
  // assertion in this file would pass against a page rendering none of what it names.
  const tier = await addTier(supabase, seededBarn.id, {
    name: STANDARD_TIER,
    price: TIER_PRICE,
    isDefault: true,
  })

  apple = await addHorse(supabase, seededBarn.id, APPLE, {
    exhaustionThresholdModerate: THRESHOLD_MODERATE,
    exhaustionThresholdHigh: THRESHOLD_HIGH,
  })
  butter = await addHorse(supabase, seededBarn.id, BUTTER, {
    exhaustionThresholdModerate: THRESHOLD_MODERATE,
    exhaustionThresholdHigh: THRESHOLD_HIGH,
  })

  fixtureMonth = shiftMonth(barnToday(seededBarn.timezone).slice(0, 7), 1)
  riderDay = `${fixtureMonth}-08`
  neighbourDay = `${fixtureMonth}-09`
  appleHeavierDay = `${fixtureMonth}-14`
  butterHeavierDay = `${fixtureMonth}-20`

  const seedLesson = (day: string, time: string, horse: Horse, exertion: number, riderId: string) =>
    addUnpaidLesson(supabase, seededBarn, {
      at: wallClockToInstant(`${day}T${time}:00`, seededBarn.timezone),
      time,
      instructorId: members.manager.membershipId,
      horseIds: [horse.id],
      exertionLevels: [exertion],
      riderIds: [riderId],
      fee: tier.price,
      tierName: tier.name,
    })

  await seedLesson(riderDay, FIRST_LESSON_TIME, apple, HIGH_EXERTION, members.rider.membershipId)
  await seedLesson(appleHeavierDay, FIRST_LESSON_TIME, apple, HIGH_EXERTION, members.rider2.membershipId)
  await seedLesson(appleHeavierDay, SECOND_LESSON_TIME, butter, MODERATE_EXERTION, members.rider2.membershipId)
  await seedLesson(butterHeavierDay, FIRST_LESSON_TIME, apple, MODERATE_EXERTION, members.rider2.membershipId)
  await seedLesson(butterHeavierDay, SECOND_LESSON_TIME, butter, HIGH_EXERTION, members.rider2.membershipId)
})

// ---------------------------------------------------------------------------
// Locators, barriers and drivers
// ---------------------------------------------------------------------------

/** Every day button in the month grid — `data-past` is unique to `MonthCalendarPicker`'s cells. */
function dayCells(page: Page) {
  return page.locator('button[aria-label][data-past]')
}

/** One day button, by the "YYYY-MM-DD" that is its own accessible name. */
function dayCell(page: Page, date: string) {
  return page.getByRole('button', { name: date, exact: true })
}

/**
 * Everything one grid cell renders, for all 42 cells, in one round trip.
 *
 * `tint` and `color` are *computed* styles rather than class names because the checkboxes this
 * file answers are about what the grid looks like — "no day is tinted", "days … are tinted",
 * "greyed out". A class-name check would pass against a stylesheet that stopped painting.
 * `className` is carried alongside so the shading tests can additionally bind the painted colour
 * to `BAND_TINT_CLASS`'s own entry rather than to a hex written here.
 *
 * The count guard is support/read.ts's rule 3 reaching `evaluateAll`, which carries the identical
 * hazard — but it pins the FULL grid rather than rule 3's "first match is visible", because a
 * short read is as dangerous here as an empty one and three assertions accept one. The two
 * `toEqual([])` absences are satisfied by a 7-cell read, and the greyed-past test compares two
 * projections of this same array, so a 7-cell read there compares 7 against 7 and passes. 42 is
 * fixed by `getMonthGrid`'s `GRID_DAYS`, so there is no run in which a partial grid is correct.
 */
type GridCell = {
  date: string
  past: boolean
  band: string | null
  scheduled: boolean
  outside: boolean
  tint: string
  color: string
  className: string
  hasDot: boolean
}

async function readGrid(page: Page): Promise<GridCell[]> {
  const cells = dayCells(page)
  await expect(cells).toHaveCount(GRID_CELLS)
  return cells.evaluateAll((nodes: HTMLElement[]) =>
    nodes.map((node) => {
      const style = getComputedStyle(node)
      return {
        date: node.getAttribute('aria-label') ?? '',
        past: node.getAttribute('data-past') === 'true',
        band: node.getAttribute('data-band'),
        scheduled: node.getAttribute('data-scheduled') === 'true',
        outside: node.getAttribute('data-outside') === 'true',
        tint: style.backgroundColor,
        color: style.color,
        className: node.className,
        hasDot: node.querySelector('[data-testid^="conflict-dot-"]') !== null,
      }
    })
  )
}

/** The cell `readGrid` reported for `date`. Throws rather than returning undefined, so a day
 *  that fell off the grid names itself instead of failing as a mismatched `undefined`. */
function cellFor(cells: GridCell[], date: string): GridCell {
  const cell = cells.find((c) => c.date === date)
  if (!cell) throw new Error(`day ${date} is not on the rendered grid`)
  return cell
}

/** The dates, in grid order, whose background is painted at all. */
function tintedDates(cells: GridCell[]): string[] {
  return cells.filter((c) => c.tint !== UNTINTED).map((c) => c.date)
}

/** The dates, in grid order, showing a conflict dot. */
function dottedDates(cells: GridCell[]): string[] {
  return cells.filter((c) => c.hasDot).map((c) => c.date)
}

/**
 * The three adjectives of "a small red dot below the date number", measured off the rendered
 * dot rather than asserted as a class.
 *
 * `redDominant` is `r > g && r > b`, deliberately loose: the dot is `bg-red-600` in light mode
 * and `bg-red-400` in dark, and a theme-token change should not turn this into a false failure.
 * A frozen hex would be a more brittle assertion, not a stronger one.
 *
 * ## The channels come back through a 1×1 canvas, and that is not decoration
 *
 * Measured, and it cost this spec its first run. **Tailwind 4 ships its palette in `oklch()`,
 * and Chromium's `getComputedStyle` hands that format straight back** — `bg-red-600` computes to
 * the string `oklch(0.577 0.245 27.325)`, not to an `rgb()` triple. Scraping numbers out of that
 * string with a digit regex yields `[0, 577, 0, 245, 27, 325]`, whose first two "channels" are
 * `0` and `577`, so `r > g` is false for a dot that is unmistakably red on screen. The first run
 * of this file failed on exactly that, reporting `redDominant: false`.
 *
 * Painting the value into a canvas and reading the pixel back is the format-agnostic fix: the
 * browser does the conversion, so this keeps working whatever colour syntax Tailwind emits next.
 * The probe that established it: `oklch(0.577 0.245 27.325)` → `[231, 0, 11, 255]`.
 *
 * `fillStyle` is seeded to opaque black first, so a value Chromium cannot parse is silently
 * ignored and reads back as black — `r > g` is false, and the assertion fails loudly rather than
 * passing on a colour nobody measured.
 */
async function dotShape(page: Page, date: string) {
  return dayCell(page, date).evaluate((node: HTMLElement) => {
    const dot = node.querySelector('[data-testid^="conflict-dot-"]')
    if (!dot) return null
    const cell = node.getBoundingClientRect()
    const box = dot.getBoundingClientRect()

    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000000'
    ctx.fillStyle = getComputedStyle(dot).backgroundColor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data

    return {
      belowTheNumber: box.top + box.height / 2 > cell.top + cell.height / 2,
      redDominant: r > g && r > b,
      smallRelativeToTheCell: box.height < cell.height / 2,
    }
  })
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
 * `barnToday`" — which is what this did first — silently assumes the grid is sitting on the
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
async function goToMonth(page: Page, direction: 'Previous' | 'Next', target: string): Promise<void> {
  await page.getByRole('button', { name: `${direction} month`, exact: true }).click()
  await page.getByText(formatMonthHeading(target), { exact: true }).waitFor()
}

/** Pages forward onto the month every fixture sits in, settling on the month they were seeded
 *  against rather than on one recomputed from the clock. */
async function goToFixtureMonth(page: Page): Promise<void> {
  await goToMonth(page, 'Next', fixtureMonth)
}

/**
 * Taps a day, and settles on the day panel's own heading changing to that day.
 *
 * The settle is not `aria-pressed`: React 19 does not reconcile an attribute that mismatched at
 * hydration, and #1252 measured exactly that on these cells — the grid's `aria-pressed` keeps
 * the server's value through hydration and through later re-renders alike. The panel heading is
 * rendered text, so it moves.
 */
async function pickDay(page: Page, date: string): Promise<void> {
  await dayCell(page, date).click()
  await page.getByText(formatCalendarDate(calendarDate(date)), { exact: true }).waitFor()
}

/** Picks the rider from the normal lesson's single-rider `<select>`. */
async function selectRider(page: Page, name: string): Promise<void> {
  await page.locator('#rider_id').selectOption({ label: name })
}

/**
 * Blocks until the grid's decorations reflect the month's schedule, by waiting for one day whose
 * band is only reachable once the fetch has landed.
 *
 * This is the fetch barrier, not a convenience. `scheduleItems` starts `[]`, and `worstBand`
 * over an empty window is `getExhaustionBand(0, …)` — `low` — so with a horse checked and the
 * Server Action still outstanding, EVERY day already reads `data-band="low"`. A grid read taken
 * before this would see a fully-decorated calendar carrying entirely the wrong bands.
 *
 * Carries SCHEDULE_FETCH_BUDGET because it is the one wait in this file that spans that round
 * trip; every other settle here is local re-render.
 */
async function waitForScheduleShading(page: Page, date: string, band: string): Promise<void> {
  await expect(dayCell(page, date)).toHaveAttribute('data-band', band, {
    timeout: SCHEDULE_FETCH_BUDGET,
  })
}

/**
 * Blocks until the day panel lists `riderDay`'s lesson.
 *
 * The positive anchor (#1434) for the two "nothing selected" tests below, and it has to be this
 * rather than "the grid rendered 42 cells": with no horse and no rider selected the decorations
 * are all-neutral *both* before and after the schedule fetch, so a cell-count anchor cannot tell
 * "untinted because the data says so" from "untinted because the data has not arrived" — which
 * is the entire content of those two checkboxes. The panel renders from the same
 * `scheduleItems` the decorations are computed from, so its listing that lesson proves the
 * fetch has landed client-side.
 *
 * The expected text is `describeScheduleItem`'s composition for a lesson — horse names then
 * rider names — built from the fixtures rather than transcribed.
 */
async function anchorOnScheduleLoaded(page: Page): Promise<void> {
  await pickDay(page, riderDay)
  await page.getByText(`Lesson — ${APPLE}, ${RIDER_NAME}`, { exact: true }).waitFor()
}

// ---------------------------------------------------------------------------
// The grid, the greyed past, and the two "nothing selected" absences
// ---------------------------------------------------------------------------

test.describe('#1019 conflict calendar — grid and shading', () => {
  // "The Date field renders as a month calendar grid, not a native date box". Both halves in one
  // equality: the month grid is present at its full fixed 6×7, and the native `<input
  // type="date">` LessonForm falls back to without a schedule reader is not. Either half alone is
  // satisfiable by the wrong page — a form with both controls, or a form with neither.
  test('manager_new_lesson_date_field_renders_a_month_grid_not_a_native_date_input @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)

    expect({
      dayCells: await dayCells(page).count(),
      nativeDateInputs: await page.locator('#lesson-date').count(),
    }).toEqual({ dayCells: 42, nativeDateInputs: 0 })
  })

  // "Days before today are greyed out, making today the first fully-coloured day on the grid."
  //
  // Read across TWO grids, and that is what keeps it honest on every calendar day of the year.
  // The current month's grid can legitimately contain no past day at all (the 1st falling on a
  // Sunday), against which a partition equality would hold vacuously; the previous month's grid
  // always contains past days. Neither grid alone is guaranteed to hold both kinds, so the
  // colour check below runs over their union, where both are guaranteed.
  //
  // The partition is asserted as the whole 42-cell mask rather than as "the first non-past cell
  // is today", because the mask says both things at once: today is not greyed, and every day
  // before it is.
  test('manager_calendar_greys_out_every_day_before_today @manager', async ({ page }) => {
    // One `barnToday` read feeds both the navigation target and the expectation below, so a run
    // that crossed midnight could not leave the two disagreeing about which month is "previous".
    const today = barnToday(barn.data.barn.timezone)
    await openNewLessonForm(page, barn)
    const currentMonth = await readGrid(page)
    await goToMonth(page, 'Previous', shiftMonth(today.slice(0, 7), -1))
    const previousMonth = await readGrid(page)

    // Greyed-out is a text colour (`text-zinc-300 dark:text-zinc-600`), so the visual half of
    // the line is asserted as a colour that past cells share and no live cell uses — never as a
    // literal, which would freeze the palette into this spec.
    const union = [...previousMonth, ...currentMonth]
    const greyedColours = new Set(union.filter((c) => c.past).map((c) => c.color))
    const liveColours = new Set(union.filter((c) => !c.past).map((c) => c.color))

    expect({
      currentMonthGreyed: currentMonth.map((c) => c.past),
      previousMonthGreyed: previousMonth.map((c) => c.past),
      previousMonthHasGreyedDays: previousMonth.some((c) => c.past),
      distinctGreyedColours: greyedColours.size,
      coloursSharedWithLiveDays: [...greyedColours].filter((c) => liveColours.has(c)),
    }).toEqual({
      currentMonthGreyed: currentMonth.map((c) => c.date < today),
      previousMonthGreyed: previousMonth.map((c) => c.date < today),
      previousMonthHasGreyedDays: true,
      distinctGreyedColours: 1,
      coloursSharedWithLiveDays: [],
    })
  })

  // "With neither a horse nor a rider selected, no day is tinted." Anchored on the day panel
  // having listed `riderDay`'s lesson — see `anchorOnScheduleLoaded` for why nothing weaker
  // will do.
  test('manager_no_day_is_tinted_before_a_horse_or_rider_is_selected @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await anchorOnScheduleLoaded(page)

    expect(tintedDates(await readGrid(page))).toEqual([])
  })

  // "With neither a horse nor a rider selected, no day shows a dot." Same anchor, same reason.
  test('manager_no_day_shows_a_conflict_dot_before_a_horse_or_rider_is_selected @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await anchorOnScheduleLoaded(page)

    expect(dottedDates(await readGrid(page))).toEqual([])
  })

  // "Select rider Dana and no horse — days where Dana already has a lesson are tinted."
  //
  // An exact set over the whole grid rather than a check on `riderDay` alone: Dana rides on
  // exactly one seeded day, so the equality says both that her day is tinted and that the four
  // other seeded lesson days — which belong to the other rider — are not. A single-day assertion
  // would pass against a form that tinted every day it had any item for.
  test('manager_rider_only_selection_tints_exactly_the_days_that_rider_already_rides @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectRider(page, RIDER_NAME)
    await expect(dayCell(page, riderDay)).toHaveAttribute('data-scheduled', 'true', {
      timeout: SCHEDULE_FETCH_BUDGET,
    })

    expect(tintedDates(await readGrid(page))).toEqual([riderDay])
  })

  // "Still rider-only, no day shows a dot." The positive anchor is in the same assertion rather
  // than in a preceding wait: the rider tint being present on `riderDay` is what says this page
  // state has the rider selected AND the schedule loaded, which is exactly the state the absence
  // is claimed of.
  test('manager_rider_only_selection_shows_no_conflict_dot @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectRider(page, RIDER_NAME)
    await expect(dayCell(page, riderDay)).toHaveAttribute('data-scheduled', 'true', {
      timeout: SCHEDULE_FETCH_BUDGET,
    })

    const cells = await readGrid(page)
    expect({ tinted: tintedDates(cells), dotted: dottedDates(cells) }).toEqual({
      tinted: [riderDay],
      dotted: [],
    })
  })

  // "Now also check horse Apple — the flat rider tint is replaced by exertion shading."
  //
  // A transition, not a state, so both ends are asserted. The `before` half is what makes it
  // one: a form that never tinted for the rider at all would satisfy any post-hoc assertion
  // about the shading alone.
  //
  // `tintChanged` is the line's own word — "replaced" — measured as the painted colour actually
  // differing, with both ends confirmed painted. The class check binds the new colour to
  // `BAND_TINT_CLASS`'s own `high` entry, so this stays true through a palette change and false
  // if the day stops being shaded by exertion.
  test('manager_checking_a_horse_replaces_the_flat_rider_tint_with_exertion_shading @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectRider(page, RIDER_NAME)
    await expect(dayCell(page, riderDay)).toHaveAttribute('data-scheduled', 'true', {
      timeout: SCHEDULE_FETCH_BUDGET,
    })
    const before = cellFor(await readGrid(page), riderDay)

    await selectHorse(page, apple)
    await waitForScheduleShading(page, riderDay, 'high')
    const after = cellFor(await readGrid(page), riderDay)

    expect({
      before: {
        band: before.band,
        flatRiderTint: before.scheduled,
        painted: before.tint !== UNTINTED,
      },
      after: {
        band: after.band,
        flatRiderTint: after.scheduled,
        painted: after.tint !== UNTINTED,
        carriesTheBandTint: after.className.includes(BAND_TINT_CLASS.high),
      },
      tintChanged: before.tint !== after.tint,
    }).toEqual({
      before: { band: null, flatRiderTint: true, painted: true },
      after: { band: 'high', flatRiderTint: false, painted: true, carriesTheBandTint: true },
      tintChanged: true,
    })
  })

  // "A day where Apple already has a lesson shows a small red dot below the date number."
  //
  // The dot set is asserted exactly, derived from the seed: APPLE has a lesson on three of the
  // four fixture days and none at all on `neighbourDay`. Asserting only that `riderDay` has a
  // dot would pass against a grid that dotted every day.
  //
  // The three adjectives are then measured off the rendered dot — see `dotShape`.
  test('manager_a_day_the_selected_horse_already_works_shows_a_conflict_dot @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectHorse(page, apple)
    await waitForScheduleShading(page, riderDay, 'high')

    expect({
      dotted: dottedDates(await readGrid(page)),
      shape: await dotShape(page, riderDay),
    }).toEqual({
      dotted: [riderDay, appleHeavierDay, butterHeavierDay],
      shape: { belowTheNumber: true, redDominant: true, smallRelativeToTheCell: true },
    })
  })

  // "A day shaded amber/red only by neighbouring days' lessons shows no dot."
  //
  // The sharpest line in the block: dots mean *this day has a booking*, shading means *this day
  // is loaded*. `neighbourDay` holds nothing at all and is shaded `high` purely by `riderDay`
  // sitting one day inside its ±3-day window, so the two signals are forced apart.
  //
  // The absence's positive anchor is in the same assertion: `riderDay` carrying a dot on this
  // same page state proves dots render here at all, so `neighbourDay`'s missing one is a fact
  // about that day rather than about the page.
  test('manager_a_day_shaded_only_by_a_neighbouring_days_lesson_shows_no_conflict_dot @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectHorse(page, apple)
    await waitForScheduleShading(page, riderDay, 'high')

    const cells = await readGrid(page)
    const neighbour = cellFor(cells, neighbourDay)

    expect({
      neighbourBand: neighbour.band,
      neighbourIsShaded: neighbour.className.includes(BAND_TINT_CLASS.high),
      neighbourHasDot: neighbour.hasDot,
      bookedDayHasDot: cellFor(cells, riderDay).hasDot,
    }).toEqual({
      neighbourBand: 'high',
      neighbourIsShaded: true,
      neighbourHasDot: false,
      bookedDayHasDot: true,
    })
  })

  // "Check a second horse alongside Apple — a day loaded for either horse takes the heavier of
  // the two shadings."
  //
  // Two days, lopsided in opposite directions, asserted before and after BUTTER is checked.
  // `appleHeavierDay` must keep APPLE's `high` (a heatmap that took the last-checked horse's
  // band would drop it to BUTTER's `moderate`) while `butterHeavierDay` must rise from APPLE's
  // `moderate` to BUTTER's `high` (a heatmap that kept the first horse's band, or took the
  // lighter of the two, would leave it `moderate`). One lopsided day would let two of those
  // three survive.
  test('manager_two_checked_horses_resolve_each_day_to_the_heavier_shading @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectHorse(page, apple)
    await waitForScheduleShading(page, appleHeavierDay, 'high')
    const appleOnly = await readGrid(page)

    await selectHorse(page, butter)
    await waitForScheduleShading(page, butterHeavierDay, 'high')
    const bothHorses = await readGrid(page)

    const shading = (cells: GridCell[], date: string) => {
      const cell = cellFor(cells, date)
      return {
        band: cell.band,
        // Bound to BAND_TINT_CLASS's own entries rather than to a colour written here, so the
        // rendered shading is asserted without this spec owning the palette.
        //
        // `moderate` and `high` ONLY — never `BAND_TINT_CLASS.low`, which is deliberately `''`
        // (band-colors.ts paints no background for `low`). `className.includes('')` is true of
        // every cell, so admitting it here would turn this filter into a tautology that reports
        // a `low` tint on all 42 days. Any future band added to the record has to be checked for
        // an empty value before it joins this list.
        tintClass: [BAND_TINT_CLASS.moderate, BAND_TINT_CLASS.high].filter((c) =>
          cell.className.includes(c)
        ),
      }
    }

    expect({
      appleOnly: {
        appleHeavierDay: shading(appleOnly, appleHeavierDay),
        butterHeavierDay: shading(appleOnly, butterHeavierDay),
      },
      bothHorses: {
        appleHeavierDay: shading(bothHorses, appleHeavierDay),
        butterHeavierDay: shading(bothHorses, butterHeavierDay),
      },
    }).toEqual({
      appleOnly: {
        appleHeavierDay: { band: 'high', tintClass: [BAND_TINT_CLASS.high] },
        butterHeavierDay: { band: 'moderate', tintClass: [BAND_TINT_CLASS.moderate] },
      },
      bothHorses: {
        appleHeavierDay: { band: 'high', tintClass: [BAND_TINT_CLASS.high] },
        butterHeavierDay: { band: 'high', tintClass: [BAND_TINT_CLASS.high] },
      },
    })
  })
})
