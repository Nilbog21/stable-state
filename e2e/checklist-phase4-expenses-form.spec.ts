// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/components/calendar/**
//
// The manager's expense form and both delete confirmations: recipient-driven expense-type
// autofill and its flash, a planned expense saved with no amount and priced later, the "All"
// checkbox disabling the horse checkboxes, the Time field hiding for a past date, the edit
// form's pre-filled values and checkbox state, recipient/amount/payment-type round-trips, and
// the two delete confirmation pages with and without the collected-record checkbox
// (PRE_RELEASE_TEST_CHECKLIST.md 350-358 and 377-390 — the 16 (#1020) manual lines at 361-376
// sit between those halves and belong to no slice in this batch).
//
// Only the last five tests are a chain. Everything else does its own goto and either reads a
// fixture nobody mutates or creates/edits a row of its own, so no test can be running against
// state a previous one left. The chain is genuinely sequential — it deletes two expenses and
// then reads what each deletion left behind in Finances — and is the one test.describe.serial
// block here.
import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, daysFromNow, monthAnchor, type SeededAppointment } from './support/fixtures'
import { updateExpense } from '@/lib/db/expenses'
import { formatMonthParam } from '@/lib/finances-month'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import type { PaymentType } from '@/lib/db/types'
import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const BUTTER = 'Butter'

/**
 * The recipient whose history drives the expense-type autofill, and the four rows that make up
 * that history.
 *
 * getMostCommonTypeForRecipient orders by expense_date ASC and keeps the first row whose type
 * has the highest count, so the answer is 'Shoeing' (2 rows against 1 each). The dates and the
 * insertion order below are chosen so that answer differs from *every* fallback the lookup
 * could produce by accident (#1196): alphabetically first is 'Abscess Care' and last is 'Zinc
 * Poultice'; earliest expense_date is 'Abscess Care' and latest is 'Zinc Poultice'; first
 * inserted is 'Zinc Poultice' and last inserted is 'Abscess Care'. Six fallbacks, none of them
 * 'Shoeing', so deleting the counting loop cannot leave this test accidentally green.
 *
 * All four are unamounted, which keeps them out of the ledger entirely — see the Finances note
 * on the delete chain below.
 */
const HISTORY_RECIPIENT = 'Ironclad Farrier Co'
const HISTORY_EXPECTED_TYPE = 'Shoeing'
const HISTORY_ALPHA_FIRST_TYPE = 'Abscess Care'
const HISTORY_ALPHA_LAST_TYPE = 'Zinc Poultice'

// Recipients are all mutually non-substring, deliberately: Playwright's text matching is
// substring-based, so a card filtered by one recipient must not be able to match another's
// (#1202, and the members.rider/rider2 fixture hazard one level down).
const PLANNED_FILLABLE_RECIPIENT = 'Larkspur Hay Co'
const PLANNED_DELETE_READ_RECIPIENT = 'Quillon Bedding Supply'
const PLANNED_DELETE_CONFIRM_RECIPIENT = 'Wexford Stall Mats'
const EDITABLE_RECIPIENT = 'Thornfield Equine Vet'
const EDITABLE_TYPE = 'Dental Float'
const RECIPIENT_EDIT_RECIPIENT = 'Marrow Bedding Co'
const RECIPIENT_EDIT_TYPE = 'Bedding'
const AMOUNT_EDIT_RECIPIENT = 'Pellworth Grain Ltd'
const PAY_EDIT_RECIPIENT = 'Halloway Feed Mill'
const KEEPER_RECIPIENT = 'Bramble Vet Clinic'
const SWEEPER_RECIPIENT = 'Sedgewick Hoof Care'

// Recipients this file *types into the form* rather than seeding.
const NEW_PLANNED_RECIPIENT = 'Nightjar Shavings'
const NEW_PLANNED_TYPE = 'Shavings'
const NEW_BARNWIDE_RECIPIENT = 'Oakhaven Bedding'
const NEW_BARNWIDE_TYPE = 'Straw'
const NEW_PAID_RECIPIENT = 'Ridgeline Supply Co'
const NEW_PAID_TYPE = 'Supplies'
const RENAMED_RECIPIENT = 'Vesper Tack Repair'

const EDITABLE_AMOUNT = 415
/**
 * How far from today the edit-form fixture sits. It must be **non-zero and positive**, and both
 * halves of that are forced by the app — this is not a free choice, so do not "simplify" it.
 *
 * *Non-zero*, because `ExpenseForm` seeds its date state as `useState(defaultDate ?? todayStr)`
 * (`ExpenseForm.tsx:86`) and the edit page passes `todayStr={barnToday(barn.timezone)}`
 * (`[id]/page.tsx:60`). Seed this fixture at day 0 and `expense_date` *is* `todayStr`, so a form
 * that dropped `defaultDate` altogether would render the identical `aria-pressed="true"` cell and
 * the day leg of the pre-fill assertion below would pass while proving nothing.
 *
 * *Positive*, because a past date takes the `isPastDate` branch (`ExpenseForm.tsx:87`), which stops
 * rendering `#expense-time` — and the same poll reads that field, so a negative offset would make
 * the assertion throw instead of tightening it.
 *
 * Safe across a month boundary: the picker's `calendarMonth` also derives from `defaultDate`
 * (`ExpenseForm.tsx:97`), so the selected cell is always on the month the calendar opens to.
 */
const EDITABLE_DAY_OFFSET = 3
const EDITABLE_TIME = '10:15'
/**
 * The same time as the edit form reports it back. Not a typo for the seed above: expense_time is
 * a Postgres `time`, which arrives over PostgREST as "HH:MM:SS" and is handed to the time input
 * verbatim — ExpenseForm's own computeOccurredAt comment (`:65-66`) records exactly that, and had
 * to strip the seconds for the same reason. So the stored value this field is pre-filled with
 * genuinely is '10:15:00'.
 */
const EDITABLE_TIME_STORED = '10:15:00'
const RECIPIENT_EDIT_AMOUNT = 60
const AMOUNT_EDIT_AMOUNT = 45
const PAY_EDIT_AMOUNT = 95

/**
 * The two expenses the delete chain works on. Both carry a payment type, which is not
 * decoration: sync_expense_transaction sets `collected = (payment_type IS NOT NULL)`, and
 * delete_expense_with_transactions *always* deletes uncollected expense rows. An amounted but
 * unpaid expense therefore loses its ledger row whichever way the checkbox goes, which would
 * make checklist line 389 false rather than merely untested. The line's own wording — "the
 * collected record" — says the same thing.
 *
 * 210 and 340 are chosen so the three figures in play (210 alone, 340 alone, 550 together) are
 * mutually non-substring once rendered.
 */
const KEEPER_AMOUNT = 210
const SWEEPER_AMOUNT = 340
/**
 * The reconciliation footer's Unattributed row once the keeper's record has been orphaned, whole:
 * label, Gross, Expenses, Net. Written beside the seed rather than derived from formatCurrency
 * (the code under test).
 *
 * The row rather than the Expenses cell alone, and that is the point rather than thoroughness:
 * expenses/unattributed is 210 → `($210.00)`, and net/unattributed is `gross - expenses` =
 * `0 - 210` = -210, which `formatCurrency`'s `currencySign: 'accounting'` *also* renders
 * `($210.00)`. A single-cell assertion therefore cannot tell the Expenses column from the Net
 * column, so an off-by-one in the index — or a column inserted later — would pass silently.
 *
 * Gross is what makes the row discriminating: it renders `$0.00` rather than an em dash, because
 * `ValueCell`'s em-dash branch requires `forceParens` and only Expenses passes it
 * (`ReconciliationFoot.tsx:15-18`). Nothing in this barn produces unattributed *income*, so 0 is
 * the seed's value, not a reading taken from the page.
 *
 * The label is a regex because the cell also holds the `InfoPopover` trigger's `ⓘ` glyph.
 */
const UNATTRIBUTED_ROW_WITH_KEEPER = [/^Unattributed/, '$0.00', '($210.00)', '($210.00)']

/** ExpenseCard's amount branch for a null amount. */
const NO_AMOUNT_RENDERED = '(no amount specified)'
const BARN_WIDE_RENDERED = 'Entire Barn'

/** The delete confirmation's own heading, and the checkbox only an amounted expense gets. */
const DELETE_PAGE_HEADING = 'Delete Expense'
const FINANCES_CHECKBOX_LABEL = 'Also delete the collected record from Finances'
const CONFIRM_DELETE = 'Confirm Delete'

let plannedFillable: SeededAppointment
let plannedDeleteRead: SeededAppointment
let plannedDeleteConfirm: SeededAppointment
let editable: SeededAppointment
let recipientEdit: SeededAppointment
let amountEdit: SeededAppointment
let payEdit: SeededAppointment
let keeper: SeededAppointment
let sweeper: SeededAppointment

/** Barn-local calendar days, resolved at seed time — the frame ExpenseForm's own todayStr uses. */
let todayStr = ''
let yesterdayStr = ''
/**
 * A comfortably future day, for the planned expense this file creates through the form.
 *
 * The form defaults its Date to the barn's today, and that is not far enough ahead: the card's
 * own isExpensePastDue builds its due instant as `expense_date + 'T23:59:59.999Z'` — UTC-framed,
 * against a date chosen in the *barn's* frame — so a today-dated unamounted expense already
 * reads Past Due in any barn west of UTC. Five days out clears that gap by a full day either
 * way, and is what "planned" means in the first place. (#1194's planned fixture sits at +5 for
 * the same reason.)
 */
let plannedDayStr = ''

/**
 * Gives an already-seeded expense a payment type, which is what makes its ledger row
 * `collected`. addExpense does not forward one, and `fixtures.ts` is off limits to a slice
 * (ruling 4), so this replays the row through the DAL's own writer instead of poking
 * appointment_costs directly — the collected flag then gets set by the same RPC the app uses.
 */
async function markPaid(
  supabase: SupabaseClient,
  barnId: string,
  expense: SeededAppointment,
  horseIds: string[],
  paymentType: PaymentType
): Promise<void> {
  await updateExpense(
    expense.id,
    barnId,
    {
      expenseDate: expense.expense_date,
      expenseTime: expense.expense_time,
      amount: expense.amount,
      recipient: expense.recipient,
      expenseType: expense.expense_type,
      notes: expense.notes,
      appliesToAllHorses: expense.applies_to_all_horses,
      horseIds,
      paymentType,
    },
    supabase
  )
}

const barn = withBarn('phase4-expenses-form', async ({ supabase, barn }) => {
  const apple = await addHorse(supabase, barn.id, APPLE)
  await addHorse(supabase, barn.id, BUTTER)

  todayStr = instantToLocalWallClock(daysFromNow(0, barn.timezone), barn.timezone).slice(0, 10)
  yesterdayStr = instantToLocalWallClock(daysFromNow(-1, barn.timezone), barn.timezone).slice(0, 10)
  plannedDayStr = instantToLocalWallClock(daysFromNow(5, barn.timezone), barn.timezone).slice(0, 10)

  // Insertion order deliberately differs from date order — see HISTORY_RECIPIENT above.
  for (const [day, expenseType] of [
    [-25, HISTORY_ALPHA_LAST_TYPE],
    [-35, HISTORY_EXPECTED_TYPE],
    [-30, HISTORY_EXPECTED_TYPE],
    [-40, HISTORY_ALPHA_FIRST_TYPE],
  ] as const) {
    await addExpense(supabase, barn, {
      at: daysFromNow(day, barn.timezone),
      recipient: HISTORY_RECIPIENT,
      expenseType,
      horseIds: [apple.id],
    })
  }

  plannedFillable = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: PLANNED_FILLABLE_RECIPIENT,
    expenseType: 'Hay',
    horseIds: [apple.id],
  })

  // Two unamounted expenses rather than one, so the test that *reads* the confirmation page and
  // the test that *submits* it are order-independent instead of sharing a row one of them
  // destroys.
  plannedDeleteRead = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: PLANNED_DELETE_READ_RECIPIENT,
    expenseType: 'Bedding',
    horseIds: [apple.id],
  })
  plannedDeleteConfirm = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: PLANNED_DELETE_CONFIRM_RECIPIENT,
    expenseType: 'Matting',
    horseIds: [apple.id],
  })

  // Every amounted fixture is horse-specific, and that is load-bearing rather than incidental.
  // applicableHorseIdsForExpense resolves an applies_to_all_horses expense against the barn's
  // horses filtered by `created_at <= expense_date` at midnight UTC — and these horses are
  // created *now*, so a barn-wide expense dated today resolves to zero horses and lands in the
  // Unattributed bucket. That is the exact cell the delete chain reads, so a barn-wide amounted
  // fixture would quietly poison it. The one barn-wide expense this file creates (line 355)
  // carries no amount and so never reaches the ledger at all.
  // EDITABLE_DAY_OFFSET, not 0, and that is load-bearing rather than arbitrary — see the constant.
  editable = await addExpense(supabase, barn, {
    at: daysFromNow(EDITABLE_DAY_OFFSET, barn.timezone),
    time: EDITABLE_TIME,
    recipient: EDITABLE_RECIPIENT,
    expenseType: EDITABLE_TYPE,
    horseIds: [apple.id],
    amount: EDITABLE_AMOUNT,
  })
  recipientEdit = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: RECIPIENT_EDIT_RECIPIENT,
    expenseType: RECIPIENT_EDIT_TYPE,
    horseIds: [apple.id],
    amount: RECIPIENT_EDIT_AMOUNT,
  })
  amountEdit = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: AMOUNT_EDIT_RECIPIENT,
    expenseType: 'Grain',
    horseIds: [apple.id],
    amount: AMOUNT_EDIT_AMOUNT,
  })
  payEdit = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: PAY_EDIT_RECIPIENT,
    expenseType: 'Feed',
    horseIds: [apple.id],
    amount: PAY_EDIT_AMOUNT,
  })

  // monthsAgo: 0 rather than a day offset, matching the idiom every month-scoped Finances spec
  // already uses: it is UTC-framed, which is the frame resolveFinancesMonth buckets in, and it
  // is the only reachable month here — resolveFinancesMonth clamps the requested month up to
  // the barn's own created_at month, and withBarn does not backdate that, so a monthsAgo: 1
  // fixture could never be navigated to.
  //
  // The explicit time is what pins the day: with expense_time null the RPC derives occurred_at
  // as midnight UTC of expense_date, which decodes to the *previous* day in a barn west of UTC
  // and could carry the row into the previous month at a boundary.
  keeper = await addExpense(supabase, barn, {
    monthsAgo: 0,
    time: '12:00',
    recipient: KEEPER_RECIPIENT,
    expenseType: 'Vaccination',
    horseIds: [apple.id],
    amount: KEEPER_AMOUNT,
  })
  sweeper = await addExpense(supabase, barn, {
    monthsAgo: 0,
    time: '12:00',
    recipient: SWEEPER_RECIPIENT,
    expenseType: 'Trim',
    horseIds: [apple.id],
    amount: SWEEPER_AMOUNT,
  })
  await markPaid(supabase, barn.id, keeper, [apple.id], 'cash')
  await markPaid(supabase, barn.id, sweeper, [apple.id], 'cash')
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function expenseHref(expense: SeededAppointment): string {
  return `/barn/${barn.slug}/expenses/${expense.id}`
}

function listPath(): string {
  return `/barn/${barn.slug}/expenses`
}

function newExpensePath(): string {
  return `/barn/${barn.slug}/expenses/new`
}

/** The By Horse breakdown for the month the delete chain's fixtures sit in. */
function financesByHorsePath(): string {
  return `/barn/${barn.slug}/finances?month=${formatMonthParam(monthAnchor(0))}&tab=horse`
}

/** Nth line of a card, 1-based, matching ExpenseCard's four <p> children. */
function cardLine(expense: SeededAppointment, line: number): string {
  return `a[href="${expenseHref(expense)}"] > p:nth-child(${line})`
}

const RECIPIENT_AND_TYPE_LINE = 2
const HORSES_LINE = 3
const AMOUNT_LINE = 4

/** Every expense card on the list, in DOM order — the `:not` drops the "Add Expense" button. */
function cardLinks(page: Page) {
  return page.locator(`main a[href^="/barn/${barn.slug}/expenses/"]:not([href$="/new"])`)
}

/**
 * A card this file just created through the form, addressed by the recipient it was saved with
 * — its id isn't knowable in advance. Anchored at the start of the recipient/type line so a
 * recipient that is a *prefix* of another couldn't match the wrong card; the constants above
 * are mutually non-substring anyway, which makes that a second line of defence rather than the
 * only one.
 */
function createdCard(page: Page, recipient: string) {
  return cardLinks(page).filter({ has: page.getByText(new RegExp(`^${recipient} · `)) })
}

function horseCheckbox(page: Page, name: string) {
  return page.getByRole('checkbox', { name, exact: true })
}

/** The barn-wide checkbox — the first row of the Horses group, not one of the horses. */
function allCheckbox(page: Page) {
  return page.getByRole('checkbox', { name: 'All', exact: true })
}

function financesCheckbox(page: Page) {
  return page.getByRole('checkbox', { name: FINANCES_CHECKBOX_LABEL, exact: true })
}

/** Every cell of the reconciliation footer's Unattributed row — see UNATTRIBUTED_ROW_WITH_KEEPER. */
function unattributedRowCells(page: Page) {
  return page.locator('main table tfoot tr').filter({ hasText: 'Unattributed' }).locator('td')
}

/**
 * Keyboard activation rather than a pointer click, per the suite's #501 / 04c64505 treatment of
 * submit controls: this form's Save sits below a month calendar grid whose popup grows the page
 * mid-interaction, which is exactly the scroll-into-view race that idiom exists to dodge.
 *
 * test.slow() lives here rather than on the individual tests (#1206's a97bd435 shape): the
 * budget needs raising wherever the submit-and-redirect compile is actually paid, and putting it
 * on call sites instead leaves any test run standalone under --grep on an unbudgeted one.
 */
async function submitForm(page: Page, label: string): Promise<void> {
  test.slow()
  const button = page.getByRole('button', { name: label, exact: true })
  await button.focus()
  await button.press('Enter')
  await page.waitForURL(`**${listPath()}`, { waitUntil: 'commit' })
}

/** Selects a day in the #1020 month calendar. Past days are greyed but never disabled. */
async function tapDay(page: Page, day: string): Promise<void> {
  const cell = page.getByRole('button', { name: day, exact: true })
  await cell.focus()
  await cell.press('Enter')
}

// ---------------------------------------------------------------------------
// Recipient-driven expense-type autofill
// ---------------------------------------------------------------------------

test('entering_a_recipient_seen_before_autofills_the_expense_type @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  const recipientField = page.locator('#expense-recipient')
  await recipientField.fill(HISTORY_RECIPIENT)
  await recipientField.blur()

  await expect(page.locator('#expense-type')).toHaveValue(HISTORY_EXPECTED_TYPE)
})

/**
 * The flash is a `ring-2` class held for 600ms by a setTimeout, so the window can close before a
 * poll ever opens. The observer is installed *before* the blur and records transitions, which
 * makes the read order-independent — and pins the actual claim: a field that gained a ring and
 * never released it is not a flash, and `[false, true]` fails here where a toHaveClass race
 * would have passed.
 */
test('the_autofilled_expense_type_field_flashes @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  const typeField = page.locator('#expense-type')
  await typeField.evaluate((el) => {
    const w = window as unknown as { __ringLog: boolean[] }
    w.__ringLog = [el.className.includes('ring-2')]
    new MutationObserver(() => {
      const on = el.className.includes('ring-2')
      if (on !== w.__ringLog[w.__ringLog.length - 1]) w.__ringLog.push(on)
    }).observe(el, { attributes: true, attributeFilter: ['class'] })
  })

  const recipientField = page.locator('#expense-recipient')
  await recipientField.fill(HISTORY_RECIPIENT)
  await recipientField.blur()

  await expect
    .poll(() => typeField.evaluate(() => (window as unknown as { __ringLog: boolean[] }).__ringLog))
    .toEqual([false, true, false])
})

// ---------------------------------------------------------------------------
// Planned expenses — saved with no amount, priced later
// ---------------------------------------------------------------------------

// All four of the card's lines in one assertion: the array form pins the count, so a card that
// stopped rendering its amount line fails rather than leaving the claim to the other three. The
// date line is /./ because its value belongs to #1194's block, not this one.
//
// The date is moved off the form's today default to plannedDayStr — see that constant for why a
// today-dated unamounted expense renders a Past Due badge into the very <p> this asserts on.
test('leaving_the_amount_blank_saves_a_planned_expense @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await page.locator('#expense-recipient').fill(NEW_PLANNED_RECIPIENT)
  await page.locator('#expense-type').fill(NEW_PLANNED_TYPE)
  await horseCheckbox(page, APPLE).check()
  await tapDay(page, plannedDayStr)
  await submitForm(page, 'Add Expense')

  await expect(createdCard(page, NEW_PLANNED_RECIPIENT).locator('> p')).toHaveText([
    /./,
    `${NEW_PLANNED_RECIPIENT} · ${NEW_PLANNED_TYPE}`,
    APPLE,
    NO_AMOUNT_RENDERED,
  ])
})

// Full-string equality, so '$88.00' cannot be satisfied by '$880.00' or by the no-amount branch.
test('reopening_a_planned_expense_lets_its_amount_be_filled_in @manager', async ({ page }) => {
  await page.goto(expenseHref(plannedFillable))
  await page.locator('#expense-amount').fill('88')
  await submitForm(page, 'Save Changes')

  await expect(page.locator(cardLine(plannedFillable, AMOUNT_LINE))).toHaveText('$88.00')
})

// ---------------------------------------------------------------------------
// The barn-wide "All" checkbox
// ---------------------------------------------------------------------------

/**
 * Both halves in one comparison. The zero is the claim; the seeded horse count beside it is what
 * stops a page that rendered no horse checkboxes at all — or never hydrated far enough to render
 * the fieldset — from reading as "all of them are disabled".
 *
 * The hydration failure mode resolves safely on its own, too: an unhydrated .check() sets the
 * DOM box without ever reaching React, so `disabled` is never applied and this reports 2 enabled
 * rather than 0. The failure direction is red, which is the property #1191's amber-label case
 * did not have.
 */
test('checking_all_disables_the_horse_checkboxes @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await allCheckbox(page).check()

  await expect
    .poll(async () => ({
      horses: await page.locator('input[name="horse_id"]').count(),
      enabled: await page.locator('input[name="horse_id"]:not([disabled])').count(),
    }))
    .toEqual({ horses: 2, enabled: 0 })
})

// Deliberately saved with no amount: an amounted barn-wide expense dated today would resolve to
// zero applicable horses and land in the Unattributed bucket the delete chain below reads. With
// no amount it never reaches the ledger, so this test cannot reach across the file.
test('saving_a_barn_wide_expense_shows_entire_barn_on_its_card @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await page.locator('#expense-recipient').fill(NEW_BARNWIDE_RECIPIENT)
  await page.locator('#expense-type').fill(NEW_BARNWIDE_TYPE)
  await allCheckbox(page).check()
  await submitForm(page, 'Add Expense')

  await expect(createdCard(page, NEW_BARNWIDE_RECIPIENT).locator(`> p:nth-child(${HORSES_LINE})`)).toHaveText(
    BARN_WIDE_RENDERED
  )
})

// ---------------------------------------------------------------------------
// The Time field and the date it depends on
// ---------------------------------------------------------------------------

/**
 * `#expense-time` rather than `input[name="expense_time"]`: the past-date branch still renders a
 * hidden input under that name, so a name-based locator would report the field present in the
 * very state this checkbox is about — a silent false negative rather than a failure.
 *
 * The amount field is the positive control, paired in the same comparison so a page that
 * rendered no form at all reports {0, 0} and fails. Unhydrated resolves red as above: the tap
 * never reaches React, the Time field never leaves, and this reads 1.
 */
test('setting_the_date_to_yesterday_hides_the_time_field @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await tapDay(page, yesterdayStr)

  await expect
    .poll(async () => ({
      time: await page.locator('#expense-time').count(),
      amount: await page.locator('#expense-amount').count(),
    }))
    .toEqual({ time: 0, amount: 1 })
})

// The detached wait is flow control, not an assertion — it is what makes the expectation below a
// *return*. Without it a page whose Time field never left would satisfy the final line trivially.
test('setting_the_date_back_to_today_brings_the_time_field_back @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await tapDay(page, yesterdayStr)
  await page.locator('#expense-time').waitFor({ state: 'detached' })
  await tapDay(page, todayStr)

  await expect(page.locator('#expense-time')).toBeVisible()
})

// ---------------------------------------------------------------------------
// The edit form's opening state
// ---------------------------------------------------------------------------

/**
 * One assertion over the five stored values, because "opens pre-filled with its stored values"
 * is a single claim about the form as a whole — the batch's ratified indivisible-round-trip
 * exception (#1200), in its read-only direction. Splitting it into five tests would assert five
 * things the checklist states as one.
 *
 * inputValue() throws when its element is missing, so the poll cannot settle on a page that
 * never rendered the form.
 */
test('the_edit_form_opens_prefilled_with_the_expenses_stored_values @manager', async ({ page }) => {
  await page.goto(expenseHref(editable))

  await expect
    .poll(async () => ({
      recipient: await page.locator('#expense-recipient').inputValue(),
      expenseType: await page.locator('#expense-type').inputValue(),
      amount: await page.locator('#expense-amount').inputValue(),
      time: await page.locator('#expense-time').inputValue(),
      day: await page.locator('button[aria-pressed="true"]').getAttribute('aria-label'),
    }))
    .toEqual({
      recipient: EDITABLE_RECIPIENT,
      expenseType: EDITABLE_TYPE,
      amount: String(EDITABLE_AMOUNT),
      time: EDITABLE_TIME_STORED,
      day: editable.expense_date,
    })
})

// Three booleans rather than one: `editable` is seeded against Apple only, so a form that
// ignored its stored state entirely — every box clear — fails on Apple, and one that checked
// everything fails on All and Butter.
test('the_edit_form_opens_with_the_stored_all_and_horse_checkbox_state @manager', async ({ page }) => {
  await page.goto(expenseHref(editable))

  await expect
    .poll(async () => ({
      all: await allCheckbox(page).isChecked(),
      apple: await horseCheckbox(page, APPLE).isChecked(),
      butter: await horseCheckbox(page, BUTTER).isChecked(),
    }))
    .toEqual({ all: false, apple: true, butter: false })
})

// ---------------------------------------------------------------------------
// Editing an expense and seeing it on the card
// ---------------------------------------------------------------------------

// Full-string over the whole recipient/type line, so the unchanged type is pinned too — a save
// that overwrote both would fail rather than pass on the half this checkbox names. The new
// recipient has no history, so the blur autofill correctly leaves the type alone.
test('changing_the_recipient_and_saving_updates_the_card @manager', async ({ page }) => {
  await page.goto(expenseHref(recipientEdit))
  await page.locator('#expense-recipient').fill(RENAMED_RECIPIENT)
  await submitForm(page, 'Save Changes')

  await expect(page.locator(cardLine(recipientEdit, RECIPIENT_AND_TYPE_LINE))).toHaveText(
    `${RENAMED_RECIPIENT} · ${RECIPIENT_EDIT_TYPE}`
  )
})

// 45 -> 275, so neither figure is a substring of the other and the seeded value cannot satisfy
// the assertion.
test('changing_the_amount_and_saving_updates_the_card @manager', async ({ page }) => {
  await page.goto(expenseHref(amountEdit))
  await page.locator('#expense-amount').fill('275')
  await submitForm(page, 'Save Changes')

  await expect(page.locator(cardLine(amountEdit, AMOUNT_LINE))).toHaveText('$275.00')
})

// ---------------------------------------------------------------------------
// Payment type
// ---------------------------------------------------------------------------

// The Payment Type control only exists once an amount has been entered (ExpenseForm gates it on
// `amount.trim() !== ''`), so both of these fill an amount first. "Persists on reload" is served
// by re-opening the saved expense's own edit page, which is a fresh server render.
test('a_payment_type_set_on_the_new_expense_form_persists @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await page.locator('#expense-recipient').fill(NEW_PAID_RECIPIENT)
  await page.locator('#expense-type').fill(NEW_PAID_TYPE)
  await horseCheckbox(page, APPLE).check()
  await page.locator('#expense-amount').fill('130')
  await page.locator('#expense-payment-type').selectOption('zelle')
  await submitForm(page, 'Add Expense')

  const card = createdCard(page, NEW_PAID_RECIPIENT)
  // getAttribute is one-shot and answers null against an unsettled list; the waitFor is what
  // makes a missing card fail here rather than further down as a confusing goto error.
  await card.waitFor()
  const href = await card.getAttribute('href')
  if (!href) throw new Error(`no href on the card just created for ${NEW_PAID_RECIPIENT}`)
  await page.goto(href)

  await expect(page.locator('#expense-payment-type')).toHaveValue('zelle')
})

test('a_payment_type_set_on_the_edit_expense_form_persists @manager', async ({ page }) => {
  await page.goto(expenseHref(payEdit))
  await page.locator('#expense-payment-type').selectOption('check')
  await submitForm(page, 'Save Changes')
  await page.goto(expenseHref(payEdit))

  await expect(page.locator('#expense-payment-type')).toHaveValue('check')
})

// ---------------------------------------------------------------------------
// Deleting an expense that has no amount
// ---------------------------------------------------------------------------

/**
 * waitForURL pins *which* expense's confirmation page this landed on; the heading is the proof
 * it rendered, and it is a real render proof rather than a restatement of the URL because the
 * origin page's own h1 is 'Edit Expense' — verified by pointing this assertion at the edit page,
 * where it finds nothing.
 *
 * The checklist said this page is headed "Confirm Delete". It is not: delete/page.tsx:24 renders
 * an h1 of "Delete Expense", and "Confirm Delete" (:37) is the submit button's label. The line
 * was corrected in place under the batch's factual-label-repair precedent.
 */
test('the_delete_confirmation_page_is_headed_delete_expense @manager', async ({ page }) => {
  test.slow()
  await page.goto(expenseHref(plannedDeleteRead))
  const deleteLink = page.getByRole('link', { name: 'Delete', exact: true })
  await deleteLink.focus()
  await deleteLink.press('Enter')
  await page.waitForURL(`**${expenseHref(plannedDeleteRead)}/delete`, { waitUntil: 'commit' })

  await expect(page.getByRole('heading', { name: DELETE_PAGE_HEADING, exact: true })).toBeVisible()
})

// The zero paired with the Confirm Delete button in one comparison: a confirmation page that
// failed to render would report no checkboxes *and* no button, and fails here rather than
// reading as a page that correctly withheld the checkbox. Both are server-rendered.
test('the_unamounted_delete_confirmation_carries_no_checkbox @manager', async ({ page }) => {
  await page.goto(`${expenseHref(plannedDeleteRead)}/delete`)
  const main = page.locator('main')

  await expect
    .poll(async () => ({
      checkboxes: await main.locator('input[type="checkbox"]').count(),
      confirmButtons: await main.getByRole('button', { name: CONFIRM_DELETE, exact: true }).count(),
    }))
    .toEqual({ checkboxes: 0, confirmButtons: 1 })
})

// Deletes its own fixture, not the one the two tests above read, so the three are order
// independent. The surviving card is the same-page non-zero control for the absence.
test('confirming_an_unamounted_delete_removes_it_from_the_list @manager', async ({ page }) => {
  await page.goto(`${expenseHref(plannedDeleteConfirm)}/delete`)
  await submitForm(page, CONFIRM_DELETE)

  await expect
    .poll(async () => ({
      deleted: await page.locator(`a[href="${expenseHref(plannedDeleteConfirm)}"]`).count(),
      survivor: await page.locator(`a[href="${expenseHref(plannedDeleteRead)}"]`).count(),
    }))
    .toEqual({ deleted: 0, survivor: 1 })
})

// ---------------------------------------------------------------------------
// Deleting an expense that has an amount, and what it leaves in Finances
// ---------------------------------------------------------------------------

/**
 * The one chain in this file. Its last two tests read a Finances figure that only means anything
 * *after* a specific deletion, so the order is the subject rather than an accident.
 *
 * What the Unattributed cell is doing here, since it is not the obvious surface. Deleting an
 * appointment sets its transaction's `expense_id` to NULL, which strips the recipient the By
 * Paid To rows and the recipient drill-down both filter on — so the surviving record vanishes
 * from every *named* breakdown while still counting toward the month's expense total. It lands
 * in the Unattributed bucket, whose own tooltip on this page describes exactly this state: "an
 * expense record whose original entry was deleted after being marked paid". That cell is
 * therefore the only honest reading of "still shows up in Finances".
 *
 * Every other amounted expense in this barn is horse-attributed, so the cell reads "—" until the
 * first of these deletions and exactly ($210.00) afterwards.
 */
test.describe.serial('deleting an expense that has an amount', () => {
  test('deleting_an_amounted_expense_offers_the_finances_checkbox @manager', async ({ page }) => {
    await page.goto(`${expenseHref(keeper)}/delete`)

    await expect(financesCheckbox(page)).toBeVisible()
  })

  // not.toBeChecked() still requires the locator to resolve, so a missing checkbox fails here
  // rather than passing as "not checked".
  test('the_finances_delete_checkbox_is_unchecked_by_default @manager', async ({ page }) => {
    await page.goto(`${expenseHref(keeper)}/delete`)

    await expect(financesCheckbox(page)).not.toBeChecked()
  })

  test('confirming_without_the_checkbox_removes_the_expense_from_the_list @manager', async ({ page }) => {
    await page.goto(`${expenseHref(keeper)}/delete`)
    await submitForm(page, CONFIRM_DELETE)

    await expect
      .poll(async () => ({
        deleted: await page.locator(`a[href="${expenseHref(keeper)}"]`).count(),
        survivor: await page.locator(`a[href="${expenseHref(sweeper)}"]`).count(),
      }))
      .toEqual({ deleted: 0, survivor: 1 })
  })

  // Was "—" before the deletion above, and is the deleted expense's own amount after it.
  test('the_deleted_expenses_record_still_counts_in_finances_for_that_month @manager', async ({ page }) => {
    await page.goto(financesByHorsePath())

    await expect(unattributedRowCells(page)).toHaveText(UNATTRIBUTED_ROW_WITH_KEEPER)
  })

  /**
   * The absence and its positive control are the same cell, in the same document. If checking
   * the box had failed to remove the sweeper's ledger row, that row would have been orphaned
   * exactly as the keeper's was and this cell would read ($550.00); the keeper's ($210.00) still
   * being there is what proves the page rendered and the mechanism works at all.
   *
   * The two waits before it are flow control: they establish that the deletion itself landed, so
   * this cannot pass by the delete having silently done nothing.
   */
  test('checking_the_box_also_removes_its_record_from_finances @manager', async ({ page }) => {
    await page.goto(`${expenseHref(sweeper)}/delete`)
    await financesCheckbox(page).check()
    await submitForm(page, CONFIRM_DELETE)
    await page.locator(`a[href="${expenseHref(plannedDeleteRead)}"]`).waitFor()
    await page.locator(`a[href="${expenseHref(sweeper)}"]`).waitFor({ state: 'detached' })
    await page.goto(financesByHorsePath())

    await expect(unattributedRowCells(page)).toHaveText(UNATTRIBUTED_ROW_WITH_KEEPER)
  })
})
