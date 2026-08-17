// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/ExhaustionBar.tsx
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/lib/month-calendar.ts
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-form-parsing.ts
// covers: src/lib/db/horses.ts
// covers: src/lib/db/lessons.ts
// covers: src/lib/db/lesson-participants.ts
// covers: src/lib/db/schedule.ts
// covers: src/lib/barn-timezone.ts
// covers: src/lib/local-day.ts
//
// `src/lib/db/schedule.ts` is declared even though no assertion here reads schedule data, and
// that is deliberate rather than an oversight: `LessonForm` fires `getScheduleRangeForBarn` on
// every displayed month, so a throw in there takes down the form every test below drives. #1461
// names it as required for this spec's header too. `src/lib/db/lesson-participants.ts` is the
// other direction — nothing imports it here, but `create_lesson_with_participants` and
// `update_lesson_with_participants` are what test 1's create and save actually persist through,
// and that test asserts every field they wrote.
//
// Phase 3's exhaustion-bar block (checklists/pre-release/phase-3-manager-lesson-entry.md, from
// "Create a **current-month paid lesson**" through "Open a **future-dated** lesson's edit page"):
// the lesson a manager creates through /lessons/new and then marks paid, and the live exhaustion
// bars the same form renders beside each horse.
//
// Adjacent prior art, deliberately not duplicated. checklist-phase3-lesson-fees.spec.ts (#1460)
// owns the block above this one — the past lesson, the Fee field's rejections, the tier prefill —
// and several helpers here are its bodies, copied with attribution at each. checklist-phase3-
// calendar-shading.spec.ts (#1462) and checklist-phase3-calendar-appointments.spec.ts (#1463) own
// the #1019 conflict *calendar* below this block: day tints, conflict dots, month navigation.
// This file drives that calendar purely as the date field it is, and asserts nothing about how a
// day cell is painted.
//
// ## THREE CHECKLIST LINES WERE WRONG ABOUT THE APP, AND WERE REWRITTEN
//
// All three come from one line of `LessonForm.tsx`, and a reader who does not know it will read
// the rewrites as avoidance:
//
//     {exhaustion && !isPastLesson && (checkedHorseIds.has(h.id) || (!isUnavailable && …)) && (
//
// **`isPastLesson` gates the bars off entirely.** A form whose selected instant is before the
// start of the barn's current hour renders no exhaustion bar for any horse. The app's own unit
// suite already pins this: `LessonForm.edit-exhaustion-prefill.test.tsx` renders its `pastLesson`
// fixture and asserts `document.querySelector('[data-testid="exhaustion-bar-solid"]')` is `null`.
//
//   1. "Open **this lesson's** edit page afterward and confirm Clover's bar still renders" was
//      impossible as written. "This lesson" is the current-month lesson dated a few days ago, so
//      its edit form is exactly the case that unit test pins — no bar, for any horse, ever. The
//      line now names a **future-dated** lesson, and the test below opens the seeded `dayA`
//      Clover lesson. That keeps Clover and keeps the checkbox's actual content, which is the
//      exclude-itself-from-its-own-window proof — see `EXCLUDE_SELF` below for how it is made.
//      Future-dating the *created* lesson instead was rejected: "dated a few days ago … mark it
//      **paid**" is the whole of the first checkbox.
//
//   2. "Before a date is picked no exhaustion bars render" names a state the form cannot be in.
//      `LessonForm` seeds `lessonDate` from `barnToday(timezone)` and `MonthCalendarPicker` has
//      no deselect, so since #1019 a day is always selected. The gate the line is really about is
//      `lessonAt` being empty, and the reachable route to *that* is clearing the Start Time —
//      which is what the line now says. Same gate, different route.
//
//   3. "Pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar"
//      is true but cannot fail: the render condition admits every available active horse whether
//      checked or not, so bare presence would pass against a form that ignored the checkboxes
//      completely. The test keeps the walk and asserts each bar's **exact window total**.
//
// ## Why nothing here reads a computed colour
//
// Worth stating, because the two sibling calendar specs both had to. #1462 measured that
// Tailwind 4 ships its palette in `oklch()` and Chromium's `getComputedStyle` returns that
// verbatim, so a digit-regex channel read makes `r > g` false for an obviously red element; its
// `dotShape` normalises through a 1×1 canvas to survive that. This file needs none of it.
// `ExhaustionBar` publishes its whole state as text and geometry — an
// `aria-label="Exhaustion: {total} points from {n} lessons"` on the bar's button, and
// `data-testid="exhaustion-bar-solid"`/`-ghost` segments each carrying an inline `width: N%`. So
// every claim below is an exact number derived from the fixture table, and "the bar stays
// **solid**" is asserted structurally — the ghost element is absent — rather than chromatically.
// Numbers beat colours here; do not "improve" these reads into class or colour checks.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row result would go
// unnoticed. The seed callback below contains neither directly. `addTier` and `addUnpaidLesson`
// are insert-only (the latter bottoms out in `create_lesson_with_participants`, which raises
// server-side); `addHorse`'s threshold write IS an `.update(`, but it lives inside the builder,
// is guarded there by `mustSucceed`, and matches the row `createHorse` just returned.
//
// ## Why there is no `test.describe.serial` here
//
// Each test opens its own form and drives it from scratch, and no test reads state another wrote
// — including the two that involve a created or seeded lesson, which after rewrite 1 above are
// about different lessons. An ordered file would buy nothing and would expose every test after
// the first ✘ to fact 15's worker-restart silence. The one mutation any test performs (test 1
// creates a lesson) is placed in the barn's *current* month while every bar fixture sits in the
// *next* one, so it can never enter a ±3-day window read below.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addTier, addUnpaidLesson } from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'
import { lessonCards, saveLessonForm, waitForEditFormHydrated } from './support/lesson-pages'
import { BARRIER_TIME, editPath, newLessonPath, openNewLessonForm, selectHorse, submitNewLesson } from './support/lesson-form'
import { pickDay } from './support/calendar'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { shiftMonth } from '@/lib/month-calendar'
import { addDays, firstOfMonth, formatMonthHeading } from '@/lib/local-day'
import type { Horse, Lesson, LessonTier } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn these bars are a picture of
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const BUTTER = 'Butter'
const CLOVER = 'Clover'

/** How many horses the barn holds, and therefore how many bars a picked future day renders. */
const HORSE_COUNT = 3

// The checklist's "Beginner tier", and the barn's separate default. The default is load-bearing
// rather than scenery, twice over — the same reasoning checklist-phase3-lesson-fees.spec.ts
// states for its own pair, plus one more this file adds:
//
//   - `LessonForm` seeds `selectedId` from `tiers.find(t => t.is_default)`, so without a second
//     defaulted tier the form would open already on Beginner and "select Beginner" would assert
//     nothing.
//   - every *seeded* lesson carries STANDARD's name while the created one carries BEGINNER's,
//     which is what lets test 1 address its own lesson through the list's By Tier filter and
//     find exactly one card. See `openCreatedLessonEditForm`.
const BEGINNER = { name: 'Beginner', price: 60 }
const STANDARD = { name: 'Standard', price: 80 }

// Per-horse thresholds rather than the barn defaults, so every width below is arithmetic rather
// than coincidence — and chosen high enough that nothing saturates: the largest total any test
// produces is Apple's 7 existing points plus a ghost of 5, which is 12 of 20. `ExhaustionBar`
// clamps at `thresholds.high` and has a MIN_GHOST_PCT special case once the solid segment fills
// the track, and a saturating fixture would silently walk into it.
const THRESHOLD_MODERATE = 10
const THRESHOLD_HIGH = 20

/** Barn-local wall clocks for the seeded lessons. Distinct hours only so that a day carrying two
 *  lessons has them at separate times; the ±3-day window is far too wide for an hour to matter. */
const FIRST_TIME = '10:00'
const SECOND_TIME = '11:00'
const THIRD_TIME = '12:00'

/** The exertion the dayA Clover lesson is seeded with. Named because two places need to agree
 *  about it: the seed below, and the ghost segment its own edit form renders for it. */
const CLOVER_DAY_A_EXERTION = 2

/** What test 1 marks the created lesson paid with — a `#payment_type` option value. */
const PAID_VIA = 'cash'

/**
 * `expect.poll` and web-first matchers run on expect's own 5s default, which `test.slow()` does
 * not raise (fact 1), so a number here *loosens* rather than tightens. Every bar read below
 * waits on `getProjectedExhaustionForBarn` — a Server Action round trip, behind a `next dev`
 * compile of a route the run may be touching for the first time, measured by #1482 at ~16.6s of
 * pure compile inside one test's budget. Same 30s and same reasoning as
 * checklist-phase3-calendar-shading.spec.ts's SCHEDULE_FETCH_BUDGET. Warm, these settle in well
 * under a second; a genuinely broken fetch never resolves and still fails.
 */
const EXHAUSTION_FETCH_BUDGET = 30_000

let beginner: LessonTier
let apple: Horse
let butter: Horse
let clover: Horse
let cloverDayALesson: Lesson
let trainerMembershipId: string
let riderMembershipId: string

/**
 * The month every bar fixture sits in — the barn's NEXT month, for the reason
 * checklist-phase5-lessons-new.spec.ts states: the current month's grid can hold as few as ~5
 * future cells when the suite runs at month end, which cannot hold separated fixture days, while
 * next month is entirely future, entirely inside one grid, and one `Next month` click away on
 * every calendar day of the year. Entirely future also matters more here than there — a past day
 * renders no bar at all.
 */
let fixtureMonth: string
/** The day every "picked date" test selects. Apple 7 / Butter 3 / Clover 6 in its ±3-day window. */
let dayA: string
/** One day after `dayA`, inside its window and outside `dayB`'s. Carries no test's selection. */
let dayNear: string
/** The day test 6 changes to. Apple 0 / Butter 4 / Clover 0 — every horse's total moves. */
let dayB: string

/**
 * The day test 1's lesson is created on: three days back, clamped up to the first of the barn's
 * current month.
 *
 * The clamp is why this is not a bare `addDays(today, -3)`. On the first three days of a month
 * an unclamped offset lands in the *previous* month, which breaks the half of that checkbox that
 * actually matters — "**current-month** paid lesson".
 *
 * WHAT THE CLAMP COSTS, stated plainly because the checklist line no longer says "before today"
 * and a reader is owed the reason: on the **first** of a month it resolves to today itself, and
 * `openNewLessonForm` fills BARRIER_TIME, so on that one day the created lesson can even be a
 * few hours in the *future*. No assertion here depends on the lesson being past — the checkbox's
 * content is what was stored and that it took a payment type — so nothing below is affected. The
 * two are genuinely irreconcilable: on the first of a month no day is both in the current month
 * and before today, and "current-month" is the adjective the rest of the checklist leans on.
 *
 * Barn-framed via `barnToday`, and the arithmetic is `local-day.ts`'s `addDays` on a branded
 * `CalendarDate` — never a host-zone `new Date()`, which `eslint.config.mjs` bans outside the
 * date modules anyway.
 */
let pastDay: string

/**
 * The fixture layout, and every window sum read below.
 *
 *   day 08  dayA      Apple 5 @10:00,  Butter 3 @11:00,  Clover 2 @12:00  <- the lesson test 7 edits
 *   day 09  dayNear   Apple 2 @10:00,  Clover 4 @11:00
 *   day 20  dayB      Butter 4 @10:00
 *
 * `get_horse_projected_exhaustion` sums a horse's non-cancelled lessons within
 * `[target - 3 days, target + 3 days]`. The two clusters are 11 days apart and the days within
 * the near cluster are 1 apart, so every sum below is exact at whatever hour the suite runs —
 * only the *day* separation has to clear 3, and the nearest fixture to either window edge is
 * more than a week away from it.
 *
 *   dayA's window (05–11) holds days 08 and 09   -> Apple 7/2,  Butter 3/1,  Clover 6/2
 *   dayB's window (17–23) holds day 20 alone     -> Apple 0/0,  Butter 4/1,  Clover 0/0
 *
 * Butter is the horse that is non-zero on *both* days and equal on neither, which is what makes
 * test 6 a claim about refreshing rather than about emptying: a form that dropped its
 * exhaustion data on a date change would read 0/0 for Butter, and a form that never refetched
 * would read dayA's 3/1.
 *
 * EXCLUDE_SELF: Clover's 6/2 on dayA is 4 (day 09) + 2 (day 08). The day-08 lesson is the one
 * test 7 opens for editing, so its own edit form must read **4/1** — the same window, minus
 * itself. Two lessons rather than one is what makes that assertion discriminating: with a single
 * Clover lesson, "excluded" and "the fetch returned nothing" are the same number.
 *
 * One horse per lesson, deliberately: `assert_lesson_participant_counts` constrains a normal
 * lesson's participants, and a day needing several horses' load gets several lessons rather than
 * an argument about that constraint.
 */
const barn = withBarn('phase3-exhaustion', async ({ supabase, barn: seeded, members }) => {
  // Not decoration: `LessonForm` short-circuits its whole render to "No lesson tiers have been
  // configured…" on a tier-less barn, so every assertion below would run against a page holding
  // none of what it names.
  await addTier(supabase, seeded.id, { ...STANDARD, isDefault: true })
  beginner = await addTier(supabase, seeded.id, BEGINNER)

  const thresholds = {
    exhaustionThresholdModerate: THRESHOLD_MODERATE,
    exhaustionThresholdHigh: THRESHOLD_HIGH,
  }
  apple = await addHorse(supabase, seeded.id, APPLE, thresholds)
  butter = await addHorse(supabase, seeded.id, BUTTER, thresholds)
  clover = await addHorse(supabase, seeded.id, CLOVER, thresholds)

  trainerMembershipId = members.trainer.membershipId
  riderMembershipId = members.rider.membershipId

  const today = barnToday(seeded.timezone)
  fixtureMonth = shiftMonth(today.slice(0, 7), 1)
  dayA = `${fixtureMonth}-08`
  dayNear = `${fixtureMonth}-09`
  dayB = `${fixtureMonth}-20`

  const monthStart = firstOfMonth(today)
  const threeBack = addDays(today, -3)
  pastDay = threeBack < monthStart ? monthStart : threeBack

  const seedLesson = (day: string, time: string, horse: Horse, exertion: number) =>
    addUnpaidLesson(supabase, seeded, {
      at: wallClockToInstant(`${day}T${time}:00`, seeded.timezone),
      time,
      instructorId: members.manager.membershipId,
      horseIds: [horse.id],
      exertionLevels: [exertion],
      riderIds: [members.rider2.membershipId],
      fee: STANDARD.price,
      tierName: STANDARD.name,
    })

  await seedLesson(dayA, FIRST_TIME, apple, 5)
  await seedLesson(dayA, SECOND_TIME, butter, 3)
  cloverDayALesson = await seedLesson(dayA, THIRD_TIME, clover, CLOVER_DAY_A_EXERTION)
  await seedLesson(dayNear, FIRST_TIME, apple, 2)
  await seedLesson(dayNear, SECOND_TIME, clover, 4)
  await seedLesson(dayB, FIRST_TIME, butter, 4)
})

// The window sums the table above derives, named once so no test retypes one.
const DAY_A = { apple: { points: 7, lessons: 2 }, butter: { points: 3, lessons: 1 }, clover: { points: 6, lessons: 2 } }
const DAY_B = { apple: { points: 0, lessons: 0 }, butter: { points: 4, lessons: 1 }, clover: { points: 0, lessons: 0 } }
/**
 * Clover's dayA window with the day-08 lesson itself taken out.
 *
 * DERIVED rather than written as `{ points: 4, lessons: 1 }`, because the subtraction *is* the
 * claim test 7 makes: "the same window, minus this lesson" is stated here as arithmetic instead
 * of being asserted in a comment and retyped as a literal. It also means a change to the seeded
 * exertion cannot leave this constant quietly describing a window the barn no longer has.
 */
const CLOVER_EXCLUDING_ITSELF = {
  points: DAY_A.clover.points - CLOVER_DAY_A_EXERTION,
  lessons: DAY_A.clover.lessons - 1,
}

/** The exertion `LessonForm` assigns a horse the moment it is checked, when the selected tier
 *  sets no `default_exertion_level` and Jumping is off — neither seeded tier does. */
const DEFAULT_EXERTION = 3
/** The two values test 4 drives the exertion input between. Both inside the field's 1–5 range. */
const LOW_EXERTION = 1
const HIGH_EXERTION = 5

// ---------------------------------------------------------------------------
// Locators, readers and drivers
// ---------------------------------------------------------------------------

/**
 * One horse's row in the Horses fieldset, addressed through the checkbox that carries its id.
 *
 * There is no per-horse test id on that row, and the bar inside it names its horse nowhere — its
 * `aria-label` is about exhaustion alone — so the row has to be reached structurally.
 * `LessonForm` renders, per horse:
 *
 *     <div>                          <- this locator
 *       <div><label><input value={h.id} …/> {h.name}</label> …exertion input… </div>
 *       <ExhaustionBar …/>
 *     </div>
 *
 * The child combinators are what keep it to exactly one match. An ancestor of the row would need
 * its own `> div > label > input` path to match, and the row's children are a `div` and the bar's
 * wrapper — neither a `label` — so no ancestor qualifies. The enclosing `<fieldset>` is not a
 * `div` and is excluded by the tag on its own. Playwright's strict mode then does the rest: a
 * structural change that broke the containment fails loudly here rather than silently widening
 * every read below.
 */
function horseRow(page: Page, horse: Horse) {
  return page.locator(`div:has(> div > label > input[value="${horse.id}"])`)
}

/** Every solid bar segment on the form, whichever horse it belongs to. The count claim of the
 *  no-start-time test, and nothing else uses it. */
function solidBars(page: Page) {
  return page.locator('[data-testid="exhaustion-bar-solid"]')
}

/** The bar's own button, the element carrying the `aria-label` every total below is read from. */
function barButton(page: Page, horse: Horse) {
  return horseRow(page, horse).getByRole('button', { name: /^Exhaustion: / })
}

/** `ExhaustionBar`'s `aria-label`, composed here rather than transcribed, so a test's expectation
 *  and the component's template cannot drift into agreeing about the wrong thing. The component
 *  does not pluralise; neither does this. */
function exhaustionLabel({ points, lessons }: { points: number; lessons: number }): string {
  return `Exhaustion: ${points} points from ${lessons} lessons`
}

/** A points value as the percentage of the track `ExhaustionBar` paints for it, rounded.
 *
 *  Rounded because the component's arithmetic is floating point — `(7 / 20) * 100` is
 *  `35.000000000000004` in JS and reaches the DOM as `width: 35.000000000000004%` — so an exact
 *  string comparison would be a comparison against a rounding artefact. The expectation is still
 *  derived from THRESHOLD_HIGH and the fixture table rather than written as a literal. */
function trackPct(points: number): number {
  return Math.round((points / THRESHOLD_HIGH) * 100)
}

type BarShape = {
  label: string | null
  solidPct: number | null
  ghostPct: number | null
}

/**
 * Everything one horse's bar renders, as one object.
 *
 * A single `evaluate` on the row locator rather than three separate reads: the locator resolves
 * to exactly one element or throws (strict mode), and auto-waits for it to be attached, so there
 * is no `evaluateAll` pass-on-nothing hazard here (spec-maintenance rule 3) and no need for the
 * count guard checklist-phase3-calendar-shading.spec.ts's `readGrid` carries.
 *
 * `null` for all three members is a horse whose bar is not rendered at all, which is a legitimate
 * answer rather than a failure. No test currently reads a bar in that state — the no-start-time
 * test counts `solidBars` instead, because its claim is about the whole fieldset rather than one
 * horse — but a per-horse read that threw there would be the wrong shape for this helper.
 */
async function readBar(page: Page, horse: Horse): Promise<BarShape> {
  const raw = await horseRow(page, horse).evaluate((row: HTMLElement) => {
    const button = row.querySelector('button[aria-label^="Exhaustion:"]')
    const solid = row.querySelector('[data-testid="exhaustion-bar-solid"]')
    const ghost = row.querySelector('[data-testid="exhaustion-bar-ghost"]')
    return {
      label: button?.getAttribute('aria-label') ?? null,
      solidWidth: solid instanceof HTMLElement ? solid.style.width : null,
      ghostWidth: ghost instanceof HTMLElement ? ghost.style.width : null,
    }
  })
  return {
    label: raw.label,
    solidPct: raw.solidWidth === null ? null : Math.round(parseFloat(raw.solidWidth)),
    ghostPct: raw.ghostWidth === null ? null : Math.round(parseFloat(raw.ghostWidth)),
  }
}

/** All three horses' bars in one shape, for the tests whose claim spans the whole fieldset. */
async function readAllBars(page: Page) {
  return {
    apple: await readBar(page, apple),
    butter: await readBar(page, butter),
    clover: await readBar(page, clover),
  }
}

/**
 * Blocks until a horse's bar carries the total that only the landed fetch can produce.
 *
 * This is the fetch barrier, not a convenience, and every test that reads a bar goes through it
 * first. `exhaustionData` starts `null` and `exhaustionByHorseId` is recomputed as
 * `exhaustionData?.lessonAt === lessonAt`, so between a date change and the Server Action
 * resolving, *every* bar is unmounted — a read taken then sees an empty fieldset and a
 * `toHaveCount(0)` taken then would pass for the wrong reason.
 *
 * The expected label is the day's own fixture sum, so it is discriminating in both directions:
 * no other day in this barn produces the same pair for the same horse.
 *
 * Carries EXHAUSTION_FETCH_BUDGET because it is the only wait in this file spanning that round
 * trip; every other settle here is local re-render.
 */
async function waitForBarTotal(page: Page, horse: Horse, total: { points: number; lessons: number }): Promise<void> {
  await expect(barButton(page, horse)).toHaveAttribute('aria-label', exhaustionLabel(total), {
    timeout: EXHAUSTION_FETCH_BUDGET,
  })
}

/**
 * Pages the grid forward onto `fixtureMonth`, settling on that month's heading.
 *
 * A plain click, deliberately NOT `hydrateByDriving`: the month button is *monotonic*, not
 * idempotent, so a retry loop whose read merely lagged one successful click would page a second
 * month forward and never satisfy its own predicate. `openNewLessonForm`'s barrier has already
 * proved React is listening, which is what makes one click enough.
 *
 * The settle target is `fixtureMonth` — the month the fixtures were *seeded* against in
 * `beforeAll` — rather than one recomputed from the clock here, which is #1463's ruling on this
 * helper's shape. A run that crossed midnight into a new month would otherwise wait on a heading
 * that is displayed, and fail much later and much more confusingly.
 */
async function goToFixtureMonth(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next month', exact: true }).click()
  await page.getByText(formatMonthHeading(fixtureMonth), { exact: true }).waitFor()
}

/** Opens the form and lands it on `dayA`, the day every bar fixture is arranged around. */
async function openFormOnDayA(page: Page): Promise<void> {
  await openNewLessonForm(page, barn)
  await goToFixtureMonth(page)
  await pickDay(page, dayA)
}

/**
 * Sets a checked horse's exertion.
 *
 * THE `toHaveValue` SETTLE IS WEAK, and calling it a barrier would be a lie: `fill()` writes the
 * input's DOM value directly and React never reverts a controlled input to a *stale* value, so
 * the settle is satisfied whether or not `setExertionMap` has committed. It is here to fail
 * loudly if the fill was rejected outright (the field is `min=1 max=5`), not to order what
 * follows.
 *
 * The bar's own response is never the settle — it is the claim in both callers. What actually
 * orders the read is each caller's assertion: test 4 asserts the ghost moved, and test 5 carries
 * Apple in both snapshots for exactly that reason (see there).
 */
async function setExertion(page: Page, horse: Horse, level: number): Promise<void> {
  const field = page.locator(`#exertion_${horse.id}`)
  await field.fill(String(level))
  await expect(field).toHaveValue(String(level))
}

/**
 * Switches the list's filter by clicking its `Pill`, never by re-`goto`ing with a query param
 * (fact 11). Copied from checklist-phase3-lesson-fees.spec.ts's `pickTopFilter`.
 */
async function pickTopFilter(page: Page, label: string, expected: string): Promise<void> {
  await page.getByRole('link', { name: label, exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('filter') === expected, { waitUntil: 'commit' })
}

/**
 * Walks from the Lessons list to the created lesson's own edit form, the way a manager reaches
 * it, and reports the URL it landed on.
 *
 * The By Tier filter is **addressing**, not assertion. Every seeded lesson in this barn carries
 * STANDARD's name and only the created one carries BEGINNER's, so filtering to Beginner leaves
 * exactly one card — and `lessonCards`' strict-mode click is what enforces that. A lesson that
 * saved against the wrong tier fails here, loudly, at the click, rather than passing something
 * weaker further down. Reaching it this way also means nothing outside the app tells this test
 * which lesson it just made: no service-role lookup of the new id.
 *
 * Not the By Horse filter checklist-phase3-lesson-fees.spec.ts uses: Clover carries two seeded
 * lessons here as well as the created one, so By Horse would leave three cards.
 *
 * The `#tier_name` wait is render proof, not decoration: `waitUntil: 'commit'` resolves before
 * the document renders, so a 500 at the right URL would satisfy the URL half on its own.
 */
async function openCreatedLessonEditForm(page: Page): Promise<void> {
  await pickTopFilter(page, 'By Tier', 'tier')
  await page.getByRole('link', { name: BEGINNER.name, exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('id') === BEGINNER.name, { waitUntil: 'commit' })

  // Settles on the filtered list before the click, and doubles as the addressing claim: exactly
  // one card carries BEGINNER's tier name. `waitUntil: 'commit'` resolves before React has
  // swapped the list, so a bare strict-mode click here could resolve against the seven unfiltered
  // cards and fail as a strict-mode violation rather than as the count being wrong.
  await expect(lessonCards(page)).toHaveCount(1)
  await lessonCards(page).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
  await openEditFromDetail(page)
}

/** Follows the detail page's Edit link and waits for the form to render. */
async function openEditFromDetail(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}\/edit$/, { waitUntil: 'commit' })
  await page.locator('#tier_name').waitFor()
}

/**
 * What a stored lesson's edit form holds, as one object.
 *
 * Body from e2e/support/lesson-form.ts's `editFormSelection`, extended with the payment
 * type this checkbox adds. Read together and asserted as a single `toEqual` because the checkbox
 * is a conjunction — "Beginner tier, trainer Alex, horse Clover, rider Dana … mark it paid" is
 * six claims about one lesson, and splitting them would let five pass while the sixth silently
 * named a different lesson.
 *
 * Called inside `expect.poll`, which is what makes the composite safe: every member read here is
 * one-shot. `inputValue()` and `getAttribute()` do not retry once they have an element, and
 * `evaluateAll` does not retry at all — it yields `[]` on an unsettled page, which is
 * spec-maintenance rule 3's pass-on-nothing hazard. The poll re-reads the whole object instead.
 *
 * NO INLINE `first().waitFor()` GUARD, unlike rule 3's reference implementation in
 * support/lesson-pages.ts, and the difference is the poll rather than laziness. That guard is
 * unbounded (fact 1), so inside `expect.poll` it would convert this helper's fast, legible
 * failure into a hang that eats the whole test budget and reports nothing about which member was
 * wrong. The poll supplies the retry the guard exists for, and `[]` cannot equal `[clover.id]`,
 * so the pass-on-nothing hole the rule protects is closed here by construction.
 *
 * `aria-pressed` is safe to read here — the server and the client compute it from the same
 * `initialLesson` prop, so fact 7's non-reconciliation has no mismatch to preserve, and nothing
 * on this page ever changes the selected day.
 */
async function editFormSelection(page: Page) {
  return {
    day: await page.locator('button[data-past][aria-pressed="true"]').getAttribute('aria-label'),
    tier: await page.locator('#tier_name').inputValue(),
    instructor: await page.locator('#instructor_id').inputValue(),
    horses: await page
      .locator('input[name="horse_id"]')
      .evaluateAll((els) =>
        els.filter((el) => (el as HTMLInputElement).checked).map((el) => (el as HTMLInputElement).value)
      ),
    rider: await page.locator('#rider_id').inputValue(),
    paymentType: await page.locator('#payment_type').inputValue(),
  }
}

// ---------------------------------------------------------------------------
// The created lesson
// ---------------------------------------------------------------------------

test.describe('New Lesson — the current-month paid lesson', () => {
  // "Create a **current-month paid lesson** (dated three days back, clamped to the first of the
  // month): Beginner tier, trainer Alex, horse Clover, rider Dana — after saving, mark it
  // **paid**". One test rather than two because the line is one checkbox and its two halves are
  // one lesson: "mark it paid" has no subject without the creation above it.
  //
  // THE BARRIER HERE IS THE NAV BAR'S, NOT THIS PAGE'S, and neither obvious alternative works.
  //
  // support/lesson-pages.ts's `waitForEditFormHydrated` waits on an exhaustion bar, and this
  // lesson is dated at or before today on all but one calendar day a month (see `pastDay`), so
  // `isPastLesson` gates every bar on its edit form off and that barrier would simply never
  // resolve — a silent 30-second timeout whose cause is nowhere near where it fails.
  //
  // `hydrateByDriving` on `#payment_type` was the first replacement and is also wrong, subtly:
  // its predicate would be the select's own `inputValue()`, which a *pre-hydration*
  // `selectOption` already satisfies. The barrier would resolve having proved nothing, React
  // would then reconcile the controlled `<select>` back to `''` (LessonForm.tsx's `paymentType`
  // state), and the save would store no payment type at all. Loud rather than silent — the
  // assertion below would fail — but flaky, and for a reason no one would look for here.
  //
  // `waitForBarnPageHydrated` has neither problem: the nav bar renders into the *same* React
  // root as the page, and its avatar popover is `useState`-gated markup that cannot exist before
  // that root hydrates. It is fact 13's own prescribed workaround for a page whose own controls
  // all either write or render identically either side of hydration, which is this page exactly.
  test('creating_a_current_month_lesson_then_marking_it_paid_stores_its_details_and_payment_type @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page, barn)
    await page.locator('#tier_name').selectOption(beginner.id)
    await expect(page.locator('#tier_name')).toHaveValue(beginner.id)
    await pickDay(page, pastDay)
    await page.locator('#instructor_id').selectOption(trainerMembershipId)
    await selectHorse(page, clover)
    await page.locator('#rider_id').selectOption(riderMembershipId)
    await submitNewLesson(page, barn)

    await openCreatedLessonEditForm(page)
    await waitForBarnPageHydrated(page)
    const paymentType = page.locator('#payment_type')
    await paymentType.selectOption(PAID_VIA)
    await expect(paymentType).toHaveValue(PAID_VIA)
    await saveLessonForm(page)
    await page.waitForURL(/\/lessons\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })

    // Re-read the stored lesson through a freshly loaded form rather than the one just saved:
    // the assertion is about what the save persisted, and the pre-save form already held every
    // one of these values in client state.
    await openEditFromDetail(page)

    // Every expectation is a builder return value, a seeded membership id, or a constant this
    // file also drove the form with — nothing here is a string typed twice.
    await expect
      .poll(() => editFormSelection(page))
      .toEqual({
        day: pastDay,
        tier: beginner.id,
        instructor: trainerMembershipId,
        horses: [clover.id],
        rider: riderMembershipId,
        paymentType: PAID_VIA,
      })
  })
})

// ---------------------------------------------------------------------------
// The live exhaustion bars
// ---------------------------------------------------------------------------

test.describe('New Lesson — live exhaustion bars', () => {
  // "The New Lesson form OPENS with Start Time empty — so no lesson instant is selected — and no
  // exhaustion bars render." The claim is the opening state since #1578, not a cleared field: the
  // form no longer pre-fills the time with the barn's current hour, so "no instant selected" is
  // now what a manager actually sees on arrival rather than a state they have to construct.
  //
  // NOT `openNewLessonForm`, and that is forced rather than stylistic: that helper's hydration
  // barrier *fills the start time*, which is the very field this asserts is empty. The barrier
  // here is `waitForBarnPageHydrated` instead — driven through the nav bar's avatar menu, which
  // shares a React root with the page and touches no form control at all (fact 13's prescribed
  // workaround, `support/hydration.ts`).
  //
  // THE ABSENCE IS DURABLE, WHICH IS WHAT MAKES IT ASSERTABLE (fact 18 / spec-maintenance rule
  // 4). `LessonStartTime` reports `''` for the combined instant whenever either half is empty,
  // and `LessonForm`'s fetch effect early-returns on an empty `lessonAt` — so with no time
  // entered no request is ever outstanding and nothing can bring the bars up. A `toHaveCount(0)`
  // satisfied on its first poll therefore observes the settled state rather than a pre-render
  // window, and a regression that restored the pre-fill would fetch and would fail.
  //
  // The positive anchor rule 4 requires is the second half: entering a time on dayA brings all
  // three bars in, each carrying that day's fixture total. It proves the page region renders and
  // that the fetch path is live, so the zero above is an absence rather than a blank page.
  test('the_new_lesson_form_opens_with_an_empty_start_time_and_no_exhaustion_bars @manager', async ({
    page,
  }) => {
    await page.goto(newLessonPath(barn))
    await waitForBarnPageHydrated(page)

    await expect(page.locator('#lesson-start-time')).toHaveValue('')
    await expect(solidBars(page)).toHaveCount(0)

    await goToFixtureMonth(page)
    await pickDay(page, dayA)
    await page.locator('#lesson-start-time').fill(BARRIER_TIME)
    await waitForBarTotal(page, apple, DAY_A.apple)
    await expect(solidBars(page)).toHaveCount(HORSE_COUNT)
  })

  // "Pick a date and check Apple, Butter, and Clover in turn — each shows an exhaustion bar."
  //
  // The walk is reproduced as written, but bare presence is not what is asserted: the render
  // condition admits every available active horse whether checked or not, so "a bar is there"
  // would pass against a form that ignored the checkboxes entirely. Each bar's window total is
  // asserted instead, which no other day in this barn produces, and the ghost segment each
  // checkbox adds is asserted alongside it — that half *is* caused by the checking.
  test('picking_a_day_gives_apple_butter_and_clover_each_an_exhaustion_bar_for_that_days_window @manager', async ({
    page,
  }) => {
    await openFormOnDayA(page)
    await waitForBarTotal(page, apple, DAY_A.apple)

    await selectHorse(page, apple)
    await selectHorse(page, butter)
    await selectHorse(page, clover)

    expect(await readAllBars(page)).toEqual({
      apple: { label: exhaustionLabel(DAY_A.apple), solidPct: trackPct(DAY_A.apple.points), ghostPct: trackPct(DEFAULT_EXERTION) },
      butter: { label: exhaustionLabel(DAY_A.butter), solidPct: trackPct(DAY_A.butter.points), ghostPct: trackPct(DEFAULT_EXERTION) },
      clover: { label: exhaustionLabel(DAY_A.clover), solidPct: trackPct(DAY_A.clover.points), ghostPct: trackPct(DEFAULT_EXERTION) },
    })
  })

  // "Adjust a checked horse's exertion level — its ghost segment moves live."
  //
  // "Live" is the whole claim, so nothing here saves or reloads: the exertion field is filled and
  // the bar is read on the same page. The solid segment is asserted unchanged in the same object
  // — the ghost is the projection and the solid is the history, and a form that recomputed both
  // from the edited value would still satisfy a ghost-only assertion.
  test('raising_a_checked_horses_exertion_widens_its_ghost_segment_without_moving_its_solid_segment @manager', async ({
    page,
  }) => {
    await openFormOnDayA(page)
    await waitForBarTotal(page, apple, DAY_A.apple)
    await selectHorse(page, apple)

    await setExertion(page, apple, LOW_EXERTION)
    const before = await readBar(page, apple)
    await setExertion(page, apple, HIGH_EXERTION)
    const after = await readBar(page, apple)

    expect({ before, after }).toEqual({
      before: { label: exhaustionLabel(DAY_A.apple), solidPct: trackPct(DAY_A.apple.points), ghostPct: trackPct(LOW_EXERTION) },
      after: { label: exhaustionLabel(DAY_A.apple), solidPct: trackPct(DAY_A.apple.points), ghostPct: trackPct(HIGH_EXERTION) },
    })
  })

  // "Unchecked horses' bars stay solid while that exertion level changes."
  //
  // The control for the test above it, and it has to capture Butter and Clover on *both* sides of
  // the edit: asserting only that Apple's ghost moved leaves the regression this line exists for
  // — every bar moving together — completely undetected. `ghostPct: null` is the "solid" half
  // stated structurally: an unchecked horse gets `ghostValue={undefined}`, so `ExhaustionBar`
  // renders no ghost element at all rather than a zero-width one.
  //
  // APPLE IS IN BOTH SNAPSHOTS, AND IS THE REASON THIS TEST CAN FAIL AT ALL. Without it the whole
  // assertion is "two bars that should not move did not move", which a run where the exertion
  // edit never landed satisfies perfectly — `setExertion`'s `toHaveValue` settle cannot rule that
  // out, because `fill()` writes the input's DOM value directly and React never reverts it, so
  // the settle is satisfied whether or not `setExertionMap` committed. Apple's ghost moving from
  // LOW to HIGH inside the same object is the same-test positive anchor (spec-maintenance rule 4)
  // that proves the change the other two are being held still across actually happened.
  test('an_unchecked_horses_bar_stays_solid_and_unchanged_while_another_horses_exertion_changes @manager', async ({
    page,
  }) => {
    await openFormOnDayA(page)
    await waitForBarTotal(page, apple, DAY_A.apple)
    await selectHorse(page, apple)
    await setExertion(page, apple, LOW_EXERTION)

    const before = await readAllBars(page)
    await setExertion(page, apple, HIGH_EXERTION)
    const after = await readAllBars(page)

    const untouched = {
      butter: { label: exhaustionLabel(DAY_A.butter), solidPct: trackPct(DAY_A.butter.points), ghostPct: null },
      clover: { label: exhaustionLabel(DAY_A.clover), solidPct: trackPct(DAY_A.clover.points), ghostPct: null },
    }
    const appleAt = (exertion: number) => ({
      label: exhaustionLabel(DAY_A.apple),
      solidPct: trackPct(DAY_A.apple.points),
      ghostPct: trackPct(exertion),
    })
    expect({ before, after }).toEqual({
      before: { ...untouched, apple: appleAt(LOW_EXERTION) },
      after: { ...untouched, apple: appleAt(HIGH_EXERTION) },
    })
  })

  // "Change the date — the bars refresh."
  //
  // Read across both days in one test, because "refresh" is a transition and neither end of it is
  // the claim on its own. Butter is the horse that carries it: non-zero on both days and equal on
  // neither, so a form that dropped its data on the date change reads 0/0 for Butter and one that
  // never refetched reads dayA's 3/1. Apple and Clover going to 0/0 are the other half — a
  // refresh that only ever adds would leave them at dayA's totals.
  test('changing_the_selected_day_refreshes_every_bar_to_the_new_days_window @manager', async ({
    page,
  }) => {
    await openFormOnDayA(page)
    await waitForBarTotal(page, apple, DAY_A.apple)
    const before = await readAllBars(page)

    await pickDay(page, dayB)
    await waitForBarTotal(page, butter, DAY_B.butter)
    const after = await readAllBars(page)

    expect({ before, after }).toEqual({
      before: {
        apple: { label: exhaustionLabel(DAY_A.apple), solidPct: trackPct(DAY_A.apple.points), ghostPct: null },
        butter: { label: exhaustionLabel(DAY_A.butter), solidPct: trackPct(DAY_A.butter.points), ghostPct: null },
        clover: { label: exhaustionLabel(DAY_A.clover), solidPct: trackPct(DAY_A.clover.points), ghostPct: null },
      },
      after: {
        apple: { label: exhaustionLabel(DAY_B.apple), solidPct: trackPct(DAY_B.apple.points), ghostPct: null },
        butter: { label: exhaustionLabel(DAY_B.butter), solidPct: trackPct(DAY_B.butter.points), ghostPct: null },
        clover: { label: exhaustionLabel(DAY_B.clover), solidPct: trackPct(DAY_B.clover.points), ghostPct: null },
      },
    })
  })
})

// ---------------------------------------------------------------------------
// The edit form's own window
// ---------------------------------------------------------------------------

test.describe('Edit Lesson — a lesson is excluded from its own exhaustion window', () => {
  // "Open a **future-dated** lesson's edit page and confirm its horse's bar still renders,
  // excluding the lesson itself from its own window."
  //
  // See the header for why this is not the lesson the first checkbox creates: that one is dated
  // on or before today, and `isPastLesson` gates every bar on its edit form off — behaviour the
  // app's own `LessonForm.edit-exhaustion-prefill.test.tsx` already pins for its `pastLesson`
  // fixture. So the subject is the seeded future-dated Clover lesson on dayA instead, which keeps
  // both Clover and the exclude-itself claim the line is actually about.
  //
  // THE EXCLUSION IS WHAT THE NUMBERS SAY. Clover's dayA window holds two lessons totalling 6 —
  // which is exactly what `picking_a_day_gives_apple_butter_and_clover_each_an_exhaustion_bar_for
  // _that_days_window` reads on the New Lesson form for the same day. Opened from *inside* one of
  // those two, the same window must read 4 from 1 lesson. Apple and Butter are asserted alongside
  // at their unchanged dayA totals, which is what makes this a claim about excluding one lesson
  // rather than about the fetch having returned less of everything.
  test('the_edit_form_renders_the_lessons_own_horses_bar_excluding_that_lesson_from_its_window @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(editPath(barn, cloverDayALesson.id))
    await waitForEditFormHydrated(page)
    await waitForBarTotal(page, clover, CLOVER_EXCLUDING_ITSELF)

    expect(await readAllBars(page)).toEqual({
      apple: { label: exhaustionLabel(DAY_A.apple), solidPct: trackPct(DAY_A.apple.points), ghostPct: null },
      butter: { label: exhaustionLabel(DAY_A.butter), solidPct: trackPct(DAY_A.butter.points), ghostPct: null },
      // Checked, because it is this lesson's own horse — so its bar carries the ghost for the
      // exertion the lesson was seeded with.
      clover: {
        label: exhaustionLabel(CLOVER_EXCLUDING_ITSELF),
        solidPct: trackPct(CLOVER_EXCLUDING_ITSELF.points),
        ghostPct: trackPct(CLOVER_DAY_A_EXERTION),
      },
    })
  })
})
