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
import { accordionSection } from './support/accordion'
import { settledInnerTexts } from './support/read'
import { mustAffect } from './support/must-affect'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import { formatShortDateOnly } from '@/lib/format-date'
import { calendarDate } from '@/lib/local-day'
import type { Agreement, Horse, Lesson } from '@/lib/db/types'

// The stub rider addMemberships seeds. Used instead of the `rider` login for the lesson this
// file marks paid, so the paid and unpaid rows belong to different members.
const RIDER2_NAME = 'Test Sutton'

// Typed into the expense edit form partway through the Outstanding Expenses chain, so it
// can't come from a builder — every assertion about it is still expressed as this value
// plus a builder-returned one, never as a literal currency string.
const PLANNED_EXPENSE_AMOUNT = 42

/**
 * The five Finances breakdown tabs, in the order `readTabExpenseTotals` visits them — its only
 * consumer. `pill` is the tab's switcher label (finances/page.tsx); `column` is the table's
 * first column header, which is the only header that differs between tabs (Gross/Expenses/Net
 * are uniform), and so the only thing that says *which* tab is rendered.
 */
const TABS = [
  // First entry is the tab a bare financesUrl() lands on (finances/page.tsx's `tab` default).
  { pill: 'By Horse', column: 'Horse' },
  { pill: 'By Tier', column: 'Tier' },
  { pill: 'By Rider', column: 'Rider' },
  { pill: 'By Instructor', column: 'Trainer' },
  { pill: 'By Paid To', column: 'Recipient' },
] as const

/**
 * The first of this file's two custom timeouts (the other is SETTLE_AFTER_SOFT_NAV below; the
 * suite's other is members-access.spec.ts's), and only for the two
 * assertions that follow a payment-type `selectOption`. The 5s default is sized for a page
 * assertion; those two wait on a server
 * action *plus* the revalidate and RSC round trip it triggers, which has been observed
 * exceeding 5s in CI under parallel-worker load. With `retries: 0` that's a hard failure, not
 * a retry — so the wait is widened here rather than globally, where it would slow every
 * genuine failure in the suite down.
 */
const SETTLE_AFTER_WRITE = 15_000

/**
 * The second custom timeout, for `readTabExpenseTotals`'s one header assertion — the soft nav a
 * tab switch performs, rather than a write. Same 15s value as SETTLE_AFTER_WRITE above, and
 * deliberately a separate constant: that one's comment scopes itself in terms to the two
 * post-`selectOption` assertions, so reusing it would falsify the thing that makes it legible.
 *
 * Widened on **two measurements, two server architectures apart**, which is what makes this a bug
 * rather than a flake to re-roll. `specs/issue-1309.md` (2026-08-04) recorded this same helper's
 * same assertion timing out at `workers: 2` against the old `next dev` suite, and filed it as a
 * pre-existing timing flake. #1601's full run at `workers: 4` against the production server hit it
 * again: 14 polls, still reading the previous tab's `"Rider ▲"` where `"Trainer"` was expected.
 * That is the only assertion in the suite that has ever failed this way, and until #1606 it was
 * what capped `playwright.config.ts`'s worker count — see the comment at that setting.
 *
 * An explicit matcher timeout is the *only* lever that reaches it. A web-first `expect` runs on
 * expect's fixed 5000 ms, which is e2e-framework-facts.md fact 1's third tier — the one
 * `test.slow()` cannot raise — and fact 1 names an explicit timeout as the legitimate way to
 * loosen it. Costs ~0 on a green run, since a web-first assertion returns on first match.
 */
const SETTLE_AFTER_SOFT_NAV = 15_000

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
  mustAffect(
    await supabase
      .from('barns')
      .update({ created_at: monthAnchor(2, barn.timezone).toISOString() })
      .eq('id', barn.id)
      .select('id'),
    'backdate barn created_at',
    1
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

/**
 * Both derived from the same barn-framed anchor the fixtures are placed by, never from the
 * raw clock: finances/page.tsx resolves its default month through `barnToday` (#1360), so a
 * param computed in the host's UTC names next month — and gets clamped back down to the
 * barn's — for the hours each month after UTC rolls over and the barn hasn't.
 */
function currentMonth(): string {
  return formatMonthParam(monthAnchor(0, barn.data.barn.timezone))
}

function previousMonth(): string {
  return formatMonthParam(monthAnchor(1, barn.data.barn.timezone))
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

// Each Outstanding section is an `AccordionSection` since #1550 — a `<details>`, not the
// `<section>` these two used to locate — so both go through the shared scope helper.
function outstandingIncome(page: Page) {
  return accordionSection(page, 'Outstanding Income')
}

function outstandingExpenses(page: Page) {
  return accordionSection(page, 'Outstanding Expenses')
}

/**
 * The bold figure each Outstanding section renders above its list. #1550 moved the label that used
 * to precede it up into the accordion's `<summary>` as the section title.
 *
 * Selected on `font-bold` rather than as the section's *first* paragraph, which it briefly was:
 * that section now leads with a description (`sectionDescriptionClass`), so `p:first` picks up a
 * sentence and the failure reads as a dollar amount not matching prose. `toContainText` is still
 * right for the read — the figure carries no ⓘ now, but a thousands separator or a trailing
 * currency glyph is not worth an exact match.
 */
function sectionTotal(section: ReturnType<typeof outstandingIncome>) {
  return section.locator('p.font-bold')
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

/** The one breakdown table on the page — the Outstanding tables have a thead but no tfoot. */
function breakdownTable(page: Page) {
  return page.locator('main table:has(tfoot)')
}

/**
 * Every tab's Expenses Total, in TABS order. One `page.goto` and four pill clicks: the switcher
 * is `<Pill href>` → a Next `Link`, so a tab change is a client-side soft nav, and the five
 * `goto`s this used to do stood in for what the UI does with none (#1244).
 *
 * The header wait is load-bearing, not decoration. The read below is a one-shot `innerText`, so
 * without it the re-render races the read and returns the *previous* tab's figure — the hazard
 * checklist-phase4-finances-by-tier.spec.ts's by_tier_tab_lists_every_barn_tier documents.
 * `toContainText`, because every breakdown table sorts by its first column by default, so that
 * header also carries a sort glyph. It carries SETTLE_AFTER_SOFT_NAV because it is the assertion
 * whose fixed 5s budget capped the suite's worker count until #1606 — see that constant.
 *
 * No hydration barrier is needed, which is the property that makes this substitution safe
 * everywhere: a pill is an anchor, so a click landing before React is listening navigates the
 * document instead of being lost (the inverse of e2e/CLAUDE.md rule 10) — slower for that one
 * tab, never wrong.
 */
async function readTabExpenseTotals(page: Page): Promise<number[]> {
  await page.goto(financesUrl())
  const totals: number[] = []
  for (const [i, tab] of TABS.entries()) {
    if (i > 0) await page.getByRole('link', { name: tab.pill, exact: true }).click()
    await expect(breakdownTable(page).locator('th').first()).toContainText(tab.column, {
      timeout: SETTLE_AFTER_SOFT_NAV,
    })
    // Column *order* is uniform across every tab — label, Gross, Expenses, Net — so Expenses is
    // always the third cell, even though the label header itself is what differs (see TABS).
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
  await expect(sectionTotal(outstandingExpenses(page))).toContainText(formatCurrency(seeded.pricedExpense.amount!))
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
  // The same recipient, present in the section it *does* belong to. A render proof that also
  // makes the absence below a real discrimination rather than a page that never drew a table.
  await expect(
    outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
  ).toBeVisible()
  await expect(
    outstandingIncome(page).locator('tbody tr').filter({ hasText: seeded.plannedExpense.recipient })
  ).toHaveCount(0)
})

// #1550 replaced both Outstanding sections' ⓘ with a description leading the section, so these
// two are plain visibility reads with no click: the text is on the page for a reader who never
// knew there was an icon to tap.
test('outstanding_income_description_explains_what_it_lists @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(
    outstandingIncome(page).getByText(
      'All-time unpaid lessons, leases, and boarding charges — not only the month shown below.'
    )
  ).toBeVisible()
})

test('outstanding_expenses_description_explains_why_an_entry_is_listed @manager', async ({ page }) => {
  await page.goto(financesUrl())
  await expect(
    outstandingExpenses(page).getByText(
      'Expenses past their scheduled time that are still missing an amount, a payment type, or both. The total counts only the ones with an amount.'
    )
  ).toBeVisible()
})

// Re-pointed from the Outstanding Expenses ⓘ to Pending income's, which #1550 left in place:
// this was #1551's only coverage anywhere in e2e/, so deleting it with the icon it happened to
// be written against would have dropped the outside-tap fix silently.
test('pending_income_info_icon_dismisses_on_a_tap_outside_it @manager', async ({ page }) => {
  await page.goto(financesUrl())
  const section = accordionSection(page, 'Monthly Breakdown')
  const explanation = section.getByText(
    "Lessons scheduled this month that haven't been paid yet, net of the per-lesson instructor cut"
  )
  // Scoped to the Pending income label rather than `.first()` — Monthly Breakdown also holds
  // the three column-header ⓘ, so a positional pick would follow the table's layout around.
  await section
    .locator('p')
    .filter({ hasText: /^Pending income/ })
    .getByRole('button', { name: 'Info' })
    .click()
  // Rule 4's same-test anchor: without it a regression to the open path leaves the
  // explanation hidden throughout, and the dismissal assertion below passes on nothing.
  await expect(explanation).toBeVisible()
  // Tapping the heading, not the icon: before #1551 only a second tap on the icon closed it.
  await page.getByRole('heading', { name: 'Finances' }).click()
  await expect(explanation).toBeHidden()
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

  await expect(page.getByRole('heading', { name: 'Outstanding Payments', level: 1 })).toBeVisible()
  await expect(page.locator(`a[href="${lessonHref(seeded.paidLateCancelLesson.id)}"]`)).toHaveCount(0)
})

test('outstanding_page_omits_outstanding_expenses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/finances/outstanding`)

  await expect(page.getByRole('heading', { name: 'Outstanding Payments', level: 1 })).toBeVisible()
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
    await expect(sectionTotal(outstandingExpenses(page))).toContainText(
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
    // The *other* seeded expense, still outstanding for want of a payment type of its own. It
    // proves the section rendered and still holds entries, so the absence below is this
    // expense leaving rather than the list never arriving.
    await expect(
      outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.pricedExpense.recipient) })
    ).toBeVisible()
    await expect(
      outstandingExpenses(page).getByRole('link', { name: new RegExp(seeded.plannedExpense.recipient) })
    ).toHaveCount(0)
  })
})
