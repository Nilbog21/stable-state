// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addExpense, addHorse, addLeaseCharge, addPaidLesson, addTier, monthAnchor } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import type { HorseExpense } from '@/lib/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { SeededBarn } from './support/fixtures'

// The two #971 cross-tab integrity checks: every breakdown table's footer Total reconciles to
// the same barn-wide figures, and money whose per-entity attribution was destroyed surfaces
// under Unattributed rather than vanishing.

// By Paid To passes gross={null} net={null} to BreakdownTable, so ReconciliationFoot renders
// "—" for its Gross and Net in every footer row, Total included — a recipient has no revenue
// concept. Gross and Net therefore reconcile across the four revenue tabs; only Expenses is a
// five-tab claim. (The checklist previously said "all five tabs" for Gross and Net; those two
// lines were reworded to the true invariant in this PR. By Paid To's "—" is not left uncovered
// — it is its own checkbox on the By Paid To tab's slice.)
const REVENUE_TABS = ['horse', 'tier', 'rider', 'trainer'] as const
const ALL_TABS = [...REVENUE_TABS, 'recipient'] as const
type Tab = (typeof ALL_TABS)[number]

const TIER_PRICE = 100
const INSTRUCTOR_CUT = 25
const APOLLO_FEE = 100
const BELLA_FEE = 60
// A charge belongs to no tier and no instructor, so it lands in By Tier's and By Instructor's
// "Outside this view" while By Horse and By Rider count it in their Subtotal. That asymmetry is
// what stops the reconciliation checks below from passing vacuously: the four tabs' Subtotals
// genuinely differ, and only their Totals agree.
const BELLA_LEASE_FEE = 150
const APOLLO_EXPENSE = 40
const ORPHAN_EXPENSE = 35

/**
 * The month this file works in, and the `?month=` param naming it — both derived from one
 * Date on purpose. Deriving them independently from `new Date()` would let them name
 * *different* months if a month rolled over between the two calls: the seed would land in one
 * month while every navigation asked for another, and each tab would render its EmptyState
 * instead of a table. `monthAnchor` and `formatMonthParam` are both UTC-framed (#1151), so
 * the param can be read straight off the anchor.
 *
 * A past month rather than the current one, per the same anchor's doc: day 15 of a finished
 * month is unambiguously inside it however the barn's timezone decodes the instant, whereas
 * `monthsAgo: 0` is placed relative to "now" and can decode to the previous calendar day.
 */
const WORKING_MONTH_ANCHOR = monthAnchor(1)
const WORKING_MONTH = formatMonthParam(WORKING_MONTH_ANCHOR)

// Footer cells sit to the right of the label cell, which spans one column (labelColSpan={1}).
const GROSS_COL = 1
const EXPENSES_COL = 2
const NET_COL = 3

// Verbatim from ByHorseTable.tsx / ByPaidToTable.tsx — the assertion is that the ⓘ reveals
// precisely this explanation, so the strings are the expected values, not paraphrases.
const BY_HORSE_UNATTRIBUTED_INFO_TEXT =
  "A paid lesson with no horse recorded, or an expense record whose original entry was deleted after being marked paid — never a barn-wide expense split across horses, which appears in each horse's own row instead."
const BY_PAID_TO_UNATTRIBUTED_INFO_TEXT =
  'An expense record whose original entry was deleted after being marked paid.'

type Seeded = { orphanExpense: HorseExpense }

let seeded: Seeded

const barn = withBarn('phase4-finances-reconciliation', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps any requested month up to the barn's creation month, an
  // explicit ?month= included, and withBarn creates this barn now — without backdating, every
  // previous-month navigation below would silently resolve to this month instead.
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

  const lastMonth = WORKING_MONTH_ANCHOR
  const lessonDefaults = { at: lastMonth, instructorId: members.trainer.membershipId, tierName: tier.name }

  // Paid, not merely booked: every income breakdown counts collected rows only. Seeding
  // everything collected also keeps both Outstanding Income and Outstanding Expenses off the
  // page, so no assertion here has to work around them.
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
    fee: APOLLO_FEE,
  })
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    horseIds: [bella.id],
    riderIds: [members.rider2.membershipId],
    fee: BELLA_FEE,
  })

  await addLeaseCharge(supabase, barn, {
    at: lastMonth,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
    fee: BELLA_LEASE_FEE,
    paid: true,
  })

  // Two paid expenses, so that orphaning one below still leaves a non-zero Subtotal behind it
  // on both tabs. The checks are that an amount *moves* from Subtotal into Unattributed; with
  // a single expense there'd be nothing left in Subtotal to tell that apart from the whole
  // Expenses column emptying. Not needed to keep either tab rendering — page.tsx's
  // horseHasActivity/recipientHasActivity already count unattributedExpenses on their own,
  // which is precisely what its #971 review-fix comment guarantees.
  await markExpensePaid(
    supabase,
    barn,
    await addExpense(supabase, barn, {
      at: lastMonth,
      recipient: 'Ridge Feed',
      expenseType: 'Feed',
      amount: APOLLO_EXPENSE,
      horseIds: [apollo.id],
    })
  )
  const orphanExpense = await markExpensePaid(
    supabase,
    barn,
    await addExpense(supabase, barn, {
      at: lastMonth,
      recipient: 'Hill Vet',
      expenseType: 'Vet',
      amount: ORPHAN_EXPENSE,
      horseIds: [bella.id],
    })
  )

  seeded = { orphanExpense }
})

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

/**
 * Marks an expense collected. Spec-local rather than an addExpense option because the
 * scenario needing it is this file's alone: delete_expense_with_transactions deletes an
 * *uncollected* expense transaction outright, so only a collected expense can leave behind the
 * orphaned ledger row these checks are about.
 *
 * Written as a direct ledger update for the same reason addPaidLesson and addLeaseCharge are —
 * create_expense_with_horses owns transaction creation, so collection is a separate update over
 * the rows it wrote. horse_expenses.payment_type moves with it so the expense also reads as
 * paid to getOutstandingExpenses, matching what a manager who set a payment type would see.
 */
async function markExpensePaid(
  supabase: SupabaseClient,
  barn: SeededBarn,
  expense: HorseExpense
): Promise<HorseExpense> {
  mustSucceed(
    await supabase.from('horse_expenses').update({ payment_type: 'venmo' }).eq('id', expense.id),
    'mark expense paid'
  )
  mustSucceed(
    await supabase
      .from('transactions')
      .update({ collected: true, payment_type: 'venmo' })
      .eq('barn_id', barn.id)
      .eq('expense_id', expense.id)
      .eq('kind', 'expense'),
    'collect expense transaction'
  )
  return expense
}

/**
 * Throws unless the seeded expense's ledger row is in `state`. A guard, not an assertion: the
 * checkbox's claim is what the *page* shows, and this only establishes that the page is being
 * asked about a genuinely orphaned amount rather than a still-attached one. `attached` is the
 * precondition for the deletion meaning anything; `orphaned` is the precondition for the
 * post-deletion read being about Unattributed money at all.
 */
async function requireLedgerRow(state: 'attached' | 'orphaned'): Promise<void> {
  const { supabase, barn: seededBarn } = barn.data
  const rows = mustSucceed<{ id: string; expense_id: string | null; collected: boolean }[]>(
    await supabase
      .from('transactions')
      .select('id, expense_id, collected')
      .eq('barn_id', seededBarn.id)
      .eq('kind', 'expense')
      .eq('amount', -ORPHAN_EXPENSE),
    'look up the orphan-candidate expense transaction'
  )
  const expectedExpenseId = state === 'attached' ? seeded.orphanExpense.id : null
  const match = rows.find((row) => row.collected && row.expense_id === expectedExpenseId)
  if (!match) {
    throw new Error(
      `expected one collected expense transaction of ${ORPHAN_EXPENSE} with expense_id ${expectedExpenseId} — got ${JSON.stringify(rows)}`
    )
  }
}

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** finances/page.tsx resolves its default month from the server clock, so never rely on it. */
function financesUrl(tab: Tab): string {
  return `/barn/${barn.slug}/finances?month=${WORKING_MONTH}&tab=${tab}`
}

/**
 * The active tab's breakdown table. Scoped to a direct `main > div` child so it can't also
 * match a table nested deeper inside one of the page's `<section>`s.
 */
function breakdownTable(page: Page): Locator {
  return page.locator('main > div > table')
}

/**
 * A reconciliation footer row, picked by its own label cell rather than by position, so a
 * future reordering of the four rows surfaces as a failure here instead of a silently
 * mismatched read. The label cell also carries an InfoPopover glyph on two of the rows, hence
 * the start-anchored (rather than exact) patterns.
 */
function footerRow(page: Page, label: 'Subtotal' | 'Unattributed' | 'Outside this view' | 'Total'): Locator {
  return breakdownTable(page)
    .locator('tfoot tr')
    .filter({ has: page.locator('td').filter({ hasText: new RegExp(`^${label}`) }) })
}

async function footerCell(page: Page, row: Parameters<typeof footerRow>[1], column: number): Promise<string> {
  return (await footerRow(page, row).locator('td').nth(column).innerText()).trim()
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

/** Reads one footer Total cell on each of `tabs`, in order. */
async function totalsAcrossTabs(
  page: Page,
  tabs: readonly Tab[],
  column: number,
  parse: (text: string) => number
): Promise<number[]> {
  const figures: number[] = []
  for (const tab of tabs) {
    await page.goto(financesUrl(tab))
    figures.push(parse(await footerCell(page, 'Total', column)))
  }
  return figures
}

// ---------------------------------------------------------------------------
// Reconciliation across tabs (#971)
// ---------------------------------------------------------------------------

// One assertion each, per the "one state asserted across N places" reading: that a single
// barn-wide figure is what every tab's Total reports is one claim, however many tabs report it.

test('every_tab_footer_total_shows_the_same_gross_figure @manager', async ({ page }) => {
  const totals = await totalsAcrossTabs(page, REVENUE_TABS, GROSS_COL, parseMoney)
  expect(totals).toEqual(REVENUE_TABS.map(() => totals[0]))
})

test('every_tab_footer_total_shows_the_same_expenses_figure @manager', async ({ page }) => {
  const totals = await totalsAcrossTabs(page, ALL_TABS, EXPENSES_COL, parseMagnitude)
  expect(totals).toEqual(ALL_TABS.map(() => totals[0]))
})

test('every_tab_footer_total_shows_the_same_net_figure @manager', async ({ page }) => {
  const totals = await totalsAcrossTabs(page, REVENUE_TABS, NET_COL, parseMoney)
  expect(totals).toEqual(REVENUE_TABS.map(() => totals[0]))
})

// ---------------------------------------------------------------------------
// The unattributed-expense check (#971)
// ---------------------------------------------------------------------------

// Serial because both steps describe one mutation — the expense deletion step 1 performs,
// which no other test in this file may see first — and step 2 reads the baseline step 1
// captured. Deltas throughout, so neither step needs to know the barn's totals.
test.describe.serial('deleting a paid expense but keeping its collected record', () => {
  let byHorseBaseline: number
  let byPaidToBaseline: number

  test('orphaned_expense_amount_appears_in_the_by_horse_unattributed_row @manager', async ({ page }) => {
    await requireLedgerRow('attached')

    await page.goto(financesUrl('horse'))
    byHorseBaseline = parseMagnitude(await footerCell(page, 'Unattributed', EXPENSES_COL))
    await page.goto(financesUrl('recipient'))
    byPaidToBaseline = parseMagnitude(await footerCell(page, 'Unattributed', EXPENSES_COL))

    // "Also delete the collected record from Finances" is deliberately left unchecked — that
    // is what makes delete_expense_with_transactions keep the collected transactions row and
    // let its expense_id go NULL as the horse_expenses row goes away.
    await page.goto(`/barn/${barn.slug}/expenses/${seeded.orphanExpense.id}/delete`)
    await page.getByRole('button', { name: 'Confirm Delete' }).click()
    // waitForURL, and commit rather than load — the repo's established pattern for a
    // post-form-submit redirect that can land on a route the dev server is still
    // cold-compiling under full-suite load (#1009, #1140, and
    // checklist-phase4-finances-outstanding.spec.ts's saveExpenseForm on this same route).
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/expenses$`), { waitUntil: 'commit' })
    await requireLedgerRow('orphaned')

    await page.goto(financesUrl('horse'))
    expect(parseMagnitude(await footerCell(page, 'Unattributed', EXPENSES_COL))).toBe(
      byHorseBaseline + seeded.orphanExpense.amount!
    )
  })

  test('orphaned_expense_amount_appears_in_the_by_paid_to_unattributed_row @manager', async ({ page }) => {
    await page.goto(financesUrl('recipient'))
    expect(parseMagnitude(await footerCell(page, 'Unattributed', EXPENSES_COL))).toBe(
      byPaidToBaseline + seeded.orphanExpense.amount!
    )
  })
})

// ---------------------------------------------------------------------------
// The Unattributed row's own explanation
// ---------------------------------------------------------------------------

test('by_horse_unattributed_info_icon_explains_where_the_amount_came_from @manager', async ({ page }) => {
  await page.goto(financesUrl('horse'))
  await footerRow(page, 'Unattributed').getByRole('button', { name: 'Info' }).click()
  await expect(page.getByText(BY_HORSE_UNATTRIBUTED_INFO_TEXT)).toBeVisible()
})

test('by_paid_to_unattributed_info_icon_explains_where_the_amount_came_from @manager', async ({ page }) => {
  await page.goto(financesUrl('recipient'))
  await footerRow(page, 'Unattributed').getByRole('button', { name: 'Info' }).click()
  await expect(page.getByText(BY_PAID_TO_UNATTRIBUTED_INFO_TEXT)).toBeVisible()
})
