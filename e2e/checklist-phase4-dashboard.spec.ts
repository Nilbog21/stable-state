import { test, expect } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

// #1015 replaced the dashboard's old Today/This-Week split with a single-day
// CalendarDayView — the day heading itself carries the "Today" indicator now.
// @mobile rather than @manager: the mobile project runs on the manager storageState too,
// so this doubles as the dashboard's small-viewport smoke test without running twice.
test('dashboard_today_indicator_visible_on_current_day @mobile', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  await expect(page.getByRole('heading', { name: /Today$/ })).toBeVisible()
})

// Each click re-derives the "Next day" locator and waits for the URL's `date` param to
// actually advance before clicking again — it's a client-side transition on a server-rendered
// Link, so its href (and the page underneath it) don't update synchronously with the click.
// Firing clicks back-to-back races the same stale link and nets zero navigation.
async function goToDaysAhead(page: import('@playwright/test').Page, days: number) {
  await page.goto(`/barn/${barnSlug}`)
  for (let i = 0; i < days; i++) {
    const next = page.getByRole('link', { name: 'Next day' })
    const targetDate = new URL((await next.getAttribute('href'))!, page.url()).searchParams.get('date')
    await next.click()
    await page.waitForURL((url) => url.searchParams.get('date') === targetDate)
  }
}

// The Valley Farrier expense is seeded at 23:00 on the same barn-local day as a lesson
// whose own time-of-day isn't controlled (it's "2 days from whenever the suite seeded
// the barn") — pinning the expense to near end-of-day makes "lesson card, then expense
// card" a deterministic DOM order regardless. A single-day view only ever shows these
// two items on that day (the old third item, a lesson 3 days further out, belongs to a
// different day entirely now).
test('dashboard_expense_interleaved_with_lesson_by_time_on_shared_day @manager', async ({ page }) => {
  await goToDaysAhead(page, 2)
  const cardLinks = page.locator('a[href*="/lessons/"], a[href*="/expenses/"]')
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
  await page.goto(`/barn/${barnSlug}`)
  await expect(page.getByRole('heading', { name: 'Reminders' })).toBeVisible()
})

test('dashboard_reminders_header_hidden_for_rider_with_no_reminders @rider', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  await expect(page.getByRole('heading', { name: 'Reminders' })).toHaveCount(0)
})

test('dashboard_document_reminder_card_shown_after_setting_reminder_date @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/horses`)
  await page.getByRole('link', { name: /Apollo/ }).first().click()
  await expect(page).toHaveURL(new RegExp(`/barn/${barnSlug}/horses/`))

  const pastDate = new Date()
  pastDate.setUTCDate(pastDate.getUTCDate() - 1)
  const pastDateStr = pastDate.toISOString().slice(0, 10)

  const dateInput = page.locator('input[type="date"]')
  await dateInput.fill(pastDateStr)
  await dateInput.blur()
  await page.waitForLoadState('networkidle')

  await page.goto(`/barn/${barnSlug}`)
  const expectedDate = new Date(pastDateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
  await expect(page.getByRole('link', { name: `Apollo — Coggins — ${expectedDate}` })).toBeVisible()
})

test('dashboard_unpaid_lesson_reminder_links_to_outstanding @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  const unpaidLessons = page.getByRole('link', { name: /unpaid lesson/ })
  await expect(unpaidLessons).toHaveAttribute('href', `/barn/${barnSlug}/finances/outstanding`)
})

test('dashboard_unpaid_lease_reminder_links_to_outstanding @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  const unpaidLease = page.getByRole('link', { name: /unpaid lease/ })
  await expect(unpaidLease).toHaveAttribute('href', `/barn/${barnSlug}/finances/outstanding`)
})
