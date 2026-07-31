// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/DocumentRemindersSection.tsx
// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/components/calendar/**
import { test, expect, withBarn, type Page } from './support/test'
import {
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
  // The lesson's time has to be set: daysFromNow carries the runner's own time of day, and the
  // dashboard sorts on barn-local wall clock, so a seed landing after 23:00 *in the barn's zone*
  // would otherwise place it past the expense (#1150).
  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
  await addExpense(supabase, barn, {
    at: daysFromNow(2),
    time: '23:00',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })

  // Date-only planned expense (no time) — must stay off the dashboard, which shows only
  // scheduled expenses that have a time set. Asserted on its own day, not an unrelated one.
  await addExpense(supabase, barn, {
    at: daysFromNow(4),
    recipient: 'Feed Supplier',
    expenseType: 'Feed',
  })

  // Both unpaid fixtures enrol the stub rider, not the `rider` login, so the manager's
  // Reminders section has barn-wide content to show. The matching hidden-for-a-rider
  // assertion moved to checklist-phase6-dashboard.spec.ts (#1136) and reseeds this same
  // pairing there — keep the two in step if either changes.
  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(-1),
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
    at: daysFromNow(-3),
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })

  // Undated on purpose — the spec sets its reminder date through the horse page's own form.
  await addHorseDocument(supabase, barn, apollo.id, { recordType: 'coggins', fileName: 'coggins.pdf' })
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
