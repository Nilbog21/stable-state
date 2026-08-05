// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addLeaseCharge, addPaidLesson, addTier, monthAnchor } from './support/fixtures'
import { settledInnerTexts } from './support/read'
import { sortControl, tapSort, tapSortAndSettle } from './support/sort'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'

// Seed constants. Every figure this file asserts is built from these, from a builder return
// value, or from another figure read off the DOM — never from a query against the same
// aggregation the page under test uses.
//
// INSTRUCTOR_CUT is flat per-lesson dollars, snapshotted onto `lessons.instructor_cut` at
// creation from the tier named by the lesson. Its job since #1156 is to be *non-zero*: the
// tab and the drill-down are both pre-cut now, so their equality check only has teeth if
// there is a cut that could have driven them apart. It also stays deliberately distinct
// from the barn's default_instructor_cut (25), which create_lesson_with_participants falls
// back to whenever a lesson's tier name doesn't resolve.
const INSTRUCTOR_CUT = 20
const RIDER_LESSON_FEE = 60
const RIDER_LEASE_FEE = 90
const RIDER_BOARD_FEE = 50
const RIDER2_LESSON_FEE = 300
const TRAINER_LESSON_FEE = 100
const PREVIOUS_MONTH_LESSON_FEE = 75

// Display names of the three seeded members addMemberships creates, as the By Rider tab
// renders them.
const RIDER_NAME = 'Test Rider'
const RIDER2_NAME = 'Test Sutton'
const TRAINER_NAME = 'Test Trainer'

const SEEDED_RIDER_COUNT = 3

// Three riders, not two. With two rows, "rows load sorted by Rider name ascending" and "tap
// Gross re-sorts ascending" cannot both have teeth: the server already hands the table its
// rows in gross-descending order (toSortedIncomeRows), so with two rows any name ordering
// that differs from the server's necessarily agrees with the gross ordering, or vice versa.
// The trainer login rides as the third — a trainer taking lessons is ordinary, and it costs
// neither a fourth auth account nor a stub member the shared fixtures don't build.
//
//   this month's Gross          Test Rider 200, Test Sutton 300, Test Trainer 100
//   name ascending              Test Rider,   Test Sutton, Test Trainer
//   Gross ascending             Test Trainer, Test Rider,  Test Sutton
//   server order (Gross desc)   Test Sutton,  Test Rider,  Test Trainer
//
// All three orderings differ, so no sort assertion below can pass by accident.
//
// Test Rider's 200 is the pre-cut figure the By Rider tab shows: its lesson contributes the
// full RIDER_LESSON_FEE (#971 — the tab's Gross zeroes the instructor cut before splitting),
// plus both agreement charges unsplit.

type Seeded = { riderMembershipId: string }

let seeded: Seeded

const barn = withBarn('phase4-finances-by-rider', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps the viewable range to the barn's creation month, and withBarn
  // creates this barn *now* — without backdating, the previous month the month-param check
  // navigates to isn't reachable at all.
  mustSucceed(
    await supabase.from('barns').update({ created_at: monthAnchor(2, barn.timezone).toISOString() }).eq('id', barn.id),
    'backdate barn created_at'
  )

  const tier = await addTier(supabase, barn.id, {
    name: 'Rider Slice',
    price: RIDER_LESSON_FEE,
    isDefault: true,
    instructorCut: INSTRUCTOR_CUT,
  })
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')

  // The manager instructs every lesson, so no rider is ever their own lesson's instructor.
  const lessonDefaults = { instructorId: members.manager.membershipId, tierName: tier.name }

  // Day 15 rather than pastInstantInMonth(0): agreement charges always pin to the 1st of
  // their month, so a day-15 lesson is what gives the drill-down's date-ascending check its
  // teeth — that page concatenates its lesson rows *before* its charge rows and sorts after,
  // so an unsorted table would come out 15th, 1st, 1st. Nothing here is filtered on `< now`,
  // so a day-15 anchor still in the future is fine.
  const thisMonth = { at: monthAnchor(0, barn.timezone) }

  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    ...thisMonth,
    fee: RIDER_LESSON_FEE,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
  })
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    ...thisMonth,
    fee: RIDER2_LESSON_FEE,
    horseIds: [bella.id],
    riderIds: [members.rider2.membershipId],
  })
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    ...thisMonth,
    fee: TRAINER_LESSON_FEE,
    horseIds: [apollo.id],
    riderIds: [members.trainer.membershipId],
  })

  // Both charges sit on the drill-down's subject, so its one combined table carries all three
  // Type values — Lesson, Lease and Boarding. `paid` is required, not incidental:
  // getPaidCharges filters `collected = true`, so an unpaid charge is invisible to both the
  // By Rider tab and the drill-down.
  await addLeaseCharge(supabase, barn, {
    ...thisMonth,
    paid: true,
    riderId: members.rider.membershipId,
    horseId: apollo.id,
    fee: RIDER_LEASE_FEE,
  })
  await addLeaseCharge(supabase, barn, {
    ...thisMonth,
    kind: 'board',
    paid: true,
    riderId: members.rider.membershipId,
    horseId: bella.id,
    fee: RIDER_BOARD_FEE,
  })

  // Gives the previous month a By Rider row to click through, so the month-param check runs
  // against a month that is not the page's own server-clock default.
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    monthsAgo: 1,
    fee: PREVIOUS_MONTH_LESSON_FEE,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
  })

  seeded = { riderMembershipId: members.rider.membershipId }
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Both month params are derived from the same monthAnchor the fixtures are placed by, rather
 * than from `new Date()` — a param computed from the raw clock can disagree with the month a
 * fixture actually landed in if a month rolls over between the two calls. (Both sides resolve
 * through `barnToday` since #1360, so that rollover race is all that's left; a host-UTC param
 * would instead disagree for the whole 4-5 hours each month between UTC's rollover and the
 * barn's.)
 */
function currentMonth(): string {
  return formatMonthParam(monthAnchor(0, barn.data.barn.timezone))
}

function previousMonth(): string {
  return formatMonthParam(monthAnchor(1, barn.data.barn.timezone))
}

/** finances/page.tsx resolves its default month from the server clock, so never rely on it. */
function byRiderUrl(month = currentMonth()): string {
  return `/barn/${barn.slug}/finances?month=${month}&tab=rider`
}

function drilldownUrl(month = currentMonth()): string {
  return `/barn/${barn.slug}/finances/riders/${seeded.riderMembershipId}?month=${month}`
}

/**
 * The breakdown table, isolated from the Outstanding Income/Expenses tables rendered above it
 * on the same page: only BreakdownTable renders a <tfoot> (ReconciliationFoot).
 */
function breakdownTable(page: Page) {
  return page.locator('table').filter({ has: page.locator('tfoot') })
}

function breakdownRows(page: Page) {
  return breakdownTable(page).locator('tbody tr')
}

/** 1-based, matching CSS: 1 Rider, 2 Gross, 3 Expenses, 4 Net. */
function columnCells(page: Page, index: number) {
  return breakdownRows(page).locator(`td:nth-child(${index})`)
}

function headerCell(page: Page, index: number) {
  return breakdownTable(page).locator('thead th').nth(index)
}

/**
 * Each header's own label text — the first button (sortable column) or span (not) inside the
 * th, which is the label element in both SortableTh modes. Excludes InfoPopover's trailing ⓘ
 * trigger, and strips the ▲/▼ sort indicator the active column's label carries.
 */
async function columnLabels(page: Page): Promise<string[]> {
  // `evaluateAll` does not auto-wait, so a table that hasn't rendered yet yields `[]` — a diff
  // that reads as "this tab rendered no table" rather than "this read was too early" (#1238).
  await breakdownTable(page).waitFor()
  return breakdownTable(page)
    .locator('thead th')
    .evaluateAll((ths) =>
      ths.map((th) => (th.querySelector('button, span')?.textContent ?? '').replace(/[▲▼]/g, '').trim())
    )
}

/** Every breakdown figure is a formatted currency string; magnitude is what's compared. */
function parseMoney(text: string): number {
  return Math.abs(Number(text.replace(/[^0-9.]/g, '')))
}

function riderRow(page: Page, name: string) {
  return breakdownRows(page).filter({ has: page.getByRole('link', { name, exact: true }) })
}

/** The drill-down's bottom Total is a two-span flex row beneath the table, not a <tfoot>. */
function drilldownTotal(page: Page) {
  return page.getByText('Total', { exact: true }).locator('xpath=following-sibling::span')
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

test('by_rider_tab_shows_rider_gross_expenses_net_columns @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  expect(await columnLabels(page)).toEqual(['Rider', 'Gross', 'Expenses', 'Net'])
})

test('by_rider_expenses_column_is_always_a_dash @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await expect(columnCells(page, 3)).toHaveText(Array(SEEDED_RIDER_COUNT).fill('—'))
})

test('by_rider_expenses_header_is_not_sortable @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  // SortableTh sets aria-sort on every sortable header — "ascending"/"descending" when it's
  // the active key, "none" when it isn't — and omits the attribute entirely otherwise, so its
  // absence is what distinguishes a column with no sort key from an inactive sortable one.
  await expect(headerCell(page, 2)).not.toHaveAttribute('aria-sort', /.*/)
})

test('by_rider_net_column_equals_gross_in_every_row @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  expect(await settledInnerTexts(columnCells(page, 4))).toEqual(await settledInnerTexts(columnCells(page, 2)))
})

test('by_rider_name_is_an_underlined_link_to_the_rider_drilldown @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await expect(
    breakdownTable(page).locator(
      `a.underline[href="/barn/${barn.slug}/finances/riders/${seeded.riderMembershipId}?month=${currentMonth()}"]`
    )
  ).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// Drill-down
// ---------------------------------------------------------------------------

test('rider_drilldown_combines_lessons_and_agreement_charges_in_one_table @manager', async ({ page }) => {
  await page.goto(drilldownUrl())
  const types = await settledInnerTexts(page.locator('tbody tr td:nth-child(2)'))
  expect([...new Set(types)].sort()).toEqual(['Boarding', 'Lease', 'Lesson'])
})

test('rider_drilldown_rows_are_ordered_by_date_ascending @manager', async ({ page }) => {
  await page.goto(drilldownUrl())
  const dates = (await settledInnerTexts(page.locator('tbody tr td:nth-child(1)'))).map((t) => new Date(t).getTime())
  expect(dates).toEqual([...dates].sort((a, b) => a - b))
})

test('rider_drilldown_table_has_a_type_column @manager', async ({ page }) => {
  await page.goto(drilldownUrl())
  await expect(page.getByRole('columnheader', { name: 'Type', exact: true })).toHaveCount(1)
})

// #971 made the By Rider tab's Gross pre-cut (RIDER_INCOME_DESCRIPTOR.splitsGrossFee) but
// left the drill-down net-of-cut, so the two figures used to differ by exactly the
// snapshotted cut on the rider's lessons in view. #1156 carries the flag into detail mode
// and they now agree. The Gross is read off the tab rather than computed, so this asserts
// the *relationship* between the two pages and not a total either of them derives.
test('rider_drilldown_total_matches_the_by_rider_gross @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  const gross = parseMoney(await riderRow(page, RIDER_NAME).locator('td').nth(1).innerText())
  await page.goto(drilldownUrl())
  expect(parseMoney(await drilldownTotal(page).innerText())).toBe(gross)
})

test('rider_drilldown_preserves_the_month_param @manager', async ({ page }) => {
  await page.goto(byRiderUrl(previousMonth()))
  await breakdownTable(page).getByRole('link', { name: RIDER_NAME, exact: true }).click()
  await page.waitForURL(new RegExp(`/finances/riders/${seeded.riderMembershipId}\\?month=${previousMonth()}$`), { waitUntil: 'commit' })
})

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

test('by_rider_rows_load_sorted_by_rider_name_ascending @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await expect(columnCells(page, 1)).toHaveText([RIDER_NAME, RIDER2_NAME, TRAINER_NAME])
})

test('by_rider_rider_header_shows_an_ascending_indicator_on_load @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await expect(headerCell(page, 0)).toContainText('▲')
})

test('by_rider_gross_header_tap_re_sorts_rows_ascending @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await tapSort(sortControl(breakdownTable(page), 'Gross'))
  await expect(columnCells(page, 1)).toHaveText([TRAINER_NAME, RIDER_NAME, RIDER2_NAME])
})

// Gross and Net share one sort key (they're always equal on this tab), so sorting by either
// must land on the same order. Compared DOM-to-DOM across two loads rather than against a
// written-out expectation, so the check is about the two columns agreeing with each other.
test('by_rider_net_header_tap_produces_the_same_order_as_gross @manager', async ({ page }) => {
  await page.goto(byRiderUrl())
  await tapSortAndSettle(sortControl(breakdownTable(page), 'Gross'), '▲')
  const orderByGross = await settledInnerTexts(columnCells(page, 1))

  await page.goto(byRiderUrl())
  await tapSortAndSettle(sortControl(breakdownTable(page), 'Net'), '▲')
  expect(await settledInnerTexts(columnCells(page, 1))).toEqual(orderByGross)
})
