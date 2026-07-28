import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addExpense, addHorse, addLeaseCharge, addPaidLesson, addTier, monthAnchor } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import type { Horse, HorseExpense, LessonTier } from '@/lib/db/types'

// Per-horse figures. Every horse's Gross is distinct, and the gross-descending order
// computeHorseNetIncome returns rows in differs from the name-ascending order the client
// applies on load — otherwise the default-sort and Gross-sort checks below would both pass
// against a table nobody had sorted.
const TIER_PRICE = 100
const INSTRUCTOR_CUT = 25
const WILLOW_FEE = 80
const APOLLO_FEE = 40
const BELLA_FEE = 60
const DANCER_FEE = 100
const BELLA_LEASE_FEE = 150
const APOLLO_EXPENSE = 30
const BELLA_EXPENSE = 20
const COMET_EXPENSE = 60

// Column positions, uniform across every breakdown tab: label, Gross, Expenses, Net.
const HORSE_COL = 0
const GROSS_COL = 1
const EXPENSES_COL = 2
const NET_COL = 3

// The By Horse Gross header's own explanatory text (ByHorseTable.tsx).
const GROSS_INFO_TEXT = "This horse's lesson and agreement income, before the instructor's cut"

type Seeded = {
  tier: LessonTier
  apollo: Horse
  bella: Horse
  comet: Horse
  willow: Horse
  dancer: Horse
  bellaExpense: HorseExpense
}

let seeded: Seeded

const barn = withBarn('phase4-finances-by-horse', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps *any* requested month up to the barn's own creation month,
  // an explicit ?month= included, and withBarn creates this barn now — so without
  // backdating, the previous-month check below would silently resolve to this month and
  // pass against the wrong table.
  mustSucceed(
    await supabase.from('barns').update({ created_at: monthAnchor(2).toISOString() }).eq('id', barn.id),
    'backdate barn created_at'
  )

  const tier = await addTier(supabase, barn.id, {
    name: 'Standard',
    price: TIER_PRICE,
    isDefault: true,
    instructorCut: INSTRUCTOR_CUT,
  })

  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')
  const comet = await addHorse(supabase, barn.id, 'Comet')
  const willow = await addHorse(supabase, barn.id, 'Willow')
  const dancer = await addHorse(supabase, barn.id, 'Dancer')

  // monthAnchor(0) — day 15 — rather than `monthsAgo: 0`, whose "an hour ago" instant can
  // decode to the previous calendar day in the barn's timezone when the suite runs in the
  // first hours of a month, putting an expense in a month this file never looks at.
  const thisMonth = monthAnchor(0)
  const lessonDefaults = {
    at: thisMonth,
    instructorId: members.trainer.membershipId,
    tierName: tier.name,
    riderIds: [members.rider.membershipId],
  }

  // Paid, not merely booked: getEntityIncome counts collected lessons only.
  await addPaidLesson(supabase, barn, { ...lessonDefaults, horseIds: [willow.id], fee: WILLOW_FEE })
  await addPaidLesson(supabase, barn, { ...lessonDefaults, horseIds: [apollo.id], fee: APOLLO_FEE })
  await addPaidLesson(supabase, barn, { ...lessonDefaults, horseIds: [bella.id], fee: BELLA_FEE })

  // The previous month's only fixture, so Dancer's presence in that month's table — and
  // its absence from this month's — is entirely this lesson's doing.
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: monthAnchor(1),
    horseIds: [dancer.id],
    fee: DANCER_FEE,
  })

  // Bella is the drill-down horse, and needs one row of each kind the combined table can
  // render: a lesson (above), this charge, and an expense (below).
  await addLeaseCharge(supabase, barn, {
    at: thisMonth,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
    fee: BELLA_LEASE_FEE,
    paid: true,
  })

  // No `time`: getOutstandingExpenses reads a time-less expense as due at 23:59:59 on its
  // own date, so from the 16th onward these are past due and — having no payment type —
  // do surface under Outstanding Expenses. That costs the assertions below nothing, since
  // the section renders as a <ul> and breakdownTable() scopes by the Horse header rather
  // than by being the page's only table.
  await addExpense(supabase, barn, {
    at: thisMonth,
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    amount: APOLLO_EXPENSE,
    horseIds: [apollo.id],
  })
  const bellaExpense = await addExpense(supabase, barn, {
    at: thisMonth,
    recipient: 'Ridge Feed',
    expenseType: 'Feed',
    amount: BELLA_EXPENSE,
    horseIds: [bella.id],
  })
  // Comet's only fixture: an expense with no lesson behind it, which is what puts a horse
  // in the table at zero Gross and a negative Net.
  await addExpense(supabase, barn, {
    at: thisMonth,
    recipient: 'Hill Vet',
    expenseType: 'Vet',
    amount: COMET_EXPENSE,
    horseIds: [comet.id],
  })

  seeded = { tier, apollo, bella, comet, willow, dancer, bellaExpense }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** finances/page.tsx resolves its default month from the server clock, so never rely on it. */
function currentMonth(): string {
  return formatMonthParam(new Date())
}

function previousMonth(): string {
  const now = new Date()
  return formatMonthParam(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))
}

function financesUrl(month = currentMonth()): string {
  return `/barn/${barn.slug}/finances?month=${month}`
}

function horseDrilldownUrl(horseId: string, month = currentMonth()): string {
  return `/barn/${barn.slug}/finances/horses/${horseId}?month=${month}`
}

/**
 * The By Horse breakdown table. Every lesson and the one charge are seeded paid and the
 * expenses are date-only, so this barn renders neither Outstanding section and the
 * breakdown table is the page's only table — scoping by its own header keeps that from
 * being a silent assumption a later fixture change could break.
 */
function breakdownTable(page: Page): Locator {
  return page.locator('table').filter({ has: page.getByRole('columnheader', { name: /^horse/i }) })
}

function horseRow(page: Page, horse: Horse): Locator {
  return breakdownTable(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('link', { name: horse.name, exact: true }) })
}

/** Accounting notation: formatCurrency renders a negative as parens, never a leading minus. */
function parseMoney(text: string): number {
  if (text.trim() === '—') return 0
  const magnitude = Number(text.replace(/[^0-9.]/g, ''))
  return text.includes('(') ? -magnitude : magnitude
}

/** The Expenses column passes `forceParens`, so there the parens are notation, not sign. */
function parseMagnitude(text: string): number {
  return Math.abs(parseMoney(text))
}

async function cellText(row: Locator, index: number): Promise<string> {
  return (await row.locator('td').nth(index).innerText()).trim()
}

async function columnValues(page: Page, index: number): Promise<number[]> {
  const texts = await breakdownTable(page).locator(`tbody td:nth-child(${index + 1})`).allInnerTexts()
  return texts.map(parseMagnitude)
}

/** A header cell renders its label plus, optionally, a sort arrow and an info icon. */
function headerLabel(text: string): string {
  return text.replace(/[▲▼ⓘ]/g, '').trim().toUpperCase()
}

async function columnLabels(page: Page): Promise<string[]> {
  return (await breakdownTable(page).locator('thead th').allInnerTexts()).map(headerLabel)
}

async function headersWithIndicator(page: Page, indicator: '▲' | '▼'): Promise<string[]> {
  const texts = await breakdownTable(page).locator('thead th').allInnerTexts()
  return texts.filter((text) => text.includes(indicator)).map(headerLabel)
}

function grossHeader(page: Page): Locator {
  return breakdownTable(page).locator('thead th').filter({ hasText: /gross/i })
}

/** The header's sort control, as opposed to the ⓘ button sitting beside it. */
function grossSortButton(page: Page): Locator {
  return grossHeader(page).getByRole('button', { name: /gross/i })
}

/**
 * Taps the Gross header and waits for `indicator` to render. A wait, not an assertion: the
 * row-order reads below are one-shot `allInnerTexts` calls with no retry of their own, so
 * without it they could sample the order the click was about to replace.
 */
async function tapGrossHeader(page: Page, indicator: '▲' | '▼'): Promise<void> {
  await grossSortButton(page).click()
  await grossHeader(page).locator(`button:has-text("${indicator}")`).waitFor()
}

/** The drill-down's combined table: Date, Type, Amount, Horses, Split. */
const DETAIL_AMOUNT_COL = 2
const DETAIL_SPLIT_COL = 4

function drilldownExpenseRow(page: Page): Locator {
  return page.locator('tbody tr').filter({ has: page.getByRole('cell', { name: 'Expense', exact: true }) })
}

/** The bottom Net line under a drill-down table — a label span followed by its figure. */
function drilldownNetFigure(page: Page): Locator {
  return page.locator('main span', { hasText: /^Net$/ }).locator('xpath=following-sibling::span[1]')
}

// ---------------------------------------------------------------------------
// The tab itself
// ---------------------------------------------------------------------------

test('by_horse_is_the_default_tab_on_page_load @manager', async ({ page }) => {
  // No ?tab= at all: only the By Horse table links its rows to /finances/horses/<id>.
  await page.goto(financesUrl())
  await expect(page.getByRole('link', { name: seeded.willow.name, exact: true })).toHaveAttribute(
    'href',
    horseDrilldownUrl(seeded.willow.id)
  )
})

test('by_horse_tab_shows_horse_gross_expenses_net_columns @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(await columnLabels(page)).toEqual(['HORSE', 'GROSS', 'EXPENSES', 'NET'])
})

// The computed style, not the class list: the checklist item is specifically that the
// underline is there without hovering, which a `hover:underline` rule would also satisfy
// in markup but not in a resting page.
test('by_horse_horse_name_is_underlined_without_hovering @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const decoration = await page
    .getByRole('link', { name: seeded.willow.name, exact: true })
    .evaluate((el) => getComputedStyle(el).textDecorationLine)
  expect(decoration).toBe('underline')
})

// ---------------------------------------------------------------------------
// An expense landing on a horse that already has a lesson this month
// ---------------------------------------------------------------------------

// Serial because step 2 reads the baselines step 1 captured, and both describe one
// mutation: the expense step 1 adds, which no other test in this file may see first.
test.describe.serial('adding an expense for a horse that already has a lesson', () => {
  // Amounts are the real pre-mutation figures read off the page, so neither step needs to
  // know what Apollo's Expenses or Net were to begin with.
  let baselineExpenses: number
  let baselineNet: number
  let addedExpense: HorseExpense

  test('by_horse_expenses_column_grows_by_the_new_expense_amount @manager', async ({ page }) => {
    await page.goto(financesUrl())
    baselineExpenses = parseMagnitude(await cellText(horseRow(page, seeded.apollo), EXPENSES_COL))
    baselineNet = parseMoney(await cellText(horseRow(page, seeded.apollo), NET_COL))

    addedExpense = await addExpense(barn.data.supabase, barn.data.barn, {
      at: monthAnchor(0),
      recipient: 'Creek Vet',
      expenseType: 'Vet',
      amount: 45,
      horseIds: [seeded.apollo.id],
    })

    await page.goto(financesUrl())
    expect(parseMagnitude(await cellText(horseRow(page, seeded.apollo), EXPENSES_COL))).toBe(
      baselineExpenses + addedExpense.amount!
    )
  })

  test('by_horse_net_column_shrinks_by_the_new_expense_amount @manager', async ({ page }) => {
    await page.goto(financesUrl())
    expect(parseMoney(await cellText(horseRow(page, seeded.apollo), NET_COL))).toBe(
      baselineNet - addedExpense.amount!
    )
  })
})

// ---------------------------------------------------------------------------
// Dash vs. zero
// ---------------------------------------------------------------------------

test('by_horse_shows_a_dash_for_a_horse_with_no_expenses @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(horseRow(page, seeded.willow).locator('td').nth(EXPENSES_COL)).toHaveText('—')
})

test('by_horse_lists_a_horse_with_expenses_and_no_lessons_at_zero_gross @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(horseRow(page, seeded.comet).locator('td').nth(GROSS_COL)).toHaveText(formatCurrency(0))
})

test('by_horse_net_is_negative_for_a_horse_with_expenses_and_no_lessons @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(parseMoney(await cellText(horseRow(page, seeded.comet), NET_COL))).toBeLessThan(0)
})

// ---------------------------------------------------------------------------
// The drill-down
// ---------------------------------------------------------------------------

test('horse_drilldown_combines_lessons_charges_and_expenses_in_one_table @manager', async ({ page }) => {
  await page.goto(horseDrilldownUrl(seeded.bella.id))
  const types = await page.locator('tbody tr td:nth-child(2)').allInnerTexts()
  expect([...new Set(types)].sort()).toEqual(['Expense', 'Lease', 'Lesson'])
})

test('horse_drilldown_rows_are_ordered_by_date_ascending @manager', async ({ page }) => {
  await page.goto(horseDrilldownUrl(seeded.bella.id))
  const dates = (await page.locator('tbody tr td:nth-child(1)').allInnerTexts()).map((text) => Date.parse(text))
  expect(dates).toEqual([...dates].sort((a, b) => a - b))
})

test('horse_drilldown_table_has_a_type_column @manager', async ({ page }) => {
  await page.goto(horseDrilldownUrl(seeded.bella.id))
  await expect(page.getByRole('columnheader', { name: 'Type' })).toHaveCount(1)
})

test('horse_drilldown_expense_amount_renders_in_parentheses @manager', async ({ page }) => {
  await page.goto(horseDrilldownUrl(seeded.bella.id))
  await expect(drilldownExpenseRow(page).locator('td').nth(DETAIL_AMOUNT_COL)).toHaveText(
    formatCurrency(seeded.bellaExpense.amount!, { forceParens: true })
  )
})

// Its own checkbox rather than a clause on the one above: Amount and Split are separate
// cells rendered from separate values, and either can regress while the other holds.
test('horse_drilldown_expense_split_renders_in_parentheses @manager', async ({ page }) => {
  await page.goto(horseDrilldownUrl(seeded.bella.id))
  // Bella is that expense's only horse, so its Split is the whole Amount.
  await expect(drilldownExpenseRow(page).locator('td').nth(DETAIL_SPLIT_COL)).toHaveText(
    formatCurrency(seeded.bellaExpense.amount!, { forceParens: true })
  )
})

/**
 * The checklist previously claimed these two Net figures match. They don't, and can't:
 * HORSE_INCOME_DESCRIPTOR sets `splitsGrossFee`, so getEntityIncomeSummary zeroes each
 * lesson's cut and the tab's Gross/Net are pre-cut, while getEntityIncomeDetail has no
 * such branch and runs every row through splitNetFee — #971 changed summary mode only.
 *
 * The real invariant is the difference: this horse's *share* of each of its lessons'
 * snapshotted cuts. Both sides divide by the lesson's horse count — computeGroupedIncome
 * splits the cut-zeroed fee across participants, computeDetailRows splits fee-minus-cut
 * across the same participants — so a lesson contributes cut/horseCount to the gap, not
 * the whole cut. Bella has exactly one lesson this month, she is its only horse, and it
 * was booked on the Standard tier whose instructor_cut create_lesson_with_participants
 * snapshots onto it; her share is therefore the entire cut, which is what makes the
 * expected value expressible without a horse-count divisor here.
 */
test('horse_drilldown_net_is_the_by_horse_net_less_the_horses_share_of_its_lessons_instructor_cuts @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const tabNet = parseMoney(await cellText(horseRow(page, seeded.bella), NET_COL))

  await page.goto(horseDrilldownUrl(seeded.bella.id))
  expect(parseMoney(await drilldownNetFigure(page).innerText())).toBe(tabNet - seeded.tier.instructor_cut)
})

// The previous month, not the current one: on the current month the assertion would hold
// even if the link carried no month at all, since the page defaults to it.
test('horse_drilldown_link_preserves_the_month_param @manager', async ({ page }) => {
  await page.goto(financesUrl(previousMonth()))
  await page.getByRole('link', { name: seeded.dancer.name, exact: true }).click()
  await expect(page).toHaveURL(new RegExp(`/finances/horses/${seeded.dancer.id}\\?month=${previousMonth()}$`))
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

// Each of these re-establishes its own state from a fresh load — Playwright hands every
// test a new page, so a serial block would buy nothing here.

test('by_horse_rows_load_sorted_by_horse_name_ascending @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const names = await breakdownTable(page).locator(`tbody td:nth-child(${HORSE_COL + 1})`).allInnerTexts()
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
})

test('by_horse_horse_header_shows_an_ascending_indicator_on_load @manager', async ({ page }) => {
  await page.goto(financesUrl())
  expect(await headersWithIndicator(page, '▲')).toEqual(['HORSE'])
})

test('by_horse_gross_header_tap_sorts_rows_by_gross_ascending @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await tapGrossHeader(page, '▲')
  const gross = await columnValues(page, GROSS_COL)
  expect(gross).toEqual([...gross].sort((a, b) => a - b))
})

// One assertion for both halves of the line — the indicator arriving on Gross and leaving
// Horse are the same claim about which column is active.
test('by_horse_gross_header_tap_moves_the_ascending_indicator_to_gross @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await tapGrossHeader(page, '▲')
  expect(await headersWithIndicator(page, '▲')).toEqual(['GROSS'])
})

// The probe covers the half of the claim a URL comparison can't: a reload would leave the
// URL identical while wiping window state, so its survival is what proves no navigation.
test('by_horse_gross_header_tap_does_not_change_the_url @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await page.evaluate(() => {
    ;(window as unknown as { sortProbe?: number }).sortProbe = 1
  })
  const urlBefore = page.url()

  await tapGrossHeader(page, '▲')

  expect(
    await page.evaluate(() => ({
      probe: (window as unknown as { sortProbe?: number }).sortProbe ?? null,
      url: location.href,
    }))
  ).toEqual({ probe: 1, url: urlBefore })
})

test('by_horse_second_gross_header_tap_reverses_the_order @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await tapGrossHeader(page, '▲')
  const ascending = await columnValues(page, GROSS_COL)
  await tapGrossHeader(page, '▼')
  expect(await columnValues(page, GROSS_COL)).toEqual([...ascending].reverse())
})

// The second tap is a bare click rather than tapGrossHeader, whose wait is for the very
// indicator this test exists to check — waiting on it first would make the assertion circular.
test('by_horse_second_gross_header_tap_flips_the_indicator_to_descending @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await tapGrossHeader(page, '▲')
  await grossSortButton(page).click()
  await expect(grossSortButton(page)).toContainText('▼')
})

// ---------------------------------------------------------------------------
// The shared header info icon
// ---------------------------------------------------------------------------

test('gross_header_info_icon_reveals_its_explanation @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await grossHeader(page).getByRole('button', { name: 'Info' }).click()
  await expect(page.getByText(GROSS_INFO_TEXT)).toBeVisible()
})

// The icon sits beside the sort button rather than inside it, so tapping it must leave the
// active column alone — the popover wait is only there to prove the tap landed.
test('gross_header_info_icon_tap_does_not_trigger_a_sort @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await grossHeader(page).getByRole('button', { name: 'Info' }).click()
  await page.getByText(GROSS_INFO_TEXT).waitFor()
  expect(await headersWithIndicator(page, '▲')).toEqual(['HORSE'])
})
