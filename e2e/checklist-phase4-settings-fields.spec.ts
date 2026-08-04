// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/new/**
// covers: src/app/barn/[slug]/(protected)/expenses/new/**
// covers: src/app/barn/[slug]/(protected)/horses/[id]/**
//
// Manage Barn's accordion shell and the settings fields themselves
// (PRE_RELEASE_TEST_CHECKLIST.md lines 665-675, 684-695 and 696-701): the eight collapsible
// sections; Default Instructor Cut; Default Board Fee and its non-retroactive promise;
// Horse Exhaustion Thresholds; Schedule Buffer; Barn Timezone — including the proof that the
// stored zone actually drives the past-due check rather than only the display — and the six
// `#1149` items asserting that the barn's calendar day, not the device's, is the frame every
// "today" comparison resolves in.
//
// The five `covers:` lines beyond `settings/**` are not decoration. Six of the 29 items are
// only observable away from the settings page: a barn day is asserted on the dashboard
// heading, the New Lesson month calendar, a horse's document reminder badge, the Add Expense
// form and the Add Lease/Add Boarding form, and the board-fee and timezone items land on
// Agreements and Finances. A change to any of those breaks this file, so it declares them.
//
// Adjacent slices: #1205 owns 676-683 and 713-720, #1252 owns 702-712, #1206/#1240 own
// 721-761. Nothing outside 665-675, 684-695 and 696-701 is touched here.
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import {
  addExpense,
  addHorse,
  addHorseDocument,
  addLeaseCharge,
  addTier,
  updateBarnSettings,
} from './support/fixtures'
import { barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import type { Agreement, Horse } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/**
 * The barn's own zone — `barns.timezone`'s schema default, so a freshly seeded barn already
 * carries it and line 693's "(default Eastern)" is asserted against the real default rather
 * than against something this file arranged.
 */
const EASTERN = 'America/New_York'

/**
 * Hawaii, in both of its two unrelated roles.
 *
 * As a *barn* zone it is the westernmost `BARN_TIMEZONES` offers, which is what makes line
 * 695 work at all — see BARN_TIMEZONE_CHANGE below.
 *
 * As the *device* zone it is line 696's "set your machine's timezone to Hawaii", expressed as
 * `test.use({ timezoneId })` on the barn-day describe. Never a `playwright.config.ts` edit:
 * #1221 owns the runner's `TZ`, and the browser context zone is a per-file override.
 */
const HAWAII = 'Pacific/Honolulu'

// ---------------------------------------------------------------------------
// The barn's calendar day, and the device day pinned one behind it
// ---------------------------------------------------------------------------

/**
 * Calendar-day arithmetic on a "YYYY-MM-DD" string, the same `Date.UTC`-on-the-digits idiom
 * `fixtures.ts:daysFromNow` uses. Deliberately not `local-day.ts:addDays` — the barn-day
 * items below assert values that module helps produce, and an expectation computed by the
 * code under test agrees with any bug in it.
 */
function shiftDay(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * The barn's own calendar day, resolved from the real clock — the same value the *server*
 * computes when it renders any of the six barn-day items, since every one of them is
 * server-rendered from `barnToday(barn.timezone)` (dashboard heading, `LessonForm`'s
 * `todayStr`, `ReminderDueBadge`'s `today`, `ExpenseForm`'s `todayStr`, `AgreementForm`'s
 * `defaultStartDate`).
 *
 * Fixed once at module evaluation, so a run that crosses barn-local midnight mid-file sees a
 * stale day. That window is pre-existing and file-wide across this batch — #1187 accepted the
 * same one rather than forking the clock-pinning decision — and it fails loudly rather than
 * passing wrongly.
 */
const BARN_TODAY = barnToday(EASTERN)

/** One day behind the barn: what the device is pinned to. See DEVICE_INSTANT. */
const DEVICE_DAY = shiftDay(BARN_TODAY, -1)

/**
 * 8pm Hawaii on the day before the barn's — line 696's "after 8pm Hawaii time (by then the
 * barn's own date is already tomorrow)", expressed as an instant.
 *
 * `page.clock.setFixedTime`, never `page.clock.install()`: `install` also fakes the timers
 * React and Next's router run on, whereas `setFixedTime` fakes `Date` alone and leaves them
 * ticking.
 *
 * What the pin is for is worth being precise about, because it is *not* what makes these six
 * tests pass. Every value they assert comes from the server's clock in the barn's zone, so a
 * correct app renders the same answer whatever the browser thinks the time is. The pin is
 * what makes them **discriminate**: it guarantees the device is on a different calendar day
 * from the barn, so an implementation that read the device's clock would render DEVICE_DAY
 * and fail. Without it the two agree roughly eighteen hours in twenty-four and the items are
 * green and worthless for most of the day — which is the exact failure mode #1222 existed to
 * remove.
 */
const DEVICE_INSTANT = wallClockToInstant(`${DEVICE_DAY}T20:00:00`, HAWAII)

/**
 * `local-day.ts:formatCalendarDate`'s output, rebuilt here rather than imported — the
 * dashboard heading is what line 696 asserts, and that helper is half of what produces it.
 * Same in-spec `Intl` mirror `checklist-timezone.spec.ts` already uses for the same reason.
 * UTC-forced because a "YYYY-MM-DD" names a day, not an instant.
 */
function calendarDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

/** `format-date.ts:formatShortDateOnly`'s output, mirrored for the same reason. */
function shortDateLabel(date: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`))
}

// ---------------------------------------------------------------------------
// Seed values and the expectations they pin
// ---------------------------------------------------------------------------

/**
 * Every `AccordionSection` the settings page renders, in render order.
 *
 * Line 669's claim is a *negative* one — there is no "Active Members" section — and an
 * absence assertion is satisfied just as well by a page that rendered no sections at all. So
 * the expectation is this exact list rather than a `not.toContain`: the absence and the seven
 * presences are one equality, and a page rendering nothing reads `[]` and fails.
 */
const SECTION_TITLES = [
  'Default Instructor Cut',
  'Horse Exhaustion Thresholds',
  'Schedule Buffer',
  'Lesson Tiers',
  'Barn Events',
  'Default Board Fee',
  'Barn Timezone',
  'Data Backup',
]

/** `barns` schema defaults, which a freshly seeded barn carries untouched. */
const DEFAULT_INSTRUCTOR_CUT = '25'
const DEFAULT_THRESHOLDS = { moderate: '5', high: '11' }
const DEFAULT_SCHEDULE_BUFFER = '30'

/**
 * Saved values, each chosen to be a value the seed can never produce — the property that
 * makes a mutation restart-proof, and the property that makes a *test* survive a worker
 * restart honestly: if Playwright re-seeds the barn mid-chain, these fail loudly instead of
 * agreeing with the fresh fixture.
 */
const SAVED_INSTRUCTOR_CUT = '42'
const ZERO_INSTRUCTOR_CUT = '0'
const SAVED_THRESHOLDS = { moderate: '3', high: '9' }
const SAVED_SCHEDULE_BUFFER = '45'

/**
 * Line 689's rejected pair. Moderate is above High, not merely equal to it, and **neither
 * number matches either stored value** — that second property is what the paired
 * "stored values unchanged" item below rests on. An earlier draft used `9`/`9`, which shares
 * its High with SAVED_THRESHOLDS: a server action that wrote High before validating would
 * have left `{3, 9}` behind and the unchanged-check would have agreed with it on that field.
 * Off-default on both axes means a partial write of *either* field is caught.
 */
const REJECTED_THRESHOLDS = { moderate: '9', high: '4' }
const THRESHOLD_ERROR = 'Moderate threshold must be less than high threshold'

/**
 * Board fees. Three distinct numbers, none of them `barns.default_board_fee`'s schema default
 * of 1000: the pre-existing agreement's own fee, and the new barn default. Line 686's
 * pre-fill can therefore only read as correct by having actually picked up the save in line
 * 685's test — 1450 is reachable from nowhere else.
 */
const EXISTING_BOARD_FEE = 725
const SAVED_BOARD_FEE = '1450'

const INSTRUCTOR_CUT_HELPER =
  "Changing this doesn't affect past lessons — only new tiers and Custom lessons booked afterward."
const BOARD_FEE_HELPER = 'Applies to new boarding agreements only — existing boarders are unchanged.'

/**
 * Line 694 parks the barn in Hawaii and line 695 brings it back to Eastern, and that order is
 * forced rather than chosen.
 *
 * `getOutstandingExpenses` decides past-due by comparing an expense's wall clock against
 * `instantToLocalWallClock(now, barns.timezone)` — a wall-clock compare *in the barn's zone*.
 * Moving the barn west makes the barn's own clock read earlier, so an expense can only ever
 * *gain* past-due status when the barn moves **east**. Eastern is the easternmost zone the
 * picker offers, so line 695's "it now surfaces" is reachable only by changing the zone *to*
 * Eastern — which means the preceding change has to have gone the other way.
 *
 * It also leaves the barn Eastern for the barn-day block below, which needs exactly that.
 */
const BARN_TIMEZONE_CHANGE = HAWAII

/**
 * Line 695's three planned expenses. Recipients are mutually non-substring, so a `hasText`
 * or `getByText` read can never match two of them — the fixture hazard `members.rider` /
 * `members.rider2` already demonstrates in the shared fixtures.
 *
 * - CONTROL is past-due in both zones: the same-document positive half, present before *and*
 *   after the timezone change, so the "before" read proves the section renders on a page
 *   where DISCRIMINATOR is genuinely absent rather than on a page that rendered nothing.
 * - DISCRIMINATOR is seeded at the barn's Eastern wall clock 30 minutes ago. In Hawaii that
 *   same wall clock is 5.5 hours *ahead* of now, so it is not past-due there; in Eastern it
 *   already is. That is the AC's pre-ratified narrowing of "wait for its due time to pass" —
 *   same invariant, no real-time wait.
 * - FUTURE is past-due in neither, so an Outstanding section rendering everything fails.
 */
const CONTROL_EXPENSE = { recipient: 'Ashford Farrier', expenseType: 'Trim' }
const DISCRIMINATOR_EXPENSE = { recipient: 'Beacon Vet', expenseType: 'Vaccination' }
const FUTURE_EXPENSE = { recipient: 'Cedar Dentist', expenseType: 'Float' }

/**
 * Line 698's two horse documents. `ReminderDueBadge` renders only when
 * `reminder_date <= today`, so a reminder on the barn's own day is due and one on the barn's
 * *next* day is not — and the device, pinned a day behind, calls the first of those
 * "tomorrow", which is precisely the wording of the line.
 *
 * The not-due row is the negative half: without it, "the due row has a badge" is satisfied by
 * a page that badges every document.
 */
const DUE_DOCUMENT = { recordType: 'coggins' as const, fileName: 'coggins-due.pdf' }
const NOT_DUE_DOCUMENT = { recordType: 'shot_record' as const, fileName: 'shots-later.pdf' }

const REMINDER_DUE_BADGE = 'Reminder Due'

let horse: Horse
let boardingAgreement: Agreement
/**
 * The `expense_date` each seeded appointment actually landed on, taken from the builder's own
 * return value rather than recomputed at assertion time.
 *
 * Recomputing `instantToLocalWallClock(Date.now() - 7d, EASTERN)` in the test agrees with the
 * seed only while both fall on the same side of an Eastern midnight — so a run that straddles
 * one reads a date the row does not have. Reading the builder's answer removes the window
 * entirely, and is what this batch means by "expected values come from builder return values".
 */
let controlExpenseDate: string
let discriminatorExpenseDate: string

const barn = withBarn('settings-fields', async ({ supabase, barn: seededBarn, members }) => {
  // The barn's settings are deliberately left at their schema defaults: lines 670, 687, 691
  // and 693 all assert those defaults, so seeding over them would make the checklist's own
  // parenthetical unverifiable.

  horse = await addHorse(supabase, seededBarn.id, 'Juniper')

  // /lessons/new is read once (line 697); a tier keeps the form in its populated shape rather
  // than whatever a tierless barn renders.
  await addTier(supabase, seededBarn.id, { name: 'Standard', price: 80, isDefault: true })

  boardingAgreement = await addLeaseCharge(supabase, seededBarn, {
    monthsAgo: 1,
    kind: 'board',
    riderId: members.rider2.membershipId,
    horseId: horse.id,
    fee: EXISTING_BOARD_FEE,
  })

  // Line 695's three expenses. `addExpense` derives `expense_date` from `at` in the seeded
  // barn's own zone — Eastern, the value captured at createBarn — which is the frame these
  // wall clocks are reasoned in above.
  const halfAnHourAgo = new Date(Date.now() - 30 * 60 * 1000)
  const aWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const aWeekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  controlExpenseDate = (
    await addExpense(supabase, seededBarn, { ...CONTROL_EXPENSE, at: aWeekAgo, time: '12:00' })
  ).expense_date
  discriminatorExpenseDate = (
    await addExpense(supabase, seededBarn, {
      ...DISCRIMINATOR_EXPENSE,
      at: halfAnHourAgo,
      time: instantToLocalWallClock(halfAnHourAgo, EASTERN).slice(11, 16),
    })
  ).expense_date
  await addExpense(supabase, seededBarn, { ...FUTURE_EXPENSE, at: aWeekAhead, time: '12:00' })

  await addHorseDocument(supabase, seededBarn, horse.id, {
    ...DUE_DOCUMENT,
    reminderDate: BARN_TODAY,
  })
  await addHorseDocument(supabase, seededBarn, horse.id, {
    ...NOT_DUE_DOCUMENT,
    reminderDate: shiftDay(BARN_TODAY, 1),
  })
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function settingsUrl() {
  return `/barn/${barn.slug}/settings`
}

/** One `AccordionSection`'s `<details>`, identified by the `<h2>` in its `<summary>`. */
function section(page: Page, title: string) {
  return page
    .locator('details')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
}

/**
 * Every section's title and open state, in render order.
 *
 * `evaluateAll` rather than one of `read.ts`'s settled helpers, and that is forced rather than
 * preferred: every one of these sections is closed on load, so its contents are never
 * *visible*, and a settled read's visibility guard can only time out on them. (Found by
 * #1205 on `<option>` inside a collapsed `<select>`; a closed `<details>` is the same shape.)
 *
 * The title is read alongside the flag deliberately. "Eight things are closed" says nothing
 * about *which* eight, and a page that rendered no sections at all would satisfy any
 * all-closed claim by producing nothing.
 */
async function sectionStates(page: Page): Promise<[string | undefined, boolean][]> {
  const details = page.locator('main details')
  await details.first().waitFor()
  return details.evaluateAll((els) =>
    els.map((el): [string | undefined, boolean] => [
      el.querySelector('summary h2')?.textContent ?? undefined,
      (el as HTMLDetailsElement).open,
    ])
  )
}

/**
 * Loads Manage Barn and opens one section, returning it.
 *
 * The `waitFor` is a precondition that throws, not an assertion: a `<summary>` click is the
 * only thing standing between a form and being unreachable, and content inside a closed
 * `<details>` is never visible — so waiting for the section's own Save button to become
 * visible is a genuine proof that the section opened, in the same document, before anything
 * reads it.
 */
async function openSection(page: Page, title: string): Promise<Locator> {
  await page.goto(settingsUrl())
  const sec = section(page, title)
  await sec.locator('summary').click()
  await sec.getByRole('button', { name: 'Save', exact: true }).waitFor()
  return sec
}

/**
 * Submits one section's form and waits for the server action to answer.
 *
 * The wait is on the action's own POST response, not on `waitForURL`. Every settings action
 * redirects to `/barn/[slug]/settings` — the URL the form is already on — so a `waitForURL`
 * for it resolves on its first poll whether or not anything happened, which is #1202's
 * tautological-wait finding in its purest form. The POST response is the one signal that
 * distinguishes "the action ran" from "nothing happened yet", and it is what makes the
 * reload-and-read on the far side of every persistence item a real read.
 *
 * No explicit timeout: `actionTimeout: 0` makes every `waitFor*` unbounded, so passing one
 * would tighten the budget rather than loosen it.
 *
 * focus()+Enter rather than a raw pointer click, per #501/`04c64505`.
 */
async function saveSection(page: Page, sec: Locator): Promise<void> {
  const submitted = page.waitForResponse((response) => response.request().method() === 'POST')
  await sec.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  await submitted
}

/** A settings input, reached through its own section so the section is open first. */
async function openField(page: Page, title: string, selector: string): Promise<Locator> {
  const sec = await openSection(page, title)
  return sec.locator(selector)
}

// ---------------------------------------------------------------------------
// Accordions — checklist lines 665-669
// ---------------------------------------------------------------------------

test.describe('Manage Barn — accordions', () => {
  test('settings_sections_all_render_collapsed_on_page_load @manager', async ({ page }) => {
    await page.goto(settingsUrl())

    // Titles and flags together, as an exact array: both halves of line 665's claim ("render
    // as collapsible accordions" and "all collapsed") in one equality.
    expect(await sectionStates(page)).toEqual(SECTION_TITLES.map((title) => [title, false]))
  })

  test('clicking_a_section_heading_opens_that_section @manager', async ({ page }) => {
    await page.goto(settingsUrl())
    const sec = section(page, 'Schedule Buffer')
    await sec.locator('summary').click()

    await expect(sec).toHaveJSProperty('open', true)
  })

  test('clicking_an_open_section_heading_closes_it @manager', async ({ page }) => {
    // openSection's visible-Save wait is what makes the assertion below a transition rather
    // than a restatement of the pre-state: closed is the state the page loads in, so
    // `open === false` is satisfied by a section that never opened at all.
    const sec = await openSection(page, 'Schedule Buffer')
    await sec.locator('summary').click()

    await expect(sec).toHaveJSProperty('open', false)
  })

  test('opening_a_second_section_leaves_the_first_open @manager', async ({ page }) => {
    await openSection(page, 'Schedule Buffer')
    const second = section(page, 'Barn Timezone')
    await second.locator('summary').click()
    await second.getByRole('button', { name: 'Save', exact: true }).waitFor()

    // The whole eight-section state, not just the first one: line 668 claims the *other*
    // sections are unchanged, and asserting only that Schedule Buffer stayed open would pass
    // on a page that had opened all eight.
    expect(await sectionStates(page)).toEqual(
      SECTION_TITLES.map((title) => [title, title === 'Schedule Buffer' || title === 'Barn Timezone'])
    )
  })

  test('settings_page_has_no_active_members_section @manager', async ({ page }) => {
    await page.goto(settingsUrl())

    // Exact equality, so "there is no Active Members section" is checked against the sections
    // that *are* there — see SECTION_TITLES.
    expect((await sectionStates(page)).map(([title]) => title)).toEqual(SECTION_TITLES)
  })
})

// ---------------------------------------------------------------------------
// Default Instructor Cut — checklist lines 670-675
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Default Instructor Cut', () => {
  const FIELD = '#instructor_cut'

  test('instructor_cut_field_shows_the_barns_current_value @manager', async ({ page }) => {
    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      DEFAULT_INSTRUCTOR_CUT
    )
  })

  test('saving_a_new_instructor_cut_persists_it_across_a_reload @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')
    await sec.locator(FIELD).fill(SAVED_INSTRUCTOR_CUT)
    await saveSection(page, sec)

    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      SAVED_INSTRUCTOR_CUT
    )
  })

  test('instructor_cut_helper_text_says_past_lessons_are_unaffected @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')

    // Exact text, which is the whole of line 672's claim: it is not "some helper text exists"
    // but "it says the change doesn't affect past lessons, *not* that it recalculates
    // historical income". Equality is what rules the second reading out.
    await expect(sec.locator('p')).toHaveText(INSTRUCTOR_CUT_HELPER)
  })

  test('instructor_cut_accepts_zero @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')
    await sec.locator(FIELD).fill(ZERO_INSTRUCTOR_CUT)
    await saveSection(page, sec)

    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      ZERO_INSTRUCTOR_CUT
    )
  })

  test('blank_instructor_cut_is_rejected_by_the_field @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')
    await sec.locator(FIELD).fill('')
    await sec.getByRole('button', { name: 'Save', exact: true }).click()

    // The rejection is the browser's own constraint validation — the input is `required`, so
    // no request is made at all. Reading the validity state is therefore reading the actual
    // mechanism rather than a proxy for it, and it is falsifiable: drop `required` and both
    // halves flip. The paired item below is what checks nothing was stored.
    expect(
      await sec.locator(FIELD).evaluate((el) => {
        const input = el as HTMLInputElement
        return { valueMissing: input.validity.valueMissing, hasMessage: input.validationMessage !== '' }
      })
    ).toEqual({ valueMissing: true, hasMessage: true })
  })

  test('a_rejected_blank_instructor_cut_leaves_the_stored_value_unchanged @manager', async ({
    page,
  }) => {
    // `0`, from the accepts-zero item above — a value the seed can never produce, so a worker
    // restart between the two makes this fail against the re-seeded `25` rather than agreeing
    // with it.
    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      ZERO_INSTRUCTOR_CUT
    )
  })
})

// ---------------------------------------------------------------------------
// Default Board Fee — checklist lines 684-686
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Default Board Fee', () => {
  const FIELD = '#default_board_fee'

  test('board_fee_helper_text_says_existing_boarders_are_unchanged @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Board Fee')

    await expect(sec.locator('p')).toHaveText(BOARD_FEE_HELPER)
  })

  test('changing_the_default_board_fee_leaves_an_existing_boarding_agreement_unchanged @manager', async ({
    page,
  }) => {
    const sec = await openSection(page, 'Default Board Fee')
    await sec.locator(FIELD).fill(SAVED_BOARD_FEE)
    await saveSection(page, sec)

    await page.goto(`/barn/${barn.slug}/agreements/${boardingAgreement.id}`)
    const feeBlock = page
      .locator('dl > div')
      .filter({ has: page.getByText('Fee', { exact: true }) })

    // The seeded fee, from the builder's own input rather than a literal — and distinct from
    // both the schema default and the new default, so "unchanged" cannot be satisfied by any
    // of the three values in play collapsing onto each other.
    await expect(feeBlock.locator('dd')).toHaveText(`$${EXISTING_BOARD_FEE}.00`)
  })

  test('a_new_boarding_agreement_prefills_the_changed_default_board_fee @manager', async ({
    page,
  }) => {
    await page.goto(`/barn/${barn.slug}/agreements/new?kind=board`)

    // 1450 is reachable from nowhere but the save in the item above: it is neither
    // `default_board_fee`'s schema default (1000) nor the seeded agreement's own fee (725).
    await expect(page.locator('#agreement-fee')).toHaveValue(SAVED_BOARD_FEE)
  })
})

// ---------------------------------------------------------------------------
// Horse Exhaustion Thresholds — checklist lines 687-690
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Horse Exhaustion Thresholds', () => {
  const MODERATE = '#exhaustion-moderate'
  const HIGH = '#exhaustion-high'

  async function thresholdValues(page: Page) {
    const sec = await openSection(page, 'Horse Exhaustion Thresholds')
    return {
      moderate: await sec.locator(MODERATE).inputValue(),
      high: await sec.locator(HIGH).inputValue(),
    }
  }

  test('exhaustion_threshold_fields_show_the_barns_current_values @manager', async ({ page }) => {
    // Both fields in one equality — line 687 names them as a pair, and reading only one would
    // pass on a form that rendered the same value into both.
    expect(await thresholdValues(page)).toEqual(DEFAULT_THRESHOLDS)
  })

  test('saving_new_exhaustion_thresholds_persists_them_across_a_reload @manager', async ({
    page,
  }) => {
    const sec = await openSection(page, 'Horse Exhaustion Thresholds')
    await sec.locator(MODERATE).fill(SAVED_THRESHOLDS.moderate)
    await sec.locator(HIGH).fill(SAVED_THRESHOLDS.high)
    await saveSection(page, sec)

    expect(await thresholdValues(page)).toEqual(SAVED_THRESHOLDS)
  })

  test('a_moderate_threshold_at_or_above_high_is_rejected_with_a_field_error @manager', async ({
    page,
  }) => {
    const sec = await openSection(page, 'Horse Exhaustion Thresholds')
    await sec.locator(MODERATE).fill(REJECTED_THRESHOLDS.moderate)
    await sec.locator(HIGH).fill(REJECTED_THRESHOLDS.high)
    await saveSection(page, sec)

    // Unlike the blank instructor cut above, this rejection is the server action's — the
    // inputs are individually valid and only their relation is not — so the observable is the
    // `role="alert"` the form renders from the returned error, asserted by equality rather
    // than containment so a different validation message cannot satisfy it.
    await expect(sec.getByRole('alert')).toHaveText(THRESHOLD_ERROR)
  })

  test('a_rejected_threshold_save_leaves_the_stored_values_unchanged @manager', async ({ page }) => {
    expect(await thresholdValues(page)).toEqual(SAVED_THRESHOLDS)
  })
})

// ---------------------------------------------------------------------------
// Schedule Buffer — checklist lines 691-692
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Schedule Buffer', () => {
  const FIELD = '#schedule_buffer_minutes'

  test('schedule_buffer_field_shows_the_barns_current_value @manager', async ({ page }) => {
    await expect(await openField(page, 'Schedule Buffer', FIELD)).toHaveValue(
      DEFAULT_SCHEDULE_BUFFER
    )
  })

  test('saving_a_new_schedule_buffer_persists_it_across_a_reload @manager', async ({ page }) => {
    const sec = await openSection(page, 'Schedule Buffer')
    await sec.locator(FIELD).fill(SAVED_SCHEDULE_BUFFER)
    await saveSection(page, sec)

    await expect(await openField(page, 'Schedule Buffer', FIELD)).toHaveValue(
      SAVED_SCHEDULE_BUFFER
    )
  })
})

// ---------------------------------------------------------------------------
// Barn Timezone — checklist lines 693-695
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Barn Timezone', () => {
  const FIELD = '#timezone'

  /** Every Outstanding Expenses entry, in render order. */
  function outstandingExpenses(page: Page) {
    return page
      .locator('section')
      .filter({ hasText: 'Outstanding Expenses' })
      .locator('ul li a')
  }

  function expenseEntry(date: string, expense: { recipient: string; expenseType: string }) {
    return `${shortDateLabel(date)} — ${expense.recipient} — ${expense.expenseType}`
  }

  test('barn_timezone_select_shows_the_barns_current_zone @manager', async ({ page }) => {
    await expect(await openField(page, 'Barn Timezone', FIELD)).toHaveValue(EASTERN)
  })

  test('saving_a_new_barn_timezone_persists_it_across_a_reload @manager', async ({ page }) => {
    const sec = await openSection(page, 'Barn Timezone')
    await sec.locator(FIELD).selectOption(BARN_TIMEZONE_CHANGE)
    await saveSection(page, sec)

    await expect(await openField(page, 'Barn Timezone', FIELD)).toHaveValue(BARN_TIMEZONE_CHANGE)
  })

  test('changing_the_barn_timezone_moves_a_newly_past_due_expense_into_outstanding_expenses @manager', async ({
    page,
  }) => {
    const controlEntry = expenseEntry(controlExpenseDate, CONTROL_EXPENSE)
    const discriminatorEntry = expenseEntry(discriminatorExpenseDate, DISCRIMINATOR_EXPENSE)

    // Precondition, not an assertion: with the barn still in Hawaii the discriminator's wall
    // clock is 5.5 hours in that zone's future, so only the control is past due. This is the
    // same-document positive control the batch's absence rule requires — it proves the
    // section rendered on a page where the discriminator is genuinely missing, which a bare
    // "the discriminator is absent" read cannot distinguish from a page that rendered nothing.
    await page.goto(`/barn/${barn.slug}/finances`)
    await expect(outstandingExpenses(page)).toHaveText([controlEntry])

    const sec = await openSection(page, 'Barn Timezone')
    await sec.locator(FIELD).selectOption(EASTERN)
    await saveSection(page, sec)

    // Exact array: the discriminator has appeared, the control is still there, and the
    // week-ahead expense is still absent. A section rendering everything fails on the third.
    await page.goto(`/barn/${barn.slug}/finances`)
    await expect(outstandingExpenses(page)).toHaveText([controlEntry, discriminatorEntry])
  })
})

// ---------------------------------------------------------------------------
// The barn's day versus the device's — checklist lines 696-701 (#1149)
// ---------------------------------------------------------------------------

test.describe('Manage Barn — barn day versus device day', () => {
  // Line 696's "set your *machine's* timezone to Hawaii". A describe-scoped override, so the
  // other 23 items stay in the runner's pinned zone (#1221), and never a
  // `playwright.config.ts` edit.
  test.use({ timezoneId: HAWAII })

  // WHAT THESE SIX DO NOT COVER, measured rather than assumed. There are three zones in play,
  // not two: the barn's, the device's, and the *host the dev server runs on*. The pin below
  // separates the barn from the device, which is the axis these checklist lines are about. It
  // does nothing about the third — and line 696 fixes the barn to Eastern, so on a host that
  // is itself in Eastern (the developer machine this was written on: `America/New_York`) the
  // barn's day and the host's day are equal by construction, and a regression that read the
  // host's clock instead of `barns.timezone` would pass every one of these. #1224's own note
  // in `ExpenseForm` records that the thing it replaced *was* the server host's UTC day, so
  // that regression is not hypothetical. Not fixable inside these six without contradicting
  // line 696's "set Barn Timezone to Eastern"; logged as a follow-up instead.

  // Line 696's "set Barn Timezone to Eastern", done as a write to this file's own barn rather
  // than through the UI: the settings-page path is already covered by the timezone items
  // above, and doing it here makes the block independent of whether they ran — a worker
  // restart mid-chain up there would otherwise leave the barn in Hawaii and quietly invert
  // every claim below.
  test.beforeAll(async () => {
    await updateBarnSettings(barn.data.supabase, barn.data.barn.id, { timezone: EASTERN })
  })

  // See DEVICE_INSTANT: this is the device half of "the barn's date is already tomorrow", and
  // it is what makes each of these six discriminate rather than merely pass.
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(DEVICE_INSTANT)
  })

  /**
   * One day cell of a `MonthCalendarPicker` grid, by its own "YYYY-MM-DD" accessible name.
   *
   * The grid opens on the barn's current month, and DEVICE_DAY is the day before it — which
   * falls outside that grid in exactly one case: the barn's day is the 1st *and* that 1st is
   * a Sunday, leaving no leading spill-over cells. Rare, but it would be a real failure on a
   * real day, so it pages back rather than being left as a latent flake. The BARN_TODAY wait
   * is the grid-rendered guard: that cell is always in its own month's grid.
   */
  async function dayCell(page: Page, date: string): Promise<Locator> {
    await page.getByRole('button', { name: BARN_TODAY, exact: true }).waitFor()
    const cell = page.getByRole('button', { name: date, exact: true })
    if ((await cell.count()) === 0) {
      await page.getByRole('button', { name: 'Previous month', exact: true }).click()
      await cell.waitFor()
    }
    return cell
  }

  test('dashboard_heading_names_the_barns_day_not_the_devices @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)

    // Scoped through the day pager's own `aria-label`s rather than by heading index: the page
    // carries three `<h2>`s and only this one is the date. The expected string is built from
    // BARN_TODAY, which the device is pinned a full day behind — so an implementation reading
    // the device's clock renders DEVICE_DAY here and fails.
    await expect(page.locator('div:has(> a[aria-label="Previous day"]) h2')).toHaveText(
      `${calendarDateLabel(BARN_TODAY)} · Today`
    )
  })

  test('new_lesson_calendar_greys_out_the_devices_day_as_past @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    const deviceCell = await dayCell(page, DEVICE_DAY)
    const barnCell = page.getByRole('button', { name: BARN_TODAY, exact: true })

    // Both halves in one equality. "The device's day is greyed" alone is satisfied by a
    // calendar that greys every day; pairing it with the barn's own day being live is what
    // pins the cutoff to exactly the barn's date.
    expect({
      deviceDay: await deviceCell.getAttribute('data-past'),
      barnDay: await barnCell.getAttribute('data-past'),
    }).toEqual({ deviceDay: 'true', barnDay: 'false' })
  })

  test('a_document_due_on_the_barns_day_shows_the_reminder_due_badge @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/horses/${horse.id}`)

    const rowFor = (fileName: string) =>
      page.locator('tbody tr').filter({ has: page.getByRole('link', { name: fileName, exact: true }) })
    const dueRow = rowFor(DUE_DOCUMENT.fileName)
    const notDueRow = rowFor(NOT_DUE_DOCUMENT.fileName)
    // Preconditions that throw: `count()` does not auto-wait, so an unrendered table would
    // otherwise read 0 badges on both rows and satisfy half the expectation for free.
    await dueRow.waitFor()
    await notDueRow.waitFor()

    // The barn calls the due document's reminder date *today*; the device, a day behind,
    // calls it tomorrow — so a device-framed comparison renders no badge and fails. The
    // not-due row is the negative half, ruling out a page that badges every document.
    expect({
      due: await dueRow.getByText(REMINDER_DUE_BADGE, { exact: true }).count(),
      notDue: await notDueRow.getByText(REMINDER_DUE_BADGE, { exact: true }).count(),
    }).toEqual({ due: 1, notDue: 0 })
  })

  test('add_expense_hides_the_time_field_for_the_devices_already_past_day @manager', async ({
    page,
  }) => {
    await page.goto(`/barn/${barn.slug}/expenses/new`)
    const deviceCell = await dayCell(page, DEVICE_DAY)
    // The form opens on the barn's own day, which is not past — so the Time field is showing
    // before anything is clicked. Read first, then flip.
    const atBarnDay = await page.locator('#expense-time').count()

    await deviceCell.click()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    // A positive signal for the branch flip, rather than waiting for the visible field to
    // disappear — waiting for the disappearance would be the assertion doing its own work.
    // The past branch replaces the labelled input with a hidden one of the same name.
    await page.locator('input[type="hidden"][name="expense_time"]').waitFor({ state: 'attached' })
    const atDeviceDay = await page.locator('#expense-time').count()

    expect({ atBarnDay, atDeviceDay }).toEqual({ atBarnDay: 1, atDeviceDay: 0 })
  })

  test('add_expense_date_prefills_the_barns_day @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/expenses/new`)

    // The month calendar posts through a hidden input; that is the form's actual Date value.
    await expect(page.locator('input[name="expense_date"]')).toHaveValue(BARN_TODAY)
  })

  test('add_boarding_start_date_prefills_the_barns_day @manager', async ({ page }) => {
    const startDateFor = async (kind: string) => {
      await page.goto(`/barn/${barn.slug}/agreements/new?kind=${kind}`)
      const field = page.locator('#agreement-start-date')
      await field.waitFor()
      return field.inputValue()
    }

    // Line 701 names both forms, and they are one component reached by two `kind` values — so
    // one test, and one equality covering both rather than an assertion that only one of the
    // two entry points was checked.
    expect({ lease: await startDateFor('lease'), board: await startDateFor('board') }).toEqual({
      lease: BARN_TODAY,
      board: BARN_TODAY,
    })
  })
})
