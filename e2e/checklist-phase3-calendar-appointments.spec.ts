// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/lib/month-calendar.ts
// covers: src/lib/band-colors.ts
// covers: src/lib/exhaustion-band.ts
// covers: src/app/actions/lessons.ts
// covers: src/lib/db/schedule.ts
// covers: src/lib/db/expenses.ts
//
// #1019/#1021/#1147's month conflict calendar on the manager's New Lesson form, second half
// (checklists/pre-release/phase-3-manager-lesson-entry.md, from "Change the **Start Time** field
// in the day panel from an early hour to a late one" through "With Apple selected, a greyed-out
// past day shows no dot"): the ±3-day exertion window following the start-time field, the
// conflict dot an appointment raises — for a horse it names and for a horse it never names —
// and the past day that carries neither signal.
//
// `src/lib/db/expenses.ts` is declared because the two appointments are seeded through
// `addExpense` → `createExpense`, so a change to the appointment write path can break the dot
// assertions here. `src/components/ui/date-nav.ts` is NOT declared even though the month arrows
// are clicked: phase 5's spec owns the claim about that constant, and this file uses the arrows
// purely as navigation (checklist-phase3-calendar-shading.spec.ts makes the same call).
//
// ## Adjacent prior art, and the overlap this file does not pretend away
//
// checklist-phase3-calendar-shading.spec.ts (#1462) owns the first half of this same checklist
// block — the grid, the greyed past, the rider tint, the exertion shading and the conflict dot
// on a *lesson* day — and every locator, barrier and driver below is copied from it rather than
// re-derived. The New Lesson form's shared drive vocabulary (`openNewLessonForm`, `selectHorse`,
// `BARRIER_TIME`) was hoisted into `e2e/support/lesson-form.ts` on 2026-08-14, accepting that
// `e2e/support/**` is in `scripts/select-specs.sh`'s `ALWAYS_FULL` and that a diff touching it
// forces `mode=full`; the month-grid vocabulary (`dayCells`, `dayCell`, `cellFor`, `goToMonth`,
// `pickDay`, `GRID_CELLS`) followed into `e2e/support/calendar.ts` on the same date; everything
// else below stays file-local. Two of those copies carry corrections that were paid for the hard
// way and must not be "simplified" back — see `goToMonth` and `readGrid`.
//
// checklist-phase5-lessons-new.spec.ts's `trainer_conflict_dot_fires_on_the_selected_horses_
// appointment_day` makes the horse-specific-appointment-dot claim already, as a *trainer*, on a
// different barn. One spec file runs as one role, so neither file can observe the other's; the
// phase-3 checklist line is a separate claim about the manager's form and the duplication is the
// price of that partition rather than an oversight.
//
// #1462 also owns the greyed-vs-live *colour* contrast, in
// `manager_calendar_greys_out_every_day_before_today` — it reads two grids so the partition
// cannot hold vacuously. The two past-day tests below therefore bind "greyed-out" as `data-past`
// plus a single shared past-cell colour and cite that test rather than reading a second grid to
// duplicate it: duplicating it would cost a grid read on every run and leave two places to
// update when the palette moves.
//
// ## The one mutating test, and why the fixtures are spread over three months
//
// #1147's pair needs the barn-wide day's shading captured *before* the appointment exists, so
// that appointment is booked mid-test rather than in the seed — the only mutation in this file.
// Its fixtures therefore sit in the barn's month **+2**, out of reach of every other test:
// a month+1 grid spans 42 cells from the Sunday on or before its 1st, which in the worst case
// (a 28-day month whose 1st is a Sunday) ends at +2 day 14, and the form fetches only
// `grid[0] - 3 … grid[41] + 4`, reaching at most +2 day 18. Fixtures at +2 days 20 and 21 are
// unreachable from every other test's grid *and* from its fetch.
//
// Do not "simplify" those two days back into the fixture month because the extra month looks
// arbitrary. It is what makes this file order-independent as a property of the fixture geometry
// rather than as a consequence of `playwright.config.ts`'s `retries: 0` and `fullyParallel:
// false` — config that can change without anyone re-auditing the specs silently relying on it.
//
// THE REACH RUNS BOTH WAYS, and only one direction is load-bearing. Backwards, a grid starts at
// the Sunday on or before its 1st, so the +2 grid can spill back up to 6 days — far enough to
// pull `horseAppointmentDay` (+1 day 25) onto it, dot and all, on some month alignments. That is
// harmless *because* the two barn-wide tests address cells by name through `cellFor` and never
// assert a whole-grid set. Do not "strengthen" either of them into an exact `dottedDates`
// equality: it would be right on most calendar days and wrong on the rest, which is the shape of
// bug that reads as a phantom flake rather than as a mistake.
//
// Both directions were verified computationally over every month alignment 2026–2030, not by
// hand: max forward reach day 14 of the following month (worst case a 28-day February whose 1st
// is a Sunday), fetch tail to day 18; max backward reach 6 days.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row result would go
// unnoticed. There is neither in the seed callback nor in the mid-test booking: `addTier`,
// `addHorse` and `addExpense` bottom out in inserts that raise on a zero-row match, and
// `addUnpaidLesson` bottoms out in the `create_lesson_with_participants` RPC, which raises
// server-side. `addHorse`'s threshold write IS an `.update(`, but it lives inside the builder,
// is guarded there by `mustSucceed`, and matches the row `createHorse` just returned.
import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { openNewLessonForm, selectHorse } from './support/lesson-form'
import { GRID_CELLS, cellFor, dayCell, dayCells, goToMonth, pickDay } from './support/calendar'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { shiftMonth } from '@/lib/month-calendar'
import { BAND_TINT_CLASS } from '@/lib/band-colors'
import type { Horse } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn this grid is a picture of
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

/** The checklist's "Dana" — the rider login, whose name this barn's rider picker offers, and
 *  whose name the past day's panel line is therefore built from rather than transcribed. */
const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`

// APPLE carries per-horse thresholds rather than the barn defaults, so every band below is
// arithmetic rather than coincidence. `getExhaustionBand` is `total <= moderate -> low;
// total <= high -> moderate; else high`, so against { moderate: 2, high: 4 }:
//   0 -> low      3 -> moderate      5 -> high
const THRESHOLD_MODERATE = 2
const THRESHOLD_HIGH = 4
const HIGH_EXERTION = 5
const MODERATE_EXERTION = 3

/**
 * The two appointments' wall clocks, and `time` is load-bearing rather than cosmetic:
 * `getScheduleForRange` filters `.not('expense_time', 'is', null)` and then re-filters on the
 * recombined `expense_date`T`expense_time`, so a **date-only planned expense never reaches the
 * calendar at all** and both dot assertions below would be made against a grid that legitimately
 * shows nothing. The amounts are seeded for the same reason the checklist line asks for one —
 * #1148 split the money onto `appointment_costs`, and an appointment carrying no cost row is a
 * different shape from the one a manager actually books.
 */
const HORSE_APPOINTMENT_TIME = '09:00'
const HORSE_APPOINTMENT_AMOUNT = 120
const BARN_WIDE_APPOINTMENT_TIME = '08:30'
const BARN_WIDE_APPOINTMENT_AMOUNT = 90

/** Recipients, held to `support/fixtures.ts`'s E2E_STUB_RIDER naming constraint even though
 *  neither is a person: neither contains the other, and neither collapses onto a seeded
 *  member's first-initial form. */
const VET_RECIPIENT = 'Ridgefield Equine Vet'
const FARRIER_RECIPIENT = 'Ridgefield Hoofcare'

/*
 * BARRIER_TIME's HOUR is separately load-bearing in this file: every test that does not drive the
 * start-time field runs the grid at hour 10, and the fixture-day table below is written against
 * that. Changing `10` breaks the two `earlyHourBarrierDay` transitions in the first test.
 *
 * Since #1578 that hour comes only from `openNewLessonForm`'s own fill — the form no longer
 * pre-fills a start time, so hour 10 is a state every test here *enters* rather than one it
 * inherits. A test that skipped the helper would sit on `estimateAt`'s hour instead, which is
 * whatever the barn's clock reads when the suite runs and therefore pins nothing.
 */

/** The start-time field's two ends for the shift test — "an early hour" and "a late one" in the
 *  checklist line's own words. Both are well clear of any DST transition hour. */
const EARLY_TIME = '06:00'
const LATE_TIME = '23:00'

/**
 * `expect.poll` and web-first matchers run on expect's own 5s default, which `test.slow()` does
 * not raise, so a number here *loosens* rather than tightens (e2e/CLAUDE.md fact 1). 30s rather
 * than 20s is #1482's measurement rather than padding: a cold `next dev` compiles the routes a
 * test visits *inside that test's budget*, measured at ~16.6s of pure compile, and under
 * full-suite worker contention that compounds with the schedule Server Action this file's every
 * band read waits behind. Warm, these settle in well under a second, so the headroom costs a
 * passing run nothing; a genuinely broken fetch never resolves and still fails the test.
 */
const SCHEDULE_FETCH_BUDGET = 30_000

/**
 * Chromium's computed `background-color` for an element with no background painted. A platform
 * constant, not a design colour: no palette change can move it, which is what makes "this day is
 * not shaded" assertable without freezing a hex anywhere. `transparent` is the CSS-wide keyword
 * rather than a palette entry, so no theme change routes it through Tailwind 4's `oklch()`.
 */
const UNTINTED = 'rgba(0, 0, 0, 0)'

// The three months every fixture sits in, resolved in the seed callback because the barn's
// timezone — the only frame `barnToday` may be asked in — is not knowable at module scope.
/** Barn month +1: the start-time shift and the horse-specific appointment. */
let fixtureMonth: string
/** Barn month +2: #1147's pair alone. See the three-months block in the file header. */
let barnWideMonth: string
/** Barn month −1: entirely past, so it always contains greyed days. */
let pastMonth: string

/** APPLE lesson at 08:00. Positioned so `earlyHourBarrierDay` flips across hour 8. */
let earlyHourLessonDay: string
/** Exactly 3 days before `earlyHourLessonDay`: shaded at hour 10, unshaded at hour 6. The
 *  settle target proving the EARLY_TIME fill reached the decorations. */
let earlyHourBarrierDay: string
/** Nothing within 3 days of it in any direction — the day the shift test taps, so the tapped
 *  day is provably not the day whose shading moves. */
let tapDay: string
/** APPLE lesson at 23:00. Positioned so `shiftDay` flips across hour 23. */
let shiftLessonDay: string
/** Exactly 3 days before `shiftLessonDay`: unshaded at hour 6, shaded at hour 23. The settle
 *  target proving the LATE_TIME fill reached the decorations. */
let shiftDay: string
/** APPLE's own vet appointment. No lesson within 3 days, so its dot can only be the
 *  appointment's and its band can only be `low`. */
let horseAppointmentDay: string
/** APPLE lesson at 10:00, exertion 3. Shades `barnWideDay` from one day away, and carries the
 *  dot that anchors `barnWideDay`'s "no dot yet". */
let barnWideNeighbourDay: string
/** Nothing booked: `moderate` purely by its neighbour, and dotless until #1147's barn-wide
 *  appointment is booked mid-test. */
let barnWideDay: string
/** APPLE lesson at 10:00, exertion 5, ridden by the rider login — every input that dots and
 *  shades a live day, on a day the grid has marked past. */
let pastDay: string

let apple: Horse

/**
 * The fixture layout, and why each day is where it is.
 *
 *   +1 day 05  earlyHourBarrierDay   nothing        (shaded at hour 10 and 23, not at hour 6)
 *   +1 day 08  earlyHourLessonDay    APPLE 5 @ 08:00
 *   +1 day 12  tapDay                nothing        (never within 3 days of any lesson)
 *   +1 day 17  shiftDay              nothing        (shaded at hour 23 only)
 *   +1 day 20  shiftLessonDay        APPLE 5 @ 23:00
 *   +1 day 25  horseAppointmentDay   APPLE vet appointment @ 09:00, $120
 *   +2 day 20  barnWideNeighbourDay  APPLE 3 @ 10:00
 *   +2 day 21  barnWideDay           nothing, until the barn-wide farrier appointment is booked
 *   −1 day 15  pastDay               APPLE 5 @ 10:00, rider Dana
 *
 * ## The window arithmetic, stated so it is checkable rather than trusted
 *
 * `windowTotal` (month-calendar.ts) centres a ±72h window on `${date}T${hour}` and sums the
 * exertion of every *lesson* inside it — inclusive at both ends, mirroring
 * `get_horse_projected_exhaustion`'s `BETWEEN`. A day exactly 3 calendar days before a lesson is
 * therefore in the window iff the form's chosen hour is at or past the lesson's own hour:
 *
 *   earlyHourBarrierDay → earlyHourLessonDay is 72h + (8 − hour)
 *       hour 6  → 74h → out → total 0 → low
 *       hour 10 → 70h → in  → total 5 → high      (the state BARRIER_TIME leaves the form in)
 *       hour 23 → 57h → in  → total 5 → high
 *
 *   shiftDay → shiftLessonDay is 72h + (23 − hour)
 *       hour 6  → 89h → out → total 0 → low
 *       hour 10 → 85h → out → total 0 → low
 *       hour 23 → 72h → in  → total 5 → high      (equal, and the comparison is `> WINDOW`)
 *
 * That gives each of the shift test's two fills its own settle target — a day whose band the
 * fill *changes* — so neither read is taken against a grid still decorated for the previous
 * hour, and neither settle target is the assertion (which is the whole 42-cell row).
 *
 * `barnWideDay` → `barnWideNeighbourDay` is 24h at hour 10, nowhere near either edge, so
 * #1147's pair does not depend on this arithmetic at all: total 3 → `moderate`, before the
 * appointment and after it.
 *
 * One horse per lesson, deliberately: `assert_lesson_participant_counts` constrains a normal
 * lesson's participants.
 */
const barn = withBarn('phase3-calendar-appointments', async ({ supabase, barn: seededBarn, members }) => {
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

  const thisMonth = barnToday(seededBarn.timezone).slice(0, 7)
  fixtureMonth = shiftMonth(thisMonth, 1)
  barnWideMonth = shiftMonth(thisMonth, 2)
  pastMonth = shiftMonth(thisMonth, -1)

  earlyHourBarrierDay = `${fixtureMonth}-05`
  earlyHourLessonDay = `${fixtureMonth}-08`
  tapDay = `${fixtureMonth}-12`
  shiftDay = `${fixtureMonth}-17`
  shiftLessonDay = `${fixtureMonth}-20`
  horseAppointmentDay = `${fixtureMonth}-25`
  barnWideNeighbourDay = `${barnWideMonth}-20`
  barnWideDay = `${barnWideMonth}-21`
  pastDay = `${pastMonth}-15`

  const dayAt = (day: string, time: string) =>
    wallClockToInstant(`${day}T${time}:00`, seededBarn.timezone)

  const seedLesson = (day: string, time: string, exertion: number, riderId: string) =>
    addUnpaidLesson(supabase, seededBarn, {
      at: dayAt(day, time),
      time,
      instructorId: members.manager.membershipId,
      horseIds: [apple.id],
      exertionLevels: [exertion],
      riderIds: [riderId],
      fee: tier.price,
      tierName: tier.name,
    })

  await seedLesson(earlyHourLessonDay, '08:00', HIGH_EXERTION, members.rider2.membershipId)
  await seedLesson(shiftLessonDay, '23:00', HIGH_EXERTION, members.rider2.membershipId)
  await seedLesson(barnWideNeighbourDay, '10:00', MODERATE_EXERTION, members.rider2.membershipId)
  // The rider login rather than the stub, so the past day's panel line is
  // `describeScheduleItem`'s composition over names this file already holds.
  await seedLesson(pastDay, '10:00', HIGH_EXERTION, members.rider.membershipId)

  // `horseIds` present → `appliesToAllHorses: false`. The #1147 counterpart is booked mid-test,
  // not here, because its checklist line needs the day's shading captured before it exists.
  await addExpense(supabase, seededBarn, {
    at: dayAt(horseAppointmentDay, HORSE_APPOINTMENT_TIME),
    time: HORSE_APPOINTMENT_TIME,
    recipient: VET_RECIPIENT,
    expenseType: 'Vet',
    amount: HORSE_APPOINTMENT_AMOUNT,
    horseIds: [apple.id],
  })
})

// ---------------------------------------------------------------------------
// Locators, barriers and drivers — copied from checklist-phase3-calendar-shading.spec.ts
// ---------------------------------------------------------------------------

type GridCell = {
  date: string
  past: boolean
  band: string | null
  tint: string
  color: string
  className: string
  hasDot: boolean
}

/**
 * Everything one grid cell renders, for all 42 cells, in one round trip.
 *
 * `tint` and `color` are *computed* styles rather than class names because the checkboxes this
 * file answers are about what the grid looks like. `className` is carried alongside so the
 * shading comparisons can additionally bind the painted colour to `BAND_TINT_CLASS`'s own entry
 * rather than to a hex written here.
 *
 * THE COUNT GUARD PINS THE FULL GRID, and must stay that way. It is support/read.ts's rule 3
 * reaching `evaluateAll`, which carries the identical hazard — but #1462's review established
 * that the weaker "first match is visible" form stops an empty read and *not* a short one, while
 * several assertions would accept a short one. This file has more grid-shape assertions than
 * that one, not fewer: the shift test compares two 42-entry rows, and a 7-cell read there would
 * compare 7 against 7 and pass. 42 is fixed by `getMonthGrid`'s `GRID_DAYS`, so there is no run
 * in which a partial grid is correct.
 */
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
        tint: style.backgroundColor,
        color: style.color,
        className: node.className,
        hasDot: node.querySelector('[data-testid^="conflict-dot-"]') !== null,
      }
    })
  )
}

/** The dates, in grid order, showing a conflict dot. */
function dottedDates(cells: GridCell[]): string[] {
  return cells.filter((c) => c.hasDot).map((c) => c.date)
}

/** Every cell's band, in grid order, as one comparable row. The shift test's unit of claim:
 *  the checklist line says "at least one day's shading shifts" and names no day, so the whole
 *  row is what moves rather than an enumerated cell that would go brittle against seed drift. */
function bandRow(cells: GridCell[]): string[] {
  return cells.map((c) => `${c.date}:${c.band}`)
}

/** The dates actually carrying a painted exertion band. `low` is excluded because
 *  `BAND_TINT_CLASS.low` is deliberately `''` — band-colors.ts paints no background for it. */
function shadedDates(cells: GridCell[]): string[] {
  return cells.filter((c) => c.band === 'moderate' || c.band === 'high').map((c) => c.date)
}

type DayShading = { band: string | null; painted: boolean; tintClass: string[] }

/**
 * One day's shading, as the three independent things "shading" means on this grid.
 *
 * `tintClass` is filtered against `moderate` and `high` ONLY — never `BAND_TINT_CLASS.low`,
 * which is `''`, and `className.includes('')` is true of every cell. Admitting it would turn
 * this into a tautology reporting a tint on all 42 days. Any future band added to the record has
 * to be checked for an empty value before it joins this list.
 */
function shadingOf(cell: GridCell): DayShading {
  return {
    band: cell.band,
    painted: cell.tint !== UNTINTED,
    tintClass: [BAND_TINT_CLASS.moderate, BAND_TINT_CLASS.high].filter((c) =>
      cell.className.includes(c)
    ),
  }
}

/* `goToMonth`'s (e2e/support/calendar.ts) target IS A PARAMETER, AND MUST STAY ONE — and this
 * file is exactly the case that rule was written for. #1462 first derived it here as "one month
 * either side of `barnToday`", which silently assumes the grid is sitting on the barn's current
 * month. The two barn-wide tests below call `goToMonth` **twice in one test**; under the derived
 * form the second call would click through to month+2 while waiting on month+1's heading, and
 * `waitFor` is unbounded, so it would burn the whole `test.slow()`-tripled budget instead of
 * failing fast.
 */

/** Pages forward onto the month the shift and horse-appointment fixtures sit in. */
async function goToFixtureMonth(page: Page): Promise<void> {
  await goToMonth(page, 'Next', fixtureMonth)
}

/** Pages forward twice, onto #1147's own month. Two calls, one test — see `goToMonth`. */
async function goToBarnWideMonth(page: Page): Promise<void> {
  await goToMonth(page, 'Next', fixtureMonth)
  await goToMonth(page, 'Next', barnWideMonth)
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
 * That asymmetry is why every use below waits on a `moderate`/`high` day first: waiting on a
 * `low` one would be satisfied by the un-fetched state. The shift test's two `low` waits are the
 * exception and are safe for a stated reason — see there.
 */
async function waitForScheduleShading(page: Page, date: string, band: string): Promise<void> {
  await expect(dayCell(page, date)).toHaveAttribute('data-band', band, {
    timeout: SCHEDULE_FETCH_BUDGET,
  })
}

/** Sets the day panel's Start Time field. The panel is `dayPanelAlwaysOpen` since #1021, so the
 *  field is present without tapping a day; `openNewLessonForm` has already proved React owns it. */
async function setStartTime(page: Page, time: string): Promise<void> {
  await page.locator('#lesson-start-time').fill(time)
}

/**
 * Blocks until the form's hidden `lesson_at` carries `date` at `time` in the barn's zone.
 *
 * Read through `page.evaluate` rather than `toHaveValue`, for the reason `openNewLessonForm`
 * reads it the same way: the input is hidden, and a web-first matcher on a hidden element is a
 * trap waiting for a Playwright version that starts checking visibility on it.
 *
 * Carries SCHEDULE_FETCH_BUDGET, which is generous for what is only a local re-render — but a
 * number on `expect.poll` loosens rather than tightens (e2e/CLAUDE.md fact 1), and a barrier that
 * is never the reason a passing run is slow costs nothing by being roomy.
 */
async function waitForStartTimeCommitted(page: Page, date: string, time: string): Promise<void> {
  const expected = wallClockToInstant(`${date}T${time}:00`, barn.data.barn.timezone).toISOString()
  await expect
    .poll(
      () =>
        page.evaluate((want) => {
          const el = document.querySelector('input[name="lesson_at"]')
          return el instanceof HTMLInputElement && el.value === want
        }, expected),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toBe(true)
}

/** The conflict dot on one day, as a locator that can be waited on. `getByTestId` resolves
 *  against the DOM rather than the accessibility tree, which matters because the dot is
 *  `aria-hidden` (e2e/CLAUDE.md fact 16 in the other direction). */
function conflictDot(page: Page, date: string) {
  return page.getByTestId(`conflict-dot-${date}`)
}

// ---------------------------------------------------------------------------
// #1021 — the start-time field moves the exertion window
// ---------------------------------------------------------------------------

test.describe('#1021 start time shifts the shading', () => {
  // "Change the **Start Time** field in the day panel from an early hour to a late one — at
  // least one day's shading shifts."
  //
  // The claim is about the whole grid and names no day, so the whole 42-cell band row is what is
  // compared. Enumerating the day that moves would be brittle against seed drift for no extra
  // strength — and the two settle targets already name it, at the layer where naming it buys
  // something (a fast, specific failure) instead of costing something.
  //
  // `earlyHourAlreadyHadShadedDays` IS NOT DECORATION. Without it this test's central comparison
  // passes for entirely the wrong reason whenever the schedule fetch has not landed by the time
  // `before` is read: an un-fetched grid is uniformly `low`, so `before` would differ from
  // `after` because the *data* arrived in between, not because the hour changed. The preceding
  // `waitForScheduleShading` on `shiftLessonDay` is what makes it true; asserting it is what
  // makes a future edit that drops that wait fail here rather than pass silently.
  test('manager_shifting_the_start_time_from_an_early_hour_to_a_late_one_shifts_a_days_shading @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    // A day with nothing within 3 days of it in either direction, so the day the form has
    // *selected* is provably not the day whose shading moves.
    await pickDay(page, tapDay)
    await selectHorse(page, apple)
    // The fetch barrier proper: `high` is unreachable from the empty initial `scheduleItems`.
    await waitForScheduleShading(page, shiftLessonDay, 'high')

    await setStartTime(page, EARLY_TIME)
    // TWO barriers, because neither alone pins the hour the `early` grid is decorated for.
    //
    // The band wait is safe as a `low` wait only because the fetch was already proved above (at
    // hour 10, which `openNewLessonForm`'s barrier fill put the form in — since #1578 the form
    // opens with no start time, so nothing here inherits an hour from one). But it proves only
    // `hour < 8`, not `hour == 6`: whenever `lessonAt` is `''` — which `StartTimeField` produces
    // for an empty time input — `selectedHour` comes off `estimateAt` instead (LessonForm.tsx),
    // the barn's current hour, which is unpinned and on most runs is not 6. Different hours give
    // genuinely different grids, so that is not a distinction without a difference.
    //
    // The `lesson_at` wait closes it: only client-side `StartTimeField` writes that value, and
    // once it is non-empty it is what `selectedHour` is derived from — the estimate only stands
    // in while it is `''` — so the two together say the hour is exactly 6 AND the decorations
    // have re-rendered against it. Ordered `lesson_at` first because it is the cause and the band
    // is the effect.
    await waitForStartTimeCommitted(page, tapDay, EARLY_TIME)
    await waitForScheduleShading(page, earlyHourBarrierDay, 'low')
    const early = await readGrid(page)

    await setStartTime(page, LATE_TIME)
    await waitForStartTimeCommitted(page, tapDay, LATE_TIME)
    await waitForScheduleShading(page, shiftDay, 'high')
    const late = await readGrid(page)

    expect({
      earlyHourAlreadyHadShadedDays: shadedDates(early).length > 0,
      shadingShifted: bandRow(early).join('|') !== bandRow(late).join('|'),
    }).toEqual({
      earlyHourAlreadyHadShadedDays: true,
      shadingShifted: true,
    })
  })
})

// ---------------------------------------------------------------------------
// #1019 — an appointment for the selected horse
// ---------------------------------------------------------------------------

test.describe('#1019 appointment dots', () => {
  // "Schedule a vet/farrier expense for Apple on a future day — set a time and an amount on it —
  // then reopen this form with Apple selected — that day shows a dot."
  //
  // The dotted set is asserted EXACTLY rather than as "the appointment day has a dot", which
  // would pass against a grid that dotted every day. Derived from the seed: APPLE has a lesson on
  // two days of this month and an appointment on a third.
  //
  // `appointmentDayShading` is the other half of attributing the dot: that day carries no lesson
  // within 3 days in either direction, so it is unshaded — which is what says the dot came from
  // the appointment and not from a booking that would have dotted it anyway.
  test('manager_a_future_day_with_the_selected_horses_own_appointment_shows_a_conflict_dot @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await selectHorse(page, apple)
    await waitForScheduleShading(page, shiftLessonDay, 'high')

    const cells = await readGrid(page)

    expect({
      dotted: dottedDates(cells),
      appointmentDayShading: shadingOf(cellFor(cells, horseAppointmentDay)),
    }).toEqual({
      dotted: [earlyHourLessonDay, shiftLessonDay, horseAppointmentDay],
      appointmentDayShading: { band: 'low', painted: false, tintClass: [] },
    })
  })
})

// ---------------------------------------------------------------------------
// #1147 — a barn-wide appointment dots a day without loading it
// ---------------------------------------------------------------------------

/**
 * `barnWideDay`'s shading as it stood before the barn-wide appointment existed, captured by the
 * first test of the pair below and asserted against by the second.
 *
 * Module-scoped, and the pair is `test.describe.serial`, because the mutation is ONE-WAY IN ONE
 * DIRECTION ONLY: the appointment's post-state persists and is re-observable by any later test,
 * but the pre-state cannot be re-observed once it is booked. So only the *capture* has to live
 * inside the mutating test — which is precisely why the pair is two tests rather than one, per
 * the one-test-per-checkbox rule's indivisibility carve-out.
 */
let shadingBeforeBarnWideAppointment: DayShading | null = null

test.describe.serial('#1147 barn-wide appointment', () => {
  // "Schedule a farrier expense on another future day with **Applies to all horses** checked,
  // then reopen this form with Apple selected — that day shows a dot even though the expense
  // names no horse."
  //
  // A transition, so both ends are asserted. The before half's absence claim carries its
  // same-test, same-page-state positive anchor inside the same assertion (#1434):
  // `barnWideNeighbourDay` is dotted on that very grid, so `barnWideDay`'s missing dot is a fact
  // about that day rather than about a grid that had not rendered dots yet.
  //
  // `addExpense` with no `horseIds` is what sets `applies_to_all_horses` — the form's "Applies to
  // all horses" checkbox writes the same column. APPLE is never named by it, which is the line's
  // whole point: `computeDayDecorations` fans a barn-wide appointment out to whichever horses are
  // selected rather than materialising junction rows, so it reaches horses added to the barn
  // since it was booked.
  test('manager_a_barn_wide_appointment_dots_a_day_for_a_horse_it_never_names @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToBarnWideMonth(page)
    await selectHorse(page, apple)
    await waitForScheduleShading(page, barnWideNeighbourDay, 'moderate')

    const before = await readGrid(page)
    shadingBeforeBarnWideAppointment = shadingOf(cellFor(before, barnWideDay))

    await addExpense(barn.data.supabase, barn.data.barn, {
      at: wallClockToInstant(
        `${barnWideDay}T${BARN_WIDE_APPOINTMENT_TIME}:00`,
        barn.data.barn.timezone
      ),
      time: BARN_WIDE_APPOINTMENT_TIME,
      recipient: FARRIER_RECIPIENT,
      expenseType: 'Farrier',
      amount: BARN_WIDE_APPOINTMENT_AMOUNT,
      // No `horseIds` — addExpense reads that as `appliesToAllHorses: true`.
    })

    await openNewLessonForm(page, barn)
    await goToBarnWideMonth(page)
    await selectHorse(page, apple)
    await conflictDot(page, barnWideDay).waitFor()
    const after = await readGrid(page)

    expect({
      beforeBooking: {
        barnWideDayDotted: cellFor(before, barnWideDay).hasDot,
        neighbourDayDotted: cellFor(before, barnWideNeighbourDay).hasDot,
      },
      afterBooking: { barnWideDayDotted: cellFor(after, barnWideDay).hasDot },
    }).toEqual({
      beforeBooking: { barnWideDayDotted: false, neighbourDayDotted: true },
      afterBooking: { barnWideDayDotted: true },
    })
  })

  // "That barn-wide day's exertion shading is unchanged from before the expense was booked (an
  // appointment is not a workload)."
  //
  // The real assertion of the pair. An implementation that let a barn-wide item count as load —
  // or that fell through to the flat "something is scheduled" tint — would add the dot and pass
  // the test above while failing this one.
  //
  // `capturedBeforeWasShaded` is what stops "unchanged" degenerating into "null at both ends":
  // the day is `moderate` before the booking, purely from its neighbour one day away, so a
  // change in *either* direction is detectable. The dot wait is this test's positive anchor —
  // it proves the appointment is loaded on the page state the shading is read from, so an
  // unchanged reading cannot be an appointment that simply never arrived.
  test('manager_a_barn_wide_appointment_leaves_that_days_exertion_shading_unchanged @manager', async ({
    page,
  }) => {
    const captured = shadingBeforeBarnWideAppointment
    if (!captured) throw new Error('the preceding test did not capture the pre-booking shading')

    await openNewLessonForm(page, barn)
    await goToBarnWideMonth(page)
    await selectHorse(page, apple)
    await conflictDot(page, barnWideDay).waitFor()

    const after = shadingOf(cellFor(await readGrid(page), barnWideDay))

    expect({
      capturedBeforeWasShaded: captured,
      shadingAfterBooking: after,
    }).toEqual({
      capturedBeforeWasShaded: {
        band: 'moderate',
        painted: true,
        tintClass: [BAND_TINT_CLASS.moderate],
      },
      shadingAfterBooking: captured,
    })
  })
})

// ---------------------------------------------------------------------------
// #1019 — the greyed past carries neither signal
// ---------------------------------------------------------------------------

/**
 * Drives both past-day tests to the state their checkboxes describe, and returns the grid.
 *
 * The month is the barn's previous one, every *own* day of which is past, so this grid always
 * contains greyed days — unlike the current month's grid, which legitimately holds none when the
 * 1st falls on a Sunday and today is the 1st.
 *
 * NOTE WHAT THAT DOES NOT SAY. This grid is NOT entirely past: its last rows spill up to 14 days
 * into the *current* month, which are live cells. An earlier draft of this comment claimed
 * otherwise and used it to justify the anchor below; the justification survives the correction
 * but the claim did not, so it is stated the true way here.
 *
 * THE ANCHOR (#1434) IS THE DAY PANEL LISTING THE PAST DAY'S OWN LESSON, and nothing weaker will
 * do. `toHaveCount(0)`/absence is satisfied on its first poll (fact 18), so an absence claimed
 * off a freshly-navigated grid passes before the schedule could arrive. And no cell on this grid
 * can serve instead: the past cells are suppressed by definition, and the spilled-in live cells
 * belong to the current month, where this barn seeds no fixture at all — so there is no shaded
 * or dotted cell anywhere on it to anchor against. The panel line is the right anchor rather
 * than merely an available one: it proves the fetch landed AND that this exact day holds an
 * APPLE lesson, which is precisely the input that shades and dots a *live* day. The absence is
 * therefore attributable to the day being past.
 *
 * The expected text is `describeScheduleItem`'s composition for a lesson — horse names then
 * rider names — built from the fixtures rather than transcribed.
 */
async function openPastMonthWithAppleSelected(page: Page): Promise<GridCell[]> {
  await openNewLessonForm(page, barn)
  await goToMonth(page, 'Previous', pastMonth)
  await selectHorse(page, apple)
  await pickDay(page, pastDay)
  await page.getByText(`Lesson — ${APPLE}, ${RIDER_NAME}`, { exact: true }).waitFor()
  return readGrid(page)
}

test.describe('#1019 past days', () => {
  // "With Apple selected, a greyed-out past day shows no shading."
  //
  // "Greyed-out" is bound as `data-past` — the attribute that drives the `text-zinc-300
  // dark:text-zinc-600` class — plus every past cell on the grid sharing one text colour, which
  // is what says the grey is actually painted rather than merely classed. The greyed-vs-*live*
  // colour contrast is deliberately not re-asserted here:
  // checklist-phase3-calendar-shading.spec.ts's
  // `manager_calendar_greys_out_every_day_before_today` owns it and reads two grids so the
  // partition cannot hold vacuously. Duplicating it would cost a second grid read on every run
  // and leave two places to update when the palette moves.
  test('manager_a_greyed_out_past_day_shows_no_exertion_shading @manager', async ({ page }) => {
    const cells = await openPastMonthWithAppleSelected(page)
    const cell = cellFor(cells, pastDay)

    expect({
      greyedOut: cell.past,
      distinctPastColours: new Set(cells.filter((c) => c.past).map((c) => c.color)).size,
      shading: shadingOf(cell),
    }).toEqual({
      greyedOut: true,
      distinctPastColours: 1,
      shading: { band: null, painted: false, tintClass: [] },
    })
  })

  // "With Apple selected, a greyed-out past day shows no dot."
  //
  // Same anchor, same reason. Asserted as the whole grid's dotted set rather than as one cell's
  // flag, so the claim is that the suppression is a property of pastness and not of this one day.
  //
  // The empty set rests on TWO facts, and only the first is about pastness: every *own* day of
  // this month is past and therefore suppressed, and the up-to-14 live days this grid spills in
  // from the current month carry no APPLE booking, because this barn seeds no fixture in the
  // current month. Verified over every month alignment 2026–2030 rather than by hand. Seeding
  // anything into the barn's current month would break this assertion on some alignments and not
  // others — which is exactly the shape of bug that reads as a phantom flake.
  test('manager_a_greyed_out_past_day_shows_no_conflict_dot @manager', async ({ page }) => {
    const cells = await openPastMonthWithAppleSelected(page)

    expect({
      greyedOut: cellFor(cells, pastDay).past,
      pastDayDotted: cellFor(cells, pastDay).hasDot,
      dotted: dottedDates(cells),
    }).toEqual({
      greyedOut: true,
      pastDayDotted: false,
      dotted: [],
    })
  })
})
