// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/horses/[id]/**
// covers: src/components/calendar/**
// covers: src/components/documents/**
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
//
// NavigationBlocker.tsx is declared because the two nav-guard tests at the bottom assert its
// dialog and BlockingLink behavior from a guarded settings form (#1362) — reached by import
// from the (protected) layout, so no route glob above covers it.
//
// The last two are shared components, not routes, and they are declared because this spec
// asserts on their markup directly: `MonthCalendarPicker` supplies the `aria-label`ed day
// cells and the `data-past` attribute the greying item reads (and the day the Time-field item
// clicks), and `ReminderDueBadge` supplies the badge text the reminder item counts. #1281 put
// the whole of `src/components/**` into `select-specs.sh`'s ALWAYS_FULL, so both lines now
// document what this spec drives rather than select it; they stay because that membership is not
// permanent and the accuracy rule binds either way (docs/scripts.md). Before #1281 only
// `src/components/ui/**` and `src/lib/**` were always-full, so a change to either component
// selected nothing and this spec never ran for it — and `--lint` cannot catch that: it proves a
// glob is well-formed and matches something, never that a module the spec drives has a glob.
//
// The lessons/ and expenses/ globs are deliberately the whole subtree rather than `new/**`.
// A `/**` glob is a literal string PREFIX (docs/scripts.md), and the components these tests
// actually assert on — `lessons/LessonForm.tsx`'s month calendar and `expenses/ExpenseForm.tsx`'s
// date prefill and past-date Time branch — sit one level ABOVE `new/`. Declaring `new/**` still
// passes `select-specs.sh --lint`, because it matches `new/page.tsx`; it just silently fails to
// select this spec when the form components themselves change, which is the case that matters.
//
// Manage Barn's accordion shell and the settings fields themselves
// (checklists/pre-release/phase-4-manager-verification.md — the accordions-and-Instructor-Cut
// block, the Board Fee through Barn Timezone block, and the #1149 barn-day block): the eight collapsible
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
// Adjacent slices: #1205 owns the tier and Barn Events blocks, #1252 the barn-local instant items,
// #1206/#1240 own the Data Backup block. Nothing outside the accordions, settings-fields and #1149
// barn-day blocks is touched here.
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
import { hydrateByDriving } from './support/hydration'
// Aliased: this file already has a settings-page `openSection` that navigates to `settingsUrl()`
// first. The shared helper is the horse detail page's, which is already loaded when it is called.
import { openSection as openAccordionSection } from './support/accordion'
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import type { Agreement, Horse } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Zones
// ---------------------------------------------------------------------------

/**
 * The barn's own zone — `barns.timezone`'s schema default, so a freshly seeded barn already
 * carries it and the "**Barn Timezone** select shows the current value (default Eastern)" line
 * is asserted against the real default rather
 * than against something this file arranged.
 */
const EASTERN = 'America/New_York'

/**
 * Hawaii, in both of its two unrelated roles.
 *
 * As a *barn* zone it is the westernmost `BARN_TIMEZONES` offers, which is what makes the
 * "With the timezone changed above" line work at all — see BARN_TIMEZONE_CHANGE below.
 *
 * As the *device* zone it is the #1149 setup line's "set your *machine's* timezone to Hawaii",
 * expressed as `test.use({ timezoneId })` on the barn-day describe. Never a `playwright.config.ts`
 * edit: #1221 owns the runner's `TZ`, and the browser context zone is a per-file override.
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
 * `barn-timezone.ts:barnToday`'s answer, computed here rather than imported.
 *
 * That module is not a neutral utility to this file — it is the code under test. All six
 * barn-day items are server-rendered from `barnToday(barn.timezone)`, so importing it to build
 * the expected value would make every one of them agree with any bug in it, in both
 * directions, and the reminder-badge seed below would move with it too. Same reason `shiftDay`
 * above refuses `local-day.ts:addDays`; this is the helper that carries the more weight of the
 * two, so it gets the same treatment. Mirrors `barnToday`'s `en-CA` 2-digit shape, which is
 * what yields "YYYY-MM-DD".
 */
function barnDay(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

/**
 * The barn's own calendar day, resolved from the real clock — the same value the *server*
 * computes when it renders any of the six barn-day items (dashboard heading, `LessonForm`'s
 * `todayStr`, `ReminderDueBadge`'s `today`, `ExpenseForm`'s `todayStr`, `AgreementForm`'s
 * `defaultStartDate`).
 *
 * Fixed once at module evaluation, so a run that crosses barn-local midnight mid-file sees a
 * stale day. That window is pre-existing and file-wide across this batch — #1187 accepted the
 * same one rather than forking the clock-pinning decision — and it fails loudly rather than
 * passing wrongly.
 */
const BARN_TODAY = barnDay(new Date(), EASTERN)

/** One day behind the barn: what the device is pinned to. See DEVICE_INSTANT. */
const DEVICE_DAY = shiftDay(BARN_TODAY, -1)

/**
 * The instant the device's clock is pinned to: 1pm Hawaii on the day before the barn's.
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
 *
 * **1pm and not the 8pm the #1149 setup line names, and the difference is load-bearing.** Hawaii is
 * UTC−10 with no DST, so any Hawaii evening is already the *next* UTC day: 8pm on DEVICE_DAY is
 * 06:00 UTC on BARN_TODAY, and the browser's UTC calendar day would then equal the very value all
 * six tests assert. A `new Date().toISOString().slice(0, 10)` implementation would render the right
 * answer for the wrong reason and every one of these would stay green — and per the note on the
 * describe below, the server host's UTC day is precisely the regression #1224 already shipped once.
 * 1pm keeps Hawaii *and* UTC on DEVICE_DAY (23:00 UTC), so the pin separates the barn's day from
 * the device's zone and from UTC together. 8pm is the manual recipe for producing the
 * barn-ahead-of-device relationship by hand; pinning constructs that relationship directly, and is
 * free to pick the hour that also closes the UTC axis.
 */
const DEVICE_INSTANT = wallClockToInstant(`${DEVICE_DAY}T13:00:00`, HAWAII)

/**
 * `local-day.ts:formatCalendarDate`'s output, rebuilt here rather than imported — the dashboard
 * heading is what the #1149 setup line asserts, and that helper is half of what produces it. Same
 * in-spec `Intl` mirror `checklist-timezone.spec.ts` already uses for the same reason. UTC-forced
 * because a "YYYY-MM-DD" names a day, not an instant.
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
 * The "There is no \"Active Members\" section" claim is a *negative* one, and an
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
 * The "Try setting Moderate ≥ High → rejected with a field error" pair, and **neither number
 * matches either stored value** — that property
 * is what the paired "stored values unchanged" item below rests on. The first draft used
 * `9`/`9`, which shares its High with SAVED_THRESHOLDS: a server action that wrote High before
 * validating would have left `{3, 9}` behind and the unchanged-check would have agreed with it
 * on that field. Off-default on both axes means a partial write of *either* field is caught.
 *
 * `7`/`7` rather than a strictly-greater pair, which was the draft after that one. The line says
 * Moderate **≥** High and `actions.ts` implements `moderate >= high`, so the equality case is
 * exactly where an off-by-one between `>` and `>=` would live — a strictly-greater pair leaves
 * that regression uncaught. Nothing is given up to get it: 7 collides with neither field of
 * `{3, 9}`, so the partial-write property above still holds. (`checklist-phase4-horses-detail`
 * picks the boundary on the per-horse form for the same reason.)
 */
const REJECTED_THRESHOLDS = { moderate: '7', high: '7' }
const THRESHOLD_ERROR = 'Moderate threshold must be less than high threshold'

/**
 * Board fees. Three distinct numbers, none of them `barns.default_board_fee`'s schema default
 * of 1000: the pre-existing agreement's own fee, and the new barn default. The "newly created
 * boarding agreement pre-fills the new fee" line's
 * pre-fill can therefore only read as correct by having actually picked up the save in the
 * "Edit **Default Board Fee** and Save" test — 1450 is reachable from nowhere else.
 */
const EXISTING_BOARD_FEE = 725
const SAVED_BOARD_FEE = '1450'

const INSTRUCTOR_CUT_HELPER =
  "Changing this doesn't affect past lessons — only new tiers and Custom lessons booked afterward."
const BOARD_FEE_HELPER = 'Applies to new boarding agreements only — existing boarders are unchanged.'

/**
 * The "Change it and Save → it persists on reload" line parks the barn in Hawaii and the
 * "With the timezone changed above" line brings it back to Eastern, and that order is
 * forced rather than chosen.
 *
 * `getOutstandingExpenses` decides past-due by comparing an expense's wall clock against
 * `instantToLocalWallClock(now, barns.timezone)` — a wall-clock compare *in the barn's zone*.
 * Moving the barn west makes the barn's own clock read earlier, so an expense can only ever
 * *gain* past-due status when the barn moves **east**. Eastern is the easternmost zone the
 * picker offers, so that line's "it now surfaces" is reachable only by changing the zone *to*
 * Eastern — which means the preceding change has to have gone the other way.
 *
 * It also leaves the barn Eastern for the barn-day block below, which needs exactly that.
 */
const BARN_TIMEZONE_CHANGE = HAWAII

/**
 * The "add a planned expense" line's three planned expenses. Recipients are mutually
 * non-substring, so a `hasText`
 * or `getByText` read can never match two of them.
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
 * The "horse document whose Reminder Date is *tomorrow*" line's two horse documents.
 * `ReminderDueBadge` renders only when
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
  // The barn's settings are deliberately left at their schema defaults: the Instructor Cut,
  // Exhaustion Thresholds, Schedule Buffer and **Barn Timezone** "shows the current value" lines
  // all assert those defaults, so seeding over them would make the checklist's own
  // parenthetical unverifiable.

  horse = await addHorse(supabase, seededBarn.id, 'Juniper')

  // /lessons/new is read once (for the "month calendar greys out your machine's own current
  // date" line); a tier keeps the form in its populated shape rather
  // than whatever a tierless barn renders.
  await addTier(supabase, seededBarn.id, { name: 'Standard', price: 80, isDefault: true })

  boardingAgreement = await addLeaseCharge(supabase, seededBarn, {
    monthsAgo: 1,
    kind: 'board',
    riderId: members.rider2.membershipId,
    horseId: horse.id,
    fee: EXISTING_BOARD_FEE,
  })

  // The "add a planned expense" line's three expenses. `addExpense` derives `expense_date` from
  // `at` in the seeded barn's own zone — Eastern, the value captured at createBarn — which is the
  // frame these wall clocks are reasoned in above.
  const halfAnHourAgo = new Date(Date.now() - 30 * 60 * 1000)
  const aWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
  const aWeekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  // Seeded discriminator-first, deliberately against the order the assertion expects.
  // `getOutstandingExpenses` sorts ascending by wall clock, which would put the week-old
  // control first anyway — but if insertion order and sort order agreed, the assertion would
  // pass just as happily with that `.sort()` deleted. Seeding them the other way round makes
  // the rendered order a property of the sort rather than of the seed.
  discriminatorExpenseDate = (
    await addExpense(supabase, seededBarn, {
      ...DISCRIMINATOR_EXPENSE,
      at: halfAnHourAgo,
      time: instantToLocalWallClock(halfAnHourAgo, EASTERN).slice(11, 16),
    })
  ).expense_date
  controlExpenseDate = (
    await addExpense(supabase, seededBarn, { ...CONTROL_EXPENSE, at: aWeekAgo, time: '12:00' })
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
  await sectionHeading(page, sec, title).click()
  await sec.getByRole('button', { name: 'Save', exact: true }).waitFor()
  return sec
}

/**
 * The `<h2>` inside a section's `<summary>` — the thing the open/close lines name ("clicking a
 * section's *heading*"). Clicking the heading rather than its `<summary>` parent is what the
 * lines actually describe; the click bubbles and activates the `<details>` identically.
 */
function sectionHeading(page: Page, sec: Locator, title: string) {
  return sec.getByRole('heading', { name: title, exact: true })
}

/**
 * Submits one section's form and waits for the server action to answer.
 *
 * The wait is on the action's own POST response, not on `waitForURL`. Since #1417 each settings
 * action redirects to `/barn/[slug]/settings?saved=<slug>`, so a `waitForURL` for it is no longer
 * strictly tautological — but it is still the wrong signal here: this helper is called from every
 * section, so it would need the caller's slug threaded through it to say anything, and #1202's
 * finding is that a wait which can resolve against the pre-state buys nothing. The POST response
 * is the one signal that distinguishes "the action ran" from "nothing happened yet", and it is
 * what makes the reload-and-read on the far side of every persistence item a real read.
 *
 * No explicit timeout: `actionTimeout: 0` makes every `waitFor*` unbounded, so passing one
 * would tighten the budget rather than loosen it.
 *
 * focus()+Enter rather than a raw pointer click, per #501/`04c64505`.
 */
async function saveSection(page: Page, sec: Locator): Promise<void> {
  // Narrowed to a non-failing POST to the settings route itself. A bare
  // `method() === 'POST'` predicate is satisfied by any POST at all, including a 500 — so a
  // save that blew up would still be "waited for", and a test whose expected value happens to
  // equal the pre-state (the two "unchanged" items) would sail through it.
  //
  // `status() < 400` rather than `ok()`: these actions end in `redirect()`, and Playwright's
  // `ok()` is 200-299, so requiring it waits for a response that never arrives. Measured — it
  // timed out all five saving tests at once.
  const submitted = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().includes(`/barn/${barn.slug}/settings`) &&
      response.status() < 400
  )
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
// Accordions — the checklist block from "Sections render as collapsible accordions" through
// "There is no \"Active Members\" section"
// ---------------------------------------------------------------------------

test.describe('Manage Barn — accordions', () => {
  test('settings_sections_all_render_collapsed_on_page_load @manager', async ({ page }) => {
    await page.goto(settingsUrl())

    // Titles and flags together, as an exact array: both halves of the collapsed-on-load claim ("render
    // as collapsible accordions" and "all collapsed") in one equality.
    expect(await sectionStates(page)).toEqual(SECTION_TITLES.map((title) => [title, false]))
  })

  test('clicking_a_section_heading_opens_that_section @manager', async ({ page }) => {
    await page.goto(settingsUrl())
    const sec = section(page, 'Schedule Buffer')
    await sectionHeading(page, sec, 'Schedule Buffer').click()

    await expect(sec).toHaveJSProperty('open', true)
  })

  test('clicking_an_open_section_heading_closes_it @manager', async ({ page }) => {
    // openSection's visible-Save wait is what makes the assertion below a transition rather
    // than a restatement of the pre-state: closed is the state the page loads in, so
    // `open === false` is satisfied by a section that never opened at all.
    const sec = await openSection(page, 'Schedule Buffer')
    await sectionHeading(page, sec, 'Schedule Buffer').click()

    await expect(sec).toHaveJSProperty('open', false)
  })

  test('opening_a_second_section_leaves_the_first_open @manager', async ({ page }) => {
    await openSection(page, 'Schedule Buffer')
    const second = section(page, 'Barn Timezone')
    await sectionHeading(page, second, 'Barn Timezone').click()
    await second.getByRole('button', { name: 'Save', exact: true }).waitFor()

    // The whole eight-section state, not just the first one: "Opening one section leaves the
    // other sections' open/closed state unchanged" claims the *other*
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
// Default Instructor Cut — the checklist block from "**Default Instructor Cut** field shows the
// current value" through "After that rejection the field's stored value is unchanged"
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

    // Exact text, which is the whole of the helper-text line's claim: it is not "some helper text exists"
    // but "it says the change doesn't affect past lessons, *not* that it recalculates
    // historical income". Equality is what rules the second reading out.
    await expect(sec.locator('p')).toHaveText(INSTRUCTOR_CUT_HELPER)
  })

  // DECLARATION ORDER DEPARTS FROM CHECKLIST ORDER HERE, and it has to.
  //
  // The checklist runs "Try `0` — allowed" → "Try blank — rejected" → "After that rejection the
  // field's stored value is unchanged". Follow
  // that order and the third one's pre-state is `0` — which is also exactly what a blank would store if
  // the rejection leaked and an empty string were coerced to a number. The test would then be
  // green against the very bug it exists to catch, and no mutation of it could go red: with
  // `required` dropped the action's own `parseNonNegativeAmount('')` still returns null and
  // writes nothing, and with the parser coercing instead, `0` is stored and `0` is expected.
  //
  // Running the blank pair while the stored value is still `42` makes that third line falsifiable:
  // a coerced-blank write moves it to `0` and the assertion fails. Each line still asserts its
  // own claim, and its "After that rejection" still names the test immediately above it.
  test('blank_instructor_cut_is_rejected_by_the_field @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')
    const field = sec.locator(FIELD)
    await field.fill('')
    // Armed before the click: the browser fires `invalid` on a field whose constraint blocks a
    // submit attempt. That event *is* the rejection, rather than a symptom of it.
    await field.evaluate((el) => {
      el.removeAttribute('data-invalid-fired')
      el.addEventListener('invalid', () => el.setAttribute('data-invalid-fired', 'yes'))
    })
    // A real pointer click rather than saveSection's focus()+Enter (#501, 04c64505): that
    // idiom exists to dodge scroll-into-view flake on long forms, and saveSection additionally
    // waits for a POST — which is precisely what must NOT happen here, so it would hang.
    await sec.getByRole('button', { name: 'Save', exact: true }).click()

    // `valueMissing` ALONE would not be an assertion about rejection at all: it is already true
    // of an empty `required` input before any submit is attempted, so the click above would
    // contribute nothing and the test would really be asserting "the field is required and
    // currently empty". Pairing it with the `invalid` event is what makes the submit attempt
    // load-bearing — that event cannot fire without one.
    expect(
      await field.evaluate((el) => ({
        invalidFired: el.getAttribute('data-invalid-fired'),
        valueMissing: (el as HTMLInputElement).validity.valueMissing,
      }))
    ).toEqual({ invalidFired: 'yes', valueMissing: true })
  })

  test('a_rejected_blank_instructor_cut_leaves_the_stored_value_unchanged @manager', async ({
    page,
  }) => {
    // `42`, from the persists-across-reload item above — see the ordering note. Also a value
    // the seed can never produce, so a worker restart makes this fail against the re-seeded
    // `25` rather than quietly agreeing with it.
    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      SAVED_INSTRUCTOR_CUT
    )
  })

  test('instructor_cut_accepts_zero @manager', async ({ page }) => {
    const sec = await openSection(page, 'Default Instructor Cut')
    await sec.locator(FIELD).fill(ZERO_INSTRUCTOR_CUT)
    await saveSection(page, sec)

    await expect(await openField(page, 'Default Instructor Cut', FIELD)).toHaveValue(
      ZERO_INSTRUCTOR_CUT
    )
  })
})

// ---------------------------------------------------------------------------
// Default Board Fee — the checklist block from "The **Default Board Fee** field's
// non-retroactive helper text is visible" through "pre-fills the new fee"
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
// Horse Exhaustion Thresholds — the checklist block from "**Horse Exhaustion Thresholds**
// fields show the current Moderate/High values" through "the stored threshold values are unchanged"
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
    // Both fields in one equality — the checklist names them as a "Moderate/High" pair, and reading
    // only one would pass on a form that rendered the same value into both.
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
// Schedule Buffer — the "**Schedule Buffer** field shows the current value" and "Change it and
// **Save** → value persists on reload" lines
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
// Barn Timezone — the checklist block from "**Barn Timezone** select shows the current value"
// through "add a planned expense due a few minutes from now"
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
    const select = await openField(page, 'Barn Timezone', FIELD)

    // NOT `toHaveValue(EASTERN)` on its own, which would be entirely vacuous here: Eastern is
    // `BARN_TIMEZONES[0]`, so it is also what a `<select>` reports when it has no value set at
    // all. Delete `defaultValue={barn.timezone}` from the page and a bare value read still
    // says "America/New_York" — the assertion could not tell "reads the barn's zone" from
    // "ignores it". The selected-option marker is what distinguishes them: React renders
    // `selected` on the option `defaultValue` picks, and on a select with no `defaultValue`
    // no option carries it. Verified by breaking exactly that prop and watching this fail.
    expect(
      await select.evaluate((el) => {
        const selected = el.querySelector('option[selected]')
        return { value: (el as HTMLSelectElement).value, marked: selected?.getAttribute('value') }
      })
    ).toEqual({ value: EASTERN, marked: EASTERN })
  })

  test('saving_a_new_barn_timezone_persists_it_across_a_reload @manager', async ({ page }) => {
    const sec = await openSection(page, 'Barn Timezone')

    // Throwing precondition: "Change it and Save → it persists on reload" is a *change* claim, and
    // a change claim tested against a
    // select that already reads the target value asserts nothing — the save could be a no-op
    // and the reload would still show the expected zone. Unlike the numeric settings above,
    // whose saved values are visibly distinct constants, this one is an enum that shares its
    // default with a legal target, so the pre-state is worth pinning rather than assuming.
    const before = await sec.locator(FIELD).inputValue()
    if (before === BARN_TIMEZONE_CHANGE) {
      throw new Error(
        `this test must change the zone, but the select already reads ${before} — nothing would be exercised`
      )
    }

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
    // Two preconditions that THROW, not assertions — the repo's distinction is mechanical, so
    // an `expect` here would simply be a second assertion however it were commented. Together
    // they say what the "before" state has to be: the section rendered and holds the control
    // (so a later absence cannot be the page rendering nothing), and the discriminator is not
    // in it yet (so the change below is what puts it there).
    await page.goto(`/barn/${barn.slug}/finances`)
    const before = outstandingExpenses(page)
    await before.filter({ hasText: CONTROL_EXPENSE.recipient }).waitFor()
    await before.filter({ hasText: DISCRIMINATOR_EXPENSE.recipient }).waitFor({ state: 'detached' })

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
// The barn's day versus the device's — the #1149 checklist block, from its setup line through
// "**Add Lease** / **Add Boarding**'s Start Date pre-fills with the barn's date"
// ---------------------------------------------------------------------------

test.describe('Manage Barn — barn day versus device day', () => {
  // The #1149 setup line's "set your *machine's* timezone to Hawaii". A describe-scoped override, so the
  // other 23 items stay in the runner's pinned zone (#1221), and never a
  // `playwright.config.ts` edit.
  test.use({ timezoneId: HAWAII })

  // WHAT THESE SIX DO AND DO NOT COVER ON THE THIRD AXIS. There are three zones in play, not
  // two: the barn's, the device's, and the *host the Next server runs on*. The pin below
  // separates the barn from the device, which is the axis these checklist lines are about. The
  // third zone is **UTC**, not the developer machine's Eastern — `package.json`'s dev script is
  // `TZ=UTC next dev` (#1221, `98aa03b5`), so only the shell is ever on `America/New_York`, and
  // the server process never inherits it. #1252 established that by observation and not by
  // reading the script: a Server Component with the barn's zone dropped rendered `8:00 PM` for
  // a 4:00 PM Eastern lesson. `8:00 PM` is the value UTC predicts and no other frame in play
  // does, which `checklist-phase4-barn-timezone.spec.ts`'s BARN_HOUR_DISPLAY note derives —
  // that note is the arithmetic, not a record of the probe, and the distinction is the whole
  // reason this paragraph had to be rewritten. `DEVICE_INSTANT`'s own note above already names
  // the host frame as UTC for the same reason.
  //
  // So the barn's day and the host's day are NOT equal by construction, and a regression that
  // read the host's clock instead of `barns.timezone` — precisely the one #1224 shipped once,
  // per its own note in `ExpenseForm` — does fail all six, whenever UTC has rolled over and
  // Eastern has not: from 8pm EDT (7pm EST) to barn midnight. What this axis is NOT is pinned.
  // Outside that window UTC and Eastern name the same date and the regression passes unnoticed,
  // and it can't be closed from here — BARN_TODAY comes from the real clock, and a browser
  // context cannot fake the server's. Same shape as `checklist-phase4-barn-timezone.spec.ts`'s
  // `assertPinArithmetic`: no *date* assertion separates all three frames at once, and only an
  // *hour* does.

  // The #1149 setup line's "set **Barn Timezone** to Eastern", done as a write to this file's own barn rather
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
  /**
   * A day cell's past-ness, as both the seam and the appearance: `data-past` drives the
   * `text-zinc-300` tint that the calendar line's "greys out" actually names, and asserting only the
   * attribute would leave the visible half unchecked (#1205 set the precedent of asserting the
   * class where a line names one).
   */
  async function dayCellState(cell: Locator) {
    return {
      past: await cell.getAttribute('data-past'),
      greyed: ((await cell.getAttribute('class')) ?? '').includes('text-zinc-300'),
    }
  }

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

    // The barn's own cell is read FIRST, while the grid is still on the month it opened in.
    // `dayCell` may page backwards to reach DEVICE_DAY (see its note), and paging back evicts
    // BARN_TODAY from the grid — so reading it afterwards would auto-wait to a timeout on
    // exactly the rare day the fallback exists for.
    const barnState = await dayCellState(
      page.getByRole('button', { name: BARN_TODAY, exact: true })
    )
    const deviceState = await dayCellState(await dayCell(page, DEVICE_DAY))

    // Both halves in one equality. "The device's day is greyed" alone is satisfied by a
    // calendar that greys every day; pairing it with the barn's own day being live is what
    // pins the cutoff to exactly the barn's date. `greyed` reads the class the line actually
    // names — `data-past` is the seam that drives it, but "greys out" is an appearance claim.
    expect({ device: deviceState, barn: barnState }).toEqual({
      device: { past: 'true', greyed: true },
      barn: { past: 'false', greyed: false },
    })
  })

  test('a_document_due_on_the_barns_day_shows_the_reminder_due_badge @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/horses/${horse.id}`)
    await openAccordionSection(page, 'Documents')

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

  test('add_lease_and_add_boarding_start_dates_prefill_the_barns_day @manager', async ({ page }) => {
    const startDateFor = async (kind: string) => {
      await page.goto(`/barn/${barn.slug}/agreements/new?kind=${kind}`)
      const field = page.locator('#agreement-start-date')
      await field.waitFor()
      return field.inputValue()
    }

    // The "**Add Lease** / **Add Boarding**" line names both forms, and they are one component
    // reached by two `kind` values — so
    // one test, and one equality covering both rather than an assertion that only one of the
    // two entry points was checked.
    expect({ lease: await startDateFor('lease'), board: await startDateFor('board') }).toEqual({
      lease: BARN_TODAY,
      board: BARN_TODAY,
    })
  })
})

// ---------------------------------------------------------------------------
// Unsaved-changes nav guard on a guarded settings form (#1362)
// ---------------------------------------------------------------------------
//
// The representative-form half of the phase-4 nav-guard lines: the dialog's own mechanics
// (Stay focus, Escape, back-nav) are asserted on the lesson edit form in
// checklist-phase4-lessons-detail.spec.ts; these two prove the guard arms and clears on a form
// wired through GuardedForm rather than LessonForm's bespoke state. Last in the file, so the
// buffer value they write is never read by an earlier suite, retries included.

test.describe.serial('Manage Barn — unsaved-changes nav guard', () => {
  const FIELD = '#schedule_buffer_minutes'
  const GUARD_BUFFER = '50'

  /**
   * Hydration barrier. openSection's visible-Save wait proves only that the native `<details>`
   * toggled — which works pre-hydration — while the guard's arming is pure React (bubbled
   * `onChange` → context), so a fill landing before hydration would arm nothing and the nav
   * click would silently navigate (e2e/CLAUDE.md facts 9/10). The UserMenu dropdown is
   * `useState`-gated markup, a signal that strictly post-dates hydration; drive it open, then
   * toggle it shut to leave the page as found (pattern:
   * checklist-phase56-nav-profile.spec.ts's openAvatarMenu).
   */
  async function ensureNavHydrated(page: Page) {
    const avatar = page.getByRole('button', { name: 'User menu', exact: true })
    const profileLink = page.getByRole('link', { name: 'Profile', exact: true })
    await hydrateByDriving(
      () => avatar.click(),
      async () => (await profileLink.count()) > 0
    )
    await avatar.click()
    await expect(profileLink).toHaveCount(0)
  }

  /** Only DesktopNavLinks renders at the @manager project's desktop width, so exactly one link. */
  function lessonsNavLink(page: Page): Locator {
    return page.locator('nav').getByRole('link', { name: 'Lessons', exact: true })
  }

  test('unsaved_guarded_settings_field_raises_the_unsaved_changes_dialog_on_nav @manager', async ({
    page,
  }) => {
    const sec = await openSection(page, 'Schedule Buffer')
    await ensureNavHydrated(page)
    await sec.locator(FIELD).fill(GUARD_BUFFER)
    await lessonsNavLink(page).click()

    await expect(page.getByRole('dialog').locator('p').first()).toHaveText(
      'You have unsaved changes. Leave without saving?'
    )
    // Stay leaves you where you were — both halves in one poll, so a dialog that closed by
    // navigating away can't pass on the count alone.
    await page.getByRole('dialog').getByRole('button', { name: 'Stay', exact: true }).click()
    await expect
      .poll(async () => ({
        dialogs: await page.getByRole('dialog').count(),
        path: new URL(page.url()).pathname,
      }))
      .toEqual({ dialogs: 0, path: settingsUrl() })
  })

  test('saving_a_guarded_settings_field_then_navigating_shows_no_dialog @manager', async ({
    page,
  }) => {
    const sec = await openSection(page, 'Schedule Buffer')
    await ensureNavHydrated(page)
    await sec.locator(FIELD).fill(GUARD_BUFFER)
    await saveSection(page, sec)
    await lessonsNavLink(page).click()

    // The URL changing is the claim: the guard disarmed, so the click navigated. Not a no-op
    // wait (fact 3) — /lessons differs from the /settings URL the click happens on.
    await page.waitForURL(`**/barn/${barn.slug}/lessons`)
    // waitForURL resolves on commit, before /lessons has rendered — so it sync-points the
    // navigation without proving anything drew, and toHaveCount(0) is satisfied on its first
    // poll (framework fact 18). The heading is the render proof (spec-maintenance rule 4).
    await expect(page.getByRole('heading', { name: 'Lessons', level: 1 })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Save confirmation — the #1417 "Save a section's field → that section stays open" line and its
// "That section shows a green **Saved** badge beside its heading" pair
// ---------------------------------------------------------------------------

test.describe('Manage Barn — save confirmation', () => {
  test('saving_a_settings_field_leaves_its_section_open_with_a_saved_badge @manager', async ({
    page,
  }) => {
    // Submits the stored value unchanged rather than a new one. The claim is about the round
    // trip, not about persistence — and this file's other blocks are `.serial` around the
    // values they leave behind, so writing a fresh one here would reach into them.
    const sec = await openSection(page, 'Schedule Buffer')
    await saveSection(page, sec)

    // One assertion per checklist line, and both are needed: the badge lives in the `<summary>`,
    // which is visible whether or not the section is open, so badge-alone would pass on the very
    // collapse this fixes.
    await expect(sec).toHaveJSProperty('open', true)
    await expect(sec.locator('summary').getByText('Saved', { exact: true })).toBeVisible()
  })
})
