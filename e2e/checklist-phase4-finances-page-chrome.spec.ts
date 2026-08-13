// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, addPaidLesson, addTier, addUnpaidLesson, monthAnchor } from './support/fixtures'
import { formatMonthParam } from '@/lib/finances-month'

// The page-level invariants this file covers hold across every tab, so every assertion is
// made against all five rather than against a representative one.
const TABS = ['horse', 'tier', 'rider', 'trainer', 'recipient'] as const

// The three labels #971 deleted along with the Gross Income / Total Expenses / Net Income
// SummaryStatCards (see the removed markup in commit 6ce94264). Kept as the literal strings
// the checklist names, because the assertion is precisely that these strings are gone.
const REMOVED_SUMMARY_BOX_LABELS = ['Gross Income', 'Total Expenses', 'Net Income']

const barn = withBarn('phase4-finances-page-chrome', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, 'Apollo')

  // Each tab falls back to an EmptyState unless its own dimension has activity, and an
  // EmptyState has neither the column headers nor the reconciliation footer this file
  // asserts on — so the seed has to light up all five. One collected lesson carries four of
  // them (horse, tier, rider, instructor) at once.
  await addPaidLesson(supabase, barn, {
    monthsAgo: 0,
    instructorId: members.trainer.membershipId,
    fee: tier.price,
    tierName: tier.name,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
  })

  // By Paid To is the fifth, gated on a recipient having expenses. An expense only reaches
  // the ledger once its amount is known (see sync_expense_transaction), so this one carries
  // an amount from the start.
  await addExpense(supabase, barn, {
    monthsAgo: 0,
    recipient: 'Ridge Feed',
    expenseType: 'Feed',
    amount: 25,
    horseIds: [apollo.id],
  })

  // The two fixtures below are scenery for the Pending income check, which asserts that
  // line's position relative to *both* Outstanding sections — and each section renders only
  // when it has at least one entry. Nothing else in this file reads them.
  await addUnpaidLesson(supabase, barn, {
    monthsAgo: 0,
    instructorId: members.trainer.membershipId,
    fee: tier.price,
    tierName: tier.name,
    horseIds: [apollo.id],
    riderIds: [members.rider2.membershipId],
  })
  // An explicit past time-of-day, because getOutstandingExpenses treats a time-less expense
  // as due at 23:59:59 on its date — still in the future for a current-month fixture, and so
  // never past-due. No amount, so it stays out of every breakdown above.
  await addExpense(supabase, barn, {
    monthsAgo: 0,
    time: '00:01',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Derived from the same barn-framed anchor the fixtures are placed by, never from the raw
 * clock: finances/page.tsx resolves its default month through `barnToday` (#1360), so a param
 * computed in the host's UTC names next month — and gets clamped back down to the barn's —
 * for the hours each month after UTC rolls over and the barn hasn't.
 */
function currentMonth(): string {
  return formatMonthParam(monthAnchor(0, barn.data.barn.timezone))
}

function financesUrl(tab?: (typeof TABS)[number]): string {
  return `/barn/${barn.slug}/finances?month=${currentMonth()}${tab ? `&tab=${tab}` : ''}`
}

/**
 * The active tab's breakdown table. Scoped to a direct `main > div` child so it can't also
 * match the Outstanding Income table, which has a thead of its own but sits deeper, inside
 * its `<section>`.
 */
function breakdownTable(page: Page) {
  return page.locator('main > div > table')
}

/**
 * Blocks until the breakdown table exists. Every reader below reaches it through
 * `evaluateAll`, which — unlike `expect`'s matchers — does **not** auto-wait: a table that
 * hasn't rendered yet silently yields `[]`, and the resulting diff reads as "this tab rendered
 * no table" rather than "this read was too early". That misdiagnosis cost a full round of
 * investigation on #1238. A tab whose data is genuinely empty renders an EmptyState and no
 * table at all, so a timeout here is the honest failure for that case too.
 */
async function awaitBreakdownTable(page: Page): Promise<void> {
  await breakdownTable(page).waitFor()
}

/**
 * The label of every "label above a big figure" block on the page, in document order. Each
 * such block is a direct `<section>`/`<div>` child of `<main>` whose first child is its own
 * label `<p>` — a structural handle rather than a class-name one. Only the leading text node
 * is read, so the label's trailing InfoPopover glyph is excluded.
 */
async function summaryBlockLabels(page: Page): Promise<string[]> {
  const blocks = page.locator('main > section > p:first-child, main > div > p:first-child')
  // Same no-auto-wait hazard `awaitBreakdownTable` guards against, on a different locator.
  await blocks.first().waitFor()
  return blocks.evaluateAll((paragraphs) => paragraphs.map((p) => (p.childNodes[0]?.textContent ?? '').trim()))
}

/**
 * The money-column header labels of the current tab — every column but the first, which is
 * the per-tab dimension (Horse/Tier/Rider/Trainer/Recipient) and is asserted by the other
 * slices' own checkboxes. Read from `textContent`, not `innerText`: Th uppercases its label
 * in CSS. The sort-direction glyph is stripped so an active column still compares equal.
 */
async function moneyColumnHeaders(page: Page): Promise<string[]> {
  await awaitBreakdownTable(page)
  return breakdownTable(page)
    .locator('thead th')
    .evaluateAll((headers) =>
      headers.slice(1).map((th) => (th.querySelector('div > *')?.textContent ?? '').replace(/[▲▼]/g, '').trim())
    )
}

/** The reconciliation footer's row labels, in document order. */
async function footerRowLabels(page: Page): Promise<string[]> {
  await awaitBreakdownTable(page)
  return breakdownTable(page)
    .locator('tfoot tr')
    .evaluateAll((rows) => rows.map((row) => (row.querySelector('td')?.childNodes[0]?.textContent ?? '').trim()))
}

/** Reads `read` on each of the five tabs in turn. */
async function forEachTab(page: Page, read: (page: Page) => Promise<string[]>): Promise<string[][]> {
  const perTab: string[][] = []
  for (const tab of TABS) {
    await page.goto(financesUrl(tab))
    perTab.push(await read(page))
  }
  return perTab
}

// ---------------------------------------------------------------------------
// The Pending income line and the summary boxes #971 removed
// ---------------------------------------------------------------------------

// Prefix-matched on purpose: whether the label carries a month/year suffix is the next
// checkbox's claim, so this one asserts position (Pending income sits below both
// Outstanding sections) and singularity (one entry, not one per month) and nothing else.
test('pending_income_line_appears_once_below_the_outstanding_sections @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(await summaryBlockLabels(page)).toEqual([
    expect.stringMatching(/^Outstanding Income/),
    expect.stringMatching(/^Outstanding Expenses/),
    expect.stringMatching(/^Pending income/),
  ])
})

// The month picker directly above the line already names the month, so the label must not
// repeat it. Positional destructuring rather than a fresh locator: the test above owns the
// claim that the third block is the Pending income one.
test('pending_income_line_has_no_month_year_suffix @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const [, , pendingIncome] = await summaryBlockLabels(page)
  expect(pendingIncome).toBe('Pending income')
})

// Deliberately a page-wide absence claim rather than a restatement of the block list above:
// #971 removed these three boxes because their numbers reconciled with no one breakdown
// table below, so the check is that the labels are gone from the page entirely. The regex is
// start-anchored, so no ancestor element can match by concatenating its descendants' text.
test('no_gross_expenses_net_summary_boxes_remain_on_the_page @manager', async ({ page }) => {
  await page.goto(financesUrl())

  await expect(page.getByRole('heading', { name: 'Finances', level: 1 })).toBeVisible()
  await expect(page.getByText(new RegExp(`^(${REMOVED_SUMMARY_BOX_LABELS.join('|')})`))).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The uniform columns and footer every tab shares
// ---------------------------------------------------------------------------

test('every_tab_shows_the_same_gross_expenses_net_columns @manager', async ({ page }) => {
  expect(await forEachTab(page, moneyColumnHeaders)).toEqual(TABS.map(() => ['Gross', 'Expenses', 'Net']))
})

test('every_tab_footer_lists_the_reconciliation_rows_in_order @manager', async ({ page }) => {
  expect(await forEachTab(page, footerRowLabels)).toEqual(
    TABS.map(() => ['Subtotal', 'Unattributed', 'Outside this view', 'Total'])
  )
})
