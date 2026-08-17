// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/components/ExhaustionBar.tsx
// covers: src/lib/month-calendar.ts
// covers: src/lib/band-colors.ts
// covers: src/lib/exhaustion-band.ts
// covers: src/lib/local-day.ts
// covers: src/app/actions/lessons.ts
// covers: src/lib/db/schedule.ts
// covers: src/app/barn/[slug]/(protected)/settings/events/**
//
// #1019/#1021's month conflict calendar on the manager's New Lesson form, third and last part
// (checklists/pre-release/phase-3-manager-lesson-entry.md, from "Tap a day that has a lesson on
// it — the day panel below the grid lists that day's items" through "That dimmed
// neighbouring-month day is still selectable", and from "The popup opened by tapping a day in the
// calendar's first row does not cover that day" through "Manage Barn → Events → Add Event still
// uses a plain native date box, not the month calendar"): the day panel's contents, the tap that
// both rings a day and dates the lesson, month navigation and the shading that follows it, the
// dimmed neighbouring-month day, the panel's placement relative to the day that opened it, the
// bar/calendar hue match, and the one form in the app that deliberately still uses a native date
// box.
//
// The two `(manual)` dark-mode lines sitting inside this range — the amber/red colour-separation
// judgement and the neighbouring-month contrast judgement — are #1413's verdicts and are NOT
// touched by this file. `a_day_carried_in_from_the_neighbouring_month_renders_dimmed` below is
// deliberately NOT an automation of the second of them: it asserts a *relative* ordering (an
// outside-month day's number is dimmer than an in-month day's), never a readability threshold,
// which is the judgement that was sent to `(manual)` and stays there.
//
// ## Adjacent prior art, and what is copied from where
//
// checklist-phase3-calendar-shading.spec.ts (#1462) owns the grid, the greyed past, the rider
// tint, the exertion shading and the conflict dot; checklist-phase3-calendar-appointments.spec.ts
// (#1463) owns the start-time shift, the appointment dots and the past day. Every locator,
// barrier and driver below is copied from those two rather than re-derived. The New Lesson form's
// shared drive vocabulary (`openNewLessonForm`, `selectHorse`, `BARRIER_TIME`) was hoisted into
// `e2e/support/lesson-form.ts` on 2026-08-14, accepting that `e2e/support/**` is in
// `scripts/select-specs.sh`'s `ALWAYS_FULL` and that a diff touching it forces `mode=full` and
// takes the fleet-wide suite mutex; the month-grid vocabulary (`dayCells`, `dayCell`, `cellFor`,
// `goToMonth`, `pickDay`, `GRID_CELLS`) followed into `e2e/support/calendar.ts` on the same date;
// everything else below stays file-local.
//
// THREE OF THOSE COPIES CARRY CORRECTIONS PAID FOR THE HARD WAY. Do not "simplify" them back:
//
//   - `goToMonth` takes its settle target as a PARAMETER. #1462 first derived it from the barn's
//     clock, which silently assumes the grid is sitting on the barn's current month; #1463 is the
//     file that correction was actually written for, because its two barn-wide tests call it
//     TWICE IN ONE TEST and the derived form would click through to month +2 while waiting on
//     month +1's heading. **No test in THIS file calls it more than once** — every call is a
//     single `goToFixtureMonth`, plus one direct call in the month-advance test — so the derived
//     form would happen to be correct here. The parameter is kept anyway, and this note exists
//     because an earlier draft of it claimed the opposite: a copied correction silently
//     re-derived in the one file where its failure mode is dormant is how the correction gets
//     lost. `pickDay` is what this file calls twice in one test, which is not the same thing.
//   - `readGrid` guards on all 42 cells. The weaker "first cell is visible" form stops an empty
//     read and not a short one, and several assertions below compare whole-grid rows — a 7-cell
//     read would compare 7 against 7 and pass.
//   - Colours come back through a 1×1 canvas. Tailwind 4 ships its palette in `oklch()` and
//     Chromium's `getComputedStyle` returns that string verbatim, so a digit regex over
//     `bg-red-600` yields `[0, 577, 0, 245, …]` and `r > g` is false for an obviously red
//     element. #1462 measured this and it cost that spec its first run. See `painted` below.
//
// ## The colour-match line, and why it is not the assertion #1464 asked for
//
// #1464's *Notes* ask this file to "read both computed colours and assert equality". **That
// assertion cannot pass against shipped behaviour**, and `src/lib/band-colors.ts`'s own header
// says so in as many words: "They cannot share literal values: BAND_FILL_CLASS paints a saturated
// bar on a zinc track, BAND_TINT_CLASS washes a cell background behind body text… What must stay
// aligned is the hue family per band — amber for moderate, red for high." The bar paints
// `bg-amber-500`/`bg-red-500`; the cell washes `bg-amber-200`/`bg-red-300`.
//
// So this is an **AC deviation, not a narrowing of the checklist line**. The line itself — "the
// exhaustion bar under a horse's checkbox uses the same amber/red as that horse's calendar
// shading" — is true as written, and is exactly what is asserted: same hue family per band, read
// off both rendered elements and compared to each other, with no literal hex anywhere.
//
// The invariant is real and has a regression history: `band-colors.ts` exists *because* the two
// hues drifted apart once, and its header records the symptom — "a horse's ExhaustionBar read
// orange while the same horse's calendar day read amber". This test pins that, not a convenience.
//
// The third assertion in that test is what stops it being decorative: without a check that the
// amber pair and the red pair are far apart from *each other*, "every element on the page is the
// same colour" satisfies the two equalities. Measured margins: amber ≈48° vs ≈38°, red ≈0° vs
// ≈0°, amber-to-red ≈38–48°, against a 15° tolerance.
//
// ## Why no `mustAffect` (#1435)
//
// Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row result would go
// unnoticed. This seed callback contains neither: `addTier`, `addHorse` and `addUnpaidLesson`
// bottom out in inserts that raise on failure, the last of them in the
// `create_lesson_with_participants` RPC, which raises server-side. `addHorse`'s threshold write
// IS an `.update(`, but it lives inside the builder and ends in `.select().single()`, which is
// rule 5's own "already guarded" category — a zero-row match raises PGRST116 there. `mustSucceed`
// alone would NOT be that guard, which is exactly what rule 5 exists to say; an earlier draft of
// this paragraph credited it, as does the sibling spec this was copied from.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { BARRIER_TIME, openNewLessonForm, selectHorse } from './support/lesson-form'
import { GRID_CELLS, cellFor, dayCell, dayCells, goToMonth, pickDay } from './support/calendar'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { getMonthGrid, shiftMonth } from '@/lib/month-calendar'
import { calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import type { Horse } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn this grid is a picture of
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const BUTTER = 'Butter'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

/** The rider login, whose name this barn's rider picker offers and whose name the day panel's
 *  line is therefore built from rather than transcribed. */
const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`

// APPLE carries per-horse thresholds rather than the barn defaults, so every band below is
// arithmetic rather than coincidence. `getExhaustionBand` is `total <= moderate -> low;
// total <= high -> moderate; else high`, so against { moderate: 2, high: 4 }:
//   3 -> moderate      4 -> moderate      5 -> high      6 -> high
const THRESHOLD_MODERATE = 2
const THRESHOLD_HIGH = 4
const MODERATE_EXERTION = 3
const HIGH_EXERTION = 5

/**
 * The panel lesson's wall clock, and the 12-hour rendering the checklist demands of it.
 *
 * `PANEL_LESSON_TIME_12H` is written out rather than computed through `local-day.ts`'s
 * `formatItemTime`: the checkbox's claim is that the UI uses the repo's standing 12-hour AM/PM
 * convention, and deriving the expectation from the very function under test would assert the
 * implementation against itself. `14:30` is chosen so the two forms cannot coincide — an hour
 * below 13 would render the same digits in both.
 */
const PANEL_LESSON_TIME = '14:30'
const PANEL_LESSON_TIME_12H = '2:30 PM'

/** One panel line's whole rendered text. The two `<span>`s are flex siblings with no text node
 *  between them, so the time abuts the description in `textContent`; `\s*` covers that rather
 *  than depending on how the matcher normalises. Anchored at both ends, because a substring
 *  match on either name would pass against a line that had dropped the other. */
function panelLineFor(horseName: string, riderName: string): RegExp {
  return new RegExp(`^${PANEL_LESSON_TIME_12H}\\s*Lesson — ${horseName}, ${riderName}$`)
}

/*
 * BARRIER_TIME's HOUR is separately load-bearing: `computeDayDecorations` centres its ±3-day exertion window
 * on `${date}T${hour}`, and the fixture table below is written against hour 10.
 */

/**
 * `expect.poll` and web-first matchers run on expect's own 5s default, which `test.slow()` does
 * not raise, so a number here *loosens* rather than tightens (e2e/CLAUDE.md fact 1). 30s rather
 * than the 20s checklist-phase5-lessons-new.spec.ts uses, and THE EXTRA 10s is #1482's
 * measurement rather than padding: a cold `next dev` compiles the routes a test visits *inside
 * that test's budget*, measured at ~16.6s of pure compile, and under full-suite worker contention
 * that compounds with the schedule Server Action every band read here waits behind. (#1482
 * measured the compile; it did not rule on 30-vs-20, which is this file following its sibling.)
 */
const SCHEDULE_FETCH_BUDGET = 30_000

/**
 * Chromium's computed `background-color` for an element with no background painted. A platform
 * constant, not a design colour: no palette change can move it, which is what makes "this day is
 * not shaded" assertable without freezing a hex anywhere.
 */
const UNTINTED = 'rgba(0, 0, 0, 0)'

/** How far two hue angles may sit apart and still count as one hue family. Wide enough for the
 *  ≈10° between `bg-amber-500` and `bg-amber-200`, far short of the ≈38–48° between amber and
 *  red — the separation `..._share_one_hue_per_band`'s third assertion pins. */
const HUE_TOLERANCE_DEGREES = 15

/** The month every fixture sits in, resolved in the seed callback because the barn's timezone —
 *  the only frame `barnToday` may be asked in — is not knowable at module scope. Barn month +1,
 *  so every fixture day is future and none is suppressed by `data-past`. */
let fixtureMonth: string

/** Lesson on BUTTER, ridden by the rider login, at `PANEL_LESSON_TIME`. The day panel's subject.
 *  BUTTER rather than APPLE so this lesson contributes no exertion to any band asserted below. */
let panelDay: string
/** Nothing on it — the "Nothing scheduled for this day." day. */
let emptyDay: string
/** Nothing on it, and outside every exertion halo — the day the selection-ring test taps. */
let selectDay: string
/** APPLE lesson, exertion 3 @ 10:00. Bands days 12–18 `moderate`. */
let moderateLessonDay: string
/** APPLE lesson, exertion 5 @ 10:00. Bands days 19–25 `high`. */
let highLessonDay: string
/** Month +3, day 15. APPLE lesson, exertion 5 @ 10:00 — the fetch barrier for the paged-away
 *  panel test, and nothing else. #1580; the fixture-layout docstring works through why it can be
 *  added without disturbing any assertion above. */
let farLessonDay: string

let apple: Horse
let butter: Horse

/**
 * The fixture layout, and why each day is where it is.
 *
 *   +1 day 04  panelDay            BUTTER + Test Rider @ 14:30
 *   +1 day 11  emptyDay            nothing
 *   +1 day 15  moderateLessonDay   APPLE 3 @ 10:00
 *   +1 day 22  highLessonDay       APPLE 5 @ 10:00
 *   +1 day 26  selectDay           nothing
 *   +3 day 15  farLessonDay        APPLE 5 @ 10:00   (#1580's fetch barrier, three months out)
 *
 * ## The window arithmetic, stated so it is checkable rather than trusted
 *
 * `windowTotal` (month-calendar.ts) centres a ±72h window on `${date}T${hour}` and sums the
 * exertion of every *lesson* inside it, inclusive at both ends. Both APPLE lessons sit at 10:00
 * and every test that reads a band leaves the form at hour 10, so each reaches exactly ±3
 * calendar days:
 *
 *   moderateLessonDay (15, exertion 3) → days 12–18, total 3 → `moderate`
 *   highLessonDay     (22, exertion 5) → days 19–25, total 5 → `high`
 *
 * Disjoint, and provably so: |18 − 22| = 4 and |19 − 15| = 4, both outside the window. The two
 * halos therefore partition days 12–25 into 7 amber and 7 red, which is the exact set
 * `..._is_shaded_by_that_months_lessons` asserts and the pair of bands
 * `..._share_one_hue_per_band` needs. `panelDay`'s lesson is on BUTTER, so it contributes to
 * neither: `windowTotal` reads `exertionByHorseId[horseId]` and skips a lesson the horse is not
 * in.
 *
 * ## The reach runs both ways, and both directions were checked
 *
 * #1463 verified computationally over every month alignment 2026–2030 that a month grid reaches
 * at most day 14 of the following month (fetch tail `grid[41] + 4` → day 18) and at most 6 days
 * back into the preceding one. Both directions matter here and both are clear:
 *
 * FORWARD, INTO THIS FILE'S EXACT-SET ASSERTION. `..._is_shaded_by_that_months_lessons` asserts
 * an exact shaded set on the +1 grid, which spills ≤6 days back into month M and ≤14 days forward
 * into month +2 (fetch tail ≤ day 18 of +2). **There are no APPLE lessons in either month**, so
 * nothing can join that set from either edge.
 *
 * BACKWARD, INTO WHAT MAKES THAT ASSERTION DISCRIMINATE. Month M's own grid reaches forward only
 * to +1 day 14, so days 19–25 are unreachable from it — a grid left decorated from month M's
 * schedule fetch cannot produce this set, which is precisely the staleness the test exists to
 * catch. (Days 12–14 *can* appear on month M's grid; that is harmless, because the test asserts
 * nothing about month M.)
 *
 * ## `farLessonDay`, and why month +3 is far enough to be inert (#1580)
 *
 * It exists only as a fetch barrier: `..._still_lists_its_days_lesson_after_paging_two_months_away`
 * has to know the +3 fetch has LANDED before it asserts, because `scheduleItems` is never reset on
 * a month change (`waitForScheduleShading` states that staleness in full) and the pre-fetch state
 * still holds +1's items — which would satisfy that assertion under the very code it exists to
 * pin. Waiting on a `high` day only +3's fetch can produce is what makes the assertion a claim.
 *
 * It cannot join `..._is_shaded_by_that_months_lessons`'s exact set: that set is read off the +1
 * grid, whose fetch tail is +2 day 18 (the paragraph above), so a +3 lesson is out of reach by more
 * than a month. And it is out of reach in the other direction too — nothing below ever pages past
 * +1 except this one test.
 *
 * ## #1580's widened fetch range does not reach any of this either
 *
 * `LessonForm` now stretches its range to cover the selected day, so on the +1 grid `from` is the
 * day the form opened on (in month M) rather than `grid[0] − 3`. That admits month-M items no
 * assertion here has ever seen — and it cannot change a single decoration, because `windowTotal`
 * centres ±72h on `${date}T${hour}` and so reaches back at most to `grid[0] − 3`, which is exactly
 * where the range used to start. Every newly admitted item is strictly earlier than that. It
 * reaches `popupItems` and nothing else, which is the whole point of the change.
 *
 * One horse per lesson, deliberately: `assert_lesson_participant_counts` constrains a normal
 * lesson's participants.
 */
const barn = withBarn('phase3-calendar-panel', async ({ supabase, barn: seededBarn, members }) => {
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
  butter = await addHorse(supabase, seededBarn.id, BUTTER)

  fixtureMonth = shiftMonth(barnToday(seededBarn.timezone).slice(0, 7), 1)

  panelDay = `${fixtureMonth}-04`
  emptyDay = `${fixtureMonth}-11`
  moderateLessonDay = `${fixtureMonth}-15`
  highLessonDay = `${fixtureMonth}-22`
  selectDay = `${fixtureMonth}-26`
  farLessonDay = `${shiftMonth(fixtureMonth, 2)}-15`

  const dayAt = (day: string, time: string) =>
    wallClockToInstant(`${day}T${time}:00`, seededBarn.timezone)

  const seedLesson = (day: string, time: string, horseId: string, exertion: number) =>
    addUnpaidLesson(supabase, seededBarn, {
      at: dayAt(day, time),
      time,
      instructorId: members.manager.membershipId,
      horseIds: [horseId],
      exertionLevels: [exertion],
      // The rider login rather than the stub, so the panel's line is `describeScheduleItem`'s
      // composition over a name this file already holds rather than a transcription.
      riderIds: [members.rider.membershipId],
      fee: tier.price,
      tierName: tier.name,
    })

  await seedLesson(panelDay, PANEL_LESSON_TIME, butter.id, MODERATE_EXERTION)
  await seedLesson(moderateLessonDay, '10:00', apple.id, MODERATE_EXERTION)
  await seedLesson(highLessonDay, '10:00', apple.id, HIGH_EXERTION)
  await seedLesson(farLessonDay, '10:00', apple.id, HIGH_EXERTION)
})

// ---------------------------------------------------------------------------
// Locators — copied from checklist-phase3-calendar-appointments.spec.ts unless noted
// ---------------------------------------------------------------------------

/**
 * The day panel, as the element whose *position* the popup-placement checkbox is about.
 *
 * Stated in DOM terms rather than by class, because a class-based locator on a panel whose whole
 * claim is geometric would break on the first styling change and pass on the wrong element on the
 * second. `MonthCalendarPicker`'s bordered box holds exactly three children in order — the
 * month-nav header, the 7-column grid, and the panel — so from the Previous-month button inside
 * that header, the panel is the parent's second following sibling.
 */
function dayPanel(page: Page): Locator {
  return page
    .locator('button[aria-label="Previous month"]')
    .locator('xpath=../following-sibling::div[2]')
}

/** The day panel's schedule lines. Scoped to the panel rather than to `main form ul li`, because
 *  this file asserts on the panel's *emptiness* as well as its contents and needs a locator whose
 *  subject exists in both states. */
function dayPanelItems(page: Page): Locator {
  return dayPanel(page).locator('li')
}

/**
 * One horse's row in the picker, reached from its exertion input rather than by class.
 *
 * `#exertion_{id}` is rendered only while that horse is checked, and its parent chain is fixed:
 * the input sits in the checkbox/exertion flex row, whose parent is the per-horse wrapper that
 * also holds that horse's `ExhaustionBar`. Scoping matters — every available horse renders a bar,
 * so an unscoped `getByTestId('exhaustion-bar-solid')` is ambiguous the moment the barn has two.
 */
function horseRow(page: Page, horse: Horse): Locator {
  return page.locator(`#exertion_${horse.id}`).locator('xpath=../..')
}

/** The filled portion of one horse's exhaustion bar — the element painted `BAND_FILL_CLASS`. */
function exhaustionBarFill(page: Page, horse: Horse): Locator {
  return horseRow(page, horse).getByTestId('exhaustion-bar-solid')
}

/** The bar's own button, whose `aria-label` carries the point total the bar was built from. */
function exhaustionBarButton(page: Page, horse: Horse): Locator {
  return horseRow(page, horse).getByRole('button', { name: /^Exhaustion: / })
}

// ---------------------------------------------------------------------------
// Reading the grid
// ---------------------------------------------------------------------------

type GridCell = {
  date: string
  past: boolean
  outside: boolean
  band: string | null
  tint: string
  boxShadow: string
}

/**
 * Everything one grid cell renders that this file asserts on, for all 42 cells, in one round
 * trip.
 *
 * `boxShadow` is #1464's addition to #1463's copy, and the reason is the checkbox's own wording:
 * "the tapped day gains a selection ring" is a claim about what is PAINTED, and Tailwind's
 * `ring-2 ring-blue-500` paints it as a box shadow. Reading the computed shadow asserts the thing
 * the line names rather than a proxy for it, and nothing else on a day cell paints a shadow, so
 * `!== 'none'` is exactly the ring.
 *
 * NOT justified by fact 7, though an earlier draft of this comment claimed it was. #1252 did
 * measure `aria-pressed` surviving at the server's value on these very cells — but only because
 * that spec PINS THE CLOCK, which is what made server and client disagree at hydration. This file
 * pins nothing, and `lessonDate` initialises from `barnToday` identically on both sides, so there
 * is no mismatch here for React to decline to reconcile — and `className` would be no safer than
 * `aria-pressed` if there were, since React writes both.
 *
 * THE COUNT GUARD PINS THE FULL GRID, and must stay that way. It is support/read.ts's rule 3
 * reaching `evaluateAll`, which carries the identical hazard — the weaker "first match is
 * visible" form stops an empty read and *not* a short one, and the whole-grid comparisons below
 * would compare a short row against a short row and pass. 42 is fixed by `getMonthGrid`'s
 * `GRID_DAYS`, so there is no run in which a partial grid is correct.
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
        outside: node.getAttribute('data-outside') === 'true',
        band: node.getAttribute('data-band'),
        tint: style.backgroundColor,
        boxShadow: style.boxShadow,
      }
    })
  )
}

/** The dates carrying a painted exertion band, with their band, in grid order. `low` never
 *  appears: `BAND_TINT_CLASS.low` is deliberately `''` — band-colors.ts paints no background for
 *  it, so a `low` day is indistinguishable from an undecorated one on screen. */
function shadedRow(cells: GridCell[]): string[] {
  return cells
    .filter((c) => c.band === 'moderate' || c.band === 'high')
    .map((c) => `${c.date}:${c.band}`)
}

/** The dates showing a selection ring — i.e. carrying any box shadow at all. Nothing else on a
 *  day cell paints one, so this is the ring and only the ring. */
function ringedDates(cells: GridCell[]): string[] {
  return cells.filter((c) => c.boxShadow !== 'none').map((c) => c.date)
}

// ---------------------------------------------------------------------------
// Reading a rendered colour
// ---------------------------------------------------------------------------

type Painted = { r: number; g: number; b: number; a: number }

/**
 * One element's computed `backgroundColor` or `color`, as sRGB channels.
 *
 * THE 1×1 CANVAS IS NOT DECORATION. Measured by #1462, and it cost that spec its first run:
 * **Tailwind 4 ships its palette in `oklch()`, and Chromium's `getComputedStyle` hands that
 * format straight back** — `bg-red-600` computes to the string `oklch(0.577 0.245 27.325)`, not
 * to an `rgb()` triple, so scraping numbers out of it with a digit regex yields
 * `[0, 577, 0, 245, …]` and every channel comparison is nonsense. Painting the value into a
 * canvas and reading the pixel back makes the browser do the conversion, so this keeps working
 * whatever colour syntax Tailwind emits next. The probe that established it:
 * `oklch(0.577 0.245 27.325)` → `[231, 0, 11, 255]`.
 *
 * `fillStyle` is seeded to opaque black first, so a value Chromium cannot parse is silently
 * ignored and reads back as black rather than as the previous element's colour.
 *
 * `a` is returned and not discarded because callers must be able to tell "painted black" from
 * "painted nothing": an unpainted element leaves the canvas at `[0, 0, 0, 0]`, whose hue is 0 —
 * which is red's hue, and would let an *unshaded* calendar cell silently satisfy a match against
 * a red bar.
 */
async function painted(locator: Locator, property: 'backgroundColor' | 'color'): Promise<Painted> {
  const channels = await locator.evaluate((node: HTMLElement, prop) => {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000000'
    ctx.fillStyle = getComputedStyle(node)[prop as 'color']
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data
    return { r, g, b, a }
  }, property)
  if (!channels) throw new Error('could not read a painted colour: no 2d canvas context')
  return channels
}

/** The HSL hue angle of an sRGB triple, in degrees. A grey has no hue; callers that care assert
 *  on the pair's separation, which a grey would fail rather than pass. */
function hueOf({ r, g, b }: Painted): number {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min
  if (delta === 0) return 0
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return (raw * 60 + 360) % 360
}

/** The shorter way round the colour wheel between two hues. Plain subtraction is wrong for the
 *  reds this file compares, which sit either side of 0°/360°. */
function hueGap(a: number, b: number): number {
  const gap = Math.abs(a - b) % 360
  return gap > 180 ? 360 - gap : gap
}

/** WCAG relative luminance. Used for "dimmed", which is a lightness claim rather than a hue one. */
function luminanceOf({ r, g, b }: Painted): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

// ---------------------------------------------------------------------------
// Drivers and barriers — copied from checklist-phase3-calendar-appointments.spec.ts
// ---------------------------------------------------------------------------

/** Pages forward onto the month every fixture sits in. */
async function goToFixtureMonth(page: Page): Promise<void> {
  await goToMonth(page, 'Next', fixtureMonth)
}

/**
 * Blocks until the grid's decorations reflect the month's schedule, by waiting for one day whose
 * band is only reachable once the fetch has landed.
 *
 * This is the fetch barrier, not a convenience. `scheduleItems` starts `[]`, and `worstBand` over
 * an empty window is `getExhaustionBand(0, …)` — `low` — so with a horse checked and the Server
 * Action still outstanding, every *future* day already reads `data-band="low"` (a past day is
 * `band: null` and carries no attribute at all). A grid read taken before this would see a
 * fully-decorated calendar carrying entirely the wrong bands. That asymmetry is why every use
 * below waits on a `moderate`/`high` day: waiting on a `low` one would be satisfied by the
 * un-fetched state.
 *
 * THERE IS A SECOND STALE STATE, and it makes the choice of DAY matter as much as the choice of
 * band. `scheduleItems` is never reset when the month changes — `LessonForm`'s effect only calls
 * `setScheduleItems` inside its `.then` — so immediately after paging forward the grid is still
 * decorated from the PREVIOUS month's items. Month M's fetch reaches `fixtureMonth` day
 * `45 − w − L` (w = weekday of M's 1st, L = M's length), which ranges over day 8 to day 17, so a
 * barrier on day 15 can be satisfied by month M's fetch on some calendar alignments. Day 22 is
 * unreachable from it for every alignment (`45 − w − L ≥ 22` needs `w + L ≤ 23`, impossible for
 * `L ≥ 28`), which is why every barrier below names day 22.
 */
async function waitForScheduleShading(page: Page, date: string, band: string): Promise<void> {
  await expect(dayCell(page, date)).toHaveAttribute('data-band', band, {
    timeout: SCHEDULE_FETCH_BUDGET,
  })
}

/**
 * Blocks until the form's hidden `lesson_at` carries `date` at `BARRIER_TIME` in the barn's zone —
 * i.e. until the tapped day has actually become the lesson's date.
 *
 * Read through `page.evaluate` rather than `toHaveValue`, for the reason `openNewLessonForm` reads
 * it the same way: the input is hidden, and a web-first matcher on a hidden element is a trap
 * waiting for a Playwright version that starts checking visibility on it.
 */
async function expectLessonDated(page: Page, date: string): Promise<void> {
  const expected = wallClockToInstant(
    `${date}T${BARRIER_TIME}:00`,
    barn.data.barn.timezone
  ).toISOString()
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

/**
 * Blocks until APPLE's exhaustion bar has been rebuilt for the currently selected day.
 *
 * The barrier is the bar's `aria-label` point total, derived from the seeded exertion levels —
 * NEVER the bar's colour, which is the very thing `..._share_one_hue_per_band` asserts. A barrier
 * that waited on the colour would make that test tautological: it would wait until the answer was
 * on screen and then assert the answer was on screen.
 *
 * It has to be a barrier at all because `LessonForm` gates the bar on
 * `exhaustionData.lessonAt === lessonAt` — so between tapping a day and its Server Action
 * resolving, the bar is either unmounted or still showing the previous day's totals.
 */
async function waitForExhaustionBar(page: Page, horse: Horse, points: number): Promise<void> {
  await expect(exhaustionBarButton(page, horse)).toHaveAttribute(
    'aria-label',
    `Exhaustion: ${points} points from 1 lessons`,
    { timeout: SCHEDULE_FETCH_BUDGET }
  )
}

// ---------------------------------------------------------------------------
// The day panel — "Tap a day that has a lesson on it" through "Nothing scheduled for this day."
// ---------------------------------------------------------------------------

test.describe('The day panel below the grid', () => {
  // The count is the claim: the panel's other branch renders a "Nothing scheduled for this day."
  // <p> and no <li> at all, so one item is the difference between a panel that listed the day's
  // schedule and one that opened empty. SCHEDULE_FETCH_BUDGET rather than the default because the
  // items come from the same Server Action every band read waits behind.
  test('manager_tapping_a_day_with_a_lesson_lists_that_days_items_in_the_day_panel @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await pickDay(page, panelDay)

    await expect(dayPanelItems(page)).toHaveCount(1, { timeout: SCHEDULE_FETCH_BUDGET })
  })

  // The 12-hour form is asserted *and* the 24-hour form is denied, in that order. Only the pair
  // is a claim about the format: the panel could carry "2:30 PM" as a substring of a line that
  // also printed "14:30", and a lone positive would not see it. The positive read is the same-test
  // anchor the absence half needs (#1434, e2e/CLAUDE.md fact 18) — it proves the panel rendered
  // this day's line before anything is claimed about what is missing from it.
  test('manager_the_day_panel_shows_each_items_time_in_12_hour_am_pm_format @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await pickDay(page, panelDay)

    await expect(dayPanelItems(page).first()).toContainText(PANEL_LESSON_TIME_12H, {
      timeout: SCHEDULE_FETCH_BUDGET,
    })
    await expect(dayPanelItems(page).first()).not.toContainText(PANEL_LESSON_TIME)
  })

  // Both name lines assert the whole rendered text rather than a substring, because
  // `describeScheduleItem` composes horses and riders into one string and a substring match on
  // either half would pass against a line that had dropped the other. The expected text is that
  // composition over values this file's own builders returned.
  //
  // THE TWO BODIES ARE THEREFORE IDENTICAL, and that is bookkeeping rather than a copy-paste
  // slip: they are two checklist checkboxes over one rendered string, and the convention is one
  // test per checkbox. Each still discriminates its own half — breaking the horse name fails the
  // first and breaking the rider name fails the second — but neither catches anything the other
  // misses, so do not read the pair as two independent guarantees.
  test('manager_the_day_panel_shows_each_items_horse_names @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await pickDay(page, panelDay)

    await expect(dayPanelItems(page)).toHaveText([panelLineFor(butter.name, RIDER_NAME)], {
      timeout: SCHEDULE_FETCH_BUDGET,
    })
  })

  test('manager_the_day_panel_shows_each_items_rider_names @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await pickDay(page, panelDay)

    await expect(dayPanelItems(page)).toHaveText([panelLineFor(butter.name, RIDER_NAME)], {
      timeout: SCHEDULE_FETCH_BUDGET,
    })
  })

  // THE ANCHOR IS A DIFFERENT DAY, and that is the whole point of this test's shape.
  //
  // The empty message and the empty list are NOT independent readings: `MonthCalendarPicker`
  // renders both from the single `popupItems.length === 0` branch. And `[]` is that branch's
  // PRE-FETCH default — `scheduleItems` starts empty and `LessonForm` never resets it, so a day
  // with a lesson on it also reads "Nothing scheduled for this day." while the fetch is in
  // flight. Anchoring on the message alone satisfies rule 4 literally and proves nothing: it
  // shows the panel rendered, not that this month's schedule was ever fetched.
  //
  // So the anchor is `highLessonDay` — day 22, which is out of reach of the previous month's
  // fetch on every calendar alignment (`waitForScheduleShading` states the arithmetic). Its line
  // can only be on screen once THIS month's fetch has landed, which is what makes the emptiness
  // asserted immediately afterwards a claim about `emptyDay` rather than about a pending request.
  // `panelDay` would NOT do: at day 04 it is always already inside month M's fetch range.
  test('manager_tapping_a_day_with_nothing_on_it_reads_nothing_scheduled_for_this_day @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    await pickDay(page, highLessonDay)
    await expect(dayPanelItems(page)).toHaveCount(1, { timeout: SCHEDULE_FETCH_BUDGET })

    await pickDay(page, emptyDay)

    await expect(dayPanel(page).getByText('Nothing scheduled for this day.', { exact: true })).toBeVisible()
    await expect(dayPanelItems(page)).toHaveCount(0)
  })

  /**
   * #1580 — this form's panel cannot close (it hosts the required Start Time field), so its heading
   * stays on the selected day however far the grid is paged. The bug was that only the heading did:
   * the schedule was refetched per DISPLAYED month, so the panel's body emptied under a day that
   * has a lesson on it, and read "Nothing scheduled for this day." as if it were true.
   *
   * TWO PAGES, not one, and not because one is insufficient — one already breaks it, since month
   * +1's grid reaches back only to ~the 25th of M. Two puts `panelDay` beyond the +3 grid's own
   * spill-back (≤6 days into +2) by more than a month, so no calendar alignment can make this pass
   * by accident. `goToMonth`'s `target` parameter is what makes two calls in one test safe — the
   * file header records what a derived settle target does here.
   *
   * THE BARRIER IS THE TEST. `scheduleItems` is never reset on a month change, so between the
   * second page and the +3 fetch landing the panel is still showing +1's items — which is the
   * assertion's expected state. Waiting on `farLessonDay` at `high` first is what makes the read
   * a claim about the NEW range rather than about a request still in flight; without it this test
   * passes against the bug. APPLE is checked for that barrier alone: `popupItems` filters by date
   * only, so the panel's line is unaffected by which horse is selected.
   */
  test('manager_the_day_panel_still_lists_its_days_lesson_after_paging_two_months_away @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await selectHorse(page, apple)
    await goToFixtureMonth(page)
    await pickDay(page, panelDay)
    await expect(dayPanelItems(page)).toHaveText([panelLineFor(butter.name, RIDER_NAME)], {
      timeout: SCHEDULE_FETCH_BUDGET,
    })

    await goToMonth(page, 'Next', shiftMonth(fixtureMonth, 1))
    await goToMonth(page, 'Next', shiftMonth(fixtureMonth, 2))
    await waitForScheduleShading(page, farLessonDay, 'high')

    await expect(dayPanel(page).getByText(formatCalendarDate(calendarDate(panelDay)), { exact: true })).toBeVisible()
    await expect(dayPanelItems(page)).toHaveText([panelLineFor(butter.name, RIDER_NAME)])
  })
})

// ---------------------------------------------------------------------------
// Selection and month navigation
// ---------------------------------------------------------------------------

test.describe('Selecting a day and paging the grid', () => {
  // "Tapping a day **also** selects it as the lesson's date (the tapped day gains a selection
  // ring)" is two claims, and both are asserted: the ring, which the checkbox names, and the
  // form's date, which is what "also selects it" means.
  //
  // The pre-tap read is what makes "gains" a claim rather than a coincidence — `selectDay` is in
  // month +1 and can never be the day the form opened on, but asserting that rather than assuming
  // it is the difference between this test and one that would pass against a ring nailed in place.
  // The post-tap form is an equality over the whole grid, so a ring left behind on the previously
  // selected day fails here too.
  test('manager_tapping_a_day_rings_it_and_takes_it_as_the_lessons_date @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    expect(ringedDates(await readGrid(page))).not.toContain(selectDay)

    await pickDay(page, selectDay)

    expect(ringedDates(await readGrid(page))).toEqual([selectDay])
    await expectLessonDated(page, selectDay)
  })

  // The heading and the 42 dates together. The heading alone would pass against a label that
  // moved while the grid did not; the dates alone would not say which month the user is looking
  // at. Both expectations come from `month-calendar.ts`/`local-day.ts` applied to the month the
  // form opened on, so neither is a transcription.
  test('manager_tapping_next_month_advances_the_grid_one_month @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    const openingMonth = barnToday(barn.data.barn.timezone).slice(0, 7)
    // `fixtureMonth` is frozen at seed time while this is read per test, so a suite run that
    // crosses barn-local midnight on a month's last day would leave every other test in this file
    // paging to the month its fixtures are NOT in — and `goToMonth`'s settle is unbounded, so
    // they would hang out their budget rather than say why. This is where that condition gets a
    // name; it is asserted here rather than inside `goToFixtureMonth` because a helper on twelve
    // tests' path cannot be touched without re-scoring the whole mutation pass.
    expect(shiftMonth(openingMonth, 1)).toBe(fixtureMonth)
    await expect(page.getByText(formatMonthHeading(openingMonth), { exact: true })).toBeVisible()
    expect((await readGrid(page)).map((c) => c.date)).toEqual(getMonthGrid(openingMonth))

    await goToMonth(page, 'Next', shiftMonth(openingMonth, 1))

    expect((await readGrid(page)).map((c) => c.date)).toEqual(getMonthGrid(shiftMonth(openingMonth, 1)))
  })

  // The exact shaded set, not "at least one day is shaded" — and the exactness is what makes this
  // a claim about the NEW month rather than about any month. Month M's own grid reaches forward
  // only to +1 day 14, so a grid still decorated from month M's schedule fetch cannot produce
  // days 19–25 at all; the file header works both reach directions through in full.
  //
  // The settle is `highLessonDay` at `high`: `low` is what every day reads before the fetch lands,
  // so waiting on it would be satisfied by the un-fetched state (`waitForScheduleShading`).
  test('manager_the_advanced_months_grid_is_shaded_by_that_months_lessons @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await selectHorse(page, apple)
    await goToFixtureMonth(page)
    await waitForScheduleShading(page, highLessonDay, 'high')

    const expected = [
      ...[12, 13, 14, 15, 16, 17, 18].map((d) => `${fixtureMonth}-${d}:moderate`),
      ...[19, 20, 21, 22, 23, 24, 25].map((d) => `${fixtureMonth}-${d}:high`),
    ]
    expect(shadedRow(await readGrid(page))).toEqual(expected)
  })

  // "Dimmed" read as the relative claim it is: the neighbouring-month day's number is lighter —
  // nearer the white page — than an in-month day's. Both colours come off rendered elements and
  // are compared to each other, so no palette value is frozen here.
  //
  // Grid index 41 is provably always a neighbouring-month day: the grid is 42 cells starting on
  // the Sunday on or before the 1st, so at most 6 leading spill-over days plus at most 31 of the
  // month consume 37 cells, and indices 37–41 always spill forward. It is also always in the future, being in month +2, which
  // matters because a *past* day is greyed further still (`text-zinc-300`) and would satisfy this
  // ordering for the wrong reason — hence the `past` assertions on both cells.
  //
  // NOT an automation of the neighbouring `(manual)` line, which asks whether that number is
  // *readable* against its tint. This asserts an ordering between two cells and sets no threshold.
  //
  // The ordering encodes LIGHT-MODE polarity: `text-zinc-600` outside vs `text-zinc-900` inside,
  // against a white page. The dark variants (`zinc-300` vs `zinc-50`) invert it, so "dimmed" as a
  // mode-independent claim would be "further from the in-month colour toward the page background"
  // rather than "lighter". `playwright.config.ts` sets no `colorScheme`, so Chromium's `light`
  // default holds and this is correct today — and if a dark project is ever added it FAILS rather
  // than passing vacuously, which is the safe direction for a fragility to point.
  test('manager_a_day_carried_in_from_the_neighbouring_month_renders_dimmed @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    const cells = await readGrid(page)

    const outside = cells[GRID_CELLS - 1]
    const inside = cellFor(cells, `${fixtureMonth}-01`)
    expect({ outside: outside.outside, past: outside.past }).toEqual({ outside: true, past: false })
    expect({ outside: inside.outside, past: inside.past }).toEqual({ outside: false, past: false })

    const outsideColour = await painted(dayCell(page, outside.date), 'color')
    const insideColour = await painted(dayCell(page, inside.date), 'color')
    expect(luminanceOf(outsideColour)).toBeGreaterThan(luminanceOf(insideColour))
  })

  // "Still selectable" asserted as the click having *taken*, not as the element being enabled:
  // the ring lands on it and the form's date becomes it. Tapping an outside-month day does not
  // page the grid — `handleDayTap` never touches `month` — so the same cell is still at index 41
  // when the post-tap grid is read.
  test('manager_a_dimmed_neighbouring_month_day_is_still_selectable @manager', async ({ page }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    const before = await readGrid(page)
    const outside = before[GRID_CELLS - 1]
    expect(outside.outside).toBe(true)
    expect(ringedDates(before)).not.toContain(outside.date)

    await pickDay(page, outside.date)

    expect(ringedDates(await readGrid(page))).toEqual([outside.date])
    await expectLessonDated(page, outside.date)
  })
})

// ---------------------------------------------------------------------------
// The panel's placement, and the hue it shares with the exhaustion bar
// ---------------------------------------------------------------------------

test.describe('The day panel’s placement and the exhaustion bar’s hue', () => {
  // The checkbox's own words are geometric, so the assertion is: the panel's top edge sits at or
  // below the tapped day's bottom edge. `MonthCalendarPicker`'s own comment records why this is a
  // real invariant with a real regression behind it — the panel was once an overlay anchored at a
  // fixed `top`, "so tapping a day near the start of the month hid the very day just tapped".
  //
  // The day tapped is the first cell that belongs to the displayed month, which is always in the
  // first row: the grid starts on the Sunday on or before the 1st, so the 1st lands at index 0–6
  // by construction. `toBeLessThan(7)` is therefore a GUARD on `data-outside` rather than a claim
  // that can fail from a real placement bug — it is here so "in the calendar's first row" is
  // pinned to something rather than left to the reader, not because the grid could violate it.
  test('manager_the_day_panel_does_not_cover_the_first_row_day_that_opened_it @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await goToFixtureMonth(page)
    const cells = await readGrid(page)
    const firstRowDay = cells.findIndex((c) => !c.outside)
    expect(firstRowDay).toBeLessThan(7)

    await pickDay(page, cells[firstRowDay].date)

    const dayBox = await dayCell(page, cells[firstRowDay].date).boundingBox()
    const panelBox = await dayPanel(page).boundingBox()
    if (!dayBox || !panelBox) throw new Error('day cell or day panel is not rendered')
    expect(panelBox.y).toBeGreaterThanOrEqual(dayBox.y + dayBox.height)
  })

  /**
   * The bar and the calendar day share one hue per band — the checklist line, and NOT the
   * equality #1464's Notes asked for, which `band-colors.ts` states outright is unachievable.
   * The file header works that through; the short version is that the bar paints a saturated fill
   * and the cell washes a background behind text, so the two can only agree on hue family.
   *
   * APPLE's exertion is set to 1 so the bar and the cell land on the same band on both days.
   * `computeDayDecorations` scores a day from the lessons already booked; `ExhaustionBar` adds the
   * lesson being created. Against thresholds { moderate: 2, high: 4 }:
   *
   *   moderateLessonDay  cell 3 → moderate    bar 3 + 1 = 4 → moderate
   *   highLessonDay      cell 5 → high        bar 5 + 1 = 6 → high
   *
   * The band assertions before each colour read are a guard, not decoration: an unshaded cell
   * computes to `rgba(0, 0, 0, 0)`, which paints nothing and reads back as `[0, 0, 0, 0]` — hue
   * 0, which is red's hue. Without them a grid that had lost its shading entirely would satisfy
   * the red half of this test. The opacity assertions close the same hole from the other side.
   */
  test('manager_a_horses_exhaustion_bar_and_its_calendar_shading_share_one_hue_per_band @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await selectHorse(page, apple)
    await page.locator(`#exertion_${apple.id}`).fill('1')
    await expect(page.locator(`#exertion_${apple.id}`)).toHaveValue('1')
    await goToFixtureMonth(page)
    // Day 22, not day 15: month M's fetch reaches day 15 on some calendar alignments, so a
    // barrier there can be satisfied by the previous month's stale items. See
    // `waitForScheduleShading`.
    await waitForScheduleShading(page, highLessonDay, 'high')

    await pickDay(page, moderateLessonDay)
    await waitForExhaustionBar(page, apple, MODERATE_EXERTION)
    const amberDay = cellFor(await readGrid(page), moderateLessonDay)
    expect({ band: amberDay.band, unpainted: amberDay.tint === UNTINTED }).toEqual({
      band: 'moderate',
      unpainted: false,
    })
    const amberCell = await painted(dayCell(page, moderateLessonDay), 'backgroundColor')
    const amberBar = await painted(exhaustionBarFill(page, apple), 'backgroundColor')

    await pickDay(page, highLessonDay)
    await waitForExhaustionBar(page, apple, HIGH_EXERTION)
    const redDay = cellFor(await readGrid(page), highLessonDay)
    expect({ band: redDay.band, unpainted: redDay.tint === UNTINTED }).toEqual({
      band: 'high',
      unpainted: false,
    })
    const redCell = await painted(dayCell(page, highLessonDay), 'backgroundColor')
    const redBar = await painted(exhaustionBarFill(page, apple), 'backgroundColor')

    expect([amberCell.a, amberBar.a, redCell.a, redBar.a]).toEqual([255, 255, 255, 255])
    expect(hueGap(hueOf(amberBar), hueOf(amberCell))).toBeLessThan(HUE_TOLERANCE_DEGREES)
    expect(hueGap(hueOf(redBar), hueOf(redCell))).toBeLessThan(HUE_TOLERANCE_DEGREES)
    // Without this the two matches above are satisfied by a page painted one flat colour.
    expect(hueGap(hueOf(amberBar), hueOf(redBar))).toBeGreaterThan(HUE_TOLERANCE_DEGREES)
  })
})

// ---------------------------------------------------------------------------
// The Recurring relabel, and the one form that still uses a native date box
// ---------------------------------------------------------------------------

// The month calendar is asserted to be *still rendered* alongside its relabelled field, which is
// what this checkbox's "the calendar's field label" says and what makes it more than a text swap:
// a Recurring branch that fell back to `LessonForm`'s native-input path would relabel the field
// correctly and fail here.
//
// checklist-phase3-recurring.spec.ts's `checking_recurring_relabels_the_date_field_to_starting_
// date` (#1465) asserts the label text alone, from its own checklist line further down this same
// file. The two lines are near-duplicates and one of them should probably go, but re-verdicting a
// checklist line is #1413's call and not this slice's — see this issue's `## Follow-ups`.
test('manager_checking_recurring_relabels_the_month_calendars_own_field_label @manager', async ({ page }) => {
  await openNewLessonForm(page, barn)
  // `span[1]` rather than a bare `preceding-sibling::span`: unambiguous today, since the picker's
  // outer flex column holds exactly the label span and then the bordered box — but a second span
  // added ahead of the box would turn this into a strict-mode violation rather than a clean miss.
  const label = page.locator('button[aria-label="Previous month"]').locator('xpath=../../preceding-sibling::span[1]')
  await expect(label).toHaveText('Date')

  await page.getByRole('checkbox', { name: 'Recurring (weekly)', exact: true }).check()

  await expect(label).toHaveText('Starting Date')
  await expect(dayCells(page)).toHaveCount(GRID_CELLS)
})

// "still uses a plain native date box, not the month calendar" is two claims and both are made:
// the input's own `type`, and the absence of a month grid. The absence half needs a same-test
// positive anchor on the same page state (#1434, e2e/CLAUDE.md fact 18) — `toHaveCount(0)` is
// satisfied on its first poll, so on its own it would pass against a page that had not rendered
// yet. The visible native date input is that anchor.
//
// Reached by `goto` rather than by clicking through Manage Barn → Events → Add Event.
// checklist-phase4-settings-tiers-events.spec.ts reaches this same route by `goto` too, which is
// the precedent being followed. Framework fact 11 binds switching a *tab or filter*, where the
// query param is the state under test; a route is not that.
test('manager_add_event_uses_a_plain_native_date_box_and_no_month_calendar @manager', async ({ page }) => {
  test.slow()
  await page.goto(`/barn/${barn.slug}/settings/events/new`)
  await page.getByRole('heading', { level: 1, name: 'New Event' }).waitFor()

  await expect(page.locator('#dh-date')).toBeVisible()
  await expect(page.locator('#dh-date')).toHaveAttribute('type', 'date')
  await expect(dayCells(page)).toHaveCount(0)
})
