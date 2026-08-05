// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-form-parsing.ts
// covers: src/app/actions/expenses.ts
// covers: src/components/calendar/**
// covers: src/components/useOutsideDismiss.ts
//
// The three `src/app/actions/` files are the SERVER ACTIONS behind the three forms this spec
// submits, and they are reached by import rather than by path, so no route glob covers them:
// `submitLesson`/`updateLessonAction` back items 706 and 709, `parseLessonFormData` is the code
// that turns the hidden `lesson_at` input item 707 asserts into the instant item 709 asserts,
// and `createExpenseAction` writes the row whose `transactions.occurred_at` item 710 reads.
// A regression in `lesson-form-parsing.ts` is the single most likely way 707 and 709 break.
// (`checklist-phase4-lessons-cancel-group.spec.ts` sets the per-file precedent.)
//
// The subtree globs are deliberately whole subtrees rather than `new/**`. A `/**` glob is a
// literal string PREFIX (docs/scripts.md), and the components these tests actually assert on
// — `lessons/LessonStartTime.tsx`, `lessons/LessonForm.tsx`, `lessons/LessonListItem.tsx`,
// `expenses/ExpenseForm.tsx` — sit one level ABOVE `new/`. `select-specs.sh --lint` passes
// either way, because `new/**` matches `new/page.tsx`; it just silently fails to select this
// spec when the form components themselves change, which is the only case that matters
// (#1204 measured this on its own file).
//
// The two `src/components/` entries are not routes. Since #1281 `ALWAYS_FULL` carries the whole
// of `src/components/**` and `src/app/actions/**`, so those entries — and the three
// `src/app/actions/` lines above — now document what this spec drives rather than select it.
// They stay declared because the accuracy rule binds regardless (docs/scripts.md) — not because
// that membership is provisional, which #1357 measured and it is not. `calendar/**` supplies markup asserted on
// directly (`CalendarLessonCard`, `CalendarEventCard`, `MonthCalendarPicker`);
// `useOutsideDismiss.ts` is reached through `MonthCalendarPicker` and owns the open/close state
// of the day popup that item 709's day selection drives, which is exactly the kind of module
// you forget you drive because you reach it through a helper.
//
// `EmptyState` and `ExhaustionBar` render on these pages and are deliberately NOT declared: no
// assertion here touches either, and over-declaring makes the selector run specs that cannot
// detect the change. `src/lib/**` IS in ALWAYS_FULL, so `format-date.ts` and `barn-timezone.ts`
// need no glob of their own.
//
// checklists/pre-release/phase-4-manager-verification.md lines 513-523: barn-local *instant*
// rendering and entry — the display half of the viewer timezone frame #1222 deleted. Adjacent
// slices: #1204 owns 507-512 (the barn-*day* cutoff half of the same "Under that setup" run)
// and #1205 owns 524-531.
// Nothing outside 513-523 is touched.
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addTier, addUnpaidLesson, E2E_USERS } from './support/fixtures'
import { settledTextContents } from './support/read'
import { hydrateByDriving } from './support/hydration'
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
// The same 4 PM as an "HH:MM" wall clock, which is what #1021's minute-granular Start Time field
// reads and writes. `BARN_HOUR` survives alongside it for the Add Event form, which still uses
// the whole-hour `DateHourPicker`.
const BARN_TIME = `${BARN_HOUR}:00`
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
 * whose `LessonStartTime` computes its defaults from the browser clock in a `useState`
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
// "HH:MM" since #1021: the New Lesson default is now read off a minute-granular time input
// rather than an hour `<select>`, so the expected value carries the :00 the field renders.
const PIN_BARN_TIME = '01:00'

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
  // The one precondition the whole file rests on, and it is not decoration.
  //
  // Items 702-705 read a value the app both ENCODES and DECODES through `barns.timezone`: the
  // seed writes an instant, and `formatBarnDateTime`/`formatBarnTime`/`LessonForm`'s pre-fill
  // all render it back through `instant.tz`, which the DAL fills from that same column. Encode
  // and decode therefore share one zone Z, and "4:00 PM" comes back unchanged for ANY Z — so
  // if the barn's zone were ever Honolulu, those four items would go green in precisely the
  // configuration under which they prove nothing at all. Nothing else in this file would catch
  // it: `EASTERN` only enters through the direct-DB helpers, which items 706 and 709-712 use
  // and 702-705 do not.
  //
  // Asserting the barn's zone once here closes it for all four, and the seed below then frames
  // its instant in `EASTERN` rather than in whatever the row happens to say, so the expected
  // value stops agreeing with the app on the one axis this file is about.
  if (barn.timezone !== EASTERN) {
    throw new Error(
      `precondition: this barn's timezone is ${barn.timezone}, expected ${EASTERN}. Lines 702-712 ` +
        'all say "under that setup", and that setup pins Barn Timezone to Eastern (line 696). With ' +
        'any other zone, items 702-705 become a round trip through one shared zone and assert nothing.'
    )
  }

  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, HORSE_NAME)

  seededLesson = await addUnpaidLesson(supabase, barn, {
    at: wallClockToInstant(LESSON_WALL_CLOCK, EASTERN),
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
async function openBarnEventsSection(page: Page): Promise<Locator> {
  await page.goto(`/barn/${barn.slug}/settings`)
  const sec = page.locator('details').filter({ has: page.getByRole('heading', { name: 'Barn Events', exact: true }) })
  await sec.getByRole('heading', { name: 'Barn Events', exact: true }).click()
  // Scoped to this section's own Add Event link, which sits inside the `<details>` and so is
  // genuinely hidden until it opens. Not parameterised by title: the open-proof is specific to
  // this section, and a `title` argument would let a caller wait, inside a different section,
  // for a control that can never appear there.
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
 * Pages the month grid to the month containing `day`, then taps that day. The bounded-loop shape
 * is `checklist-timezone.spec.ts`'s; the days this file picks are at most 3 ahead, so one page
 * forward is the most that is ever needed.
 *
 * #1021 removed the dismiss that used to close the day panel here: on the lesson form that panel
 * hosts the Start Time field, so it is always open and has no Close button. (ExpenseForm still
 * has one — `checklist-phase4-settings-fields.spec.ts` continues to click it.)
 */
async function pickCalendarDay(page: Page, day: string): Promise<void> {
  const monthHeading = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))
  for (let i = 0; i < 2 && !(await page.getByText(monthHeading, { exact: true }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
  }
  await expect(page.getByText(monthHeading, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: day, exact: true }).click()
}

/** The time the time-axis barrier below enters. Never the picker's own default. */
const HYDRATION_BARRIER_TIME = '09:00'

/**
 * A day in the same calendar month as the barn's today, so it is always inside the rendered
 * grid without paging. `getMonthGrid` starts at the 1st minus its weekday, so a neighbouring
 * day in an ADJACENT month is only sometimes present — and a month always has at least 28
 * days, so at least one of ±1 stays inside it.
 */
const HYDRATION_BARRIER_DAY =
  shiftDay(BARN_TODAY, 1).slice(0, 7) === BARN_TODAY.slice(0, 7)
    ? shiftDay(BARN_TODAY, 1)
    : shiftDay(BARN_TODAY, -1)

/**
 * Whether the named hidden input already reports the given barn-local field, which only
 * client-side React can write. `slice` picks the field: `[0, 10]` for the date, `[11, 13]` for
 * the hour, `[0, 19]` for the whole wall clock.
 *
 * `name` because two forms here carry such an input: the lesson form's `lesson_at` and — since
 * #1363 — `ExpenseForm`'s `occurred_at`, which `computeOccurredAt` recomputes from the date and
 * time fields on every render.
 *
 * A one-shot predicate rather than a `waitForFunction`, because `hydrateByDriving` owns the
 * pacing — a retrying read inside its loop would spend the whole budget on the first attempt
 * that lands before hydration (#1280).
 */
async function pickerFieldIs(
  page: Page,
  name: string,
  from: number,
  to: number,
  expected: string
): Promise<boolean> {
  return page.evaluate(
    ([zone, want, start, end, field]) => {
      const el = document.querySelector(`input[name="${field as string}"]`) as HTMLInputElement | null
      if (!el?.value) return false
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: zone as string,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(el.value))
      const get = (t: string) => parts.find((p) => p.type === t)!.value
      const wall = `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}:${get('second')}`
      return wall.slice(start as number, end as number) === want
    },
    [EASTERN, expected, from, to, name] as const
  )
}

/**
 * Blocks until React has hydrated `LessonStartTime` and taken over its state.
 *
 * A precondition that throws, not an assertion — and it is not optional. Waiting for
 * `#lesson-start-time` to appear proves nothing about hydration: that element is in the
 * SERVER-rendered HTML, so a read taken straight after it sees the server's answer. That is
 * #1191's "unsettled page" hazard in its quietest form, because the server's answer is usually
 * the right one, so the assertion passes for the wrong reason. Both barriers below were forced
 * by probes that PASSED.
 *
 * Each barrier perturbs the axis the test it serves does NOT assert, then waits for the hidden
 * `lesson_at` input to carry the change — a write only client-side React can produce, so
 * observing it is genuine proof the component is live. `selectOption`/`click` before hydration
 * is a no-op on a control whose listener is not attached yet, which is exactly why the wait is
 * on the consequence rather than on the control's own value.
 *
 * What it does NOT do — measured, after an earlier version of this comment claimed otherwise —
 * is reconcile `aria-pressed`. That attribute keeps the server's value through hydration and
 * through the barrier's own re-render alike; only a month-nav round trip was observed to move
 * it. So the barrier makes the hidden input trustworthy and leaves the day cell exactly as
 * stale as it was.
 *
 * Both go through `hydrateByDriving` (`support/hydration.ts`, #1280) rather than driving once and
 * waiting: a control driven before React is listening receives nothing and nothing replays it, so
 * a single drive can only run out the budget. Re-entering the same time is idempotent, which is
 * what makes the time axis safe to retry.
 */
async function hydrateByChangingTime(page: Page): Promise<void> {
  await hydrateByDriving(
    () => page.locator('#lesson-start-time').fill(HYDRATION_BARRIER_TIME),
    // 11..16 rather than 11..13 since #1021: the wall clock the hidden input now carries is
    // minute-granular, so the barrier has to match "HH:MM" or it would pass on a truncation.
    () => pickerFieldIs(page, 'lesson_at', 11, 16, HYDRATION_BARRIER_TIME)
  )
}

/**
 * The date-axis barrier, for the test that asserts the TIME and so must not perturb it.
 *
 * #1021 removed the trailing dismiss this used to carry. It existed because `Close` lived inside
 * MonthCalendarPicker's `useState`-gated popup, so it was unreachable on the pre-hydration
 * attempt and had to wait until `lesson_at` proved React was live (#1280). The lesson form now
 * passes `dayPanelAlwaysOpen`, so that panel is open from the server's own markup and renders no
 * Close button at all — there is nothing left to dismiss, and the ordering hazard is gone with it.
 */
async function hydrateByChangingDay(page: Page): Promise<void> {
  await hydrateByDriving(
    () => page.getByRole('button', { name: HYDRATION_BARRIER_DAY, exact: true }).click(),
    () => pickerFieldIs(page, 'lesson_at', 0, 10, HYDRATION_BARRIER_DAY)
  )
}

/**
 * The `aria-label`s of every day cell the month grid reports as selected.
 *
 * Scoped to the picker's own grid rather than the page: `aria-pressed` is not unique to this
 * component in `src/`, so an unscoped read would silently start collecting someone else's
 * toggle the moment one appeared above the grid.
 *
 * `evaluateAll` keeps its inline `waitFor` guard, which is the condition `e2e/support/read.ts`
 * attaches to using it instead of a settled helper — without it an unpainted grid reads `[]`
 * and the caller's `[0]` is `undefined`, failing as a flake rather than on its real claim.
 */
function pressedDayLabels(page: Page): Promise<string[]> {
  const grid = page.locator('button[aria-label][data-past]')
  return grid.first().waitFor().then(() =>
    grid.evaluateAll((els) =>
      els.filter((el) => el.getAttribute('aria-pressed') === 'true')
        .map((el) => el.getAttribute('aria-label') ?? '')
    )
  )
}

// ---------------------------------------------------------------------------
// A lesson at 4:00 PM — checklist lines 702-706
// ---------------------------------------------------------------------------
//
// Every assertion in this block is full-string (`toHaveText`, or an object/array equality),
// never `toContainText`: "4:00 PM" is a substring of nothing the app renders here, but the
// batch's matcher-level vacuity finding is about the class, not the instance.

// A plain `describe`, not `.serial`. Four of these five tests are read-only reads of the seeded
// lesson, and the fifth's entire claim is that it changes NOTHING — so there is no mutated state
// for a chain to share, which is the bar `.serial` is meant to clear. It also cost real
// verification signal while it was serial: a probe killing the first test skipped the other four,
// and two of them had to be re-probed in isolation to be reached at all.
test.describe("A 4:00 PM lesson renders in the barn's zone", () => {
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

  test('edit_form_opens_on_the_lessons_barn_local_date_and_four_pm_start_time @manager', async ({ page }) => {
    await page.goto(`${lessonHref(seededLesson.id)}/edit`)
    await page.locator('#lesson-start-time').waitFor()

    // Both halves of line 705 in one equality. The time is the discriminating half: a
    // viewer-framed decode of this instant yields 10:00, and a UTC one yields 20:00 (measured —
    // a probe pointing the decode at the runtime's own zone produced exactly `time: "20:00"`).
    //
    // The seed-equals-default question has a sharper answer here than "the field starts empty":
    // `LessonStartTime` falls back to THE BARN'S CURRENT HOUR at :00 when `initialTime` is
    // absent. So a form that dropped the prop entirely renders '16:00' during the 16:00-16:59
    // barn-local hour and this half agrees with it. Narrow (1-in-24) and time-of-day dependent,
    // so it reads as a flake rather than as vacuity — recorded here rather than papered over.
    //
    // The date half is asserted because the line names it, but 4:00 PM Eastern and 10:00 AM
    // Honolulu are the same calendar day, so it does not discriminate on its own.
    expect({
      date: (await pressedDayLabels(page))[0],
      time: await page.locator('#lesson-start-time').inputValue(),
    }).toEqual({ date: LESSON_DAY, time: BARN_TIME })
  })

  test('resaving_the_edit_form_unchanged_leaves_the_stored_time_untouched @manager', async ({ page }) => {
    // Precondition, not an assertion: "untouched" is only meaningful if the stored value was
    // the expected one to begin with, and a worker restart re-seeds this barn.
    const before = await seededLessonWallClock()
    if (before !== LESSON_WALL_CLOCK) {
      throw new Error(`precondition: lesson stored at ${before}, expected ${LESSON_WALL_CLOCK}`)
    }

    await page.goto(`${lessonHref(seededLesson.id)}/edit`)
    await page.locator('#lesson-start-time').waitFor()
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
    await hydrateByChangingTime(page)

    // The pre-filled date, read as the barn-local date of the value the form will submit.
    //
    // **Not `aria-pressed`, and that is the finding this test cost two probes to reach.** A
    // first version asserted the selected day cell straight after the picker appeared, and a
    // probe breaking the date default to the DEVICE's day PASSED against it — twice over: the
    // read happened before hydration, and `aria-pressed` is an ATTRIBUTE that React 19 leaves
    // at the server's value on a hydration mismatch anyway. Measured: under that probe the cell
    // read `2026-08-04` (server) while the hidden input already read `2026-08-03T05:00:00.000Z`
    // (client), and the cell still read `2026-08-04` after the barrier below. The pin was doing
    // nothing and the assertion was green for the wrong reason.
    //
    // The cell was then dropped from the assertion rather than kept alongside: past the barrier
    // it provably still carries the server's answer, so asserting it adds a claim that cannot
    // fail for the reason line 707 is about — #1204's F1 shape, an assertion whose expected
    // value the component produces whether or not it read its input. `input[name="lesson_at"]`
    // is a React-controlled PROPERTY, so it carries the browser's computation, and it is also
    // the value the form submits — the pre-fill that actually decides anything. With the clock
    // pinned, a control resolving the default in the DEVICE's zone answers `BARN_TODAY - 1`.
    const submitted = await page.locator('input[name="lesson_at"]').inputValue()
    expect(barnWallClock(new Date(submitted), EASTERN).slice(0, 10)).toBe(BARN_TODAY)
  })

  test('new_lesson_start_time_opens_on_the_barns_hour_not_the_devices @manager', async ({ page }) => {
    await page.clock.setFixedTime(PIN_INSTANT)
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await hydrateByChangingDay(page)

    // The item this file leans on hardest. At the pinned instant the barn reads hour 1, the
    // device reads 19 and UTC reads 5 — three distinct values — so this is the one assertion
    // here that separates the barn's frame from the device's AND from UTC at once, which is
    // what closes the axis item 707 provably cannot (see assertPinArithmetic).
    //
    // One residue, stated rather than hidden: the SERVER renders this field from the real
    // clock, not the pinned one, so during the 01:00-01:59 barn-local hour the server's own
    // markup already says '01:00'. The barrier above is what makes the read a client read, and
    // it is load-bearing for that window specifically.
    await expect(page.locator('#lesson-start-time')).toHaveValue(PIN_BARN_TIME)
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
    await page.locator('#lesson-start-time').fill(BARN_TIME)
    await submitForm(page, 'Submit', new RegExp(`/barn/${barn.slug}/lessons$`))

    // Exact array over "every lesson but the seeded one", so a form that created nothing reads
    // `[]` and fails rather than passing on an empty set. A viewer-framed encode stores this
    // 4:00 PM as 02:00 UTC the next day, which renders back as `T22:00:00` barn-local — six
    // hours off, and not a value this seed can otherwise produce.
    expect(await otherLessonWallClocks()).toEqual([NEW_LESSON_WALL_CLOCK])
  })

  test('adding_an_expense_at_eleven_thirty_pm_stores_it_barn_local_in_transactions @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/expenses/new`)
    // The Time field leads, and it is the hydration barrier as well as the test's own input
    // (#1363): an unhydrated `fill` moves the DOM value without firing `onChange`
    // (e2e/CLAUDE.md fact 9), and React reconciles a controlled input's value at hydration — so a
    // fill made before this barrier can be silently discarded. `occurred_at` is recomputed by
    // `computeOccurredAt` on every render and defaults to midnight while the Time field is blank,
    // so it carrying 23:30 Eastern is a write only client-side React can have made. Re-entering
    // the same time is idempotent, which is what makes it safe to re-dispatch.
    //
    // The Date field is left on its own pre-fill, which is the server's `todayStr`. That is
    // deliberate on two counts: it is BARN_TODAY, and `ExpenseForm` hides the Time field
    // entirely for a past date — so touching the date is what would put line 710's own subject
    // out of reach. The [0, 19] slice pins that date alongside the time, since `occurred_at`
    // carries both.
    await hydrateByDriving(
      () => page.locator('#expense-time').fill(EXPENSE_TIME),
      () => pickerFieldIs(page, 'occurred_at', 0, 19, EXPENSE_WALL_CLOCK)
    )
    await page.locator('#expense-recipient').fill(EXPENSE_RECIPIENT)
    await page.locator('#expense-type').fill(EXPENSE_TYPE)
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

test.describe.serial("A barn event's time renders in the barn's zone", () => {
  test('barn_event_row_on_manage_barn_shows_the_barn_local_four_pm @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/events/new`)
    await page.locator('#event-title').fill(EVENT_TITLE)
    // EventForm is `DateHourPicker`'s only consumer since #1021, and it has always used the
    // plain native date input and whole-hour select asserted here.
    await page.locator('#dh-date').fill(EVENT_DAY)
    await page.locator('#dh-hour').selectOption(String(BARN_HOUR))
    await submitForm(page, 'Save', new RegExp(`/barn/${barn.slug}/settings$`))

    await requireEventStoredBarnLocal()

    const section = await openBarnEventsSection(page)
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
    expect(await settledTextContents(card.locator('p'))).toEqual([BARN_HOUR_DISPLAY, EVENT_TITLE])
  })
})
