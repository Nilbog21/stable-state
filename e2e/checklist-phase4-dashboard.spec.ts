// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/DocumentRemindersSection.tsx
// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/components/calendar/**
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { wallClockToInstant } from '@/lib/barn-timezone'
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
} from './support/fixtures'

const barn = withBarn('phase4-dashboard', async ({ supabase, barn, members }) => {
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

  await addBarnEvent(supabase, barn.id, { at: barnNoon('2030-05-17'), title: 'Spring Open House' })
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

// Each click re-derives the "Next day" locator and waits for the URL's `date` param to
// actually advance before clicking again — it's a client-side transition on a server-rendered
// Link, so its href (and the page underneath it) don't update synchronously with the click.
// Firing clicks back-to-back races the same stale link and nets zero navigation.
async function goToDaysAhead(page: Page, days: number) {
  await page.goto(`/barn/${barn.slug}`)
  for (let i = 0; i < days; i++) {
    const next = page.getByRole('link', { name: 'Next day' })
    const targetDate = new URL((await next.getAttribute('href'))!, page.url()).searchParams.get('date')
    await next.click()
    await page.waitForURL((url) => url.searchParams.get('date') === targetDate, { waitUntil: 'commit' })
  }
}

test('dashboard_expense_interleaved_with_lesson_by_time_on_shared_day @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
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
  await goToDaysAhead(page, 4)
  await expect(page.getByText('Feed Supplier')).toHaveCount(0)
})

test('dashboard_expense_card_shows_scheduled_time @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink.locator('p').first()).toContainText('11:00 PM')
})

test('dashboard_expense_card_shows_recipient @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink).toContainText('Valley Farrier')
})

// A substring check for "Farrier" alone would trivially pass off the recipient name
// ("Valley Farrier") even if the expense-type field were removed entirely — this
// targets the type paragraph specifically so it verifies that field independently.
test('dashboard_expense_card_shows_type @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink.locator('p').nth(2)).toHaveText('Farrier')
})

test('dashboard_expense_card_shows_horse @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
  const expenseLink = page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })
  await expect(expenseLink).toContainText('Apollo')
})

test('dashboard_reminders_header_visible_for_manager @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible()
})

test('dashboard_document_reminder_card_shown_after_setting_reminder_date @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await page.getByRole('link', { name: /Apollo/ }).first().click()
  // page.waitForURL, not a bare expect(page).toHaveURL: expect's 5s default times out under
  // full-suite load while the dev server cold-compiles this route (#1140). 'commit' matches the
  // repo's other cold-compile waits — it skips a `load` event that lags dev navigation.
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/horses/`), { waitUntil: 'commit' })

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
  await goToDaysAhead(page, 2)
  await expect(page.locator('a[href*="/expenses/"]').filter({ hasText: 'Valley Farrier' })).toBeVisible()
})

test('dashboard_today_link_appears_when_viewing_another_day @manager', async ({ page }) => {
  await goToDaysAhead(page, 1)
  await expect(todayLink(page)).toBeVisible()
})

test('dashboard_today_link_returns_to_todays_calendar @manager', async ({ page }) => {
  await goToDaysAhead(page, 1)
  await todayLink(page).click()
  // The Today link drops the ?date= param entirely rather than setting it to today's date.
  await page.waitForURL((url) => !url.searchParams.has('date'), { waitUntil: 'commit' })
  await expect(dayHeading(page)).toBeVisible()
})

// The day heading also reads "… · Today", so this has to target the link specifically — an
// unscoped text check would never fail. See todayLink's own note on why it is shared.
test('dashboard_no_today_link_while_viewing_today @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(todayLink(page)).toHaveCount(0)
})

// Fourth <p> of the card, matching how dashboard_expense_card_shows_type targets the third:
// a page-wide text check for "Entire Barn" would pass off any stray copy elsewhere, and
// "in place of horse names" is a claim about that specific slot.
test('dashboard_entire_barn_expense_card_shows_entire_barn_instead_of_horses @manager', async ({ page }) => {
  await goToDaysAhead(page, 3)
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

/** The Week view's seven per-day <section>s. */
const daySections = (page: Page) => calendarSection(page).locator('section')

/** Their per-day date headings — the only <h3>s the dashboard renders. */
const dayHeadings = (page: Page) => calendarSection(page).getByRole('heading', { level: 3 })

/**
 * Every view/period control in the Calendar section: the two pills plus the current-period
 * link, which reads "This Week" in Week view (page.tsx's currentPeriodLabel) and "Today" in
 * Day view. Prev/Next are excluded — their accessible names come from aria-label
 * ("Previous week"/"Next week") — as are the lesson and appointment cards.
 *
 * Shared deliberately between the two presence-rule tests, and asserted as a positive array in
 * both directions rather than as a count of zero. An absent-link assertion written as
 * toHaveCount(0) passes just as happily when the locator is wrong or the page never rendered;
 * this one demands two named elements be there in order, so a broken locator fails both tests
 * instead of silently satisfying the negative one.
 */
const periodControls = (page: Page) =>
  calendarSection(page).getByRole('link', { name: /^(Day|Week|This Week)$/ })

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

test('dashboard_day_and_week_pill_switcher_appears_above_the_calendar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(pillRow(page).getByRole('link')).toHaveText(['Day', 'Week'])
})

// bg-zinc-900 is Pill.tsx's active-state class and appears in no inactive pill — pillInactive
// carries hover:text-zinc-900, a different property. One array assertion therefore proves both
// halves at once: that Day is the active pill, and that Week is not.
test('dashboard_day_pill_is_the_active_view_on_load @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(pillRow(page).locator('[class*="bg-zinc-900"]')).toHaveText(['Day'])
})

// Anchored on a Wednesday, which is what makes "calendar-aligned, not a rolling 7-day window"
// falsifiable: a rolling window from the viewed date would render May 15 .. May 21.
test('dashboard_week_pill_shows_the_calendar_aligned_sunday_to_saturday_week_of_the_viewed_date @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${WEEK_ANCHOR}`)
  await pillRow(page).getByRole('link', { name: 'Week', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('view') === 'week', { waitUntil: 'commit' })
  await expect(dayHeadings(page)).toHaveText(WEEK_DAY_HEADINGS)
})

test('dashboard_week_view_shows_a_date_heading_for_each_of_the_seven_days @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(dayHeadings(page)).toHaveCount(7)
})

// The bucketing assertion. One regex per day section, matched against that section's whole
// text, so this pins the complete day-to-content map in a single expectation rather than
// sampling it: a lesson on Tuesday, an appointment on Thursday, an event on Friday, and the
// empty-day line on the other four.
//
// The seed inserts those three rows in reverse day order on purpose. Bucketing is a derived
// property, and a derived property can be accidentally right — so the expected answer here is
// one that neither insertion order, nor created_at, nor "everything in the first day" can
// produce. [\s\S]* rather than .* so the match survives whatever whitespace normalisation
// toHaveText applies to a multi-line section.
test('dashboard_week_view_lists_each_days_own_items_under_that_day @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(daySections(page)).toHaveText([
    /Sunday, May 12[\s\S]*Nothing scheduled for this day\./,
    /Monday, May 13[\s\S]*Nothing scheduled for this day\./,
    /Tuesday, May 14[\s\S]*9:00 AM[\s\S]*Apollo/,
    /Wednesday, May 15[\s\S]*Nothing scheduled for this day\./,
    /Thursday, May 16[\s\S]*Ridgeline Vet/,
    /Friday, May 17[\s\S]*Spring Open House/,
    /Saturday, May 18[\s\S]*Nothing scheduled for this day\./,
  ])
})

// Four, not seven and not zero: W1 seeds Tuesday, Thursday and Friday, so the count is a
// number only a view that renders the line on empty days and withholds it on occupied ones can
// produce.
test('dashboard_week_view_shows_nothing_scheduled_on_a_day_with_no_items @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${WEEK_ANCHOR}`)
  await expect(calendarSection(page).getByText('Nothing scheduled for this day.')).toHaveCount(4)
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
  await expect(periodControls(page)).toHaveText(['Day', 'Week', 'This Week'])
})

// No ?date= at all, so the server resolves the week from the barn's own today — the link's
// absence is decided and rendered in the same request, with no seed-time clock to drift from.
// See periodControls on why this is a positive two-element assertion rather than a zero count.
test('dashboard_week_view_hides_the_this_week_link_when_today_is_inside_the_visible_week @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week`)
  await expect(periodControls(page)).toHaveText(['Day', 'Week'])
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
