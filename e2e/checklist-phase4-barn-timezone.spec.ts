// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/components/calendar/**
//
// The subtree globs are deliberately whole subtrees rather than `new/**`. A `/**` glob is a
// literal string PREFIX (scripts/CLAUDE.md), and the components these tests actually assert on
// — `lessons/DateHourPicker.tsx`, `lessons/LessonForm.tsx`, `lessons/LessonListItem.tsx`,
// `expenses/ExpenseForm.tsx` — sit one level ABOVE `new/`. `select-specs.sh --lint` passes
// either way, because `new/**` matches `new/page.tsx`; it just silently fails to select this
// spec when the form components themselves change, which is the only case that matters
// (#1204 measured this on its own file).
//
// `src/components/calendar/**` is not a route. It is declared because `CalendarLessonCard`,
// `CalendarEventCard` and `MonthCalendarPicker` supply markup asserted on here directly, and
// that directory is not in `select-specs.sh`'s ALWAYS_FULL list. `src/lib/**` IS in that list,
// so `format-date.ts` and `barn-timezone.ts` need no glob of their own.
//
// PRE_RELEASE_TEST_CHECKLIST.md lines 702-712: barn-local *instant* rendering and entry — the
// display half of the viewer timezone frame #1222 deleted. Adjacent slices: #1204 owns 696-701
// (the barn-*day* cutoff half of the same "Under that setup" run) and #1205 owns 713-720.
// Nothing outside 702-712 is touched.
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { wallClockToInstant } from '@/lib/barn-timezone'
import type { Lesson } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Zones, and the arithmetic that decides what these eleven items can prove
// ---------------------------------------------------------------------------

/**
 * The barn's own zone — `barns.timezone`'s schema default, so a freshly seeded barn already
 * carries it and line 696's "set Barn Timezone to Eastern" (the setup all eleven of these
 * lines say "under that setup" about) holds without this file arranging anything.
 */
const EASTERN = 'America/New_York'

/**
 * Line 696's "set your *machine's* timezone to Hawaii", expressed as the browser context's
 * zone. Never a `playwright.config.ts` edit: #1221 owns the *runner's* `TZ` (and pins the
 * default browser zone to Asia/Kolkata); the per-file override below is what these lines are
 * actually about.
 */
const HAWAII = 'Pacific/Honolulu'

test.use({ timezoneId: HAWAII })

/**
 * Calendar-day arithmetic on a "YYYY-MM-DD" string — the `Date.UTC`-on-the-digits idiom
 * `fixtures.ts:daysFromNow` uses. Deliberately not `local-day.ts:addDays`: an expectation
 * computed by the code under test agrees with any bug in it.
 */
function shiftDay(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

/**
 * An instant's wall clock in a zone, as "YYYY-MM-DDTHH:MM:SS".
 *
 * This is `barn-timezone.ts:instantToLocalWallClock`'s answer, reimplemented here rather than
 * imported, and that is the point rather than duplication for its own sake: five of these
 * eleven items assert what the app *stored* or what its date/hour controls *defaulted to*,
 * and every one of those values is produced by that module. Importing it to build the
 * expected value would make the assertion agree with any bug in it, in both directions.
 * Mirrors its `en-CA` + `hourCycle: 'h23'` shape, which is what yields the ISO-ish layout.
 */
function barnWallClock(at: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at)
  const get = (type: string) => parts.find((part) => part.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
}

/** The calendar day half of the above. `barnToday`'s answer, computed independently. */
function barnDay(at: Date, timeZone: string): string {
  return barnWallClock(at, timeZone).slice(0, 10)
}

/**
 * "Aug 5, 2026" for a "YYYY-MM-DD" string — the date half of what `formatBarnDateTime`
 * renders. UTC-forced because the input names a calendar day, not an instant, and written out
 * here rather than run back through `format-date.ts` for the same reason `barnWallClock` is.
 */
function displayDate(day: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T00:00:00Z`))
}

/**
 * The barn's own calendar day, resolved from the real clock — the value the *server* computes
 * for `todayStr` on every page these tests load.
 *
 * Fixed once at module evaluation, so a run crossing barn-local midnight mid-file sees a stale
 * day. That window is pre-existing and file-wide across this batch (#1187 accepted the same
 * one rather than forking the clock-pinning decision), and it fails loudly rather than passing
 * wrongly.
 */
const BARN_TODAY = barnDay(new Date(), EASTERN)

/**
 * One day per subject, so no test can disturb another's day view or month grid.
 *
 * LESSON_DAY is `+1` rather than today specifically so the seeded lesson is always in the
 * future whatever hour the suite runs at — a past lesson falls behind `OlderLessonsToggle` on
 * the Lessons list, which would make item 702's card conditionally unreachable.
 */
const LESSON_DAY = shiftDay(BARN_TODAY, 1)
const EVENT_DAY = shiftDay(BARN_TODAY, 2)
const NEW_LESSON_DAY = shiftDay(BARN_TODAY, 3)

/**
 * 4:00 PM, the wall clock lines 702-706, 709, 711 and 712 all name.
 *
 * Its counter-value is the reason it was chosen: 4:00 PM Eastern is 20:00 UTC, which is
 * **10:00 AM in Honolulu** — the exact string line 702 says must NOT appear. So an app that
 * reverted to the viewer-local frame #1222 deleted renders "10:00 AM" into every one of these
 * assertions and fails it, and an app rendering in UTC produces "8:00 PM" and fails it too.
 */
const BARN_HOUR = 16
const BARN_HOUR_DISPLAY = '4:00 PM'
const LESSON_WALL_CLOCK = `${LESSON_DAY}T${BARN_HOUR}:00:00`
const NEW_LESSON_WALL_CLOCK = `${NEW_LESSON_DAY}T${BARN_HOUR}:00:00`
const EVENT_WALL_CLOCK = `${EVENT_DAY}T${BARN_HOUR}:00:00`
const LESSON_DISPLAY = `${displayDate(LESSON_DAY)}, ${BARN_HOUR_DISPLAY}`
const EVENT_DISPLAY = `${displayDate(EVENT_DAY)}, ${BARN_HOUR_DISPLAY}`

/**
 * Line 710's 11:30 PM. Barn-local 23:30 Eastern is 03:30 UTC *the next day*, and 23:30 in
 * Honolulu is 09:30 UTC the next day — so this single stored value separates the barn's frame
 * from the device's AND from UTC, which no *date* assertion in this file can do (see
 * PIN_INSTANT). That is also exactly the bug line 710 names: a late-evening entry near a month
 * boundary bucketing into the wrong month in Finances.
 */
const EXPENSE_TIME = '23:30'
const EXPENSE_WALL_CLOCK = `${BARN_TODAY}T${EXPENSE_TIME}:00`
const EXPENSE_RECIPIENT = 'Valley Farrier'
const EXPENSE_TYPE = 'Farrier'
const EXPENSE_AMOUNT = '145'

const EVENT_TITLE = 'Barn Open House'

const HORSE_NAME = 'Apollo'
const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`

// ---------------------------------------------------------------------------
// The device clock pin
// ---------------------------------------------------------------------------

/**
 * The instant the browser's clock is pinned to for items 707 and 708: **01:00 Eastern on the
 * barn's own day**, i.e. 05:00 UTC, which Honolulu reads as 19:00 on the day *before*.
 *
 * `page.clock.setFixedTime`, never `page.clock.install()`: `install` also fakes the timers
 * React and Next's router run on, whereas `setFixedTime` fakes `Date` alone and leaves them
 * ticking. #1204 measured `setFixedTime` safe on `/lessons/new` specifically — the one page
 * whose `DateHourPicker` computes its defaults from the browser clock in a `useState`
 * initialiser, which is exactly the surface items 707/708 read.
 *
 * **Why this pin and not #1204's 1pm-Hawaii one.** Its six items all assert values the SERVER
 * rendered, so its pin put the browser's barn-zone day one day BEHIND the server's and every
 * assertion still named the server's answer. Items 707 and 708 are the opposite: their answers
 * are computed in the BROWSER, off this frozen clock, and read against a month grid whose
 * past-day cutoff comes from the server's `todayStr`. So the browser's barn-zone day has to
 * EQUAL the server's, while its *local* (Honolulu) day differs. Same frame, opposite
 * requirement, because of where the computation happens.
 *
 * `wallClockToInstant` is used here and in the seed below, and nowhere else. Building a
 * fixture is not deriving an expected value — every value these tests assert is computed by
 * `barnWallClock`/`barnDay` above, and the pin's own arithmetic is proved by the guard below
 * rather than trusted.
 */
const PIN_INSTANT = wallClockToInstant(`${BARN_TODAY}T01:00:00`, EASTERN)
const PIN_BARN_HOUR = '1'

/**
 * The pin's arithmetic, executable rather than written in a comment.
 *
 * #1204's pin was aimed one axis away from the regression it meant to catch (its first attempt
 * sat at 8pm Hawaii, which is 06:00 UTC the *next* day — so the browser's UTC day equalled the
 * barn day its tests assert, and a `toISOString().slice(0,10)` implementation would have
 * rendered the right answer for the wrong reason). That was caught only by review. A guard
 * that throws at collection makes the whole class impossible here instead of documented.
 *
 * The third check is the one worth reading twice, because it asserts an EQUALITY that looks
 * like a bug and is not. `HNL ≤ EDT ≤ UTC` at every instant, and that span is 10h < 24h — so
 * the Eastern calendar day always equals either the Honolulu day or the UTC day, and can never
 * differ from both. No date assertion in this file can separate the barn's day from the
 * device's AND from UTC. Item 707 therefore takes the axis its own line names (the device),
 * and the UTC axis is closed by item 708's HOUR, where all three frames are distinct by
 * construction — same form, same page load. Asserting the equality here means a future edit
 * that "fixes" the pin thinking it has separated all three is told the truth immediately.
 */
function assertPinArithmetic(): void {
  const barnSideDay = barnDay(PIN_INSTANT, EASTERN)
  const deviceSideDay = barnDay(PIN_INSTANT, HAWAII)
  const utcSideDay = PIN_INSTANT.toISOString().slice(0, 10)
  const hours = [
    barnWallClock(PIN_INSTANT, EASTERN).slice(11, 13),
    barnWallClock(PIN_INSTANT, HAWAII).slice(11, 13),
    PIN_INSTANT.toISOString().slice(11, 13),
  ]

  const problems: string[] = []
  if (barnSideDay !== BARN_TODAY) {
    problems.push(`barn-zone day of the pin is ${barnSideDay}, expected ${BARN_TODAY}`)
  }
  if (deviceSideDay !== shiftDay(BARN_TODAY, -1)) {
    problems.push(`device-zone day of the pin is ${deviceSideDay}, expected ${shiftDay(BARN_TODAY, -1)}`)
  }
  if (utcSideDay !== barnSideDay) {
    problems.push(
      `UTC day of the pin is ${utcSideDay} and its barn day is ${barnSideDay}. ` +
        'These are expected to be EQUAL — see the derivation above; if they now differ, the ' +
        'pin has moved and item 707 is asserting a different axis than its comment claims.'
    )
  }
  if (new Set(hours).size !== 3) {
    problems.push(`barn/device/UTC hours ${hours.join('/')} are not pairwise distinct`)
  }
  if (problems.length > 0) {
    throw new Error(`device clock pin ${PIN_INSTANT.toISOString()} is misaimed:\n  ${problems.join('\n  ')}`)
  }
}
assertPinArithmetic()

// ---------------------------------------------------------------------------
// Barn
// ---------------------------------------------------------------------------

/**
 * One tier, one horse, one lesson. Nothing else, and that is load-bearing rather than minimal
 * for its own sake: it is what lets items 709 and 710 assert an EXACT ARRAY of stored values
 * ("the barn's `kind='expense'` transactions are exactly [this]") instead of hunting for the
 * right row, which makes "no row was created at all" a failure rather than a silent pass.
 *
 * Seeded inline; `e2e/support/fixtures.ts` is not modified.
 */
let seededLesson: Lesson

const barn = withBarn('phase4-barn-timezone', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, HORSE_NAME)

  // The seed instant is built from the barn's own zone, so the stored value is 4:00 PM Eastern
  // whatever zone the runner is on. `time: '16:00'` would do the same via addUnpaidLesson's
  // own atBarnLocalTime, but naming the instant here keeps the one wall clock this file cares
  // about in one place.
  seededLesson = await addUnpaidLesson(supabase, barn, {
    at: wallClockToInstant(LESSON_WALL_CLOCK, barn.timezone),
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

// ---------------------------------------------------------------------------
// Direct reads. Preconditions and stored-value assertions only — never an expected UI value.
// ---------------------------------------------------------------------------

/**
 * Every lesson in this barn except the seeded one, as barn-local wall clocks.
 *
 * The batch's rule is that a direct service-role read verifies preconditions, never the
 * expected answer. Items 709 and 710 are the sanctioned exception, and their own issue body
 * ratifies it: they are *about storage*. The expected value is the wall clock the test typed
 * into the form, and the assertion is that the barn's zone — not the device's — is what turned
 * it into an instant. Reading the column and rendering it back in the barn's zone IS that
 * assertion, not a shortcut around it.
 */
async function otherLessonWallClocks(): Promise<string[]> {
  const { data, error } = await barn.data.supabase
    .from('lessons')
    .select('lesson_at')
    .eq('barn_id', barn.data.barn.id)
    .neq('id', seededLesson.id)
  if (error) throw error
  return (data ?? []).map((row) => barnWallClock(new Date(row.lesson_at as string), EASTERN))
}

async function seededLessonWallClock(): Promise<string> {
  const { data, error } = await barn.data.supabase
    .from('lessons')
    .select('lesson_at')
    .eq('id', seededLesson.id)
    .single()
  if (error) throw error
  return barnWallClock(new Date(data.lesson_at as string), EASTERN)
}

async function expenseTransactionWallClocks(): Promise<string[]> {
  const { data, error } = await barn.data.supabase
    .from('transactions')
    .select('occurred_at')
    .eq('barn_id', barn.data.barn.id)
    .eq('kind', 'expense')
  if (error) throw error
  return (data ?? []).map((row) => barnWallClock(new Date(row.occurred_at as string), EASTERN))
}

/**
 * Throws unless the barn holds exactly one event and its stored instant is barn-local 4:00 PM.
 *
 * **This is a precondition guard, not the assertion, and the distinction is the whole reason
 * it exists.** Lines 711 and 712 are round-trip claims — "the time shown matches what the Add
 * Event form was given" — and a *consistently* viewer-framed app satisfies a round trip
 * exactly: it would encode 4:00 PM as 4:00 PM Honolulu and then render that same instant back
 * in Honolulu as 4:00 PM. The display assertion would be true, falsifiable, and about a
 * property that survives the regression intact.
 *
 * Pinning the entry half here is what gives the display assertion force it otherwise would not
 * have. If this read were the *assertion*, the test would be asserting storage instead of
 * display, which is the dodge #1204's review correctly flagged; it does the opposite.
 */
async function requireEventStoredBarnLocal(): Promise<void> {
  const { data, error } = await barn.data.supabase
    .from('barn_events')
    .select('event_at')
    .eq('barn_id', barn.data.barn.id)
  if (error) throw error
  const stored = (data ?? []).map((row) => barnWallClock(new Date(row.event_at as string), EASTERN))
  if (stored.length !== 1 || stored[0] !== EVENT_WALL_CLOCK) {
    throw new Error(
      `precondition: expected exactly one barn event stored at ${EVENT_WALL_CLOCK} barn-local, got ` +
        `[${stored.join(', ')}]. The Add Event form did not anchor the entry to the barn's zone, so ` +
        'the display assertion below would be a round trip that a viewer-framed app also satisfies.'
    )
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function lessonHref(id: string): string {
  return `/barn/${barn.slug}/lessons/${id}`
}

/** The Lessons-list / dashboard card for one lesson, found by its own href. */
function lessonCard(page: Page, id: string): Locator {
  return page.locator(`main a[href="${lessonHref(id)}"]`)
}

/**
 * A section of Manage Barn, opened. Six lines, duplicated locally rather than imported across
 * spec files, per #1205's and #1204's precedent on this same page.
 *
 * The `waitFor` is a precondition that throws, not an assertion: every Manage Barn section is
 * a `<details>` that is closed on load, so nothing inside one is ever *visible* and
 * `read.ts`'s settled helpers can only time out on it (#1204 hit this across its whole slice).
 * Waiting for a control the open section owns is a genuine proof, in the same document, that
 * the section opened before anything reads it.
 */
async function openSection(page: Page, title: string): Promise<Locator> {
  await page.goto(`/barn/${barn.slug}/settings`)
  const sec = page.locator('details').filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await sec.getByRole('heading', { name: title, exact: true }).click()
  await sec.getByRole('link', { name: 'Add Event', exact: true }).waitFor()
  return sec
}

/**
 * Submits a form by its labelled button and waits for the resulting navigation.
 *
 * `focus()` + `Enter` rather than a pointer click, per the suite's #501 / `04c64505` treatment:
 * these submits sit below a month calendar grid whose day popup grows the page mid-interaction,
 * which is the scroll-into-view race that idiom exists to dodge.
 *
 * `waitForURL(..., { waitUntil: 'commit' })` is a real sync point on every call site here —
 * each of these actions redirects to a DIFFERENT url than the form was on (`/lessons/[id]` from
 * the edit form, `/lessons` from New Lesson, `/expenses` from Add Expense, `/settings` from Add
 * Event). #1204's finding that a same-URL redirect makes `waitForURL` a no-op does not apply,
 * and was checked rather than assumed. No explicit `timeout` (#1211): `actionTimeout: 0` makes
 * every `waitFor*` unbounded, so any number here could only tighten the budget.
 *
 * `test.slow()` lives here rather than on call sites (#1206's `a97bd435` shape), so whichever
 * test actually pays a cold route compile gets the raised budget even when run standalone.
 */
async function submitForm(page: Page, label: string, destination: RegExp): Promise<void> {
  test.slow()
  const button = page.getByRole('button', { name: label, exact: true })
  await button.focus()
  await button.press('Enter')
  await page.waitForURL(destination, { waitUntil: 'commit' })
}

/**
 * Pages the month grid to the month containing `day`, then taps that day and dismisses the
 * schedule popup it opens. The bounded-loop shape is `checklist-timezone.spec.ts`'s; the days
 * this file picks are at most 3 ahead, so one page forward is the most that is ever needed.
 */
async function pickCalendarDay(page: Page, day: string): Promise<void> {
  const monthHeading = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))
  for (let i = 0; i < 2 && !(await page.getByText(monthHeading, { exact: true }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
  }
  await expect(page.getByText(monthHeading, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: day, exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
}

/** The `aria-label`s of every day cell the month grid currently reports as selected. */
function pressedDayLabels(page: Page): Promise<string[]> {
  return page.locator('button[aria-pressed="true"]').evaluateAll((els) =>
    els.map((el) => el.getAttribute('aria-label') ?? '')
  )
}

// ---------------------------------------------------------------------------
// A lesson at 4:00 PM — checklist lines 702-706
// ---------------------------------------------------------------------------
//
// Every assertion in this block is full-string (`toHaveText`, or an object/array equality),
// never `toContainText`: "4:00 PM" is a substring of nothing the app renders here, but the
// batch's matcher-level vacuity finding is about the class, not the instance.

test.describe.serial('A 4:00 PM lesson renders in the barn s zone', () => {
  test('lessons_list_shows_the_barn_local_four_pm_not_the_devices_ten_am @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons`)

    // The time is `LessonListItem`'s first direct-child span, fixed by that component's own
    // markup rather than by any query ordering — the batch's ordering hazard is about DAL
    // embeds with no ORDER BY, which this is not.
    await expect(lessonCard(page, seededLesson.id).locator('> span').first()).toHaveText(LESSON_DISPLAY)
  })

  test('lesson_detail_shows_the_barn_local_four_pm @manager', async ({ page }) => {
    await page.goto(lessonHref(seededLesson.id))

    const dateTimeRow = page.locator('dl > div').filter({ has: page.getByText('Date & Time', { exact: true }) })
    await expect(dateTimeRow.locator('dd')).toHaveText(LESSON_DISPLAY)
  })

  test('dashboard_calendar_card_shows_the_barn_local_four_pm @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}?date=${LESSON_DAY}`)

    // `CalendarLessonCard` renders the time alone, with no date — the Day view's own heading
    // already names the day — so this is the bare wall clock, not LESSON_DISPLAY.
    await expect(lessonCard(page, seededLesson.id).locator('> p').first()).toHaveText(BARN_HOUR_DISPLAY)
  })

  test('edit_form_opens_on_the_lessons_barn_local_date_and_four_pm_hour @manager', async ({ page }) => {
    await page.goto(`${lessonHref(seededLesson.id)}/edit`)
    await page.locator('#dh-hour').waitFor()

    // Both halves of line 705 in one equality. The hour is the discriminating half: a
    // viewer-framed decode of this instant yields 10, and the select's structural default with
    // no value set is its FIRST option, '0' — so '16' is unreachable both by the regression and
    // by a control that ignored its input (the batch's seed-equals-default shape). The date
    // half is asserted because the line names it, but 4:00 PM Eastern and 10:00 AM Honolulu are
    // the same calendar day, so it does not discriminate on its own.
    expect({
      date: (await pressedDayLabels(page))[0],
      hour: await page.locator('#dh-hour').inputValue(),
    }).toEqual({ date: LESSON_DAY, hour: String(BARN_HOUR) })
  })

  test('resaving_the_edit_form_unchanged_leaves_the_stored_time_untouched @manager', async ({ page }) => {
    // Precondition, not an assertion: "untouched" is only meaningful if the stored value was
    // the expected one to begin with, and a worker restart re-seeds this barn.
    const before = await seededLessonWallClock()
    if (before !== LESSON_WALL_CLOCK) {
      throw new Error(`precondition: lesson stored at ${before}, expected ${LESSON_WALL_CLOCK}`)
    }

    await page.goto(`${lessonHref(seededLesson.id)}/edit`)
    await page.locator('#dh-hour').waitFor()
    await submitForm(page, 'Save', new RegExp(`/lessons/${seededLesson.id}$`))

    // The redirect above is what makes this a real claim rather than a tautology: it proves the
    // action ran and succeeded, so "unchanged" cannot be satisfied by "nothing happened".
    //
    // What this catches is a decode/re-encode MISMATCH — the form decoding the stored instant
    // in one frame and re-encoding it in another, which shifts the value by six hours here. It
    // does NOT catch a consistently viewer-framed app: decoding 20:00 UTC as 10:00 Honolulu and
    // re-encoding 10:00 Honolulu gives 20:00 UTC back, identical. That case is caught by
    // `edit_form_opens_on_...` directly above, on this same lesson, which asserts the decoded
    // hour is 16. The two items are complete as a pair and neither is complete alone.
    expect(await seededLessonWallClock()).toBe(LESSON_WALL_CLOCK)
  })
})

// ---------------------------------------------------------------------------
// New Lesson's date and hour defaults — checklist lines 707-708
// ---------------------------------------------------------------------------
//
// A plain describe: both tests are read-only and independent. The clock pin is per-test rather
// than file-wide so the nine tests that do not need a frozen clock do not carry one — and so
// the idiom is liftable as-is by the three specs waiting on it (see the PR body).

test.describe('New Lesson defaults follow the barn, not the device', () => {
  test('new_lesson_date_prefills_the_barns_day_not_the_devices @manager', async ({ page }) => {
    await page.clock.setFixedTime(PIN_INSTANT)
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await page.locator('#dh-hour').waitFor()

    // Both the day cell the user sees selected and the date the form will actually submit.
    //
    // **The second half is the one that discriminates, and that is a measured finding rather
    // than a design choice.** `aria-pressed` is an ATTRIBUTE, and React 19 does not reconcile
    // mismatched attributes during hydration — it keeps the server's. So the selected cell is
    // whatever the SERVER computed, and a `DateHourPicker` reading the device's day would still
    // show the barn's day there. Measured directly: with the date default broken to
    // `toLocaleDateString('en-CA')` and the clock pinned, the cell read `2026-08-04` (server)
    // while the hidden input read `2026-08-03T05:00:00.000Z` (client), and the cell only caught
    // up after a month-nav click forced a re-render. A first pass asserting the cell alone
    // passed that probe — green for the wrong reason, and the pin was doing nothing for it.
    //
    // `input[name="lesson_at"]`'s value is a React-controlled PROPERTY, which React does sync,
    // so it carries the browser's computation — and it is also the value the form submits, so
    // it is the pre-fill that actually decides anything. Asserted as its barn-local date: with
    // the clock pinned, a control reading the DEVICE's day yields `BARN_TODAY - 1` here.
    //
    // The cell half is kept rather than dropped: line 707 names the visible pre-fill, both
    // values are genuinely the barn's day in a correct app, and asserting only the hidden input
    // would stop covering the affordance the line describes.
    const submitted = await page.locator('input[name="lesson_at"]').inputValue()
    expect({
      selectedCell: (await pressedDayLabels(page))[0],
      submittedDate: barnWallClock(new Date(submitted), EASTERN).slice(0, 10),
    }).toEqual({ selectedCell: BARN_TODAY, submittedDate: BARN_TODAY })
  })

  test('new_lesson_hour_select_opens_on_the_barns_hour_not_the_devices @manager', async ({ page }) => {
    await page.clock.setFixedTime(PIN_INSTANT)
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await page.locator('#dh-hour').waitFor()

    // The item this file leans on hardest. At the pinned instant the barn reads hour 1, the
    // device reads 19 and UTC reads 5 — three distinct values — and the select's structural
    // default with no value set is its first option, '0'. So this is the one assertion here
    // that separates the barn's frame from the device's AND from UTC AND from an inert
    // control, all at once, which is what closes the axis item 707 provably cannot (see
    // assertPinArithmetic).
    await expect(page.locator('#dh-hour')).toHaveValue(PIN_BARN_HOUR)
  })
})

// ---------------------------------------------------------------------------
// Entry is barn-anchored, not just display — checklist lines 709-710
// ---------------------------------------------------------------------------

test.describe('Entered wall clocks are stored in the barn s zone', () => {
  test('creating_a_lesson_at_four_pm_stores_four_pm_barn_local @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await page.getByRole('checkbox', { name: HORSE_NAME, exact: true }).check()
    await page.locator('#rider_id').selectOption({ label: RIDER_NAME })
    await pickCalendarDay(page, NEW_LESSON_DAY)
    await page.locator('#dh-hour').selectOption(String(BARN_HOUR))
    await submitForm(page, 'Submit', new RegExp(`/barn/${barn.slug}/lessons$`))

    // Exact array over "every lesson but the seeded one", so a form that created nothing reads
    // `[]` and fails rather than passing on an empty set. A viewer-framed encode stores this
    // 4:00 PM as 02:00 UTC the next day, which renders back as `T22:00:00` barn-local — six
    // hours off, and not a value this seed can otherwise produce.
    expect(await otherLessonWallClocks()).toEqual([NEW_LESSON_WALL_CLOCK])
  })

  test('adding_an_expense_at_eleven_thirty_pm_stores_it_barn_local_in_transactions @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/expenses/new`)
    await page.locator('#expense-recipient').fill(EXPENSE_RECIPIENT)
    await page.locator('#expense-type').fill(EXPENSE_TYPE)
    // The Date field is left on its own pre-fill, which is the server's `todayStr`. That is
    // deliberate on two counts: it is BARN_TODAY, and `ExpenseForm` hides the Time field
    // entirely for a past date — so touching the date is what would put line 710's own subject
    // out of reach.
    await page.locator('#expense-time').fill(EXPENSE_TIME)
    // Without an amount `sync_expense_transaction` writes no `transactions` row at all, and
    // line 710's assertion is about that row's `occurred_at`.
    await page.locator('#expense-amount').fill(EXPENSE_AMOUNT)
    await submitForm(page, 'Add Expense', new RegExp(`/barn/${barn.slug}/expenses$`))

    expect(await expenseTransactionWallClocks()).toEqual([EXPENSE_WALL_CLOCK])
  })
})

// ---------------------------------------------------------------------------
// A barn event's time — checklist lines 711-712
// ---------------------------------------------------------------------------
//
// Serial, and the event is created through the Add Event form rather than by `addBarnEvent`,
// because both lines say "matching what the Add Event form was given" — the form IS the
// subject, and seeding the row directly would skip the entry half of the round trip.

test.describe.serial('A barn event s time renders in the barn s zone', () => {
  test('barn_event_row_on_manage_barn_shows_the_barn_local_four_pm @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/events/new`)
    await page.locator('#event-title').fill(EVENT_TITLE)
    // EventForm passes no `renderDate`, so `DateHourPicker` keeps the plain native date input.
    await page.locator('#dh-date').fill(EVENT_DAY)
    await page.locator('#dh-hour').selectOption(String(BARN_HOUR))
    await submitForm(page, 'Save', new RegExp(`/barn/${barn.slug}/settings$`))

    await requireEventStoredBarnLocal()

    const section = await openSection(page, 'Barn Events')
    const row = section
      .locator('tbody tr')
      .filter({ has: page.getByRole('cell', { name: EVENT_TITLE, exact: true }) })
    await expect(row.locator('td').nth(1)).toHaveText(EVENT_DISPLAY)
  })

  test('barn_event_card_on_the_dashboard_shows_the_barn_local_four_pm @manager', async ({ page }) => {
    // Re-checked here rather than inherited from the serial chain above, so this test still
    // states its own precondition when run standalone under --grep.
    await requireEventStoredBarnLocal()

    await page.goto(`/barn/${barn.slug}?date=${EVENT_DAY}`)

    // `CalendarEventCard` is a non-link `Card`, so there is no href to find it by. Reached from
    // its title text through the parent element instead — no class coupling. Its paragraphs as
    // an exact array: the time, then the title, and nothing else (the event carries no notes).
    // A superset render fails, and a card that did not render reads `[]`.
    const card = page.getByText(EVENT_TITLE, { exact: true }).locator('..')
    expect(await card.locator('p').allTextContents()).toEqual([BARN_HOUR_DISPLAY, EVENT_TITLE])
  })
})
