// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/components/calendar/**
// covers: src/components/AmPmWarning.tsx
// covers: src/components/ui/date-nav.ts
//
// The manager's expense form and both delete confirmations: recipient-driven expense-type
// autofill and its flash, a planned expense saved with no amount and priced later, the "All"
// checkbox disabling the horse checkboxes, the Time field hiding for a past date, the #1020
// month conflict calendar the Date field renders as, the edit form's pre-filled values and
// checkbox state, recipient/amount/payment-type round-trips, and the two delete confirmation
// pages with and without the collected-record checkbox
// (checklists/pre-release/phase-4-manager-verification.md, the block from "Tapping anywhere on
// an expense card opens its edit page" through "its record is also gone from Finances").
//
// #1394 took over the 16 (#1020) lines that used to sit unclaimed between those halves. Fifteen
// are the calendar block below. The sixteenth — "the < / > month arrows match the ones on the
// lesson form and Finances page" — was deleted rather than tested: two of its three surfaces
// render the same MonthCalendarPicker, and the third's hand-rolled copy of that class string is
// now the same import, so the claim holds by construction. That import is why this file covers
// src/components/ui/date-nav.ts — a change to the constant is a change to a claim this file
// stands in for, and nothing else asserts it. #1019's sibling line in phase-3 ("the arrows are
// the same size as the ones on the Finances page") went the same way, for the same reason.
//
// Only the last five tests are a chain. Everything else does its own goto and either reads a
// fixture nobody mutates or creates/edits a row of its own, so no test can be running against
// state a previous one left. The chain is genuinely sequential — it deletes two expenses and
// then reads what each deletion left behind in Finances — and is the one test.describe.serial
// block here.
import { test, expect, withBarn, type Page } from './support/test'
import {
  addBarnEvent,
  addExpense,
  addHorse,
  addUnpaidLesson,
  daysFromNow,
  monthAnchor,
  type SeededAppointment,
} from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import { updateExpense } from '@/lib/db/expenses'
import { formatMonthParam } from '@/lib/finances-month'
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'
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
// (#1202).
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
const TAP_SAVE_RECIPIENT = 'Alderfen Tack Co'
const TAP_SAVE_TYPE = 'Saddle Fitting'

/**
 * The two expenses the #1020 calendar block reads, and the barn event it reads beside them.
 *
 * Both carry a `time`, and that is load-bearing rather than tidiness: `getScheduleRange` filters
 * `.not('expense_time', 'is', null)` (`schedule.ts`), so an untimed expense is invisible to this
 * calendar entirely — which is also why none of the untimed fixtures above can dot a day.
 *
 * The event title is the popup's whole rendering of an event (`ScheduleEventRow.label` is
 * `barn_events.title`), so it doubles as the positive control proving the event reached the
 * calendar and was merely not dotted.
 */
const CALENDAR_EXPENSE_RECIPIENT = 'Windrow Mobile Veterinary'
const CALENDAR_EXPENSE_TYPE = 'Vet Visit'
const SELF_DOT_RECIPIENT = 'Kestrel Hoof Works'
const SELF_DOT_TYPE = 'Shoe Reset'
const CALENDAR_EVENT_TITLE = 'Grimsby Open Barn Day'
const CALENDAR_FIXTURE_TIME = '12:00'

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
 * make the "Its record still shows up in Finances for that month" line false rather than merely
 * untested. The line's own wording — "the
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
let selfDot: SeededAppointment

/** Barn-local calendar days, resolved at seed time — the frame ExpenseForm's own todayStr uses. */
let todayStr = ''
let yesterdayStr = ''
/**
 * A comfortably future day, for the planned expense this file creates through the form: **the
 * 5th of the month after the barn's today**.
 *
 * The form defaults its Date to the barn's today, which is not what "planned" means and is not
 * far enough ahead either: a today-dated unamounted expense turns Past Due at the barn's own
 * midnight (#1481), so a run crossing it would put a badge in the very <p> the planned-expense
 * test reads. Any comfortably future day settles that; which future day is decided below.
 *
 * **Next month rather than today + 5, and that is the point rather than a detail (#1283).** A
 * relative +5 sat inside the picker's own 42-cell window on all but one calendar date — day 31
 * of a 31-day month whose 1st is a Saturday, where it cleared the far end with exactly zero
 * margin — so `tapDay`'s new month alignment would have been dead code roughly 999 runs in 1000,
 * exercised only on the dates it exists to survive. Pinning the fixture to the *next month*
 * makes every run drive that alignment, and removes the zero-margin near-miss outright rather
 * than leaving it one calendar reshuffle from being a second live flake in this file.
 */
let plannedDayStr = ''

/**
 * "YYYY-MM" of the month after the barn's today — `plannedDayStr`'s month, and the month every
 * #1020 calendar fixture below sits in. Resolved in the seed, because the barn's timezone is what
 * puts `todayStr` in the barn's own frame and the barn row doesn't exist until then.
 *
 * The whole calendar block is pinned here for the three reasons `plannedDayStr`'s note already
 * gives — always future, so `computeDayDecorations`' `past` branch never suppresses a dot; always
 * inside its own month's 42-cell grid, so `tapDay`/`showMonth` reach it on every run date rather
 * than 999 in 1000 — plus a fourth of its own: it is a different *ledger* month from the
 * `monthsAgo: 0` fixtures the delete chain's Unattributed figures are taken from, so a lesson or
 * expense added here cannot reach them.
 */
let fixtureMonth = ''

/**
 * How the three days above are built, lifted to constants so the guard below can assert them
 * rather than restate them. See each day's own note for why its value is what it is;
 * `plannedDayStr`'s next-month framing in particular is not free.
 */
const YESTERDAY_OFFSET = -1
const PLANNED_DAY_OF_MONTH = '05'

/**
 * The days of `fixtureMonth` the calendar fixtures sit on. Spaced two apart rather than packed,
 * so a grid that rendered one cell off would land on an empty day and fail rather than on the
 * neighbouring fixture and pass.
 *
 * Day 20 holds nothing: it is the day `saving_after_tapping_a_day_stores_the_day_that_was_tapped`
 * taps, and that test is the only one here that writes. What it writes is untimed, so it cannot
 * become an item on this calendar however many times the file is run.
 */
const CALENDAR_DAYS_OF_MONTH = {
  /** Apple's lesson — the "already has a lesson" dot, and the lesson the popup names by horse. */
  lesson: '10',
  /** Apple's timed vet expense — the "vet/farrier expense" dot, and the popup's expense. */
  expense: '12',
  /** Butter's lesson — the booking that belongs to a *different* horse. */
  otherHorse: '14',
  /** A barn event and nothing else. */
  event: '16',
  /** The expense whose own edit page must not dot its own day. */
  selfDot: '18',
  /** Untouched — the day the save round-trip taps. */
  tapSave: '20',
} as const

function calendarDay(key: keyof typeof CALENDAR_DAYS_OF_MONTH): string {
  return `${fixtureMonth}-${CALENDAR_DAYS_OF_MONTH[key]}`
}

/**
 * The day pins' arithmetic, executable rather than written in a comment (#1283, the shape
 * #1252's `assertPinArithmetic` landed).
 *
 * It cannot run at collection the way that one does: these three days are barn-local, and the
 * barn row does not exist until `withBarn`'s callback runs. So it is the last statement of the
 * seed instead — still once per file, still throwing, still ahead of every test.
 *
 * What it asserts is the separation the tests below actually discriminate: `ExpenseForm`'s only
 * date-sensitive branch is `isPastDate = expenseDate < todayStr`, and the three tests that tap a
 * day are aimed one at each side of it. A seed edit that moved `yesterdayStr` onto or past
 * `todayStr` would leave `setting_the_date_to_yesterday_hides_the_time_field` asserting the
 * *absence* of a field that was never going to leave — green, and vacuous. Likewise a
 * `plannedDayStr` that stopped being future would put a Past Due badge into the very <p>
 * `leaving_the_amount_blank_saves_a_planned_expense` reads (#1481).
 *
 * Grid *containment* is deliberately not asserted here, and that is the point of the #1283 fix
 * rather than an omission: `tapDay` now pages the picker to the requested day's own month, so a
 * day is reachable because it is a real day, not because the current month's 42-cell window
 * happens to reach it. Before that, `yesterdayStr` fell off the grid whenever the barn's today
 * was the 1st *and* that 1st was a Sunday (`getMonthGrid` starts at the 1st minus its weekday,
 * so a Sunday 1st leaves no leading spill-over cells) — about 0.5% of run dates — and
 * `plannedDayStr` cleared the far end with exactly zero margin at day 31 of a 31-day month whose
 * 1st is a Saturday.
 */
function assertDayPinArithmetic(): void {
  const problems: string[] = []
  const shift = (days: number) =>
    new Date(`${todayStr}T00:00:00Z`).getTime() + days * 24 * 60 * 60 * 1000

  for (const [name, value] of [
    ['todayStr', todayStr],
    ['yesterdayStr', yesterdayStr],
    ['plannedDayStr', plannedDayStr],
  ] as const) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) problems.push(`${name} is ${JSON.stringify(value)}, not a "YYYY-MM-DD"`)
  }
  if (new Date(`${yesterdayStr}T00:00:00Z`).getTime() !== shift(YESTERDAY_OFFSET)) {
    problems.push(`yesterdayStr is ${yesterdayStr}, expected ${YESTERDAY_OFFSET} day(s) from ${todayStr}`)
  }
  // Checked by day arithmetic rather than by re-running `monthFromIndex(monthIndex(...) + 1)`,
  // which is the expression that *produced* the value: re-executing it compares a thing to
  // itself and cannot fail, so it would prove nothing about the very helpers whose off-by-one
  // this guard exists to catch. Stepping back one day from the 1st of plannedDayStr's month has
  // to land in todayStr's month, and that is arithmetic those helpers take no part in.
  const plannedMonthStart = new Date(`${plannedDayStr.slice(0, 7)}-01T00:00:00Z`).getTime()
  const monthBeforePlanned = new Date(plannedMonthStart - 24 * 60 * 60 * 1000).toISOString().slice(0, 7)
  if (plannedDayStr.slice(8) !== PLANNED_DAY_OF_MONTH || monthBeforePlanned !== todayStr.slice(0, 7)) {
    problems.push(
      `plannedDayStr is ${plannedDayStr}, expected day ${PLANNED_DAY_OF_MONTH} of the month after ` +
        `${todayStr.slice(0, 7)}. Inside today's own month it stops driving tapDay's month alignment ` +
        'on every run, which is the only thing that keeps that alignment from being dead code.'
    )
  }
  if (!(yesterdayStr < todayStr && todayStr < plannedDayStr)) {
    problems.push(
      `the three day pins are ${yesterdayStr}/${todayStr}/${plannedDayStr}, which are not strictly ` +
        'ordered past < today < future — ExpenseForm\'s isPastDate branch is what these tests ' +
        'discriminate, and an unordered triple leaves at least one of them vacuous.'
    )
  }
  // The calendar days ride on plannedDayStr's month check above rather than repeating it: they
  // are all built from the same `fixtureMonth`, so one month assertion covers the set. What is
  // left to check is that they are distinct, which is the edit that would go wrong silently —
  // two fixtures sharing a day makes an "and this day shows no dot" check fail for a reason that
  // has nothing to do with the rule it names, and merging the tap-save day into a booked one
  // makes it pass on the wrong evidence.
  const days = [...Object.values(CALENDAR_DAYS_OF_MONTH), PLANNED_DAY_OF_MONTH]
  if (new Set(days).size !== days.length) {
    problems.push(`the calendar fixture days collide: ${days.join(', ')} — each has to be its own day`)
  }
  if (problems.length > 0) {
    throw new Error(`the expense-form day pins are misaimed:\n  ${problems.join('\n  ')}`)
  }
}

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

const barn = withBarn('phase4-expenses-form', async ({ supabase, barn, members }) => {
  const apple = await addHorse(supabase, barn.id, APPLE)
  const butter = await addHorse(supabase, barn.id, BUTTER)

  todayStr = instantToLocalWallClock(daysFromNow(0, barn.timezone), barn.timezone).slice(0, 10)
  yesterdayStr = instantToLocalWallClock(daysFromNow(YESTERDAY_OFFSET, barn.timezone), barn.timezone).slice(0, 10)
  // Built from `todayStr`'s month rather than from a day offset — see plannedDayStr's own note.
  fixtureMonth = monthFromIndex(monthIndex(todayStr.slice(0, 7)) + 1)
  plannedDayStr = `${fixtureMonth}-${PLANNED_DAY_OF_MONTH}`
  assertDayPinArithmetic()

  /** A calendar day at a fixed barn-local hour, as the real instant every fixture builder takes. */
  const calendarInstant = (key: keyof typeof CALENDAR_DAYS_OF_MONTH, time = CALENDAR_FIXTURE_TIME) =>
    wallClockToInstant(`${calendarDay(key)}T${time}:00`, barn.timezone)

  // fee 0, and no exertion levels beyond addUnpaidLesson's default: neither figure is read here.
  // A fee would land a lesson_fee transaction in fixtureMonth's ledger, which no test reads —
  // zero keeps it out of one entirely rather than relying on that.
  const calendarLessonDefaults = { instructorId: members.trainer.membershipId, fee: 0 }
  await addUnpaidLesson(supabase, barn, {
    ...calendarLessonDefaults,
    at: calendarInstant('lesson', '09:00'),
    horseIds: [apple.id],
    riderIds: [members.rider.membershipId],
  })
  await addUnpaidLesson(supabase, barn, {
    ...calendarLessonDefaults,
    at: calendarInstant('otherHorse', '09:00'),
    horseIds: [butter.id],
    riderIds: [members.rider.membershipId],
  })
  await addExpense(supabase, barn, {
    at: calendarInstant('expense'),
    time: CALENDAR_FIXTURE_TIME,
    recipient: CALENDAR_EXPENSE_RECIPIENT,
    expenseType: CALENDAR_EXPENSE_TYPE,
    horseIds: [apple.id],
  })
  selfDot = await addExpense(supabase, barn, {
    at: calendarInstant('selfDot'),
    time: CALENDAR_FIXTURE_TIME,
    recipient: SELF_DOT_RECIPIENT,
    expenseType: SELF_DOT_TYPE,
    horseIds: [apple.id],
  })
  await addBarnEvent(supabase, barn, { at: calendarInstant('event'), title: CALENDAR_EVENT_TITLE })

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

  // Future-dated, which is both what "planned" means and what keeps the test below readable: it
  // fills the amount in through the form and then asserts the amount <p> with full-string
  // equality, and the row that save produces has no payment type — outstanding, and an outstanding
  // expense whose moment has passed badges into that very <p> (#1481). A seeded `paymentType`
  // cannot close that instead: `sync_expense_transaction` deletes the cost row whole when the
  // amount is null, so a payment type on an unamounted fixture never reaches the DB. Staying
  // untimed keeps it off the conflict calendar however its date moves.
  plannedFillable = await addExpense(supabase, barn, {
    at: daysFromNow(5, barn.timezone),
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
  // fixture would quietly poison it. The one barn-wide expense this file creates (for the
  // "shows \"Entire Barn\" on its card" line)
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
  // Paid, and seeded amounted so the payment type actually persists: this fixture's edited amount
  // is asserted with full-string equality, and a day-0 expense holding only half of what makes an
  // expense settled badges into that same <p> once the barn's midnight passes (#1481).
  amountEdit = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: AMOUNT_EDIT_RECIPIENT,
    expenseType: 'Grain',
    horseIds: [apple.id],
    amount: AMOUNT_EDIT_AMOUNT,
    paymentType: 'check',
  })
  payEdit = await addExpense(supabase, barn, {
    at: daysFromNow(0, barn.timezone),
    recipient: PAY_EDIT_RECIPIENT,
    expenseType: 'Feed',
    horseIds: [apple.id],
    amount: PAY_EDIT_AMOUNT,
  })

  // monthsAgo: 0 rather than a day offset, matching the idiom every month-scoped Finances spec
  // already uses: it is barn-framed (#1360), which is the frame resolveFinancesMonth buckets
  // in, and it is the only reachable month here — resolveFinancesMonth clamps the requested
  // month up to the barn's own created_at month, and withBarn does not backdate that, so a
  // monthsAgo: 1 fixture could never be navigated to.
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
  return `/barn/${barn.slug}/finances?month=${formatMonthParam(monthAnchor(0, barn.data.barn.timezone))}&tab=horse`
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

/** One day cell of the month calendar, addressed by the "YYYY-MM-DD" it carries as its label. */
function dayCell(page: Page, day: string) {
  return page.getByRole('button', { name: day, exact: true })
}

/** Every day cell currently on the grid — fixed at 6 rows x 7 days, spill-over included. */
function dayCells(page: Page) {
  return page.locator('button[data-outside]')
}

function conflictDot(page: Page, day: string) {
  return page.getByTestId(`conflict-dot-${day}`)
}

/**
 * The day panel's schedule lines. Scoped to the form because the panel is rendered inside it and
 * is the only list there — anchoring on the panel itself would mean matching a wrapper `div` by
 * its Close button, which is a locator that breaks on any layout change.
 */
function dayPanelItems(page: Page) {
  return page.locator('main form ul li')
}

/**
 * How long a read that depends on the calendar's schedule fetch may wait, borrowed verbatim from
 * `checklist-phase5-lessons-new.spec.ts` (#1372), which measured the need for it on the same
 * `getScheduleRange` round trip from the lesson form.
 *
 * A number here *loosens* rather than tightens (e2e/CLAUDE.md fact 1): `expect.poll` and the
 * web-first matchers run on expect's own 5s default and `test.slow()` does not raise it. Every
 * consumer below waits on a Server Action round trip behind a `next dev` compile the run may be
 * paying for the first time, and 5s is not reliably enough for that under full-suite load.
 */
const SCHEDULE_FETCH_BUDGET = 20_000

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

/**
 * The month the picker is currently showing, "YYYY-MM", read off the first cell it marks as
 * in-month. `null` if the grid has not rendered yet.
 *
 * `data-outside="false"` rather than the heading: `formatMonthHeading` renders "August 2026",
 * and parsing a localised month name back into a number is both fragile and a second copy of
 * that formatter. Every cell carries its own "YYYY-MM-DD" as `aria-label`, so an in-month cell
 * states the displayed month directly. Safe as an attribute read despite e2e/CLAUDE.md fact 7
 * (React 19 leaves a mismatched attribute at the server's value): `data-outside` is derived from
 * `month`, which is React state the *test itself* drives, so there is no server/client answer to
 * disagree about — and the retry loop below is what proves the state actually moved.
 *
 * One `page.evaluate`, deliberately: `hydrateByDriving` requires a non-retrying predicate, and
 * `locator.getAttribute` auto-waits.
 */
function displayedMonth(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const cell = document.querySelector('button[data-outside="false"]')
    return cell?.getAttribute('aria-label')?.slice(0, 7) ?? null
  })
}

/**
 * "YYYY-MM" as a count of months, and back, so two months subtract and a delta re-applies.
 *
 * Restated here rather than imported from `month-calendar.ts`'s `shiftMonth`, which is the code
 * this file's calendar tests exercise: navigation built out of the module under test would page
 * to whichever month a bug in it named, and then find the day there.
 */
function monthIndex(month: string): number {
  const [year, monthNumber] = month.split('-').map(Number)
  return year * 12 + (monthNumber - 1)
}

function monthFromIndex(index: number): string {
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * Hydration barrier for the expense form, in either of its two placements: `showMonth`'s
 * precondition before any paging, and — since #1363 — the barrier every test below puts between
 * its `goto` and its first `fill`.
 *
 * It serves both because it perturbs no form field at all. The drive is a re-tap of the day cell
 * that is *already* selected, and that choice is the whole point rather than an arbitrary pick:
 * `hydrateByDriving` re-dispatches while `isLive` is false, so it is only safe on a control whose
 * repeat is harmless (its own module comment says so). `handleDayTap` on the selected day calls
 * `onChange` with the value the form already holds and re-opens an already-open panel, so any
 * number of retries leave the form exactly as they found it. The **month pager is the opposite** —
 * a monotonic counter with no path back — which is why the barrier is here rather than around the
 * presses `showMonth` makes below.
 *
 * The signal is the day panel's Close button. `useOutsideDismiss` seeds `open` as `useState(false)`
 * and `ExpenseForm` passes `dayPanelAlwaysOpen={false}`, so the panel — and that button — cannot
 * exist in the server's markup at all. That makes its appearance strictly post-hydration rather
 * than merely correlated with it, which is what the module comment requires of a signal.
 * `count()` rather than a `waitFor`, because `isLive` has to be non-retrying.
 *
 * The panel the drive opened is then closed again, which `hydrateByDriving`'s comment names as the
 * caller's job. It cost nothing while this ran only inside `showMonth`; at the call sites below it
 * would leave every barriered test operating on a form the unbarriered ones don't have. The pager
 * `showMonth` presses next is a sibling of the day grid rather than a child of the panel
 * (`MonthCalendarPicker.tsx`), so shutting the panel doesn't take it out of reach.
 *
 * Both `/expenses/new` and `/expenses/[id]` pass `getScheduleRange` to `ExpenseForm`, so the
 * calendar this reaches for is on every page the tests below open.
 */
async function hydrateExpenseForm(page: Page): Promise<void> {
  const selectedDay = page.locator('button[aria-pressed="true"]').first()
  const close = page.getByRole('button', { name: 'Close', exact: true })
  await hydrateByDriving(
    () => selectedDay.click(),
    async () => (await close.count()) > 0
  )
  await close.click()
}

/**
 * Pages the picker to `month`, one Prev/Next press per step.
 *
 * A click dispatched before React is listening is simply lost and nothing replays it
 * (e2e/CLAUDE.md fact 10), and this is the *first* interaction on a freshly `goto`-ed form — so
 * a press has to be made after hydration rather than retried into it. Retrying the pager itself
 * is not an option: it is a counter, not a toggle, so a press that merely *lagged* the read
 * would be dispatched a second time and overshoot, and nothing here ever drives backward. That
 * failure mode is strictly worse than the lost click it would be guarding against — the loop
 * could never converge again and would burn the whole test budget. So hydration is established
 * once, on an idempotent control, and each press is then a plain click.
 *
 * The per-step wait is `expect.poll` on `displayedMonth`, whose 5s default is ample for a state
 * re-render on an already-hydrated form; per fact 1 a number there could only loosen it, so none
 * is written. It also makes an overshoot fail loudly and immediately, naming the month actually
 * on screen, instead of surfacing later as a missing day cell.
 */
async function showMonth(page: Page, month: string): Promise<void> {
  // A wait, not an assertion: `displayedMonth` is a one-shot `evaluate` with no auto-retry, so
  // without this it can be taken against a document that has not painted the grid yet and read
  // `null` — which would throw the "rendered no in-month day cell" error for a page that was
  // merely early rather than wrong.
  await page.locator('button[data-outside="false"]').first().waitFor()
  const from = await displayedMonth(page)
  if (from === null) throw new Error('the month calendar rendered no in-month day cell')
  const delta = monthIndex(month) - monthIndex(from)
  // Nothing to page: leave the form untouched, so the overwhelmingly common case costs no extra
  // interaction and behaves exactly as it did before #1283.
  if (delta === 0) return

  await hydrateExpenseForm(page)
  const pager = page.getByRole('button', { name: delta < 0 ? 'Previous month' : 'Next month', exact: true })
  for (let step = 1; step <= Math.abs(delta); step++) {
    const target = monthFromIndex(monthIndex(from) + Math.sign(delta) * step)
    await pager.click()
    await expect.poll(() => displayedMonth(page)).toBe(target)
  }
}

/**
 * Selects a day in the #1020 month calendar. Past days are greyed but never disabled.
 *
 * The picker is paged to the day's **own** month first (#1283). Without that the reachable days
 * were whatever `getMonthGrid` happened to spill into the 42-cell window around the barn's
 * current month, which is a property of the calendar rather than of the day being asked for —
 * see `assertDayPinArithmetic` for the two boundaries that made it a flake and a zero-margin
 * near-miss. A day is always inside its own month's grid, so after the alignment the tap is
 * total. The rejected alternative was a conditional "page back if the cell is missing", which
 * would have made a *genuinely* absent day read as a successful tap somewhere else.
 */
async function tapDay(page: Page, day: string): Promise<void> {
  await showMonth(page, day.slice(0, 7))
  const cell = dayCell(page, day)
  await cell.focus()
  await cell.press('Enter')
}

// ---------------------------------------------------------------------------
// Recipient-driven expense-type autofill
// ---------------------------------------------------------------------------

// The barrier fails *earlier* here than at the sites below, not more legitimately: the autofill is
// `handleRecipientBlur`, so an unhydrated fill — which moves the DOM value and fires no `onChange`
// (e2e/CLAUDE.md fact 9) — leaves `recipient` state empty, the blur returns early on the empty
// trim, and the type field stays blank for a reason that has nothing to do with history.
//
// The sites below are not the mere uniformity #1363 took them for. Their values do survive to a
// native form post, which reads the DOM rather than state — but only if they are still in the DOM
// at submit time, and an unhydrated fill leaves them one re-render away from being overwritten
// with the state React holds. `checklist-phase4-barn-timezone.spec.ts`'s expense test states that
// mechanism in full, including why this form always supplies the re-render.
test('entering_a_recipient_seen_before_autofills_the_expense_type @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
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
 *
 * The barrier is the same precondition the test above states, and it goes ahead of the observer
 * too: the ring is applied by `setTypeFlashing`, so an unhydrated fill produces no transitions at
 * all and the log reads `[false]` — a failure that names the observer rather than the hydration.
 *
 * The read is `toPass` rather than `expect.poll` because the tier is what failed, not the claim
 * (#1595): the poll runs on expect's 5s default, which the 600ms ring plus its two React commits
 * only comfortably clears on an idle machine — under full-suite contention those commits queue
 * behind compile work and the third transition lands outside the window. `toPass` is unbounded
 * (fact 1), so the wait draws on the test's own budget and there is no number here to re-size on
 * a slower box. Don't tighten it back. `waitForFunction` on `__ringLog.length === 3` would be
 * unbounded too and is the wrong shape: that predicate is satisfiable only by the success path
 * (fact 17), so a ring that latched on would time out naming the predicate, where this names the
 * observed `[false, true]`.
 */
test('the_autofilled_expense_type_field_flashes @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
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

  await expect(async () => {
    expect(
      await typeField.evaluate(() => (window as unknown as { __ringLog: boolean[] }).__ringLog)
    ).toEqual([false, true, false])
  }).toPass()
})

// ---------------------------------------------------------------------------
// Planned expenses — saved with no amount, priced later
// ---------------------------------------------------------------------------

// All four of the card's lines in one assertion: the array form pins the count, so a card that
// stopped rendering its amount line fails rather than leaving the claim to the other three. The
// date line is /./ because its value belongs to #1194's block, not this one.
//
// The date is moved off the form's today default to plannedDayStr — see that constant for why a
// today-dated unamounted expense can render a Past Due badge into the very <p> this asserts on.
test('leaving_the_amount_blank_saves_a_planned_expense @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
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
  await hydrateExpenseForm(page)
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
  await hydrateExpenseForm(page)
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
//
// It is also why this test needs the barrier where its sibling above does not, though neither is a
// `fill`: that wait is tier-1 and therefore unbounded (e2e/CLAUDE.md fact 1), so a first `tapDay`
// lost to hydration (fact 10) leaves `#expense-time` attached and blocks until the test's whole
// 30s budget is gone — the slow-timeout shape #1363 exists to remove, not the fast red the
// sibling's 5s `expect.poll` gives. `tapDay` can't supply the barrier itself: it reaches
// `showMonth` with `delta === 0` for both of these days, which returns before hydrating.
test('setting_the_date_back_to_today_brings_the_time_field_back @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
  await tapDay(page, yesterdayStr)
  await page.locator('#expense-time').waitFor({ state: 'detached' })
  await tapDay(page, todayStr)

  await expect(page.locator('#expense-time')).toBeVisible()
})

// ---------------------------------------------------------------------------
// #1020 — the month conflict calendar the Date field renders as
// ---------------------------------------------------------------------------
//
// Every check below reads the fixture month rather than the barn's current one, so a zero means
// "the rule suppressed it" rather than "there was nothing there to suppress" — the four bookings
// seeded on days 10/12/14/18, and the barn event on 16 that is deliberately not one, are all in
// view for every one of them.
//
// The dots and the day panel both depend on the schedule fetch `ExpenseForm`'s effect fires per
// displayed month, which is a Server Action round trip: nothing here is server-rendered, so every
// read that names one is an auto-retrying matcher carrying SCHEDULE_FETCH_BUDGET.

/** Opens the new-expense form, hydrated and paged to the fixture month, with `horses` ticked. */
async function openCalendarOnFixtureMonth(page: Page, horses: 'none' | 'apple' | 'all'): Promise<void> {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
  if (horses === 'apple') await horseCheckbox(page, APPLE).check()
  if (horses === 'all') await allCheckbox(page).check()
  await showMonth(page, fixtureMonth)
}

// Both halves in one equality, the shape checklist-phase5-lessons-new.spec.ts already uses for the
// lesson form's version of this line: either half alone is satisfiable by the wrong page — a form
// with both controls, or a form with neither. `#expense-date` is the id of the native input
// ExpenseForm falls back to when no schedule reader is passed.
test('the_date_field_renders_as_a_month_calendar_grid @manager', async ({ page }) => {
  await page.goto(newExpensePath())

  await expect
    .poll(async () => ({
      dayCells: await dayCells(page).count(),
      nativeDateInputs: await page.locator('#expense-date').count(),
    }))
    .toEqual({ dayCells: 42, nativeDateInputs: 0 })
})

/**
 * The rendered grey, not `data-past`: the attribute is the model's own word for the state, so
 * asserting it restates `computeDayDecorations` rather than checking that the cell looks any
 * different. Today's cell is the paired negative — without it a grid that greyed every day would
 * pass.
 *
 * Matched as the whole light/dark pair rather than the `text-zinc-300` token alone, and that is
 * not tidiness: `text-zinc-300` is also the *dark* half of the neighbouring-month tint
 * (`text-zinc-600 dark:text-zinc-300`, `MonthCalendarPicker.tsx`). On the 1st of a month today is
 * an outside cell of yesterday's grid, so the loose token would read the paired negative as grey
 * and fail this test on that one calendar date. The two pairs share no substring.
 *
 * `showMonth` to *yesterday's* month rather than trusting the default, which is today's: on the
 * 1st of a month whose 1st is a Sunday, `getMonthGrid` spills no leading cells and yesterday is
 * simply not on the grid (`assertDayPinArithmetic` says why containment isn't assumed anywhere in
 * this file). Yesterday's month always holds today too — the grid's 42 cells cover at least day
 * 36 of any month, whatever weekday its 1st falls on.
 */
const PAST_DAY_TINT = 'text-zinc-300 dark:text-zinc-600'

test('days_before_today_are_greyed_out @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await showMonth(page, yesterdayStr.slice(0, 7))

  await expect
    .poll(async () => ({
      yesterday: ((await dayCell(page, yesterdayStr).getAttribute('class')) ?? '').includes(PAST_DAY_TINT),
      today: ((await dayCell(page, todayStr).getAttribute('class')) ?? '').includes(PAST_DAY_TINT),
    }))
    .toEqual({ yesterday: true, today: false })
})

// The 42 is what makes the zero mean something: this month holds four bookings, so a grid that
// rendered them all and dotted none is the claim, and a grid that rendered nothing is a failure.
test('no_day_shows_a_dot_with_nothing_selected @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'none')

  await expect
    .poll(
      async () => ({
        dayCells: await dayCells(page).count(),
        dots: await page.locator('[data-testid^="conflict-dot-"]').count(),
      }),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toEqual({ dayCells: 42, dots: 0 })
})

/**
 * Taken with Apple checked and on the month holding Apple's lesson — the state that *would* shade
 * if this form ever grew a heatmap, rather than the empty default where the absence is trivial.
 *
 * `data-band` is absent rather than `"null"` when there is no band (React drops a null attribute),
 * so the count of cells carrying it at all is the whole reading. The dot on Apple's lesson day is
 * the positive control: it can only be there once the schedule fetch has landed *and* the horse
 * selection has reached React, which is exactly what would otherwise leave the grid unshaded for
 * reasons unrelated to the claim.
 */
test('no_day_is_exertion_shaded_on_the_expense_form @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')

  await expect
    .poll(
      async () => ({
        dayCells: await dayCells(page).count(),
        banded: await page.locator('button[data-band]').count(),
        appleLessonDot: await conflictDot(page, calendarDay('lesson')).count(),
      }),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toEqual({ dayCells: 42, banded: 0, appleLessonDot: 1 })
})

test('checking_a_horse_dots_a_day_it_already_has_a_lesson_on @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')

  await expect(conflictDot(page, calendarDay('lesson'))).toBeVisible({ timeout: SCHEDULE_FETCH_BUDGET })
})

// The vet expense is the only thing on its day, so this dot cannot have come from a lesson —
// which is the line's point, that an appointment conflicts as readily as a lesson does.
test('checking_a_horse_dots_a_day_it_already_has_an_expense_on @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')

  await expect(conflictDot(page, calendarDay('expense'))).toBeVisible({ timeout: SCHEDULE_FETCH_BUDGET })
})

// Butter's lesson day paired with Apple's, in the same render: the 1 is what proves the fetch
// landed and Apple is selected, so the 0 beside it is the horse filter doing its job rather than
// a calendar that had not caught up.
test('a_day_booked_only_for_another_horse_shows_no_dot @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')

  await expect
    .poll(
      async () => ({
        butter: await conflictDot(page, calendarDay('otherHorse')).count(),
        apple: await conflictDot(page, calendarDay('lesson')).count(),
      }),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toEqual({ butter: 0, apple: 1 })
})

// All four bookings at once, which is what "every day holding any lesson or expense" says: two
// lessons (one of them Butter's, unreachable from the horse branch) and two expenses. Checking
// them individually would let a barn-wide rule that only reached lessons pass three times.
test('checking_all_dots_every_day_holding_a_lesson_or_expense @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'all')

  await expect
    .poll(
      async () => ({
        lesson: await conflictDot(page, calendarDay('lesson')).count(),
        expense: await conflictDot(page, calendarDay('expense')).count(),
        otherHorse: await conflictDot(page, calendarDay('otherHorse')).count(),
        selfDot: await conflictDot(page, calendarDay('selfDot')).count(),
      }),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toEqual({ lesson: 1, expense: 1, otherHorse: 1, selfDot: 1 })
})

// The popup listing the event is the positive control, and it is a strong one: an event that
// never reached the calendar would produce an undotted day too, and this separates the two —
// the item is there, and it still doesn't dot.
test('a_day_holding_only_a_barn_event_shows_no_dot @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'all')
  await tapDay(page, calendarDay('event'))

  await expect(dayPanelItems(page)).toHaveText([new RegExp(`${CALENDAR_EVENT_TITLE}$`)], {
    timeout: SCHEDULE_FETCH_BUDGET,
  })
  await expect(conflictDot(page, calendarDay('event'))).toHaveCount(0)
})

// The count is the claim: the panel's other branch renders a "Nothing scheduled for this day."
// <p> and no <li> at all, so one item is the difference between a popup that listed the day's
// schedule and one that opened empty.
test('tapping_a_dotted_day_opens_a_popup_listing_that_days_items @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')
  await tapDay(page, calendarDay('expense'))

  await expect(dayPanelItems(page)).toHaveCount(1, { timeout: SCHEDULE_FETCH_BUDGET })
})

// Both halves of the name in one regex, anchored at the end so a line that carried only one of
// them fails. The leading `.*` absorbs the time cell the same <li> opens with.
test('the_day_popup_names_an_expense_by_its_recipient_and_type @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')
  await tapDay(page, calendarDay('expense'))

  await expect(dayPanelItems(page)).toHaveText(
    [new RegExp(`${CALENDAR_EXPENSE_TYPE} — ${CALENDAR_EXPENSE_RECIPIENT}$`)],
    { timeout: SCHEDULE_FETCH_BUDGET }
  )
})

// A lesson carries no server-built label, so this line is composed by the form itself from the
// horse names it holds (`describeScheduleItem`) — the one item in the popup where the *form* is
// what names it. Butter is not on this lesson, so the name is Apple's alone.
test('the_day_popup_names_a_lesson_by_its_horses @manager', async ({ page }) => {
  await openCalendarOnFixtureMonth(page, 'apple')
  await tapDay(page, calendarDay('lesson'))

  await expect(dayPanelItems(page)).toHaveText([new RegExp(`Lesson — ${APPLE}$`)], {
    timeout: SCHEDULE_FETCH_BUDGET,
  })
})

/**
 * The ring class, not `aria-pressed`: React 19 does not reconcile a mismatched attribute, and
 * #1252 measured exactly that on these cells — the grid's `aria-pressed` can keep the server's
 * value through hydration and through later re-renders alike, which is why
 * `checklist-phase5-lessons-new.spec.ts`'s `pickDay` settles on the panel heading instead. The
 * `ring-2` class is on `className`, which React tracks and updates normally.
 *
 * The count beside it is what makes this "selects it" rather than "adds a ring": exactly one cell
 * carries the ring afterwards, so the selection moved off the form's default day rather than
 * accumulating a second one.
 */
test('tapping_a_day_gives_it_the_selection_ring @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
  await tapDay(page, calendarDay('tapSave'))

  await expect
    .poll(async () => ({
      tapped: ((await dayCell(page, calendarDay('tapSave')).getAttribute('class')) ?? '').includes('ring-2'),
      ringed: await page.locator('button.ring-2').count(),
    }))
    .toEqual({ tapped: true, ringed: 1 })
})

/**
 * The stored day, read back off a fresh server render of the saved expense's own edit page —
 * `aria-pressed` is trustworthy there for the reason it isn't in the test above: on a page the
 * form has only just been handed, the server's answer *is* the stored value, and it is the same
 * read `the_edit_form_opens_prefilled_with_the_expenses_stored_values` takes.
 *
 * The tapped day is next month's, so a form that ignored the tap and posted its own default would
 * store the barn's today and fail — the two are never the same day.
 */
test('saving_after_tapping_a_day_stores_the_day_that_was_tapped @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)
  await page.locator('#expense-recipient').fill(TAP_SAVE_RECIPIENT)
  await page.locator('#expense-type').fill(TAP_SAVE_TYPE)
  await horseCheckbox(page, APPLE).check()
  await tapDay(page, calendarDay('tapSave'))
  await submitForm(page, 'Add Expense')

  const card = createdCard(page, TAP_SAVE_RECIPIENT)
  await card.waitFor()
  const href = await card.getAttribute('href')
  if (!href) throw new Error(`no href on the card just created for ${TAP_SAVE_RECIPIENT}`)
  await page.goto(href)

  await expect(page.locator('button[aria-pressed="true"]')).toHaveAttribute('aria-label', calendarDay('tapSave'))
})

/**
 * The absence and its control are the same render: this expense's own day carries no dot while
 * Apple's *other* expense day, two cells away on the same grid, carries one. An `excludeItemId`
 * that excluded everything — or a schedule fetch that had not landed — fails on the second half.
 *
 * No paging and no barrier: the edit page seeds `calendarMonth` from the record's own
 * `expense_date`, so the grid opens on the fixture month already, and Apple is pre-checked from
 * the stored horse.
 */
test('an_expenses_own_day_shows_no_dot_on_its_edit_form @manager', async ({ page }) => {
  await page.goto(expenseHref(selfDot))

  await expect
    .poll(
      async () => ({
        ownDay: await conflictDot(page, calendarDay('selfDot')).count(),
        otherDay: await conflictDot(page, calendarDay('expense')).count(),
      }),
      { timeout: SCHEDULE_FETCH_BUDGET }
    )
    .toEqual({ ownDay: 0, otherDay: 1 })
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
  await hydrateExpenseForm(page)
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
  await hydrateExpenseForm(page)
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
  await hydrateExpenseForm(page)
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

// This one is barriered for the opposite reason to every site above: its unhydrated failure is not
// red at all. The select is submitted through `<form action={formAction}>`, and
// `actions/expenses.ts` reads `formData.get('payment_type')` off the live DOM — so a
// `selectOption` that never reached React still posts, still persists, and the reload assertion
// still passes. Unbarriered this is a check that cannot fail for the reason it names, which is
// #1252's break-the-code-probe-that-PASSED class rather than a flake.
test('a_payment_type_set_on_the_edit_expense_form_persists @manager', async ({ page }) => {
  await page.goto(expenseHref(payEdit))
  await hydrateExpenseForm(page)
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

// ---------------------------------------------------------------------------
// The AM/PM warning under the Time field
// ---------------------------------------------------------------------------

/**
 * "#1646 — set the expense Time to 6:30 AM: an amber line under the field reads
 * `Check AM/PM — this is 6:30 AM, not 6:30 PM.`"
 *
 * The rule — the 8 PM–8 AM window, its four boundary minutes, the 12-hour rendering — is
 * `AmPmWarning.test.tsx`'s, in-process and free. This test exists for the one thing no unit
 * test reaches: that the warning is wired under the *real* `#expense-time` field, which unlike
 * the lesson form's start time is optional and is removed outright on a past date.
 *
 * `hydrateExpenseForm` first for the same reason every `fill` in this file needs it: an
 * unhydrated `fill` writes the DOM value and is then discarded by React's first render (fact
 * 10), which here would show no warning and read as a wiring regression.
 */
test('an_off_hours_expense_time_warns_that_the_am_pm_may_be_inverted @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)

  await page.locator('#expense-time').fill('06:30')

  await expect(page.getByText('Check AM/PM — this is 6:30 AM, not 6:30 PM.')).toBeVisible()
})

/**
 * The empty half of the same checkbox pair: the expense Time is optional, so a form nobody has
 * touched must stay silent rather than warn about a time that isn't set.
 *
 * An absence assertion is only honest on a form already proven hydrated — before that, "no
 * warning" is what an unrendered page looks like too. `hydrateExpenseForm` is what settles it
 * (fact 10), and it drives the calendar rather than the Time field, so the field is still
 * untouched when the read is taken.
 */
test('an_empty_expense_time_shows_no_am_pm_warning @manager', async ({ page }) => {
  await page.goto(newExpensePath())
  await hydrateExpenseForm(page)

  await expect(page.getByText(/Check AM\/PM/)).toHaveCount(0)
})
