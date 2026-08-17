// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/DocumentRemindersSection.tsx
// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/components/calendar/**
// covers: src/lib/month-calendar.ts
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { openSection } from './support/accordion'
import { goToDaysAhead } from './support/dashboard'
import { GRID_CELLS, dayCell, dayCells, goToMonth, pickDay } from './support/calendar'
import { BARN_TIMEZONES, barnToday, instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
import { addDays } from '@/lib/local-day'
import {
  addBarnEvent,
  addExpense,
  addHorse,
  addHorseDocument,
  addLeaseCharge,
  addPaidLesson,
  addTier,
  addUnpaidLesson,
  daysFromNow,
  updateBarnSettings,
} from './support/fixtures'

// ---------------------------------------------------------------------------
// The barn-zone pin (#1283)
// ---------------------------------------------------------------------------

/**
 * The barn's own timezone, pinned to whichever `BARN_TIMEZONES` member currently sits furthest
 * from its *own* midnight.
 *
 * **Why the barn's zone and not `page.clock`.** #1252's idiom pins the browser's clock, which
 * reaches only values the browser computes (e2e/CLAUDE.md fact 7). Nothing this file depends on
 * is one: `page.tsx` resolves `todayStr = barnToday(barn.timezone)` on the **server**, and every
 * Prev/Next-day href is server-rendered from it. A browser pin here would be inert — green while
 * doing nothing, which is the #1204 failure mode the idiom exists to prevent. The barn's
 * `timezone` column is the one lever that reaches the server's answer, and this spec owns its barn.
 *
 * **What the pin buys.** Every fixture below is placed by `daysFromNow(n, barn.timezone)` at seed
 * time, and the tests reach those days by loading the dashboard — which recomputes the barn's
 * today per request — and clicking "Next day" n times. The two agree unless the run straddles
 * barn-local midnight between `beforeAll` and the test, at which point every day-0 assertion and
 * every `goToDaysAhead` destination is off by one. #1187 accepted that window rather than fork
 * the clock-pinning decision; this closes it, by choosing the zone furthest from its own midnight
 * and stating the resulting margin in minutes rather than in a comment.
 */
const PIN_NOW = new Date()

/** Minutes between `at` and the nearest midnight in `zone`, so 12:00 local reads 720 and 00:00 reads 0. */
function minutesFromBarnMidnight(zone: string, at: Date): number {
  const wall = instantToLocalWallClock(at, zone)
  const sinceMidnight = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))
  return Math.min(sinceMidnight, 24 * 60 - sinceMidnight)
}

const PINNED_ZONE = BARN_TIMEZONES.reduce<string>(
  (best, candidate) =>
    minutesFromBarnMidnight(candidate.value, PIN_NOW) > minutesFromBarnMidnight(best, PIN_NOW)
      ? candidate.value
      : best,
  BARN_TIMEZONES[0].value
)

/**
 * The floor the pin has to clear.
 *
 * `BARN_TIMEZONES` spans UTC−4 (EDT) to UTC−10, so at any instant the seven zones offer six
 * distinct local hours, and the worst UTC hour to be standing at is 07:xx — Eastern reads 03:xx
 * and Honolulu 21:xx, leaving a best available distance of about three hours. Two is under that
 * worst case by a full hour and so cannot fire spuriously today, while an edit that narrowed the
 * zone list far enough to matter fails at collection instead of flaking one run in a hundred.
 */
const MIN_MIDNIGHT_MARGIN_MINUTES = 120

/**
 * Every day offset this file seeds a fixture at *or navigates to*, which are not the same set:
 * day +1 carries no fixture but is where `dashboard_today_link_appears_when_viewing_another_day`
 * and `dashboard_today_link_returns_to_todays_calendar` both stand. It is listed for that reason
 * — leaving it out would let a test added at +1 later inherit a pin that looks arithmetic-checked
 * and is not for that offset, which is the shape of the thing this guard exists to prevent.
 *
 * Listed rather than inferred so the guard below has something to check the seed against.
 */
const SEEDED_DAY_OFFSETS = [-3, -1, 0, 1, 2, 3, 4] as const

/**
 * The pin's arithmetic, executable rather than written in a comment (#1252's `assertPinArithmetic`
 * shape, adopted here by #1283 — the throwing guard is the load-bearing half of that idiom, not
 * the pin: #1204's pin sat one axis away from the regression it existed to catch, and only review
 * noticed).
 *
 * The second check is the one that states what these tests actually discriminate. `daysFromNow`
 * frames its result as barn-local noon on today + n, and the dashboard reaches the same day by
 * `addDays` on its own server-side `barnToday` — two different code paths onto one calendar day.
 * Asserting that they agree at every offset the file seeds is the executable form of "the seed
 * and the pager are in the same frame", and it fails at collection rather than as an
 * unreproducible off-by-one card count if they ever stop being.
 */
function assertZonePinArithmetic(): void {
  const problems: string[] = []
  const margin = minutesFromBarnMidnight(PINNED_ZONE, PIN_NOW)
  if (margin < MIN_MIDNIGHT_MARGIN_MINUTES) {
    problems.push(
      `barn-local now in ${PINNED_ZONE} is ${margin} minutes from its own midnight, under the ` +
        `${MIN_MIDNIGHT_MARGIN_MINUTES}-minute floor — no BARN_TIMEZONES member is far enough from midnight.`
    )
  }
  const today = barnToday(PINNED_ZONE, PIN_NOW)
  for (const offset of SEEDED_DAY_OFFSETS) {
    const seeded = instantToLocalWallClock(daysFromNow(offset, PINNED_ZONE, PIN_NOW), PINNED_ZONE).slice(0, 10)
    const navigated = addDays(today, offset)
    if (seeded !== navigated) {
      problems.push(
        `day ${offset} seeds onto ${seeded} but the dashboard's pager reaches ${navigated} from ${today}`
      )
    }
  }
  if (problems.length > 0) {
    throw new Error(`the barn-zone pin ${PINNED_ZONE} is misaimed:\n  ${problems.join('\n  ')}`)
  }
}
assertZonePinArithmetic()

const barn = withBarn('phase4-dashboard', async ({ supabase, barn, members }) => {
  // Before anything is seeded, so every fixture below — and every day the *pages* compute — is in
  // the pinned zone rather than the barn's default. `barn` is the object every builder reads its
  // timezone from, so the local copy is moved with the row (#1283).
  await updateBarnSettings(supabase, barn.id, { timezone: PINNED_ZONE })
  barn.timezone = PINNED_ZONE

  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')

  // Day +2 carries exactly one lesson and one expense — the interleave assertion below
  // depends on nothing else landing there. Both are pinned to an explicit barn-local time,
  // 10:00 before 23:00, making "lesson card, then expense card" a deterministic DOM order.
  // Both times are pinned here rather than left to daysFromNow's barn-local noon, so the
  // ordering this test asserts is stated at the seed instead of inherited from a fixture
  // default. It was load-bearing until #1221: daysFromNow carried the runner's own time of
  // day, and the dashboard sorts on barn-local wall clock, so a seed landing after 23:00 *in
  // the barn's zone* would place the lesson past the expense (#1150).
  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
  await addExpense(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '23:00',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })

  // Date-only planned expense (no time) — must stay off the dashboard, which shows only
  // scheduled expenses that have a time set. Asserted on its own day, not an unrelated one.
  await addExpense(supabase, barn, {
    at: daysFromNow(4, barn.timezone),
    recipient: 'Feed Supplier',
    expenseType: 'Feed',
  })

  // Both unpaid fixtures enrol the stub rider, not the `rider` login, so the manager's
  // Reminders section has barn-wide content to show. The matching hidden-for-a-rider
  // assertion moved to checklist-phase6-dashboard.spec.ts (#1136) and reseeds this same
  // pairing there — keep the two in step if either changes.
  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(-1, barn.timezone),
    instructorId: members.trainer.membershipId,
    horseIds: [bella.id],
    riderIds: [members.rider2.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
    fee: 150,
  })

  // A paid past lesson so the day view and lesson list aren't empty behind the reminders.
  await addPaidLesson(supabase, barn, {
    at: daysFromNow(-3, barn.timezone),
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })

  // Undated on purpose — the spec sets its reminder date through the horse page's own form.
  await addHorseDocument(supabase, barn, apollo.id, { recordType: 'coggins', fileName: 'coggins.pdf' })

  // --- #1187 ---------------------------------------------------------------------------
  // Today (day 0) had nothing on it before this slice. The three rows below are what make
  // "today's lessons and that expense are ordered by time together" falsifiable: 09:00
  // lesson, 12:00 expense, 15:00 lesson, so the rendered order is lesson → expense → lesson.
  // A view that grouped entries into per-type blocks could only ever produce
  // lesson → lesson → expense, whichever way it sorted within a block.
  //
  // Paid, not unpaid, on purpose. getOutstandingLessonRows counts any past unpaid lesson, so
  // an unpaid 09:00 lesson would join the "N unpaid lessons" count that the two Reminders
  // tests below assert exact text against — and would do so only on runs where the suite
  // happens to start after 09:00 barn-local, which is the worst kind of flake.
  //
  // Times pinned for the same reason the day+2 pair above pins them (#1150/#1221): the
  // dashboard buckets and sorts on barn-local wall clock, so intra-day ordering has to be
  // stated at the seed rather than inherited from daysFromNow's noon default.
  await addPaidLesson(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    time: '09:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
  await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    time: '12:00',
    recipient: 'Hilltop Equine',
    expenseType: 'Vet',
    horseIds: [bella.id],
  })
  await addPaidLesson(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    time: '15:00',
    instructorId: members.trainer.membershipId,
    horseIds: [bella.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })

  // No horseIds at all — addExpense maps that to applies_to_all_horses, which is the only
  // way to reach the "Entire Barn" card. Parked on day +3, which nothing else seeds, rather
  // than on today: a fourth card today would break the exact three-item interleave above,
  // and day +2 / day +4 already carry their own exact-count assertions.
  await addExpense(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: '08:00',
    recipient: 'Barn Supply Co',
    expenseType: 'Supplies',
  })

  // --- #1188 ---------------------------------------------------------------------------
  // The Week-view fixtures sit on FIXED calendar dates rather than daysFromNow offsets.
  //
  // Two reasons. A relative offset lands on a different weekday every day of the week, and
  // the day-to-content map the Week view is asserted against below is the whole point of
  // those items — #1188's own acceptance criteria require the Sunday-to-Saturday window to
  // be pinned explicitly instead of inherited from the runner's current weekday. And four
  // years out is comfortably clear of days -3..+4, where every exact-count assertion in this
  // file lives: none of these three rows can reach today's calendar, the day +2/+3/+4 cards,
  // or either Reminders count.
  //
  // W1 is Sunday 2030-05-12 .. Saturday 2030-05-18, viewed through ?date=2030-05-15 — a
  // Wednesday, so a rolling 7-day window would start on the 15th where a calendar-aligned
  // one starts on the 12th. Tuesday, Thursday and Friday carry one item each; the other four
  // days are empty.
  //
  // Inserted in reverse day order — Friday, then Thursday, then Tuesday — deliberately. The
  // bucketing assertion's expected answer has to differ from every fallback the system could
  // produce by accident, and insertion order is one of them.
  const barnNoon = (date: string) => wallClockToInstant(`${date}T12:00:00`, barn.timezone)

  await addBarnEvent(supabase, barn, { at: barnNoon('2030-05-17'), title: 'Spring Open House' })
  await addExpense(supabase, barn, {
    at: barnNoon('2030-05-16'),
    time: '14:00',
    recipient: 'Ridgeline Vet',
    expenseType: 'Vet',
    horseIds: [bella.id],
  })
  // Paid rather than unpaid. getOutstandingLessons only counts lessons already in the past,
  // so a 2030 unpaid lesson would not reach the "N unpaid lessons" card either — but a paid
  // row cannot reach it under any clock at all, and two tests above assert that card's exact
  // text.
  //
  // That card has a second contributor whose guard is weaker, and it is worth naming because
  // the obvious reading of the paragraph above would get it wrong: unpaidLessonsCount is
  // outstandingLessons + outstanding *cancellation fees*, and
  // getOutstandingCancellationFeeRows (lesson-finance-queries.ts) has **no date bound at
  // all** — it takes every lesson_riders row in the barn with a non-null cancelled_at. So
  // this row is held out of that count by being **uncancelled**, not by being future-dated
  // and not by being paid. Don't cancel this lesson or its rider.
  await addPaidLesson(supabase, barn, {
    at: barnNoon('2030-05-14'),
    time: '09:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

// #1015 replaced the dashboard's old Today/This-Week split with a single-day
// CalendarDayView — the day heading itself carries the "Today" indicator now.
// @mobile rather than @manager: the mobile project runs on the manager storageState too,
// so this doubles as the dashboard's small-viewport smoke test without running twice.
test('dashboard_today_indicator_visible_on_current_day @mobile', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.getByRole('heading', { name: /Today$/ })).toBeVisible()
})

test('dashboard_expense_interleaved_with_lesson_by_time_on_shared_day @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const cardLinks = page.locator('a[href*="/lessons/"], a[href*="/expenses/"]')
  // A wait, not an assertion: evaluateAll is a one-shot read with no auto-wait, so on its own
  // it can sample whichever document is mounted when it runs. The other goToDaysAhead callers
  // below all follow with a retrying expect() and self-heal; this one has to wait explicitly.
  // Day +2 is the only day seeded with a rendered expense card, so that card is the signal.
  await page.locator('a[href*="/expenses/"]').first().waitFor()
  const hrefs = await cardLinks.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  expect(hrefs.map((h) => h.includes('/expenses/'))).toEqual([false, true])
})

// Asserted on the Feed Supplier expense's own day (rather than "today") so this proves
// the no-scheduled-time exclusion itself, not just that it's absent from an unrelated day.
test('dashboard_date_only_planned_expense_not_shown @manager', async ({ page }) => {
  // 15.2s warm — 51% of the 30s default. `goToDaysAhead` walks the day pager four times, and on
  // a cold server each hop can wait on `next dev` compiling the dashboard route inside the same
  // budget. Per-test rather than in `goToDaysAhead`: that helper is shared across specs by tests
  // that run well under 10s, so budgeting it there would over-apply suite-wide (#1482).
  test.slow()
  await goToDaysAhead(page, barn.slug, 4)

  // goToDaysAhead ends on waitForURL(..., { waitUntil: 'commit' }), which resolves before the
  // new document renders — so without this the absence below can be read off a page that has
  // not drawn anything yet (spec-maintenance rule 4). The Calendar <h2> is the day-independent
  // half of the section the expense card would have rendered into.
  await expect(page.getByRole('heading', { name: 'Calendar' })).toBeVisible()
  await expect(page.getByText('Feed Supplier')).toHaveCount(0)
})

test('dashboard_expense_card_shows_scheduled_time @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink.locator('p').first()).toContainText('11:00 PM')
})

test('dashboard_expense_card_shows_recipient @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink).toContainText('Valley Farrier')
})

// A substring check for "Farrier" alone would trivially pass off the recipient name
// ("Valley Farrier") even if the expense-type field were removed entirely — this
// targets the type paragraph specifically so it verifies that field independently.
test('dashboard_expense_card_shows_type @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink.locator('p').nth(2)).toHaveText('Farrier')
})

test('dashboard_expense_card_shows_horse @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink).toContainText('Apollo')
})

test('dashboard_reminders_header_visible_for_manager @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible()
})

test('dashboard_document_reminder_card_shown_after_setting_reminder_date @manager', async ({ page }) => {
  // 12.9s warm — 43% of the 30s default. This test visits four routes (horses index, horse
  // detail, the documents section's save round trip, dashboard), so on a cold server it pays
  // `next dev`'s compile of each inside the same budget. The waitForURL below already documents
  // that cold-compile lag for one hop; test.slow() is the budget the whole sequence needs. Per
  // test rather than in `openSection`, which is a shared helper other sub-10s tests call (#1482).
  test.slow()
  await page.goto(`/barn/${barn.slug}/horses`)
  await page.getByRole('link', { name: /Apollo/ }).first().click()
  // page.waitForURL, not a bare expect(page).toHaveURL: expect's 5s default times out under
  // full-suite load while the dev server cold-compiles this route (#1140). 'commit' matches the
  // repo's other cold-compile waits — it skips a `load` event that lags dev navigation.
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/horses/`), { waitUntil: 'commit' })
  await openSection(page, 'Documents')

  const pastDate = new Date()
  pastDate.setUTCDate(pastDate.getUTCDate() - 1)
  const pastDateStr = pastDate.toISOString().slice(0, 10)

  const dateInput = page.locator('input[type="date"]')
  await dateInput.fill(pastDateStr)
  await dateInput.blur()
  await page.waitForLoadState('networkidle')

  await page.goto(`/barn/${barn.slug}`)
  const expectedDate = new Date(pastDateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  await expect(page.getByRole('link', { name: `Apollo — Coggins — ${expectedDate}` })).toBeVisible()
})

test('dashboard_unpaid_lesson_reminder_links_to_outstanding @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  const unpaidLessons = page.getByRole('link', { name: /unpaid lesson/ })
  await expect(unpaidLessons).toHaveAttribute('href', `/barn/${barn.slug}/finances/outstanding`)
})

test('dashboard_unpaid_lease_reminder_links_to_outstanding @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  const unpaidLease = page.getByRole('link', { name: /unpaid lease/ })
  await expect(unpaidLease).toHaveAttribute('href', `/barn/${barn.slug}/finances/outstanding`)
})

// =============================================================================================
// #1187 — the rest of the Dashboard subsection: day view, day navigation, the appointment
// card's own fields and tap-through, and the Reminders cards' individual hide-when-zero.
//
// Every test below is appended rather than interleaved: the file's pre-existing tests are
// untouched and keep their declaration positions. That matters for one of them —
// dashboard_document_reminder_card_shown_after_setting_reminder_date stamps a past reminder
// date on Apollo's Coggins document through the UI, and it declares *above* every test here,
// so nothing below can pull that state out from under it.
// =============================================================================================

/**
 * Every *linked* card the Day view renders — one <a> per lesson and per appointment.
 *
 * Deliberately not "every card": CalendarEventCard renders a Card with **no** href, which
 * Card.tsx emits as a plain <div>, so a barn event contributes no link here at all. Nothing in
 * this barn seeds an event, which is what lets the exact counts below stand.
 */
const dayCards = (page: Page) => page.locator('a[href*="/lessons/"], a[href*="/expenses/"]')

/**
 * Shared deliberately, not duplicated. `dashboard_no_today_link_while_viewing_today` is this
 * slice's only assertion of absence, so it is the only one a typo'd locator could make
 * vacuously true; `dashboard_today_link_appears_when_viewing_another_day` asserts the
 * *identical* locator is visible one day over, which is what turns that typo into a failure
 * instead of a silent pass. Two similar-looking locators would not do that — they have to be
 * the same one.
 *
 * That reasoning still holds, and it closes the *typo'd-locator* hole only. It does nothing
 * about the **timing** hole — `toHaveCount(0)` is satisfied on its first poll (framework fact
 * 18), so the absence test could pass off a document that had not rendered yet, and the paired
 * test one day over is a different page load that cannot speak to it. Spec-maintenance rule 4
 * is explicit that a paired positive test does not satisfy it. The `dayHeading` assertion
 * inside the absence test is what closes the second hole; the pairing keeps closing the first.
 */
const todayLink = (page: Page) => page.getByRole('link', { name: 'Today', exact: true })

/** The day heading's own row, which is what "alongside the calendar heading" means. */
const dayHeading = (page: Page) => page.getByRole('heading', { name: /Today$/ })

/** The Reminders <section>, sibling to the Calendar one. */
const remindersSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Reminders' }) })

// A count, not a sample of names: a week view or a flat list would necessarily also render
// day −3's paid lesson, day −1's unpaid lesson and day +2's lesson/expense pair, so three is
// a number only a correctly day-scoped calendar can produce.
test('dashboard_day_view_shows_only_the_selected_days_entries @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(dayCards(page)).toHaveCount(3)
})

// Scoped to the heading's own parent row rather than the page, so this asserts the
// "alongside" half of the item and not merely that the two links exist somewhere.
test('dashboard_day_heading_has_previous_and_next_day_links @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  const navRow = dayHeading(page).locator('..')
  await expect(navRow.getByRole('link', { name: /^(Previous|Next) day$/ })).toHaveCount(2)
})

// The two expected times are written out as literals beside the seed's '09:00'/'15:00'
// rather than run through formatBarnTime — deriving them from the formatter under test would
// make this agree with any bug in it.
test('dashboard_todays_lessons_appear_on_the_calendar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.locator('a[href*="/lessons/"]')).toHaveText([/9:00 AM/, /3:00 PM/])
})

test('dashboard_todays_planned_expense_appears_alongside_todays_lessons @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.locator('a[href*="/expenses/"]').filter({ hasText: 'Hilltop Equine' })).toBeVisible()
})

// The whole point of the item is the *shape* of the sequence, so the assertion is the
// is-an-expense flag per card in DOM order. Grouping by type could only ever yield
// [false, false, true] or [true, false, false]; only a single time-ordered list gives
// lesson → expense → lesson.
test('dashboard_todays_lessons_and_expense_are_ordered_by_time_not_grouped_by_type @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  // evaluateAll is a one-shot read with no auto-wait, and e2e/support/read.ts deliberately
  // leaves this call shape its inline guard rather than wrapping it. nth(2) rather than the
  // expense card alone: waiting on only the expense could sample a document that has it but
  // not yet both lessons, which reads as a *shorter* array and quietly weakens the claim
  // instead of failing.
  await dayCards(page).nth(2).waitFor()
  const hrefs = await dayCards(page).evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
  expect(hrefs.map((h) => h.includes('/expenses/'))).toEqual([false, true, false])
})

// Asserted by arriving at the seeded expense rather than by re-deriving today+2 as a date
// string: "navigates to the day the expense is scheduled for" is a claim about the
// destination's contents, and computing the date here would just restate goToDaysAhead.
test('dashboard_clicking_next_twice_reaches_the_day_of_the_two_day_out_expense @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  await expect(page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })).toBeVisible()
})

test('dashboard_today_link_appears_when_viewing_another_day @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 1)
  await expect(todayLink(page)).toBeVisible()
})

test('dashboard_today_link_returns_to_todays_calendar @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 1)
  await todayLink(page).click()
  // The Today link drops the ?date= param entirely rather than setting it to today's date.
  await page.waitForURL((url) => !url.searchParams.has('date'), { waitUntil: 'commit' })
  await expect(dayHeading(page)).toBeVisible()
})

// The day heading also reads "… · Today", so this has to target the link specifically — an
// unscoped text check would never fail. See todayLink's own note on why it is shared.
test('dashboard_no_today_link_while_viewing_today @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)

  await expect(dayHeading(page)).toBeVisible()
  await expect(todayLink(page)).toHaveCount(0)
})

// Fourth <p> of the card, matching how dashboard_expense_card_shows_type targets the third:
// a page-wide text check for "Entire Barn" would pass off any stray copy elsewhere, and
// "in place of horse names" is a claim about that specific slot.
test('dashboard_entire_barn_expense_card_shows_entire_barn_instead_of_horses @manager', async ({ page }) => {
  // 12.8s warm — 43% of the 30s default. `goToDaysAhead` walks the day pager three times, and on
  // a cold server each hop can wait on `next dev` compiling the dashboard route inside the same
  // budget. Per-test rather than in `goToDaysAhead`, for the reason given at
  // dashboard_date_only_planned_expense_not_shown (#1482).
  test.slow()
  await goToDaysAhead(page, barn.slug, 3)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Barn Supply Co' })
  await expect(expenseLink.locator('p').nth(3)).toHaveText('Entire Barn')
})

// Asserts the recipient the detail page loaded with, not just that some expense page opened —
// otherwise a card linking to the *wrong* expense would still pass.
test('dashboard_tapping_an_expense_card_opens_its_detail_page @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  const card = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Hilltop Equine' })
  // Wait on this card's own path, not a /expenses/ pattern: the card was *selected* by that
  // fragment, so a pattern-shaped wait is satisfied by the selector itself and says nothing
  // about where the click landed. Computed before the click, while the old document is still
  // the one page.url() describes.
  const expectedPath = new URL((await card.getAttribute('href'))!, page.url()).pathname
  await card.click()
  await page.waitForURL((url) => url.pathname === expectedPath, { waitUntil: 'commit' })
  // 'commit' resolves before the new document has rendered, so the wait alone would also be
  // satisfied by a notFound() or a 500 at that path. Reading a real form field is what proves
  // the expense page rendered, and reading *this* value is what proves it is the right one.
  await expect(page.getByLabel('Recipient', { exact: true })).toHaveValue('Hilltop Equine')
})

/**
 * Stamps the seeded Coggins document's reminder date directly, and hands back the horse it
 * belongs to.
 *
 * The two tests below could have inherited the state
 * dashboard_document_reminder_card_shown_after_setting_reminder_date leaves behind, since it
 * declares first and fullyParallel is false. They deliberately don't: Playwright restarts the
 * worker after a failing test, and the restart re-runs beforeAll and re-seeds the barn — so a
 * failure anywhere above would silently roll that mutation back and fail these two for a
 * reason that has nothing to do with them. Stamping it here makes them restart-proof rather
 * than merely order-correct.
 *
 * A fixed long-past date rather than "yesterday": getDueDocuments compares against the barn's
 * own day, and a date computed here would be computed in the runner's zone.
 */
const COGGINS_REMINDER_DATE = '2020-01-15'
const COGGINS_REMINDER_DISPLAY = 'Jan 15, 2020'

async function stampCogginsReminderDate(): Promise<string> {
  const { supabase, barn: seeded } = barn.data
  const { data, error } = await supabase
    .from('horse_documents')
    .update({ reminder_date: COGGINS_REMINDER_DATE })
    .eq('barn_id', seeded.id)
    .eq('record_type', 'coggins')
    .select('horse_id')
    .single()
  if (error) throw error
  return (data as { horse_id: string }).horse_id
}

// Filtered to the section that actually contains the card, so "directly under Reminders" is
// part of the assertion rather than an assumption: if the card rendered anywhere else the
// filter matches nothing and the heading list comes back empty.
test('dashboard_document_reminder_card_sits_directly_under_reminders_without_its_own_heading @manager', async ({ page }) => {
  await stampCogginsReminderDate()
  await page.goto(`/barn/${barn.slug}`)
  const section = remindersSection(page).filter({
    has: page.getByRole('link', { name: `Apollo — Coggins — ${COGGINS_REMINDER_DISPLAY}` }),
  })
  await expect(section.getByRole('heading')).toHaveText(['Reminders'])
})

test('dashboard_document_reminder_card_links_to_the_horses_detail_page @manager', async ({ page }) => {
  const horseId = await stampCogginsReminderDate()
  await page.goto(`/barn/${barn.slug}`)
  const card = page.getByRole('link', { name: `Apollo — Coggins — ${COGGINS_REMINDER_DISPLAY}` })
  await expect(card).toHaveAttribute('href', `/barn/${barn.slug}/horses/${horseId}`)
})

// Clears every document in the barn rather than just the Coggins one — the item's condition
// is "no documents are past their reminder date", which is a claim about all of them.
//
// Declared after the two tests above (and after the pre-existing reminder test) on purpose:
// this is the only test that removes the document card, so anything asserting the card exists
// has to come first. It re-asserts the two unpaid cards rather than asserting an absence,
// which makes it non-vacuous — an unrendered Reminders section yields zero links, not a pass.
// Both counts are 1: one past unpaid lesson (day −1; the day +2 one is still in the future,
// and today's two are paid) and one unpaid lease charge.
test('dashboard_no_document_reminder_cards_when_no_document_is_past_its_reminder_date @manager', async ({ page }) => {
  const { supabase, barn: seeded } = barn.data
  const { error } = await supabase.from('horse_documents').update({ reminder_date: null }).eq('barn_id', seeded.id)
  if (error) throw error

  await page.goto(`/barn/${barn.slug}`)
  await expect(remindersSection(page).getByRole('link')).toHaveText(['1 unpaid lesson', '1 unpaid lease/boarding'])
})

/**
 * Both Reminders counts are driven by transactions.collected — getOutstandingLessons and
 * getOutstandingCharges each filter their candidates through get_outstanding_transactions —
 * so flipping that column is the same lever addPaidLesson and addLeaseCharge already pull.
 *
 * Rows are captured by id with their prior payment_type before being changed, and restored to
 * those captured values rather than to a guessed null.
 */
type LedgerRow = { id: string; payment_type: string | null }

async function takeUncollected(column: 'lesson_id' | 'agreement_charge_id'): Promise<LedgerRow[]> {
  const { supabase, barn: seeded } = barn.data
  const { data, error } = await supabase
    .from('transactions')
    .select('id, payment_type')
    .eq('barn_id', seeded.id)
    .eq('collected', false)
    .not(column, 'is', null)
  if (error) throw error
  const rows = data as LedgerRow[]
  const { error: updateError } = await supabase
    .from('transactions')
    .update({ collected: true, payment_type: 'venmo' })
    .in('id', rows.map((r) => r.id))
  if (updateError) throw updateError
  return rows
}

async function restoreUncollected(rows: LedgerRow[]): Promise<void> {
  const { supabase } = barn.data
  for (const row of rows) {
    const { error } = await supabase
      .from('transactions')
      .update({ collected: false, payment_type: row.payment_type })
      .eq('id', row.id)
    if (error) throw error
  }
}

// One test, both directions. The checklist line is a single claim about a *relationship*
// ("hidden individually … without hiding the other") rather than two claims that happen to be
// adjacent, so it takes this batch's ratified indivisible-claim exception rather than the
// repo's general one-assertion-per-test default. The line is not split.
//
// Each direction is a single array equality, which proves both halves at once: the zeroed
// card's absence and the other card's survival are the same assertion.
test('dashboard_unpaid_reminder_cards_hide_independently_of_each_other @manager', async ({ page }) => {
  const unpaidLinks = () => remindersSection(page).getByRole('link', { name: /unpaid/ })
  let lessonRows: LedgerRow[] = []
  let chargeRows: LedgerRow[] = []
  try {
    lessonRows = await takeUncollected('lesson_id')
    await page.goto(`/barn/${barn.slug}`)
    await expect(unpaidLinks()).toHaveText(['1 unpaid lease/boarding'])

    await restoreUncollected(lessonRows)
    lessonRows = []
    chargeRows = await takeUncollected('agreement_charge_id')
    await page.goto(`/barn/${barn.slug}`)
    await expect(unpaidLinks()).toHaveText(['1 unpaid lesson'])
  } finally {
    await restoreUncollected(lessonRows)
    await restoreUncollected(chargeRows)
  }
})

// =============================================================================================
// #1188 — the Dashboard subsection's Week view: the Day/Week switcher, calendar alignment,
// per-day headings and content, the per-day and whole-week empty states, 7-day paging, the
// current-period link's presence rule in both directions, today's tint in both colour
// schemes, and the two Week-to-Day landing rules.
//
// Appended, like #1187's block above it, so every pre-existing test keeps its declaration
// position. Nothing here mutates a row, so nothing here can disturb the tests above.
// =============================================================================================

/** Wednesday. Its calendar week is Sunday 2030-05-12 .. Saturday 2030-05-18 (see the seed). */
const WEEK_ANCHOR = '2030-05-15'

/**
 * W1's seven day headings, in order, as formatCalendarDate renders them ("weekday long, month
 * short, day numeric"). Written out as literals rather than computed, so the expected answer
 * cannot agree with a bug in the formatter or in getWeekDates.
 */
const WEEK_DAY_HEADINGS = [
  'Sunday, May 12',
  'Monday, May 13',
  'Tuesday, May 14',
  'Wednesday, May 15',
  'Thursday, May 16',
  'Friday, May 17',
  'Saturday, May 18',
]

/** Wednesday, four weeks past W1. Nothing at all is seeded in Sunday 2030-06-09 .. Saturday 2030-06-15. */
const EMPTY_WEEK_ANCHOR = '2030-06-12'

/**
 * The Calendar <section>.
 *
 * The dashboard has two top-level sections — Reminders and Calendar — and, in Week view, seven
 * more nested inside this one. The filter picks the outer one unambiguously, since no day
 * section carries a "Calendar" heading.
 */
const calendarSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Calendar' }) })

/**
 * The Day/Week pill row.
 *
 * Located as the Calendar section's *first* <div> rather than by its Tailwind classes, because
 * being first is exactly the "above the calendar" half of the item it serves — the locator
 * carries that claim instead of assuming it. The section's children in order are the "Calendar"
 * <h2>, this row, the Prev/heading/Next row, an optional current-period button, and then the
 * calendar body itself.
 */
const pillRow = (page: Page) => calendarSection(page).locator('div').first()

/**
 * The date (Day view) or date-range (Week view) heading that sits between Prev and Next.
 *
 * nth(1), not a text match: the section's own "Calendar" <h2> is nth(0). Locating this by
 * position means the tests below select it by where it is and assert what it says, rather than
 * selecting it by the very text under assertion.
 */
const dateHeading = (page: Page) => calendarSection(page).getByRole('heading', { level: 2 }).nth(1)

/**
 * The Week view's seven per-day <section>s — nothing else in the calendar subtree renders a
 * <section>.
 *
 * One edge worth knowing before reusing this: on a week with nothing on any day,
 * CalendarWeekView returns a single EmptyState *instead* of the seven sections, so this
 * resolves to zero. No test here visits an empty week through this locator — the two tint
 * tests use the real current week, which always holds day 0's three seeded items — and a
 * hypothetical one would fail loudly on a timeout rather than pass, since every use is a
 * positive assertion.
 */
const daySections = (page: Page) => calendarSection(page).locator('section')

/** Their per-day date headings — the only <h3>s the dashboard renders. */
const dayHeadings = (page: Page) => calendarSection(page).getByRole('heading', { level: 3 })

/**
 * Every view/period control in the Calendar section: the three pills (#1558 added Month) plus
 * the current-period link, which reads "This Week" in Week view (page.tsx's currentPeriodLabel)
 * and "Today" in Day view. Prev/Next are excluded — their accessible names come from aria-label
 * ("Previous week"/"Next week") — as are the lesson and appointment cards.
 *
 * Shared deliberately between the two presence-rule tests, and asserted as a positive array in
 * both directions rather than as a count of zero. An absent-link assertion written as
 * toHaveCount(0) passes just as happily when the locator is wrong or the page never rendered;
 * this one requires elements to be there, so a broken locator fails both tests instead of
 * silently satisfying the negative one.
 *
 * Be precise about what the array proves, though, because it is less than it looks: these are
 * plain <a>s, so each accessible name *is* its normalised text, and the locator already
 * filters on exactly those three strings. The expectation therefore adds cardinality and DOM
 * order, not the labels themselves — the real evidence is "four matches here, three there".
 * That is still enough to falsify the checklist claim in both directions, which is why the
 * locator stands; it is not enough to justify reading the assertion as proof that each
 * control is correctly labelled.
 */
const periodControls = (page: Page) =>
  calendarSection(page).getByRole('link', { name: /^(Day|Week|Month|This Week)$/ })

/** The day section whose heading carries the "· Today" suffix CalendarWeekView appends. */
const todayDaySection = (page: Page) =>
  daySections(page).filter({ has: page.getByRole('heading', { level: 3, name: /Today$/ }) })

/** Any day section that is not today's — six of the seven, whatever weekday today falls on. */
const otherDaySection = (page: Page) =>
  daySections(page)
    .filter({ hasNot: page.getByRole('heading', { level: 3, name: /Today$/ }) })
    .first()

/**
 * locator.evaluate auto-waits for the element, so this throws rather than returning a stale or
 * empty value if the section never renders — which matters here more than usual: a computed
 * style read answers with a real value for whatever element it lands on, so a mis-aimed one
 * would pass for the wrong reason. background-color is not inherited, so an accidentally
 * selected ancestor computes as transparent and fails.
 */
const backgroundOf = (locator: Locator) => locator.evaluate((el) => getComputedStyle(el).backgroundColor)

/** An untinted day section's computed background — the control half of both tint assertions. */
const TRANSPARENT = 'rgba(0, 0, 0, 0)'

/**
 * Clicks a Week-view Prev/Next control and waits for the new week to be the *rendered* one.
 *
 * The toHaveAttribute is a wait, not the calling test's assertion. `waitUntil: 'commit'`
 * resolves before the new document has rendered, so a second consecutive step would otherwise
 * read the previous document's link, click a stale href, and satisfy its own URL wait without
 * having moved anywhere — the same race goToDaysAhead documents for the day pager.
 */
async function stepWeek(page: Page, label: 'Previous week' | 'Next week', expectedDate: string) {
  const link = calendarSection(page).getByRole('link', { name: label })
  await expect(link).toHaveAttribute('href', new RegExp(`date=${expectedDate}$`))
  await link.click()
  await page.waitForURL((url) => url.searchParams.get('date') === expectedDate, { waitUntil: 'commit' })
}

test('dashboard_day_week_and_month_pill_switcher_appears_above_the_calendar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(pillRow(page).getByRole('link')).toHaveText(['Day', 'Week', 'Month'])
})

// The line says the Day *view* is active, so the pill alone is not enough: which pill carries
// pillActive and which body rendered are two different facts, and a page highlighting Day
// while rendering the week body would satisfy a pill-only assertion. They happen to derive
// from the same `view` variable in page.tsx today — but that is the code being trusted rather
// than tested. So the expectation pairs them: the active pill's label, and the number of
// per-day headings, which is 0 in Day view and 7 in Week view.
//
// bg-zinc-900 is Pill.tsx's active-state class and appears in no inactive pill (pillInactive
// carries hover:text-zinc-900 — a different property), so the first element also proves Week
// is *not* active. Note the probe is kept off Button.tsx's `variant="primary"`, which carries
// bg-zinc-900 too, only by being scoped to the pill row: the "Today"/"This Week" control two
// divs below would otherwise match. It isn't rendered on this no-?date= load at all, so there
// is nothing to trip over today — but a wrapper div added around the pills would flip this
// onto the wrong control, which is worth knowing before editing either file.
test('dashboard_day_pill_is_the_active_view_on_load @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  const activePill = pillRow(page).locator('[class*="bg-zinc-900"]')
  // textContent/count are one-shot reads with no auto-wait; the active pill settles the page.
  await activePill.waitFor()
  expect([await activePill.textContent(), await dayHeadings(page).count()]).toEqual(['Day', 0])
})

// Anchored on a Wednesday, which is what makes "calendar-aligned, not a rolling 7-day window"
// falsifiable: a rolling window from the viewed date would render May 15 .. May 21.
test('dashboard_week_pill_shows_the_calendar_aligned_sunday_to_saturday_week_of_the_viewed_date @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${WEEK_ANCHOR}`)
  await pillRow(page).getByRole('link', { name: 'Week', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('view') === 'week', { waitUntil: 'commit' })
  await expect(dayHeadings(page)).toHaveText(WEEK_DAY_HEADINGS)
})

// "each of the 7 days shows its own date heading" — so this counts day sections that contain a
// heading, not headings in the section. A bare count of seven <h3>s is also satisfied by six
// days where one carries two, or by seven headings stacked outside any day section.
test('dashboard_week_view_shows_a_date_heading_for_each_of_the_seven_days @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(daySections(page).filter({ has: page.getByRole('heading', { level: 3 }) })).toHaveCount(7)
})

// The bucketing assertion. One regex per day section, matched against that section's whole
// text, so this pins the complete day-to-content map in a single expectation rather than
// sampling it: a lesson on Tuesday, an appointment on Thursday, an event on Friday, and the
// empty-day line on the other four.
//
// The seed inserts those three rows in reverse day order on purpose. Bucketing is a derived
// property, and a derived property can be accidentally right — so the expected answer here is
// one that neither insertion order, nor created_at, nor "everything in the first day" can
// produce. [\s\S]* rather than .*: toHaveText normalises whitespace, but React emits no
// inter-element whitespace here, so a section reads "Tuesday, May 149:00 AMApollo…".
//
// The three occupied days carry a negative lookahead for the *other two* days' markers, and
// that half is what makes this the line's claim rather than a weaker one. Positive
// containment alone says only "this day has its own item"; it cannot see a view that renders
// every occupied day as the union of all occupied days, because each day would still contain
// its own marker and the four empty days would be untouched. That is precisely "items listed
// under a day that isn't theirs". The empty days need no lookahead — anything leaking into
// one costs it the "Nothing scheduled" line, which the regex already demands.
test('dashboard_week_view_lists_each_days_own_items_under_that_day @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(daySections(page)).toHaveText([
    /Sunday, May 12[\s\S]*Nothing scheduled for this day\./,
    /Monday, May 13[\s\S]*Nothing scheduled for this day\./,
    /Tuesday, May 14(?![\s\S]*(?:Ridgeline Vet|Spring Open House))[\s\S]*9:00 AM[\s\S]*Apollo/,
    /Wednesday, May 15[\s\S]*Nothing scheduled for this day\./,
    /Thursday, May 16(?![\s\S]*(?:Apollo|Spring Open House))[\s\S]*Ridgeline Vet/,
    /Friday, May 17(?![\s\S]*(?:Apollo|Ridgeline Vet))[\s\S]*Spring Open House/,
    /Saturday, May 18[\s\S]*Nothing scheduled for this day\./,
  ])
})

// Names the four days rather than counting four occurrences. The claim is about "a day with
// nothing scheduled", so *which* days carry the line is the whole of it — four lines rendered
// on the wrong four days would satisfy a count. Naming them also proves the converse for free:
// Tuesday, Thursday and Friday are absent from this list because they have items.
test('dashboard_week_view_shows_nothing_scheduled_on_a_day_with_no_items @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  const emptyDays = daySections(page).filter({ hasText: 'Nothing scheduled for this day.' })
  await expect(emptyDays.getByRole('heading', { level: 3 })).toHaveText([
    'Sunday, May 12',
    'Monday, May 13',
    'Wednesday, May 15',
    'Saturday, May 18',
  ])
})

// "A single empty state instead of 7 empty lines" is one claim about two things, so it is one
// assertion over a pair. The 1 is what keeps it honest: a locator pointing nowhere would give
// [0, 0] and fail, where a bare toHaveCount(0) on the per-day line would have passed.
test('dashboard_week_view_shows_one_all_clear_empty_state_for_a_week_with_nothing_on_it @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${EMPTY_WEEK_ANCHOR}`)
  const allClear = calendarSection(page).getByText("You're all clear")
  const perDayLines = calendarSection(page).getByText('Nothing scheduled for this day.')
  // count() is a one-shot read with no auto-wait; the empty state is what settles the page.
  await allClear.waitFor()
  expect([await allClear.count(), await perDayLines.count()]).toEqual([1, 0])
})

// Two assertions, one per direction, under this batch's ratified exception for a claim that
// inherently spans a pair — "Prev/Next move the visible range by 7 days" is a single claim
// about a two-ended pager. The checklist line is not split.
//
// Asserted on the rendered range heading rather than on the URL: the href moving by 7 days
// would be satisfied by a page that then rendered some other week.
test('dashboard_week_view_prev_and_next_move_the_visible_range_by_seven_days @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await stepWeek(page, 'Previous week', '2030-05-08')
  await expect(dateHeading(page)).toHaveText('Sunday, May 5 – Saturday, May 11')
  await stepWeek(page, 'Next week', '2030-05-15')
  await stepWeek(page, 'Next week', '2030-05-22')
  await expect(dateHeading(page)).toHaveText('Sunday, May 19 – Saturday, May 25')
})

// 2030 is never today, so this direction needs no clock control of any kind.
test('dashboard_week_view_shows_the_this_week_link_when_today_is_outside_the_visible_week @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(periodControls(page)).toHaveText(['Day', 'Week', 'Month', 'This Week'])
})

// No ?date= at all, so the server resolves the week from the barn's own today — the link's
// absence is decided and rendered in the same request, with no seed-time clock to drift from.
// See periodControls on why this is a positive two-element assertion rather than a zero count.
test('dashboard_week_view_hides_the_this_week_link_when_today_is_inside_the_visible_week @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week`)
  await expect(periodControls(page)).toHaveText(['Day', 'Week', 'Month'])
})

// ---------------------------------------------------------------------------
// Month view (#1558)
// ---------------------------------------------------------------------------

/**
 * The Month view reuses the same May 2030 fixtures the Week view above is pinned to, for the
 * same reason: four years out, so none of them can reach the days -3..+4 where every
 * exact-count assertion in this file lives. Within that month, Tuesday the 14th carries a
 * lesson, Thursday the 16th an appointment and Friday the 17th an event, and every other day
 * is empty — which is what makes both a tinted and an untinted cell assertable by date.
 *
 * MONTH_ANCHOR is a mid-month day rather than the 1st, so the tests also prove the page
 * derives the displayed month from `?date=` instead of only honouring a first-of-month value.
 */
const MONTH_ANCHOR = '2030-05-15'

test('dashboard_month_view_shows_a_full_month_grid @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await expect(dayCells(page)).toHaveCount(GRID_CELLS)
})

test('dashboard_month_view_tints_the_days_that_have_something_scheduled @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)

  await expect(dayCell(page, '2030-05-14')).toHaveAttribute('data-scheduled', 'true')
  await expect(dayCell(page, '2030-05-16')).toHaveAttribute('data-scheduled', 'true')
  await expect(dayCell(page, '2030-05-17')).toHaveAttribute('data-scheduled', 'true')
})

// The control for the assertion above: a cell that resolves but is *not* tinted, so a locator
// matching the wrong element — or a grid tinting every day — fails here.
test('dashboard_month_view_leaves_a_day_with_nothing_on_it_untinted @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await expect(dayCell(page, '2030-05-13')).toHaveAttribute('data-scheduled', 'false')
})

test('dashboard_month_view_shows_that_days_items_when_a_day_is_tapped @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await pickDay(page, '2030-05-17')

  await expect(calendarSection(page).getByText('Spring Open House')).toBeVisible()
})

// The panel renders CalendarDayView, not a text list (#1558's renderDayPanel), so a lesson in
// it is a link to its own detail page — the whole reason the month view is not a dead end.
test('dashboard_month_view_day_panel_links_a_lesson_to_its_detail_page @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await pickDay(page, '2030-05-14')

  await expect(calendarSection(page).getByRole('link', { name: /Apollo/ })).toBeVisible()
})

test('dashboard_month_view_arrows_page_to_the_adjacent_month @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await goToMonth(page, 'Next', '2030-06')

  await expect(dayCell(page, '2030-06-15')).toBeVisible()
})

// The grid renders its own month heading and arrows, so the page's own day/week pager must not
// also be present — two pagers disagreeing about what "next" means is the failure this pins.
test('dashboard_month_view_hides_the_pages_own_date_pager @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=month&date=${MONTH_ANCHOR}`)
  await expect(dayCells(page)).toHaveCount(GRID_CELLS)

  await expect(calendarSection(page).getByRole('link', { name: /^(Previous|Next) (day|week)$/ })).toHaveCount(0)
})

/**
 * Both tint assertions are a pair: today's day section's computed background, and a sibling's.
 *
 * The sibling is the control. A style read answers with a real value for whatever element it
 * lands on, so "today's section is blue" alone could pass off an element that is blue for some
 * other reason; requiring the neighbour to be transparent in the same expectation means a
 * locator that resolved both to the same node fails. Read as backgrounds rather than as
 * toHaveClass because the class attribute is identical in both schemes — `dark:` variants ride
 * along in the same string — so a class assertion could not tell the two items apart, and the
 * dark one would pass on a page that never applied dark mode at all.
 *
 * The two expected colours were measured against the running app, not derived from the
 * Tailwind palette: bg-blue-50/60 and dark:bg-blue-950/30 are opacity-modified utilities, and
 * Tailwind 4 emits those as color-mix(), which Chromium resolves and serialises in oklab —
 *
 *     light   oklab(0.969998 -0.0037263 -0.0134743 / 0.6)     blue-50  at 60%
 *     dark    oklab(0.281996 -0.00328462 -0.090931 / 0.3)     blue-950 at 30%
 *
 * — matched by pattern rather than by those full strings. Seven significant figures of an
 * oklab component are the browser's serialisation, not the app's behaviour, so pinning them
 * would make a Chromium bump fail a test that is about the dashboard. What is pinned is
 * everything the item actually claims and everything that separates the two schemes: the
 * lightness band (0.9x against 0.2x — blue-50 against blue-950, which no rounding can
 * confuse) and the exact alpha (0.6 against 0.3, the two utilities' own opacity modifiers).
 * The patterns are mutually exclusive, so neither test can pass on the other's value.
 */
const TODAY_TINT_LIGHT = expect.stringMatching(/^oklab\(0\.9\d+ [-\d.]+ [-\d.]+ \/ 0\.6\)$/)
const TODAY_TINT_DARK = expect.stringMatching(/^oklab\(0\.2\d+ [-\d.]+ [-\d.]+ \/ 0\.3\)$/)

test('dashboard_week_view_tints_todays_day_section_in_light_mode @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week`)
  expect([await backgroundOf(todayDaySection(page)), await backgroundOf(otherDaySection(page))]).toEqual([
    TODAY_TINT_LIGHT,
    TRANSPARENT,
  ])
})

// Native colorScheme, not a class or data-attribute flip: src/app/globals.css drives dark mode
// purely off prefers-color-scheme, and Tailwind 4's `dark:` variant is that same media query.
// Scoped to its own describe so the file's other tests keep the default light scheme.
test.describe('week view in dark mode', () => {
  test.use({ colorScheme: 'dark' })

  test('dashboard_week_view_tints_todays_day_section_in_dark_mode @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}?view=week`)
    expect([await backgroundOf(todayDaySection(page)), await backgroundOf(otherDaySection(page))]).toEqual([
      TODAY_TINT_DARK,
      TRANSPARENT,
    ])
  })
})

// Asserted on the level-2 date heading, not on any "· Today" text: the Week view puts that
// same suffix on today's day-section <h3>, so a page-wide check for it would pass without the
// Day pill having navigated anywhere at all. In Day view the level-2 heading is the date and
// carries the suffix; in Week view it is the range and carries "· This Week" instead.
test('dashboard_week_to_day_view_lands_on_today_when_today_is_inside_the_week @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week`)
  await pillRow(page).getByRole('link', { name: 'Day', exact: true }).click()
  await page.waitForURL((url) => !url.searchParams.has('view'), { waitUntil: 'commit' })
  await expect(dateHeading(page)).toHaveText(/· Today$/)
})

// Full-string equality rather than a substring: "Sunday, May 12" with nothing after it is also
// what proves this landed on the week's Sunday rather than on today, which would have brought
// a "· Today" suffix with it.
test('dashboard_week_to_day_view_lands_on_the_weeks_sunday_when_today_is_outside_the_week @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await pillRow(page).getByRole('link', { name: 'Day', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('date') === '2030-05-12', { waitUntil: 'commit' })
  await expect(dateHeading(page)).toHaveText('Sunday, May 12')
})
