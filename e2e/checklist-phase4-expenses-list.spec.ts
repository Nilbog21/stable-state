// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
//
// The manager's Expenses list: the nav slot it occupies, the five fields an expense card renders,
// the recent/older split and its toggle, a future-dated planned expense with no amount, the Past
// Due badge on an outstanding one, the whole-card tap target, and the absence of a row-level Delete
// link (checklists/pre-release/phase-4-manager-verification.md, the block from "Nav shows
// **Expenses** between Lessons and Horses" through "There is no separate row-level Delete link on
// the list").
//
// Every test does its own goto and mutates nothing the next one reads — the one click that changes
// state (the older-expenses toggle) is component state, discarded by the next navigation. So this
// file is a set of independent reads of one seeded barn rather than a chain: no test.describe.serial,
// and no test can be running against state a previous one left.
import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, daysFromNow, type SeededAppointment } from './support/fixtures'
import { settledInnerTexts } from './support/read'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const BUTTER = 'Butter'

// The primary card's recipient and type are adversarial on purpose: 'Vet' is a substring of
// 'Bramble Vet Clinic', so a containment matcher for the expense type would pass on the recipient
// alone (#1202's substring hazard). The two assertions below anchor to opposite ends of the line
// instead, which is what tells them apart.
const PRIMARY_RECIPIENT = 'Bramble Vet Clinic'
const PRIMARY_TYPE = 'Vet'
const PRIMARY_TIME = '14:30'
/** Written beside the seed above rather than derived from formatExpenseTime (the code under test). */
const PRIMARY_TIME_RENDERED = '2:30 PM'
/** Likewise: 120 as the page must render it. Full-string equality below, so '$1200.00' can't pass. */
const PRIMARY_AMOUNT = 120
const PRIMARY_AMOUNT_RENDERED = '$120.00'
/**
 * Both horse names, in either order, and nothing else.
 *
 * Order-agnostic because the app does not define one: attachHorseNames (`expenses.ts`) selects
 * `appointment_horses` with no ORDER BY, so the join's row order is Postgres's choice — it
 * rendered 'Butter, Apple' here for a `[apple, butter]` seed. Pinning the observed order would be
 * pinning an accident and would flake the day the plan changes; pinning the seeded order would
 * assert a guarantee that doesn't exist. Anchored at both ends, so this is still full-string
 * equality — a card showing one name, or three, fails.
 */
const PRIMARY_HORSES_RENDERED = new RegExp(`^(${APPLE}, ${BUTTER}|${BUTTER}, ${APPLE})$`)

const BARNWIDE_RECIPIENT = 'Sweetfeed Supply'
const BARNWIDE_HORSES_RENDERED = 'Entire Barn'

const PLANNED_RECIPIENT = 'Ironclad Farrier Co'
const PLANNED_TIME = '09:00'
const PLANNED_TIME_RENDERED = '9:00 AM'
/** ExpenseCard's amount branch for a null amount. */
const NO_AMOUNT_RENDERED = '(no amount specified)'

const OLDER_RECIPIENT = 'Old Hay Barn Ltd'

/**
 * Past-dated, priced, and never attributed to a payment method — the state `getOutstandingExpenses`
 * calls outstanding and the card's badge now agrees with (#1481). The only fixture here seeded
 * *without* a payment type that also carries an amount.
 */
const UNPAID_RECIPIENT = 'Longmeadow Equine Dental'
const UNPAID_AMOUNT = 75
/**
 * That card's whole amount line: the figure, then the badge ExpenseCard renders into the same <p>.
 *
 * Anchored at both ends, so this is still full-string equality — the regex form is only here
 * because the two are separate <span>s and textContent's treatment of the gap between them is not
 * worth pinning. Written out rather than built from the seed for the reason PRIMARY_AMOUNT_RENDERED
 * gives: '$75.00' must not be satisfiable by '$750.00'.
 */
const UNPAID_AMOUNT_LINE_RENDERED = /^\$75\.00\s*Past Due$/

/**
 * Every other amounted fixture is seeded paid, which is what keeps the full-string amount-line
 * assertions below pinning the badge's *absence* rather than quietly tolerating it. Fixed at seed
 * time rather than left to `addExpense`'s default, so the choice is visible where it is made.
 */
const SEEDED_PAYMENT_TYPE = 'check' as const

// Day offsets against the page's own `now - 7 days` cutoff (OLDER_EXPENSE_CUTOFF_DAYS). -1/-2/-3
// and +5 are comfortably inside it and -20 comfortably outside, so a run that crosses barn-local
// midnight cannot move any of the five across the boundary.
const PRIMARY_DAY = -1
const BARNWIDE_DAY = -2
const UNPAID_DAY = -3
const PLANNED_DAY = 5
const OLDER_DAY = -20

// The manager nav, as three adjacent labels. The checkbox claims Expenses sits *between* Lessons
// and Horses, which is a claim about adjacency — so the assertion slices these three out of the
// rendered label list rather than pinning all nine, which would couple this checkbox to six labels
// it says nothing about.
const NAV_LESSONS = 'Lessons'
const NAV_EXPENSES = 'Expenses'
const NAV_HORSES = 'Horses'

// The edit page's own heading. Not present on the list page (whose h1 is 'Expenses'), which is what
// makes it a render proof rather than a restatement of the URL — see the navigation test below.
const EDIT_PAGE_HEADING = 'Edit Expense'

let primary: SeededAppointment
let barnwide: SeededAppointment
let planned: SeededAppointment
let older: SeededAppointment
let unpaid: SeededAppointment

// Insertion order is deliberately primary -> barnwide -> planned -> older -> unpaid; see
// recentHrefs below.
const barn = withBarn('phase4-expenses-list', async ({ supabase, barn }) => {
  const apple = await addHorse(supabase, barn.id, APPLE)
  const butter = await addHorse(supabase, barn.id, BUTTER)

  primary = await addExpense(supabase, barn, {
    at: daysFromNow(PRIMARY_DAY, barn.timezone),
    time: PRIMARY_TIME,
    recipient: PRIMARY_RECIPIENT,
    expenseType: PRIMARY_TYPE,
    horseIds: [apple.id, butter.id],
    amount: PRIMARY_AMOUNT,
    paymentType: SEEDED_PAYMENT_TYPE,
  })

  // No horseIds — addExpense sets applies_to_all_horses, which is the 'Entire Barn' branch.
  barnwide = await addExpense(supabase, barn, {
    at: daysFromNow(BARNWIDE_DAY, barn.timezone),
    recipient: BARNWIDE_RECIPIENT,
    expenseType: 'Feed',
    amount: 45,
    paymentType: SEEDED_PAYMENT_TYPE,
  })

  // Future-dated, no amount: a planned expense. Not past due (its due instant is still ahead), so
  // the card carries no Past Due badge and its amount line is exactly NO_AMOUNT_RENDERED.
  planned = await addExpense(supabase, barn, {
    at: daysFromNow(PLANNED_DAY, barn.timezone),
    time: PLANNED_TIME,
    recipient: PLANNED_RECIPIENT,
    expenseType: 'Farrier',
    horseIds: [apple.id],
  })

  older = await addExpense(supabase, barn, {
    at: daysFromNow(OLDER_DAY, barn.timezone),
    recipient: OLDER_RECIPIENT,
    expenseType: 'Hay',
    horseIds: [butter.id],
    amount: 300,
    paymentType: SEEDED_PAYMENT_TYPE,
  })

  // No paymentType, and that is the fixture: past-dated with an amount but nothing to attribute
  // it to. Seeded last so its created_at ordering is distinct from the rendered one — see
  // recentHrefs.
  unpaid = await addExpense(supabase, barn, {
    at: daysFromNow(UNPAID_DAY, barn.timezone),
    recipient: UNPAID_RECIPIENT,
    expenseType: 'Dental',
    horseIds: [apple.id],
    amount: UNPAID_AMOUNT,
  })
})

// ---------------------------------------------------------------------------
// Expected values
// ---------------------------------------------------------------------------

/**
 * 'YYYY-MM-DD' as the card renders it, e.g. '2026-08-02' -> 'Aug 2, 2026'.
 *
 * A local month table rather than a call to formatExpenseDate, and not Intl either: an expected
 * value computed by the same formatter the page uses agrees with any bug in that formatter. This
 * is an independent reimplementation whose month names are literals.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function mediumDate(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number)
  return `${MONTHS[month - 1]} ${day}, ${year}`
}

function expenseHref(expense: SeededAppointment): string {
  return `/barn/${barn.slug}/expenses/${expense.id}`
}

/**
 * The list's rendered order is getExpensesByBarn's `expense_date DESC, created_at DESC`, so the
 * four recent expenses come back planned (+5), primary (-1), barnwide (-2), unpaid (-3).
 *
 * That order is deliberately distinct from every fallback the system could produce by accident:
 * insertion order is primary, barnwide, planned, unpaid (seeded that way on purpose above) and a
 * pure `created_at DESC` is unpaid, planned, barnwide, primary. All three permutations differ, so
 * neither fallback can satisfy this array (#1196).
 */
function recentHrefs(): string[] {
  return [expenseHref(planned), expenseHref(primary), expenseHref(barnwide), expenseHref(unpaid)]
}

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/**
 * The desktop nav's own link container, picked out of <nav>'s direct children by the Finances link
 * it holds. Addressed this way rather than by class because <nav> also holds BarnSwitcher's
 * barn-name link, which would otherwise land in the label list; NavDrawer and UserMenu render
 * their own links only while open, and both are closed here.
 *
 * Finances rather than Lessons deliberately: filtering on one of the three labels the test then
 * asserts would make that label true by construction, leaving only two of the three doing work.
 * Finances appears in no other nav component, so it disambiguates the container without
 * overlapping the claim.
 */
function desktopNavLinks(page: Page) {
  return page
    .locator('nav > div')
    .filter({ has: page.getByRole('link', { name: 'Finances', exact: true }) })
    .getByRole('link')
}

/** The control that reveals the older group. Absent entirely when there is no older group. */
function olderToggle(page: Page) {
  return page.getByRole('button', { name: 'Show older expenses', exact: true })
}

/**
 * Keyboard activation rather than a pointer .click(), matching the sibling treatment of the
 * identical "Show older lessons" control (`checklist-phase4-lessons-list.spec.ts`, which cites
 * 04c64505 / #501): the toggle sits at the bottom of a scrollable list, where Chromium's
 * scroll-into-view animation races Playwright's actionability check and a card can intercept the
 * click mid-scroll. Unlike the tap-target test below, nothing here is a claim *about* pointer
 * behaviour, so there is no reason to take that risk.
 */
async function revealOlderExpenses(page: Page) {
  const toggle = olderToggle(page)
  await toggle.focus()
  await toggle.press('Enter')
}

/**
 * One expense's card, addressed by the href it links to.
 *
 * ExpenseCard renders Card's `href` form, so the card *is* this anchor and its four <p> children
 * are the date/time, recipient-and-type, horses and amount lines in that order.
 *
 * expenseHref is deliberately shared with the tests that assert something *present* — the rendered
 * href list (both split tests) and the tap-through, which clicks this anchor and navigates. Those
 * three read real DOM hrefs through `cardLinks`, a selector built from the barn slug rather than
 * from expenseHref, so a wrong expenseHref mismatches and fails there. That is this locator's
 * positive control.
 *
 * To be precise about what the control is *for*, since an earlier version of this comment
 * overclaimed: the card-field assertions below are not themselves at risk of passing vacuously —
 * toHaveText polls and fails on an empty match. The vacuity-prone shapes in this file are the
 * one-shot reads (evaluateAll -> [], count() -> 0), and each of those pairs its zero with a
 * non-zero in the same comparison. What the control buys is confidence that the shared *value* is
 * right, which no amount of mutating an expectation can establish.
 */
function card(page: Page, expense: SeededAppointment) {
  return page.locator(`a[href="${expenseHref(expense)}"]`)
}

/** Nth line of a card, 1-based, matching ExpenseCard's four <p> children. */
function cardLine(expense: SeededAppointment, line: number): string {
  return `a[href="${expenseHref(expense)}"] > p:nth-child(${line})`
}

const DATE_LINE = 1
const RECIPIENT_AND_TYPE_LINE = 2
const HORSES_LINE = 3
const AMOUNT_LINE = 4

/**
 * Every expense card on the page, in DOM order.
 *
 * The `:not` drops the "Add Expense" button, which is a Link to `/expenses/new` inside the same
 * <main> and would otherwise read as an extra card.
 */
function cardLinks(page: Page) {
  return page.locator(`main a[href^="/barn/${barn.slug}/expenses/"]:not([href$="/new"])`)
}

async function renderedHrefs(page: Page): Promise<(string | null)[]> {
  const links = cardLinks(page)
  // evaluateAll is one-shot and yields [] against an unsettled page, which several of the
  // comparisons below would pass on. The waitFor is what makes an empty list a failure.
  await links.first().waitFor()
  return links.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
}

// ---------------------------------------------------------------------------
// Nav
// ---------------------------------------------------------------------------

// Sliced from Lessons rather than pinned as all nine labels: the claim is adjacency, and a filtered
// three-element locator would prove relative order without it. Anchoring the slice on Lessons is
// also what makes a missing Lessons link fail — indexOf returns -1, and slice(-1, 2) over a
// nine-element array is empty, so the assertion cannot silently re-anchor at the front of the nav.
test('nav_shows_expenses_between_lessons_and_horses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)
  const labels = await settledInnerTexts(desktopNavLinks(page))
  const lessons = labels.indexOf(NAV_LESSONS)

  expect(labels.slice(lessons, lessons + 3)).toEqual([NAV_LESSONS, NAV_EXPENSES, NAV_HORSES])
})

// ---------------------------------------------------------------------------
// The card's five fields
// ---------------------------------------------------------------------------

// Both halves of the claim, in one array assertion over the anchor's *direct* <p> children.
//
// The count is the "full-card link" half, and it is the half that needs saying: matching an anchor
// by href proves nothing about what that anchor contains, so asserting only the date line would be
// satisfied by markup in which the link wraps the date and the other three lines sit outside it —
// exactly the regression this checkbox exists to forbid. Requiring all four of the card's lines to
// be inside the anchor is that regression's DOM-level negation.
//
// The first element is the date/time half, pinned exactly (toHaveText with a string is full-string
// equality, so a card rendering the date without the time fails rather than matching a prefix).
// The other three are /./ — non-empty, nothing more — because their *values* belong to the three
// checkboxes below and coupling them here would make an unrelated change fail this line instead.
test('an_expense_card_is_a_full_card_link_showing_its_date_and_time @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(card(page, primary).locator('> p')).toHaveText([
    `${mediumDate(primary.expense_date)} · ${PRIMARY_TIME_RENDERED}`,
    /./,
    /./,
    /./,
  ])
})

// Anchored at the start of the line, so this asserts the recipient is what the line *leads* with
// rather than that the text appears somewhere in it.
test('an_expense_card_shows_its_recipient @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(page.locator(cardLine(primary, RECIPIENT_AND_TYPE_LINE))).toHaveText(
    new RegExp(`^${PRIMARY_RECIPIENT} · `)
  )
})

// Anchored at the end for the mirror reason, and here the anchor is load-bearing rather than
// tidy: 'Vet' also occurs inside 'Bramble Vet Clinic' on this very line, so an unanchored match
// would pass on a card that rendered no expense type at all.
test('an_expense_card_shows_its_expense_type @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(page.locator(cardLine(primary, RECIPIENT_AND_TYPE_LINE))).toHaveText(
    new RegExp(` · ${PRIMARY_TYPE}$`)
  )
})

// One assertion over both cards, because the checkbox's "or" is a claim about the two variants as a
// pair: named horses when the expense has them, 'Entire Barn' when it applies to all of them. The
// array form pins the count at two, so a card that stopped rendering its horse line fails rather
// than leaving the other half to carry the claim. CSS union resolves in DOM order, which is
// primary (-1) before barnwide (-2).
test('an_expense_card_shows_its_horses_or_entire_barn @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(
    page.locator(`${cardLine(primary, HORSES_LINE)}, ${cardLine(barnwide, HORSES_LINE)}`)
  ).toHaveText([PRIMARY_HORSES_RENDERED, BARNWIDE_HORSES_RENDERED])
})

// Full-string, not containment: '$120.00' is a prefix of '$1200.00', and the amount line holds only
// the amount for an expense that isn't past due, so there is nothing else here to blur the boundary.
test('an_expense_card_shows_its_amount @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(page.locator(cardLine(primary, AMOUNT_LINE))).toHaveText(PRIMARY_AMOUNT_RENDERED)
})

// ---------------------------------------------------------------------------
// The Past Due badge
// ---------------------------------------------------------------------------

// Two cards in one assertion, because the claim is the *boundary* rather than the badge: `unpaid`
// and `primary` are both past-dated and both amounted, and differ only in the payment type. Before
// #1481 the card keyed the badge off the amount alone, so both read as not-past-due; the seeded
// `primary` right beside it is what stops a fix that badges every past-dated card from passing.
//
// Full-string equality on both lines rather than a badge-presence count: the badge renders *into*
// the amount <p>, so equality pins its presence on the one card and its absence on the other in
// the same read — and pins that the amount survives beside it, which a `getByText('Past Due')`
// would not. CSS union resolves in DOM order, which is primary (-1) before unpaid (-3).
test('a_past_dated_amounted_expense_with_no_payment_type_shows_past_due @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(
    page.locator(`${cardLine(primary, AMOUNT_LINE)}, ${cardLine(unpaid, AMOUNT_LINE)}`)
  ).toHaveText([PRIMARY_AMOUNT_RENDERED, UNPAID_AMOUNT_LINE_RENDERED])
})

// ---------------------------------------------------------------------------
// The recent / older split
// ---------------------------------------------------------------------------

// A *split* is two groups, so both halves are asserted together: the recent group is exactly these
// four cards, and an older group exists.
//
// The second half is not decoration. The href list alone — four recent, no older — is satisfied
// identically by a page that *discarded* expenses older than the cutoff rather than grouping them,
// since OlderExpensesToggle returns null on an empty list and nothing else marks a boundary. That
// is the cheapest way to break this checkbox, and the toggle's presence is what rules it out.
test('the_list_splits_recent_expenses_from_older_ones @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect
    .poll(async () => ({ rendered: await renderedHrefs(page), olderGroups: await olderToggle(page).count() }))
    .toEqual({ rendered: recentHrefs(), olderGroups: 1 })
})

// The pre-click state cannot satisfy this — the older card is absent until the toggle runs — so
// there is no version of the page that passes without the reveal actually happening. Asserting the
// recent three as well pins that revealing the older group doesn't replace the list.
//
// expect.poll rather than a bare read: renderedHrefs' own waitFor is satisfied by the first
// *recent* card, which is server-rendered and already present before the click, so it does not wait
// for the client re-render that mounts the older one. A one-shot read there would race React and
// flake. Same treatment, same reason, as the sibling lessons list's ten polled reads.
test('show_older_expenses_toggle_reveals_the_older_group @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)
  await revealOlderExpenses(page)

  await expect.poll(() => renderedHrefs(page)).toEqual([...recentHrefs(), expenseHref(older)])
})

// ---------------------------------------------------------------------------
// The planned expense
// ---------------------------------------------------------------------------

// Two lines of the one card in a single array assertion: its date line and its amount line reading
// the no-amount branch. The array form pins the count, so a card that rendered only one of the two
// fails.
//
// What this does and does not pin, stated precisely. "Appears in the list" and "no amount" are
// asserted directly. "Future-dated" is *not*: the expected date is read back off the seeded row, so
// it moves with the actual and would agree with a fixture that placed the expense in the past. What
// the second element does pin is the observable consequence of being future-dated — full-string
// equality on the amount <p> also rejects the `Past Due` badge, which ExpenseCard renders into that
// same <p> for any outstanding expense whose due moment has passed, and an unamounted one is
// outstanding by definition. That is a proxy, not the claim, and the claim's remaining half is a
// property of the seed rather than of the app.
test('a_future_dated_planned_expense_with_no_amount_appears_in_the_list @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(
    page.locator(`${cardLine(planned, DATE_LINE)}, ${cardLine(planned, AMOUNT_LINE)}`)
  ).toHaveText([`${mediumDate(planned.expense_date)} · ${PLANNED_TIME_RENDERED}`, NO_AMOUNT_RENDERED])
})

// ---------------------------------------------------------------------------
// The tap target
// ---------------------------------------------------------------------------

// The tap lands at (8, 8) inside the card — within Card's p-4 padding, so off every text node in it.
// That is the checkbox's actual claim: not that the date line is a link, but that the whole card is
// one. Deliberately a real pointer click rather than the suite's focus() + press('Enter') idiom
// (#501, 04c64505): that idiom exists to dodge scroll-into-view flake on submit buttons, and here
// the pointer interaction *is* the subject of the test, so activating by keyboard would assert
// something else entirely.
//
// waitForURL pins *which* expense's page this landed on; the heading is the proof it rendered, and
// carries the whole weight of the test — clicking an anchor and then observing that the URL became
// that anchor's own href is browser behaviour, not app behaviour. A URL read alone can't do the
// job: expect(page).toHaveURL passes on its first poll, and 'commit' resolves before the document
// renders, so a notFound() or a 500 at that URL would satisfy the wait identically (#1202).
// 'Edit Expense' appears on the destination and nowhere on the list page, whose own h1 is
// 'Expenses' — verified by running this assertion against the list page, where it finds nothing.
// exact:true because getByRole's name match is substring-based.
//
// Stated limit: the click position is relative to the *anchor's* box, so this proves the tap works
// away from the text but cannot observe the anchor being smaller than the card's visual box. That
// geometry judgment is what @visual is deferred for everywhere in this batch, and a boundingBox
// comparison would buy it at the cost of a one-shot layout read that resolves from parents even
// when the target is absent. The DOM-level half of the claim — the card's whole content sitting
// inside the anchor — is pinned by the four-line count in the date/time test above.
test('tapping_an_expense_card_away_from_its_text_opens_its_edit_page @manager', async ({ page }) => {
  // Raises the budget bounding waitForURL, which is where the edit route's on-demand compile is
  // actually paid: an App Router <Link> commits its pushState only once the RSC payload lands, so
  // the compile finishes inside that unbounded wait rather than inside the heading assertion's
  // expect window. test.slow() rather than an explicit timeout on the wait, which would only
  // tighten it (#1211).
  test.slow()
  await page.goto(`/barn/${barn.slug}/expenses`)
  await card(page, primary).click({ position: { x: 8, y: 8 } })
  await page.waitForURL(`**${expenseHref(primary)}`, { waitUntil: 'commit' })

  await expect(page.getByRole('heading', { name: EDIT_PAGE_HEADING, exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// What the list does not have
// ---------------------------------------------------------------------------

// An absence claim, so the zero is paired with a non-zero in one comparison: a page that rendered
// nothing at all would report zero delete controls too, and would pass an assertion that only
// looked for the absence. Requiring the four recent cards alongside it makes the empty page fail.
//
// Both roles are counted because the distinction the checkbox draws is about the control existing
// per row, not about which element it is: Delete on the *edit* page is a Button-as-Link, and the
// same control moved onto a list row would be one too.
test('the_expenses_list_has_no_row_level_delete_link @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)
  const main = page.locator('main')
  const deleteControls = main
    .getByRole('link', { name: /delete/i })
    .or(main.getByRole('button', { name: /delete/i }))

  // count() is one-shot; the waitFor is what stops an unsettled page reporting 0 cards and 0
  // delete controls, which is the shape that would make this read as a pass.
  await cardLinks(page).first().waitFor()

  expect({ cards: await cardLinks(page).count(), deleteControls: await deleteControls.count() }).toEqual({
    cards: recentHrefs().length,
    deleteControls: 0,
  })
})
