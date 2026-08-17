// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, addPaidLesson, addTier, addUnpaidLesson, monthAnchor } from './support/fixtures'
import { accordionSection } from './support/accordion'
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
 * The active tab's breakdown table. Picked by its reconciliation `<tfoot>`, which the
 * Outstanding Income table doesn't have — a structural `main > div > table` read used to do
 * this job, until #1550 put every table inside an `AccordionSection`.
 */
function breakdownTable(page: Page) {
  return page.locator('main table:has(tfoot)')
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
 * The title of every `AccordionSection` on the page, in document order — read from the `<h2>`
 * inside each `<summary>`, which is a structural handle rather than a class-name one. The
 * collapsed-row `hint` beside it is a sibling of the `<h2>`, not a child, so it's excluded for
 * free.
 */
async function sectionTitles(page: Page): Promise<string[]> {
  const titles = page.locator('main details > summary h2')
  // Same no-auto-wait hazard `awaitBreakdownTable` guards against, on a different locator.
  await titles.first().waitFor()
  return titles.evaluateAll((headings) => headings.map((h) => (h.textContent ?? '').trim()))
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
// The three accordion sections (#1550)
// ---------------------------------------------------------------------------

test('finances_renders_three_accordion_sections_in_order @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(await sectionTitles(page)).toEqual(['Outstanding Income', 'Outstanding Expenses', 'Monthly Breakdown'])
})

// The pager and the pills only ever scoped this one section's content. Two tests, not one:
// they are independently regressable — either could be hoisted back out without the other —
// and one checkbox per assertion is what lets a partial failure be marked cleanly.
//
// Both are containment claims rather than position ones, because "inside Monthly Breakdown" is
// what stops the page reading flat; where within it they sit is not these checkboxes' business.
test('the_month_navigation_lives_inside_monthly_breakdown @manager', async ({ page }) => {
  await page.goto(financesUrl())
  // By glyph rather than by role: at either end of the barn's month range the pager renders an
  // `invisible` placeholder `<span>` in place of the `<a>`, and this barn — seeded in its own
  // creation month — has no previous month to link to.
  await expect(accordionSection(page, 'Monthly Breakdown').getByText(/^[<>]$/)).toHaveCount(2)
})

test('the_tab_pills_live_inside_monthly_breakdown @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const pills = accordionSection(page, 'Monthly Breakdown').getByRole('link', { name: /^By / })
  await expect(pills).toHaveCount(TABS.length)
})

// 44px is the touch-target floor, and a header the manager can't reliably tap is a section
// they can't collapse. `AccordionSection`'s `<summary>` carries `min-h-11`; measured rather
// than asserted on the class, since the class is the mechanism and the height is the claim.
test('every_finances_section_header_is_at_least_44px_tall @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const summaries = page.locator('main details > summary')
  // Same no-auto-wait hazard `awaitBreakdownTable` guards against, on a third locator. The
  // `toHaveLength(3)` below catches a wholly-unrendered page, but a partial one — one or two
  // of the three summaries painted — would fail as a bogus 44px violation without this.
  await summaries.first().waitFor()
  const heights = await summaries.evaluateAll(
    (elements) => elements.map((s) => s.getBoundingClientRect().height)
  )
  expect(heights).toHaveLength(3)
  expect(Math.min(...heights)).toBeGreaterThanOrEqual(44)
})

// ---------------------------------------------------------------------------
// The Pending income line and the summary boxes #971 removed
// ---------------------------------------------------------------------------

// Position, not wording: the claim is that Pending income belongs to the month being viewed,
// so it sits inside Monthly Breakdown rather than floating above all three sections. Its
// singularity — one entry, not one per month — is the `toHaveCount(1)`.
test('pending_income_line_appears_once_inside_monthly_breakdown @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(accordionSection(page, 'Monthly Breakdown').getByText(/^Pending income/)).toHaveCount(1)
})

// The month picker directly above the line already names the month, so the label must not
// repeat it. Only the leading text node is read, so the label's trailing InfoPopover glyph is
// excluded.
test('pending_income_line_has_no_month_year_suffix @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const label = page.getByText(/^Pending income/)
  await label.waitFor()
  expect(await label.evaluate((p) => (p.childNodes[0]?.textContent ?? '').trim())).toBe('Pending income')
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
