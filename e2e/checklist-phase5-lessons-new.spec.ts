// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/components/ExhaustionBar.tsx
// covers: src/app/actions/lessons.ts
// covers: src/lib/month-calendar.ts
// covers: src/lib/db/schedule.ts
// covers: src/lib/db/notifications.ts

import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { shiftMonth } from '@/lib/month-calendar'
import { calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import { mustSucceed } from '@/lib/db/service-role'
import type { Horse } from '@/lib/db/types'

// The trainer's New Lesson form and the notification a nearby lesson writes for the *other*
// instructor (checklists/pre-release/phase-5-trainer.md, lines 23-27, 39 and 43-44).
//
// ## The other instructor is `members.manager`
//
// The checklist calls them Blake. Of the four members `addMemberships` seeds, the manager login
// is the only one other than the acting trainer that satisfies BOTH halves of what these lines
// need: `can_instruct: true` (the `rider` login and the `rider2` stub are both false), and a
// real `user_id` (`rider2` has none at all). So a lesson seeded under its membership id is
// "another instructor's lesson" for every check here, and it is a genuinely different
// `notifications.user_id` for the last two — the `rider` login also holds a `user_id`, but it
// can never be an instructor, so it is not a candidate. No fourth persona, and no name added to
// the set `support/fixtures.test.ts` holds to its collision constraint.
//
// ## Line 833's "same as the manager view" is a source-level fact, not an e2e claim
//
// One spec file runs as one role (Playwright dispatches on spec × project), so a `@trainer`
// test can never observe the manager's rendering of this form to compare against. What makes
// the two the *same* calendar is that `lessons/new/page.tsx` renders one `LessonForm` for both
// roles and `LessonForm` passes `getScheduleRange` unconditionally — the manager/trainer branch
// in that file covers the Instructor field alone. So 833 is asserted here in its observable
// form: the Date field IS the month calendar rather than the native date input it falls back
// to without a schedule reader. Narrowing only, no line rewrite.
//
// ## Why every fixture lives in *next* month
//
// The current month's grid can hold as few as ~5 future cells when the suite runs at month end
// (a 31-day month starting on Saturday spills only 5 days past its last row), which cannot hold
// three separated fixture days. Next month is entirely future, entirely inside one grid, and
// reached by exactly one `Next month` click — so the day placement below is deterministic on
// every calendar day of the year rather than on most of them.
//
// ## Ordering: the read-only block runs first, deliberately
//
// The serial block below creates lessons through the UI, and a created lesson is a real
// scheduling item. Every lesson it creates uses WILLOW, so APPLE's exertion window — the
// subject of line 834 — is untouched either way; declaring the read-only block first makes
// that a property of the file's order as well as of its horse choice.

const APPLE = 'Apple'
const WILLOW = 'Willow'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

// Barn-local wall clocks. The barrier time is re-entered on every form open (it is idempotent,
// which is what makes it safe inside `hydrateByDriving`); the rest pin fixture placement.
//
// ITS MINUTES MUST NOT BE `:00`, and that is the whole reason for the odd-looking value.
// `LessonStartTime` defaults `time` to the top of the barn's CURRENT hour — `${HH}:00` — and it
// runs that initializer on the server too, so the hidden `lesson_at` input is already in the
// server-rendered HTML carrying today at `HH:00`. A barrier time of `10:00` therefore *already
// matches* whenever the suite happens to run during the barn's 10:00-10:59 hour: `isLive()`
// returns true on its first pre-drive call, the fill is never dispatched, and the barrier
// resolves having proved nothing — leaving every click after it exposed to the lost-click hazard
// (e2e/CLAUDE.md facts 9 and 10) for a one-hour window once a day. Non-zero minutes cannot be
// produced by that default at any hour, so the match can only come from this spec's own fill.
const BARRIER_TIME = '10:37'
const SHADED_LESSON_TIME = '10:00'
const APPOINTMENT_TIME = '09:00'
const OTHER_INSTRUCTOR_TIME = '14:00'
// Fifteen minutes after the other instructor's lesson — inside `schedule_buffer_minutes`' 30
// (and inside the 60 + 30 window `getNearbyInstructorMembershipIds` actually applies), which
// is the precondition line 847 names.
const NEARBY_TIME = '14:15'

// APPLE carries per-horse thresholds rather than the barn defaults so line 834's band is an
// arithmetic certainty rather than a coincidence: one exertion-5 lesson sums to 5, and
// `getExhaustionBand(5, { moderate: 2, high: 4 })` is 'high' while an empty window's 0 is 'low'.
const APPLE_THRESHOLD_MODERATE = 2
const APPLE_THRESHOLD_HIGH = 4
const SHADED_EXERTION = 5

const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`

// `expect.poll` runs on expect's own 5s default, which `test.slow()` does not raise — so unlike
// every `waitFor*` in this file, a number here *loosens* rather than tightens (e2e/CLAUDE.md
// fact 1). Both polls below wait on the lesson form's one-per-displayed-month schedule read,
// which is a Server Action round trip behind a `next dev` compile of a route the run may be
// touching for the first time; 5s is not reliably enough for that under full-suite load.
const SCHEDULE_FETCH_BUDGET = 20_000

// "YYYY-MM" of the month every fixture below sits in, and the days within it. Resolved in the
// seed callback because the barn's timezone — the frame `barnToday` has to be asked in — is not
// knowable at module scope.
let nextMonth: string
let shadedDay: string
let appointmentDay: string
let quietDay: string
let nearbyDay: string
let firstCreatedDay: string
let secondCreatedDay: string

let seededHorses: Horse[]

const barn = withBarn('phase5-lessons-new', async ({ supabase, barn, members }) => {
  // Not decoration: LessonForm short-circuits its entire render to "No lesson tiers have been
  // configured…" when `tiers` is empty, so on a tier-less barn there is no form at all and
  // every assertion in this file would pass against a page rendering none of what it names.
  const standard = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true })

  const apple = await addHorse(supabase, barn.id, APPLE, {
    exhaustionThresholdModerate: APPLE_THRESHOLD_MODERATE,
    exhaustionThresholdHigh: APPLE_THRESHOLD_HIGH,
  })
  const willow = await addHorse(supabase, barn.id, WILLOW)
  seededHorses = [apple, willow]

  nextMonth = shiftMonth(barnToday(barn.timezone).slice(0, 7), 1)
  shadedDay = `${nextMonth}-06`
  firstCreatedDay = `${nextMonth}-08`
  secondCreatedDay = `${nextMonth}-09`
  appointmentDay = `${nextMonth}-13`
  quietDay = `${nextMonth}-20`
  nearbyDay = `${nextMonth}-27`

  const dayAt = (day: string, time: string) => wallClockToInstant(`${day}T${time}:00`, barn.timezone)

  // Line 834's whole point: this lesson is instructed by someone else. A role-filtered heatmap
  // would leave `shadedDay` reading 'low' for the trainer, which is exactly what the assertion
  // discriminates against. `quietDay` is 14 days away — well outside the +/-3-day exertion
  // window — so it stays the 'low' control.
  await addUnpaidLesson(supabase, barn, {
    at: dayAt(shadedDay, SHADED_LESSON_TIME),
    time: SHADED_LESSON_TIME,
    instructorId: members.manager.membershipId,
    horseIds: [apple.id],
    exertionLevels: [SHADED_EXERTION],
    riderIds: [members.rider2.membershipId],
    fee: standard.price,
    tierName: standard.name,
  })

  // `time` is required, not cosmetic: `getScheduleForRange` filters `.not('expense_time','is',
  // null)`, so a date-only appointment never reaches the calendar and line 835 would assert
  // against a grid that legitimately shows no dot.
  await addExpense(supabase, barn, {
    at: dayAt(appointmentDay, APPOINTMENT_TIME),
    time: APPOINTMENT_TIME,
    recipient: 'Ridgeline Veterinary',
    expenseType: 'Vet',
    amount: 150,
    horseIds: [apple.id],
  })

  // "Blake's lesson" for line 847 — the one the trainer's new lesson lands within the buffer of.
  // WILLOW, not APPLE, so it contributes nothing to line 834's window.
  await addUnpaidLesson(supabase, barn, {
    at: dayAt(nearbyDay, OTHER_INSTRUCTOR_TIME),
    time: OTHER_INSTRUCTOR_TIME,
    instructorId: members.manager.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider2.membershipId],
    fee: standard.price,
    tierName: standard.name,
  })

  // No trainer-instructed lesson is seeded at all — that is what lets line 831's "My Lessons now
  // holds exactly the two you just created" mean something.
})

// ---------------------------------------------------------------------------
// Locators, barriers and drivers
// ---------------------------------------------------------------------------

function newLessonPath(): string {
  return `/barn/${barn.slug}/lessons/new`
}

/** Every day button in the month grid — `data-past` is unique to `MonthCalendarPicker`'s cells. */
function dayCells(page: Page) {
  return page.locator('button[aria-label][data-past]')
}

/** One day button, by the "YYYY-MM-DD" that is its own accessible name. */
function dayCell(page: Page, date: string) {
  return page.getByRole('button', { name: date, exact: true })
}

/**
 * Opens the form and blocks until React has taken it over.
 *
 * Waiting for `#lesson-start-time` to appear would prove nothing: since #1021 the day panel is
 * `dayPanelAlwaysOpen`, so that input is in the SERVER-rendered HTML and every interaction after
 * it would race hydration — a click dispatched before React is listening is simply lost and
 * nothing replays it (e2e/CLAUDE.md facts 9 and 10). The barrier therefore waits on the hidden
 * `lesson_at` input carrying the combination of the barn's today and the time just entered,
 * which only client-side `LessonStartTime` can write.
 *
 * The drive is a `fill` of a fixed time, so re-entering it is idempotent — the property
 * `hydrateByDriving` needs to retry safely. `isLive` is a single `page.evaluate` with no
 * retrying read inside it, per that helper's contract.
 *
 * `test.slow()` rather than a timeout on any wait: `waitFor*` is unbounded already, so a number
 * could only tighten it (#1211).
 */
async function openNewLessonForm(page: Page): Promise<void> {
  test.slow()
  const timezone = barn.data.barn.timezone
  await page.goto(newLessonPath())
  await page.getByRole('heading', { level: 1, name: 'New Lesson' }).waitFor()

  const expected = wallClockToInstant(`${barnToday(timezone)}T${BARRIER_TIME}:00`, timezone).toISOString()
  await hydrateByDriving(
    () => page.locator('#lesson-start-time').fill(BARRIER_TIME),
    () =>
      page.evaluate((want) => {
        const el = document.querySelector('input[name="lesson_at"]')
        return el instanceof HTMLInputElement && el.value === want
      }, expected)
  )
}

/**
 * Pages the grid forward one month, onto the month every fixture sits in.
 *
 * A plain click, deliberately NOT `hydrateByDriving`: the month button is *monotonic*, not
 * idempotent, so a retry loop whose read merely lagged one successful click would advance a
 * second month and then never satisfy its own predicate. `openNewLessonForm`'s barrier has
 * already proved React is listening, which is what makes one click enough.
 */
async function goToNextMonth(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Next month' }).click()
  await page.getByText(formatMonthHeading(nextMonth), { exact: true }).waitFor()
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

/** Ticks a horse, settling on the per-horse exertion input — `useState`-gated markup that
 *  cannot exist until React has the horse checked. */
async function selectHorse(page: Page, horse: Horse): Promise<void> {
  await page.getByRole('checkbox', { name: horse.name, exact: true }).check()
  await page.locator(`#exertion_${horse.id}`).waitFor()
}

/** The `data-band` each named day currently carries — `null` when the attribute is absent. */
async function bandsOn(page: Page, dates: string[]): Promise<Record<string, string | null>> {
  const entries = await Promise.all(
    dates.map(async (date) => [date, await dayCell(page, date).getAttribute('data-band')] as const)
  )
  return Object.fromEntries(entries)
}

/** Whether each named day is showing a conflict dot. */
async function dotsOn(page: Page, dates: string[]): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    dates.map(async (date) => [date, (await page.getByTestId(`conflict-dot-${date}`).count()) > 0] as const)
  )
  return Object.fromEntries(entries)
}

/**
 * Fills and submits the form for one lesson, and reports how many Instructor pickers the form
 * offered — line 831's other half, measured where it is observable (on the form) and asserted
 * where the line's claim resolves (the created lessons' owner), in one expectation.
 *
 * Submit is activated by keyboard rather than a pointer click: it sits at the bottom of a long
 * scrollable form, the shape that raced Chromium's scroll-into-view animation in #501.
 *
 * The trailing `waitForURL` is the "succeeds with no error" half of line 847 as well as a sync
 * point: `submitLesson` re-renders the form with a `role="alert"` and no navigation on every
 * failure path, and only redirects on success. It cannot no-op (#1204) — the pattern excludes
 * the `/lessons/new` this is called from.
 */
async function createLesson(page: Page, opts: { day: string; time: string }): Promise<{ instructorPickers: number }> {
  await openNewLessonForm(page)
  const instructorPickers = await page.locator('#instructor_id').count()

  await goToNextMonth(page)
  await pickDay(page, opts.day)
  await page.locator('#lesson-start-time').fill(opts.time)
  await page.getByRole('checkbox', { name: WILLOW, exact: true }).check()
  await page.locator('#rider_id').selectOption({ label: RIDER_NAME })

  const submit = page.getByRole('button', { name: 'Submit' })
  await submit.focus()
  await submit.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })

  return { instructorPickers }
}

/** Every lesson card the list is currently showing. */
function lessonCards(page: Page) {
  return page.locator('main ul a[href*="/lessons/"]')
}

/**
 * The ids of the lessons on screen. `evaluateAll` is one-shot and does not auto-retry, so an
 * unsettled list yields `[]` and a length assertion would pass on nothing (#1243); the inline
 * `waitFor` is the guard `support/read.ts` deliberately leaves at `evaluateAll` call sites, and
 * it doubles as an assertion since it throws rather than handing back an empty list.
 */
async function visibleLessonIds(page: Page): Promise<string[]> {
  await lessonCards(page).first().waitFor()
  return lessonCards(page).evaluateAll((els) => els.map((el) => el.getAttribute('href')!.split('/').pop()!))
}

type NearbyNotification = { user_id: string; type: string; link: string; title: string }

/**
 * The one `instructor_lesson_nearby` row this barn holds, read with the spec's own service client.
 *
 * The row is never seeded — `addNotification` is deliberately not imported. These two checkboxes
 * claim the APP wrote a row, so planting one would make both of them vacuous.
 *
 * The retry condition is `toHaveLength(1)` on the QUERY RESULT, not on an accumulator: "some row
 * has appeared" would be satisfied by two rows as readily as by one, and the query carries no
 * `ORDER BY`, so a duplication regression would silently hand back an arbitrary one of them and
 * both tests below would go on asserting its contents. `notifications.ts`'s own module comment
 * names that risk directly — `instructor_lesson_nearby` has two independent producers sharing one
 * `(user_id, barn_id, type)` upsert key — so it is a live regression, not a hypothetical.
 *
 * `toPass` is unbounded and owns the retry, so no number is written here. In practice the row is
 * already there: `submitLesson` awaits `notifyNearbyInstructors` before it redirects, and the
 * redirect is what `createLesson` above synchronised on.
 */
async function nearbyNotification(): Promise<NearbyNotification> {
  const found: NearbyNotification[] = []
  await expect(async () => {
    const rows = mustSucceed<NearbyNotification[]>(
      await barn.data.supabase
        .from('notifications')
        .select('user_id, type, link, title')
        .eq('barn_id', barn.data.barn.id)
        .eq('type', 'instructor_lesson_nearby'),
      'read nearby-instructor notifications'
    )
    expect(rows).toHaveLength(1)
    found.length = 0
    found.push(rows[0])
  }).toPass()
  return found[0]
}

// ---------------------------------------------------------------------------
// The form itself — checklist lines 831-835 (833, 832, 834, 835 here)
// ---------------------------------------------------------------------------

test.describe("the trainer's New Lesson form", () => {
  // Line 833. Both halves in one equality: the month grid is present at its full fixed 6x7, and
  // the native `<input type="date">` LessonForm falls back to without a schedule reader is not.
  // Either half alone is satisfiable by the wrong page — a form with both controls, or a form
  // with neither.
  test('trainer_new_lesson_form_renders_the_month_calendar_as_its_date_field @trainer', async ({ page }) => {
    await openNewLessonForm(page)

    expect({
      dayCells: await dayCells(page).count(),
      nativeDateInputs: await page.locator('#lesson-date').count(),
    }).toEqual({ dayCells: 42, nativeDateInputs: 0 })
  })

  // Line 832. One bar per seeded horse, counted from the builder's own return value rather than
  // a literal. The count starts at 0 and can only reach the expected number after React has
  // hydrated, resolved the Server Action and re-rendered, so `toHaveCount` is doing real waiting
  // here rather than confirming server-rendered markup.
  test('trainer_picking_a_date_renders_an_exhaustion_bar_below_every_horse @trainer', async ({ page }) => {
    await openNewLessonForm(page)
    await goToNextMonth(page)
    await pickDay(page, shadedDay)

    await expect(page.getByTestId('exhaustion-bar-solid')).toHaveCount(seededHorses.length)
  })

  // Line 834. The shaded day's only lesson belongs to the *manager*, so a heatmap narrowed to
  // the lessons this trainer instructs would report 'low' there and this equality would fail on
  // exactly the claim the line makes. The quiet day is the control that keeps 'high' from being
  // true of every cell.
  test('trainer_exertion_shading_counts_another_instructors_lesson_for_the_selected_horse @trainer', async ({ page }) => {
    await openNewLessonForm(page)
    await goToNextMonth(page)
    await selectHorse(page, seededHorses[0])

    await expect
      .poll(() => bandsOn(page, [shadedDay, quietDay]), { timeout: SCHEDULE_FETCH_BUDGET })
      .toEqual({ [shadedDay]: 'high', [quietDay]: 'low' })
  })

  // Line 835. The appointment day carries no lesson at all, so a dot there can only have come
  // from Apple's vet appointment — which is the line's claim, that the dot fires on appointments
  // for a trainer and not only on lessons.
  test('trainer_conflict_dot_fires_on_the_selected_horses_appointment_day @trainer', async ({ page }) => {
    await openNewLessonForm(page)
    await goToNextMonth(page)
    await selectHorse(page, seededHorses[0])

    await expect
      .poll(() => dotsOn(page, [appointmentDay, quietDay]), { timeout: SCHEDULE_FETCH_BUDGET })
      .toEqual({ [appointmentDay]: true, [quietDay]: false })
  })
})

// ---------------------------------------------------------------------------
// Creating lessons, and the row a nearby one writes — lines 831, 847, 851, 852
// ---------------------------------------------------------------------------
//
// `.serial` because these four are one chain: the two lessons of 831 are the baseline 847's
// count is measured against, and 851/852 read a row that only 847's submission can have written.

test.describe.serial('a trainer creating lessons', () => {
  // Line 831. Both halves of the line in one equality. The barn holds two manager-instructed
  // lessons and no trainer-instructed one, and the Lessons list defaults to My Lessons — so
  // "exactly the two just created" is the observable form of "the instructor field is locked to
  // you", and the picker count is the mechanism that locks it.
  test('trainer_creating_two_lessons_files_both_under_the_trainer_as_instructor @trainer', async ({ page }) => {
    const first = await createLesson(page, { day: firstCreatedDay, time: '10:00' })
    await createLesson(page, { day: secondCreatedDay, time: '11:00' })

    expect({
      instructorPickers: first.instructorPickers,
      myLessons: (await visibleLessonIds(page)).length,
    }).toEqual({ instructorPickers: 0, myLessons: 2 })
  })

  // Line 847. `createLesson`'s `waitForURL` is the "no error" half — a rejected submit re-renders
  // the form in place and never navigates — and this is the "the lesson exists" half: the
  // trainer's own list grows from the two above to three.
  test('trainer_can_create_a_lesson_within_the_buffer_of_another_instructors_lesson @trainer', async ({ page }) => {
    await createLesson(page, { day: nearbyDay, time: NEARBY_TIME })

    expect(await visibleLessonIds(page)).toHaveLength(3)
  })

  // Line 851. The recipient is the *other* instructor, so this is a direct row read rather than
  // a UI assertion — the acting trainer's own bell would never show it.
  test('nearby_lesson_writes_a_notification_row_for_the_other_instructor @trainer', async () => {
    const row = await nearbyNotification()

    expect({ userId: row.user_id, type: row.type, link: row.link }).toEqual({
      userId: barn.data.members.manager.userId,
      type: 'instructor_lesson_nearby',
      link: `/barn/${barn.slug}/lessons`,
    })
  })

  // Line 852. The literal is the app's own copy, quoted by the checklist line itself — deriving
  // it from `formatNearbyInstructorNotification` would re-implement the thing under test. The
  // count is 1 rather than an increment because the two lessons of 831 sit on days no other
  // instructor teaches, so 847's submission is the only nearby one this barn ever sees.
  test('that_nearby_notification_titles_a_single_new_lesson @trainer', async () => {
    expect((await nearbyNotification()).title).toBe('1 new lesson scheduled nearby')
  })
})
