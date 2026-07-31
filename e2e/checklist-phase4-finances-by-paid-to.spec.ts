// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addExpense, addHorse, monthAnchor, type SeededAppointment } from './support/fixtures'
import { formatMonthParam } from '@/lib/finances-month'
import type { Horse } from '@/lib/db/types'

// By Paid To is a pure expense breakdown — no lesson, tier or agreement is seeded here,
// because none of them can ever contribute a row to it (a recipient is only ever the payee
// of an appointments record). Every figure asserted below comes from one of these seed
// amounts, from a builder return value, or from another figure read off the DOM.
const ACE_EXPENSE = 300
const BRIGHT_EXPENSE = 100
const SMITH_FARRIER_EXPENSE = 120
const SMITH_VET_EXPENSE = 80
// Seeded a month back, never navigated to: it is what gives "…for the month" its teeth on
// both the tab's Expenses column and the drill-down's row list. Deliberately larger than
// this month's whole Smith total, so a month filter that stopped working could not go
// unnoticed as a rounding-sized difference.
const SMITH_PREVIOUS_MONTH_EXPENSE = 500
// Added mid-test by the final test in this file, never at seed time.
const BRIGHT_SECOND_EXPENSE = 45

// Three recipients, not two. The server hands the table its rows already sorted by total
// descending (getRecipientExpenseSummary), so with two rows "rows load sorted by Recipient
// name ascending" and "tap Expenses re-sorts ascending" cannot both have teeth — one of
// them necessarily agrees with the order the server already produced.
//
//   this month's Expenses     Ace 300, Bright 100, Smith 200
//   name ascending            Ace,    Bright, Smith
//   Expenses ascending        Bright, Smith,  Ace
//   Expenses descending       Ace,    Smith,  Bright
//   server order (desc)       Ace,    Smith,  Bright
//
// Name-ascending differs from the server's order, and Expenses-ascending differs from both,
// so no sort assertion below can pass against a table nobody sorted.
//
// Smith's name carries both an ampersand and spaces, which is what the drill-down URL
// round-trip check needs; it doubles as the multi-expense recipient (two entries this
// month) and as the drill-down subject, since nothing mutates it.
const ACE = 'Ace Hay Co'
const BRIGHT = 'Bright Feed'
const SMITH = 'Dr. Smith & Sons'

const SEEDED_RECIPIENT_COUNT = 3

// 1-based, matching CSS nth-child. Uniform across every breakdown tab.
const RECIPIENT_COL = 1
const GROSS_COL = 2
const EXPENSES_COL = 3
const NET_COL = 4

type Seeded = {
  horse: Horse
  smithFarrier: SeededAppointment
  smithVet: SeededAppointment
}

let seeded: Seeded

const barn = withBarn('phase4-finances-by-paid-to', async ({ supabase, barn }) => {
  // Every expense is attached to this one horse rather than left barn-wide. A barn-wide
  // expense in a barn with no horses attributes to nobody, which would put the whole month
  // into the footer's Unattributed row — a different slice's subject, and noise here.
  const horse = await addHorse(supabase, barn.id, 'Apollo')

  // Day 15 rather than pastInstantInMonth(0): a mid-month anchor cannot drift into an
  // adjacent month when the suite runs near a boundary, and nothing on this tab is filtered
  // on `< now`, so an anchor still a few days in the future is fine.
  const thisMonth = { at: monthAnchor(0) }
  const forApollo = { horseIds: [horse.id] }

  await addExpense(supabase, barn, { ...thisMonth, ...forApollo, recipient: ACE, expenseType: 'Feed', amount: ACE_EXPENSE })
  await addExpense(supabase, barn, { ...thisMonth, ...forApollo, recipient: BRIGHT, expenseType: 'Feed', amount: BRIGHT_EXPENSE })

  // Two entries for one recipient, with two different expense types, so the tab's Expenses
  // column has an aggregate to get right and the drill-down's Type column has something to
  // distinguish.
  const smithFarrier = await addExpense(supabase, barn, {
    ...thisMonth,
    ...forApollo,
    recipient: SMITH,
    expenseType: 'Farrier',
    amount: SMITH_FARRIER_EXPENSE,
  })
  const smithVet = await addExpense(supabase, barn, {
    ...thisMonth,
    ...forApollo,
    recipient: SMITH,
    expenseType: 'Vet',
    amount: SMITH_VET_EXPENSE,
  })

  await addExpense(supabase, barn, {
    monthsAgo: 1,
    ...forApollo,
    recipient: SMITH,
    expenseType: 'Farrier',
    amount: SMITH_PREVIOUS_MONTH_EXPENSE,
  })

  seeded = { horse, smithFarrier, smithVet }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derived from the same monthAnchor the fixtures are placed by, not from the raw clock — a
 * param computed independently can disagree with the month a fixture actually landed in if a
 * UTC month rolls over between the two calls. (Both sides are UTC-framed since #1151, so that
 * rollover race is all that's left; it used to be a window |UTC offset| hours wide.)
 */
function currentMonth(): string {
  return formatMonthParam(monthAnchor(0))
}

/** finances/page.tsx resolves its default month from the server clock, so never rely on it. */
function byPaidToUrl(month = currentMonth()): string {
  return `/barn/${barn.slug}/finances?month=${month}&tab=recipient`
}

function drilldownPath(recipient: string, month = currentMonth()): string {
  return `/barn/${barn.slug}/finances/expenses/${encodeURIComponent(recipient)}?month=${month}`
}

function expenseEditPath(expenseId: string): string {
  return `/barn/${barn.slug}/expenses/${expenseId}`
}

/**
 * The By Paid To breakdown table, scoped by its own leading header. Seeded expenses carry no
 * payment type, so this page also renders the Outstanding Expenses section — that one is a
 * <ul>, not a table, but scoping by header keeps "the breakdown table is the only table here"
 * from being a silent assumption a later fixture change could break.
 */
function breakdownTable(page: Page): Locator {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: /^recipient/i }) })
}

function breakdownRows(page: Page): Locator {
  return breakdownTable(page).locator('tbody tr')
}

function columnCells(page: Page, index: number): Locator {
  return breakdownRows(page).locator(`td:nth-child(${index})`)
}

function recipientRow(page: Page, recipient: string): Locator {
  return breakdownRows(page).filter({ has: page.getByRole('link', { name: recipient, exact: true }) })
}

async function expensesCell(page: Page, recipient: string): Promise<number> {
  return parseMagnitude(await recipientRow(page, recipient).locator('td').nth(EXPENSES_COL - 1).innerText())
}

/** The Expenses column passes formatCurrency's `forceParens`, so parens are notation, not sign. */
function parseMagnitude(text: string): number {
  return Math.abs(Number(text.replace(/[^0-9.]/g, '')))
}

/**
 * Each header's own label text — the first button (sortable column) or span (not) inside the
 * th, which is the label element in both SortableTh modes. Read via textContent because the
 * Th class list uppercases the rendered text; excludes InfoPopover's trailing ⓘ trigger, and
 * strips the ▲/▼ the active column's label carries.
 */
async function columnLabels(page: Page): Promise<string[]> {
  return breakdownTable(page)
    .locator('thead th')
    .evaluateAll((ths) =>
      ths.map((th) => (th.querySelector('button, span')?.textContent ?? '').replace(/[▲▼]/g, '').trim())
    )
}

/**
 * The sort controls currently carrying `indicator`, as a locator rather than as text already
 * read out — so a test whose claim *is* where the indicator sits asserts it with a retrying
 * `toHaveText` and needs no wait of its own to settle the re-render. The ⓘ triggers share
 * these header cells, hence the aria-label exclusion.
 */
function headersShowing(page: Page, indicator: '▲' | '▼'): Locator {
  return breakdownTable(page).locator('thead th button:not([aria-label="Info"])').filter({ hasText: indicator })
}

function header(page: Page, label: RegExp): Locator {
  return breakdownTable(page).locator('thead th').filter({ hasText: label })
}

/** The header's sort control, as opposed to the ⓘ button that may sit beside it. */
function sortButton(page: Page, label: RegExp): Locator {
  return header(page, label).getByRole('button', { name: label })
}

/**
 * Blocks until the sort indicator has landed on a header, which is how a test knows React has
 * finished re-rendering the sorted rows and a plain (non-retrying) read of them is safe.
 * Locator.waitFor(), deliberately, and not an expect(): the latter is a real assertion and
 * would put a second one into a test that makes a single claim.
 */
function awaitSortIndicator(page: Page, label: RegExp, indicator: '▲' | '▼'): Promise<void> {
  return header(page, label).locator('button', { hasText: indicator }).waitFor()
}

/** The drill-down's bottom Total is a two-span flex row beneath the table, not a <tfoot>. */
function drilldownTotal(page: Page): Locator {
  return page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span')
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

test('by_paid_to_tab_shows_recipient_gross_expenses_net_columns @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  expect(await columnLabels(page)).toEqual(['Recipient', 'Gross', 'Expenses', 'Net'])
})

// One claim ("those two columns hold nothing but a dash"), asserted across both columns of
// every row at once rather than split into a per-column pair.
test('by_paid_to_gross_and_net_are_always_a_dash @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await expect(breakdownRows(page).locator(`td:nth-child(${GROSS_COL}), td:nth-child(${NET_COL})`)).toHaveText(
    Array(SEEDED_RECIPIENT_COUNT * 2).fill('—')
  )
})

test('by_paid_to_expenses_column_is_the_recipients_combined_total @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  expect(await expensesCell(page, SMITH)).toBe(seeded.smithFarrier.amount! + seeded.smithVet.amount!)
})

// The class attribute, not a computed style: `underline` is unconditional here, so a
// regression to a hover-only treatment would move the rule into a hover: variant and this
// resting-state selector would stop matching.
test('by_paid_to_recipient_name_is_an_underlined_link @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await expect(breakdownTable(page).locator(`a.underline[href="${drilldownPath(SMITH)}"]`)).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

test('by_paid_to_rows_load_sorted_by_recipient_name_ascending @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await expect(columnCells(page, RECIPIENT_COL)).toHaveText([ACE, BRIGHT, SMITH])
})

test('by_paid_to_recipient_header_shows_an_ascending_indicator_on_load @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await expect(header(page, /^recipient/i)).toContainText('▲')
})

test('by_paid_to_expenses_header_tap_re_sorts_rows_ascending @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await sortButton(page, /^expenses/i).click()
  await expect(columnCells(page, RECIPIENT_COL)).toHaveText([BRIGHT, SMITH, ACE])
})

// "…and disappears from Recipient" is the same claim as "…appears on Expenses" — one
// indicator, one place — so it is asserted as the exclusive match set rather than as a
// present-here/absent-there pair. Tapped bare, with no awaitSortIndicator: that helper waits
// for exactly what this test claims, so calling it here would leave the assertion with
// nothing left to catch (the shape #1089/#1090/#1091 each landed a fix for).
test('by_paid_to_expenses_header_tap_moves_the_ascending_indicator_off_recipient @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await sortButton(page, /^expenses/i).click()
  await expect(headersShowing(page, '▲')).toHaveText(['Expenses ▲'])
})

// Compared against the ascending order this same test just read off the page, rather than
// against a written-out expectation, so the claim is about the second tap reversing whatever
// the first tap produced.
test('by_paid_to_second_expenses_header_tap_reverses_the_row_order @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await sortButton(page, /^expenses/i).click()
  await awaitSortIndicator(page, /^expenses/i, '▲')
  const ascending = await columnCells(page, RECIPIENT_COL).allInnerTexts()

  await sortButton(page, /^expenses/i).click()
  await awaitSortIndicator(page, /^expenses/i, '▼')
  expect(await columnCells(page, RECIPIENT_COL).allInnerTexts()).toEqual([...ascending].reverse())
})

test('by_paid_to_second_expenses_header_tap_flips_the_indicator_to_descending @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await sortButton(page, /^expenses/i).click()
  await awaitSortIndicator(page, /^expenses/i, '▲')
  await sortButton(page, /^expenses/i).click()
  await expect(header(page, /^expenses/i)).toContainText('▼')
})

// ---------------------------------------------------------------------------
// Drill-down
// ---------------------------------------------------------------------------

// Sorted before comparing rather than compared positionally: both seeded entries share a
// day-15 expense_date, so the page's date-ascending sort leaves their relative order
// undefined. The previous month's larger entry is the one this excludes.
test('recipient_drilldown_lists_only_that_recipients_expenses_for_the_month @manager', async ({ page }) => {
  await page.goto(drilldownPath(SMITH))
  const amounts = (await page.locator('tbody tr td:nth-child(3)').allInnerTexts()).map(parseMagnitude)
  expect(amounts.sort((a, b) => a - b)).toEqual(
    [seeded.smithFarrier.amount!, seeded.smithVet.amount!].sort((a, b) => a - b)
  )
})

test('recipient_drilldown_shows_date_type_amount_columns @manager', async ({ page }) => {
  await page.goto(drilldownPath(SMITH))
  await expect(page.locator('thead th')).toHaveText(['Date', 'Type', 'Amount'])
})

test('recipient_drilldown_date_links_to_the_expense_edit_page @manager', async ({ page }) => {
  await page.goto(drilldownPath(SMITH))
  const hrefs = await page
    .locator('tbody tr td:nth-child(1) a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')))
  expect(hrefs.sort()).toEqual(
    [expenseEditPath(seeded.smithFarrier.id), expenseEditPath(seeded.smithVet.id)].sort()
  )
})

// Both figures are read off the two pages and compared to each other, so this asserts that
// the summary and the detail agree — not that either matches a total computed here.
test('recipient_drilldown_total_matches_the_by_paid_to_expenses_cell @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  const summary = await expensesCell(page, SMITH)
  await page.goto(drilldownPath(SMITH))
  expect(parseMagnitude(await drilldownTotal(page).innerText())).toBe(summary)
})

// The heading, not the URL: the link's href only proves the name was encoded, while the
// heading is rendered from the page's own decodeURIComponent of the route segment, so it is
// the half of the round-trip that a broken or garbled URL actually breaks.
// The waitForURL is synchronisation, not part of the claim: it only settles the cross-route
// navigation, whose default 5s assertion timeout flakes under full-suite load (#1140), and
// deliberately matches the drill-down route without naming the recipient — the encode/decode
// round-trip stays entirely the heading assertion's to catch.
test('recipient_name_with_ampersand_round_trips_through_the_drilldown_link @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  await breakdownTable(page).getByRole('link', { name: SMITH, exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/finances/expenses/`), { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: SMITH, exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Adding a second expense for a recipient that already has one
// ---------------------------------------------------------------------------

// Last in the file, and the only test here that mutates: it changes Bright Feed's total, and
// so its position in every sort order above. A delta against the figure read off the page
// first, so no baseline knowledge is needed and the seeded amount never appears as an
// expected value.
test('by_paid_to_total_combines_a_second_expense_for_the_same_recipient @manager', async ({ page }) => {
  await page.goto(byPaidToUrl())
  const before = await expensesCell(page, BRIGHT)

  const added = await addExpense(barn.data.supabase, barn.data.barn, {
    at: monthAnchor(0),
    recipient: BRIGHT,
    expenseType: 'Feed',
    amount: BRIGHT_SECOND_EXPENSE,
    horseIds: [seeded.horse.id],
  })

  await page.goto(byPaidToUrl())
  expect(await expensesCell(page, BRIGHT)).toBe(before + added.amount!)
})
