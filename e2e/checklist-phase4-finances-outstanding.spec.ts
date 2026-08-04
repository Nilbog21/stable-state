// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/lessons/[id]/cancel-rider/**
import { test, expect, withBarn, type Page } from './support/test'
import {
  addExpense,
  addHorse,
  addLeaseCharge,
  addPaidLesson,
  addTier,
  addUnpaidLesson,
  monthAnchor,
  type SeededAppointment,
} from './support/fixtures'
import { settledInnerTexts } from './support/read'
import { mustSucceed } from '@/lib/db/service-role'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDateOnly } from '@/lib/format-date'
import { calendarDate } from '@/lib/local-day'
import type { Agreement, Horse, Lesson } from '@/lib/db/types'

// The stub rider addMemberships seeds (first_name 'Test', last_name 'Rider2'). Used instead
// of the `rider` login for the lesson this file marks paid, because "Test Rider" is a
// substring of "Test Rider2" — filtering rows by the shorter name would match both.
const RIDER2_NAME = 'Test Rider2'

// Typed into the expense edit form partway through the Outstanding Expenses chain, so it
// can't come from a builder — every assertion about it is still expressed as this value
// plus a builder-returned one, never as a literal currency string.
const PLANNED_EXPENSE_AMOUNT = 42

const TABS = ['horse', 'tier', 'rider', 'trainer', 'recipient'] as const

/**
 * The suite's only custom timeout, and only for the two assertions that follow a payment-type
 * `selectOption`. The 5s default is sized for a page assertion; those two wait on a server
 * action *plus* the revalidate and RSC round trip it triggers, which has been observed
 * exceeding 5s in CI under parallel-worker load. With `retries: 0` that's a hard failure, not
 * a retry — so the wait is widened here rather than globally, where it would slow every
 * genuine failure in the suite down.
 */
const SETTLE_AFTER_WRITE = 15_000

type Seeded = {
  apollo: Horse
  comet: Horse
  paidableLesson: Lesson
  standingUnpaidLesson: Lesson
  unpaidLateCancelLesson: Lesson
  paidLateCancelLesson: Lesson
  lease: Agreement
  plannedExpense: SeededAppointment
  pricedExpense: SeededAppointment
  riderMembershipId: string
  rider2MembershipId: string
  trainerMembershipId: string
}

/**
 * Late cancellation is defined relative to `lesson_at`, not to a month, so its two fixtures
 * are the one place in this file placed by offset rather than by `monthsAgo` anchor: the
 * lesson has to be both still upcoming (isLessonCancellationEligible) and inside the
 * 24-hour window (isWithinLateCancellationWindow). Nothing this file asserts is
 * month-bucketed for either lesson, so an offset landing in the next month is harmless.
 */
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

let seeded: Seeded

const barn = withBarn('phase4-finances-outstanding', async ({ supabase, barn, members }) => {
  // resolveFinancesMonth clamps `prevMonthUrl` to null once the viewed month is the barn's
  // own creation month, and withBarn creates this barn *now* — so without backdating,
  // Finances has no reachable previous month and the `←` control never renders at all.
  mustSucceed(
    await supabase.from('barns').update({ created_at: monthAnchor(2).toISOString() }).eq('id', barn.id),
    'backdate barn created_at'
  )

  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')
  const comet = await addHorse(supabase, barn.id, 'Comet')

  const lessonDefaults = {
    instructorId: members.trainer.membershipId,
    fee: tier.price,
    tierName: tier.name,
  }

  // Marked paid partway through the Outstanding Income chain below, which is what moves it
  // out of Outstanding and into the three drill-downs (getEntityIncome counts collected
  // lessons only) — the same lesson the checklist follows across both.
  const paidableLesson = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    monthsAgo: 0,
    horseIds: [apollo.id],
    riderIds: [members.rider2.membershipId],
  })

  // Never mutated, so Outstanding Income and /finances/outstanding still have a Lesson row
  // after the chain above collects paidableLesson.
  const standingUnpaidLesson = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    monthsAgo: 0,
    horseIds: [bella.id],
    riderIds: [members.rider.membershipId],
  })

  // Unpaid, so sync_rider_cancellation_fee's `collected = false` DELETE finds its lesson_fee
  // row and replaces it with the rider_cancellation_fee row the Outstanding chain asserts on.
  const unpaidLateCancelLesson = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: hoursFromNow(2),
    horseIds: [bella.id],
    riderIds: [members.rider.membershipId],
  })

  // The same late cancellation on an already-collected lesson fee, which must produce no
  // cancellation-fee row at all — charging one would bill the rider a second time for a
  // lesson they have already paid for.
  const paidLateCancelLesson = await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: hoursFromNow(3),
    horseIds: [bella.id],
    riderIds: [members.rider.membershipId],
  })

  // The prior-month fixture the month-navigation check reads. Comet's only other fixture is
  // a boarding charge two months back, so its presence in the *previous* month's By Horse
  // table is entirely this lesson's doing.
  await addPaidLesson(supabase, barn, {
    ...lessonDefaults,
    monthsAgo: 1,
    horseIds: [comet.id],
    riderIds: [members.rider.membershipId],
  })

  // monthsAgo 1/2 rather than 0: getOutstandingCharges filters `period < firstOfCurrentMonth`.
  const lease = await addLeaseCharge(supabase, barn, {
    monthsAgo: 1,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
    fee: 150,
  })
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    kind: 'board',
    riderId: members.rider2.membershipId,
    horseId: comet.id,
    fee: 300,
  })

  // Both expenses need an explicit past time-of-day: getOutstandingExpenses treats a
  // time-less expense as due at 23:59:59 on its date, which for a current-month fixture
  // (placed an hour ago) is still in the future and so never reads as past-due.
  const plannedExpense = await addExpense(supabase, barn, {
    monthsAgo: 0,
    time: '00:01',
    recipient: 'Valley Farrier',
    expenseType: 'Farrier',
    horseIds: [apollo.id],
  })
  // Carries an amount from the start, so the Outstanding Expenses total has something to sum
  // while plannedExpense contributes nothing. On Bella, so plannedExpense stays the only
  // current-month expense attributable to Apollo.
  const pricedExpense = await addExpense(supabase, barn, {
    monthsAgo: 0,
    time: '00:02',
    recipient: 'Ridge Feed',
    expenseType: 'Feed',
    amount: 25,
    horseIds: [bella.id],
  })

  seeded = {
    apollo,
    comet,
    paidableLesson,
    standingUnpaidLesson,
    unpaidLateCancelLesson,
    paidLateCancelLesson,
    lease,
    plannedExpense,
    pricedExpense,
    riderMembershipId: members.rider.membershipId,
    rider2MembershipId: members.rider2.membershipId,
    trainerMembershipId: members.trainer.membershipId,
  }
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

/**
 * Mirrors `formatBarnDate` (src/lib/format-date.ts): a TIMESTAMPTZ instant renders in the
 * *barn's* timezone — not the viewer's, not the runner's, and not UTC (#1222 deleted the
 * viewer frame this used to assert). The browser context is pinned to `BROWSER_TIMEZONE`,
 * which is neither UTC nor the barn's zone, so this assertion fails if the page ever falls
 * back to the machine it renders on in either direction.
 */
function barnLocalDate(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: barn.data.barn.timezone }).format(new Date(iso))
}

function outstandingIncome(page: Page) {
  return page.locator('main section').filter({ hasText: 'Outstanding Income' })
}

function outstandingExpenses(page: Page) {
  return page.locator('main section').filter({ hasText: 'Outstanding Expenses' })
}

/** The bold figure each Outstanding section renders above its list — its second paragraph. */
function sectionTotal(section: ReturnType<typeof outstandingIncome>) {
  return section.locator('p').nth(1)
}

/** rider2 also owns the two agreement charges, so the Type cell is what isolates the lesson. */
function paidableLessonRow(page: Page) {
  return outstandingIncome(page)
    .locator('tbody tr')
    .filter({ hasText: RIDER2_NAME })
    .filter({ has: page.getByRole('cell', { name: 'Lesson', exact: true }) })
}

/** Every breakdown table renders Expenses in accounting parens, so magnitude is the figure. */
function parseMoney(text: string): number {
  return Math.abs(Number(text.replace(/[^0-9.]/g, '')))
}

/** Each tab's footer Total row — "Subtotal" would also match a plain `hasText: 'Total'`. */
function footerTotalRow(page: Page) {
  return page.locator('tfoot tr').filter({ hasText: /^Total/ })
}

async function readTabExpenseTotals(page: Page): Promise<number[]> {
  const totals: number[] = []
  for (const tab of TABS) {
    await page.goto(`${financesUrl()}&tab=${tab}`)
    // Columns are uniform across every tab: label, Gross, Expenses, Net.
    totals.push(parseMoney(await footerTotalRow(page).locator('td').nth(2).innerText()))
  }
  return totals
}

/** Late-cancels a rider's participation as "Cancelled by Rider" — the fee-charging branch. */
async function lateCancelByRider(page: Page, lessonId: string, riderMembershipId: string) {
  await page.goto(`/barn/${barn.slug}/lessons/${lessonId}/cancel-rider/${riderMembershipId}`)
  await page.locator('input[name="cancel_type"][value="rider"]').check()
  await page.getByRole('button', { name: 'Confirm Cancellation' }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons/${lessonId}$`), { waitUntil: 'commit' })
}

function lessonHref(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}`
}

/** Hrefs of the Outstanding Payments rows whose Type cell is one of `types`, sorted. */
async function outstandingPageHrefsForTypes(page: Page, types: string[]): Promise<string[]> {
  // Same guard the types-list read above carries, and for the same reason: `evaluateAll` is a
  // one-shot read with no auto-wait, so a not-yet-rendered table yields `[]` (#1238).
  await page.locator('tbody tr').first().waitFor()
  const hrefs = await page.locator('tbody tr').evaluateAll(
    (rows, wanted) =>
      rows
        .filter((row) => wanted.includes(row.children[1]?.textContent ?? ''))
        .map((row) => row.querySelector('a')?.getAttribute('href') ?? ''),
    types
  )
  return hrefs.sort()
}

async function saveExpenseForm(page: Page) {
  await page.getByRole('button', { name: 'Save Changes' }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/expenses$`), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// Outstanding Income, and the barn-timezone correctness of its dates
// ---------------------------------------------------------------------------

// Serial because step 3 collects the lesson steps 1-2 assert is outstanding, which is also
// what makes it visible to the three drill-downs steps 4-6 read.
test.describe.serial('outstanding income', () => {
  test('outstanding_income_lists_past_unpaid_lesson @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await expect(paidableLessonRow(page)).toHaveCount(1)
  })

  test('outstanding_income_lesson_date_renders_in_barn_timezone @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await expect(paidableLessonRow(page).locator('td').first()).toHaveText(
      barnLocalDate(seeded.paidableLesson.lesson_at)
    )
  })

  test('outstanding_income_row_leaves_list_once_payment_type_set @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await paidableLessonRow(page).locator('select').selectOption('venmo')
    await expect(paidableLessonRow(page)).toHaveCount(0, { timeout: SETTLE_AFTER_WRITE })
  })

  test('by_horse_drilldown_lesson_date_renders_in_barn_timezone @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/finances/horses/${seeded.apollo.id}?month=${currentMonth()}`)
    await expect(page.locator(`a[href="/barn/${barn.slug}/lessons/${seeded.paidableLesson.id}"]`)).toHaveText(
      barnLocalDate(seeded.paidableLesson.lesson_at)
    )
  })

  test('by_rider_drilldown_lesson_date_renders_in_barn_timezone @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/finances/riders/${seeded.rider2MembershipId}?month=${currentMonth()}`)
    await expect(page.locator(`a[href="/barn/${barn.slug}/lessons/${seeded.paidableLesson.id}"]`)).toHaveText(
      barnLocalDate(seeded.paidableLesson.lesson_at)
    )
  })

  test('by_instructor_drilldown_lesson_date_renders_in_barn_timezone @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/finances/trainers/${seeded.trainerMembershipId}?month=${currentMonth()}`)
    await expect(page.locator(`a[href="/barn/${barn.slug}/lessons/${seeded.paidableLesson.id}"]`)).toHaveText(
      barnLocalDate(seeded.paidableLesson.lesson_at)
    )
  })
})

// The counterpart to the three checks above: agreement_charges.period is a DATE with no
// time-of-day at all, so it must render as the plain calendar date it stores — a charge is
// always pinned to the 1st of its month (see create_agreement_with_first_charge).
test('outstanding_income_lease_charge_date_renders_as_plain_calendar_date @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const leaseRow = outstandingIncome(page).locator('tbody tr').filter({ hasText: 'Lease' })
  await expect(leaseRow.locator('td').first()).toHaveText(
    formatShortDateOnly(calendarDate(`${seeded.lease.start_date.slice(0, 7)}-01`))
  )
})

// ---------------------------------------------------------------------------
// Outstanding Expenses
// ---------------------------------------------------------------------------

test('outstanding_expenses_total_sums_only_entries_with_a_known_amount @manager', async ({ page }) => {
  await page.goto(financesUrl())
  // Both seeded expenses are listed; only the priced one has an amount to contribute.
  await expect(sectionTotal(outstandingExpenses(page))).toHaveText(formatCurrency(seeded.pricedExpense.amount!))
})

test('outstanding_expenses_lists_past_due_planned_expense_as_one_line @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const line = outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
  await expect(line).toHaveText(
    `${formatShortDateOnly(seeded.plannedExpense.expense_date)} — ${seeded.plannedExpense.recipient} — ${seeded.plannedExpense.expense_type}`
  )
})

test('past_due_planned_expense_absent_from_outstanding_income_table @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(
    outstandingIncome(page).locator('tbody tr').filter({ hasText: seeded.plannedExpense.recipient })
  ).toHaveCount(0)
})

test('outstanding_expenses_info_icon_explains_why_an_entry_is_listed @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const section = outstandingExpenses(page)
  await section.getByRole('button', { name: 'Info' }).click()
  await expect(
    section.getByText('Shown here because the expense is missing an amount, missing a payment type, or both')
  ).toBeVisible()
})

// ---------------------------------------------------------------------------
// Cancellation fees, and /finances/outstanding
// ---------------------------------------------------------------------------

// Serial, and the two /finances/outstanding checks sit inside it: that page's row set is
// only complete — one item of every type — between the cancellation fee being raised and
// being collected, which is exactly the window steps 2-3 run in.
test.describe.serial('cancellation fee', () => {
  test('late_cancelled_unpaid_lesson_raises_an_outstanding_cancellation_fee @manager', async ({ page }) => {
    await lateCancelByRider(page, seeded.unpaidLateCancelLesson.id, seeded.riderMembershipId)
    await page.goto(financesUrl())
    await expect(
      outstandingIncome(page).locator('tbody tr').filter({ hasText: 'Cancellation Fee' })
    ).toHaveCount(1)
  })

  test('outstanding_page_lists_every_type_of_outstanding_item @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await page.getByRole('link', { name: /View all outstanding/ }).click()
    // A wait, not a second assertion: the checkbox's one claim is what the page lists, and
    // this call still fails the test outright if the link doesn't land where it should.
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/finances/outstanding$`), { waitUntil: 'commit' })
    // 'commit' settles the URL before the new document has rendered, which is precisely the
    // window settledInnerTexts closes — see e2e/support/read.ts. A 'commit' site whose next call
    // auto-waits needs no such guard; the ones that read the DOM one-shot do.
    const types = await settledInnerTexts(page.locator('tbody tr td:nth-child(2)'))
    expect([...new Set(types)].sort()).toEqual(['Boarding', 'Cancellation Fee', 'Lease', 'Lesson'])
  })

  test('outstanding_page_lesson_and_cancellation_fee_rows_link_to_their_lesson @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/finances/outstanding`)
    // arrayContaining, not an exact set. Block order here is deterministic — `fullyParallel` is
    // false, so the earlier 'outstanding income' block has already collected `paidableLesson` by
    // the time this runs — but an exact set makes *that* block's write a precondition of this
    // assertion, which is how a single timed-out collect there cascaded into a failure here.
    // The claim is that a row of each type links to its lesson, which the two hrefs this block
    // seeds prove on their own; whether a third Lesson row lingers is the other block's business.
    expect(await outstandingPageHrefsForTypes(page, ['Lesson', 'Cancellation Fee'])).toEqual(
      expect.arrayContaining([
        lessonHref(seeded.standingUnpaidLesson.id),
        lessonHref(seeded.unpaidLateCancelLesson.id),
      ])
    )
  })

  test('cancellation_fee_leaves_the_list_once_payment_type_set @manager', async ({ page }) => {
    await page.goto(financesUrl())
    const feeRow = outstandingIncome(page).locator('tbody tr').filter({ hasText: 'Cancellation Fee' })
    await feeRow.locator('select').selectOption('venmo')
    await expect(feeRow).toHaveCount(0, { timeout: SETTLE_AFTER_WRITE })
  })
})

// The product rule behind the DELETE ... WHERE collected = false in
// sync_rider_cancellation_fee: a rider who has already paid for the lesson must not then be
// billed a cancellation fee for it as well.
test('late_cancelled_paid_lesson_raises_no_cancellation_fee @manager', async ({ page }) => {
  await lateCancelByRider(page, seeded.paidLateCancelLesson.id, seeded.riderMembershipId)
  await page.goto(`/barn/${barn.slug}/finances/outstanding`)
  await expect(page.locator(`a[href="${lessonHref(seeded.paidLateCancelLesson.id)}"]`)).toHaveCount(0)
})

test('outstanding_page_omits_outstanding_expenses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/finances/outstanding`)
  await expect(page.getByText(seeded.plannedExpense.recipient)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Month navigation
// ---------------------------------------------------------------------------

// Round-trip rather than one arrow: `→` only renders on a non-current month, so reaching it
// at all proves `←` navigated, and the final URL proves `→` did.
test('month_navigation_arrows_update_the_month_query_param @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await page.getByRole('link', { name: '<', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('month') === previousMonth(), { waitUntil: 'commit' })
  await page.getByRole('link', { name: '>', exact: true }).click()
  await page.waitForURL(new RegExp(`month=${currentMonth()}`), { waitUntil: 'commit' })
})

test('previous_month_reflects_its_own_seeded_lesson @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await page.getByRole('link', { name: '<', exact: true }).click()
  await expect(page.getByRole('link', { name: seeded.comet.name, exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Resolving the past-due planned expense
// ---------------------------------------------------------------------------

// Baselines the later steps compare against, captured by the first step below — before it
// makes the one mutation the whole chain turns on. A tab's Total for Expenses is an
// aggregate this spec is not allowed to re-derive from a query, so a delta against the
// real pre-edit figure is the only honest expected value available.
let baselineTabExpenseTotals: number[]

test.describe.serial('resolving a past-due planned expense', () => {
  test('past_due_expense_line_links_to_its_edit_page @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await outstandingExpenses(page)
      .getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
      .click()
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/expenses/${seeded.plannedExpense.id}$`), { waitUntil: 'commit' })
  })

  test('past_due_expense_still_outstanding_after_amount_entered_without_payment_type @manager', async ({ page }) => {
    // The suite's heaviest single check — ~7 navigations (`readTabExpenseTotals`'s five, plus a
    // form save and a further goto) — and the only one exempted from the 30s default. Measured
    // 14.8s / 15.2s / 21.1s across three full runs at `workers: 4`, so the default leaves it
    // one bad run from a timeout that would read as a regression rather than as its own cost.
    // Deliberately per-test and not a config-wide bump: every other check keeps the 30s ceiling,
    // which is what makes a genuine hang surface fast. The real fix is fewer navigations, and
    // that means restructuring a describe.serial chain whose next test consumes the baseline
    // this one reads — out of scope for #1238.
    test.setTimeout(60_000)
    baselineTabExpenseTotals = await readTabExpenseTotals(page)

    await page.goto(`/barn/${barn.slug}/expenses/${seeded.plannedExpense.id}`)
    await page.locator('#expense-amount').fill(String(PLANNED_EXPENSE_AMOUNT))
    await saveExpenseForm(page)

    await page.goto(financesUrl())
    await expect(
      outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
    ).toHaveCount(1)
  })

  test('past_due_expense_amount_now_counts_toward_the_outstanding_expenses_total @manager', async ({ page }) => {
    await page.goto(financesUrl())
    await expect(sectionTotal(outstandingExpenses(page))).toHaveText(
      formatCurrency(seeded.pricedExpense.amount! + PLANNED_EXPENSE_AMOUNT)
    )
  })

  test('past_due_expense_amount_added_to_every_tab_expenses_total @manager', async ({ page }) => {
    const totals = await readTabExpenseTotals(page)
    expect(totals).toEqual(baselineTabExpenseTotals.map((total) => total + PLANNED_EXPENSE_AMOUNT))
  })

  test('past_due_expense_amount_added_to_its_horses_expenses_column @manager', async ({ page }) => {
    await page.goto(`${financesUrl()}&tab=horse`)
    const horseRow = page
      .locator('tbody tr')
      .filter({ has: page.getByRole('link', { name: seeded.apollo.name, exact: true }) })
    // Apollo's only current-month expense, so the whole cell is this expense's amount.
    await expect(horseRow.locator('td').nth(2)).toHaveText(
      formatCurrency(PLANNED_EXPENSE_AMOUNT, { forceParens: true })
    )
  })

  test('past_due_expense_leaves_outstanding_expenses_once_payment_type_set @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/expenses/${seeded.plannedExpense.id}`)
    await page.locator('#expense-payment-type').selectOption('venmo')
    await saveExpenseForm(page)

    await page.goto(financesUrl())
    await expect(
      outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
    ).toHaveCount(0)
  })
})
