// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
//
// The manager's Expenses list: the nav slot it occupies, the five fields an expense card renders,
// the recent/older split and its toggle, a future-dated planned expense with no amount, the
// whole-card tap target, and the absence of a row-level Delete link
// (PRE_RELEASE_TEST_CHECKLIST.md 339-349).
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

// Day offsets against the page's own `now - 7 days` cutoff (OLDER_EXPENSE_CUTOFF_DAYS). -1/-2 and
// +5 are comfortably inside it and -20 comfortably outside, so a run that crosses barn-local
// midnight cannot move any of the four across the boundary.
const PRIMARY_DAY = -1
const BARNWIDE_DAY = -2
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

// Insertion order is deliberately primary -> barnwide -> planned -> older; see RECENT_HREFS below.
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
  })

  // No horseIds — addExpense sets applies_to_all_horses, which is the 'Entire Barn' branch.
  barnwide = await addExpense(supabase, barn, {
    at: daysFromNow(BARNWIDE_DAY, barn.timezone),
    recipient: BARNWIDE_RECIPIENT,
    expenseType: 'Feed',
    amount: 45,
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
 * three recent expenses come back planned (+5), primary (-1), barnwide (-2).
 *
 * That order is deliberately distinct from every fallback the system could produce by accident:
 * insertion order is primary, barnwide, planned (seeded that way on purpose above) and a pure
 * `created_at DESC` is planned, barnwide, primary. All three permutations differ, so neither
 * fallback can satisfy this array (#1196).
 */
function recentHrefs(): string[] {
  return [expenseHref(planned), expenseHref(primary), expenseHref(barnwide)]
}

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/**
 * The desktop nav's own link container, picked out of <nav>'s direct children by the Lessons link
 * it holds. Addressed this way rather than by class because <nav> also holds BarnSwitcher's
 * barn-name link, which would otherwise land in the label list; NavDrawer renders its copies of
 * these links only while the drawer is open, and the drawer is closed here.
 */
function desktopNavLinks(page: Page) {
  return page
    .locator('nav > div')
    .filter({ has: page.getByRole('link', { name: NAV_LESSONS, exact: true }) })
    .getByRole('link')
}

/**
 * One expense's card, addressed by the href it links to.
 *
 * ExpenseCard renders Card's `href` form, so the card *is* this anchor and its four <p> children
 * are the date/time, recipient-and-type, horses and amount lines in that order.
 *
 * expenseHref is deliberately shared with the tests that assert something *present* — the rendered
 * href list (both split tests) and the tap-through, which clicks this anchor and navigates. A
 * locator that silently resolved to nothing would make the five card-field assertions vacuous
 * rather than failing; it makes those three fail outright, so they are this locator's positive
 * control. A plain mutation cannot tell those two cases apart, which is why the control is
 * structural.
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
 * <main> and would otherwise read as a fourth card.
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

// The locator is the card anchor itself, which is the "full-card link" half of the claim; its first
// line is the date/time half. toHaveText with a string is full-string equality, so a card rendering
// the date without the time, or with a different time, fails rather than matching a prefix.
test('an_expense_card_is_a_full_card_link_showing_its_date_and_time @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  await expect(page.locator(cardLine(primary, DATE_LINE))).toHaveText(
    `${mediumDate(primary.expense_date)} · ${PRIMARY_TIME_RENDERED}`
  )
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
// The recent / older split
// ---------------------------------------------------------------------------

// The split is asserted as the exact set of cards the page renders unprompted: the three recent
// ones and not the -20-day one. Membership is the claim; the order is the DAL's and is pinned only
// because leaving it unpinned would mean sorting both sides, which hides exactly the kind of
// mis-grouping this checkbox is about.
test('the_list_splits_recent_expenses_from_older_ones @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)

  expect(await renderedHrefs(page)).toEqual(recentHrefs())
})

// The pre-click state cannot satisfy this — the older card is absent until the toggle runs — so
// there is no version of the page that passes without the reveal actually happening. Asserting the
// recent three as well pins that revealing the older group doesn't replace the list.
test('show_older_expenses_toggle_reveals_the_older_group @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/expenses`)
  await page.getByRole('button', { name: 'Show older expenses' }).click()

  expect(await renderedHrefs(page)).toEqual([...recentHrefs(), expenseHref(older)])
})

// ---------------------------------------------------------------------------
// The planned expense
// ---------------------------------------------------------------------------

// Two lines of the one card in a single array assertion: its date (the day seeded five days out) and
// its amount line reading the no-amount branch. Together those are the checkbox's three claims —
// it is in the list, it is future-dated, and it has no amount — and neither line alone carries all
// three. The array form pins the count, so a card that rendered only one of the two fails.
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
// waitForURL pins *which* expense's page this landed on; the heading is the proof it rendered.
// A URL read alone can't do that job — expect(page).toHaveURL passes on its first poll, and
// 'commit' resolves before the document renders, so a notFound() or a 500 at that URL would
// satisfy the wait identically (#1202). 'Edit Expense' appears on the destination and nowhere on
// the list page, whose own h1 is 'Expenses'; exact:true because getByRole's name match is
// substring-based.
test('tapping_an_expense_card_away_from_its_text_opens_its_edit_page @manager', async ({ page }) => {
  // The edit route compiles on demand under a shared dev server. test.slow() raises the budget
  // rather than an explicit timeout on the wait, which would only tighten it (#1211).
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
// looked for the absence. Requiring the three recent cards alongside it makes the empty page fail.
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
