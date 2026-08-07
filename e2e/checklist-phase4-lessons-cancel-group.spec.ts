// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/lesson-cancellation.ts
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import {
  addHorse,
  addManagedMember,
  addTier,
  addUnpaidLesson,
  cancelLesson,
  cancelLessonRider,
} from './support/fixtures'
import { settledTextContents } from './support/read'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const STANDARD_TIER = 'Standard'

// The tier's own price, deliberately not any lesson's fee below: a fee that happened to equal
// the tier default could have been produced by a lesson nothing ever touched.
const TIER_PRICE = 80

/**
 * The three riders every group lesson here enrols.
 *
 * They are inline managed stubs rather than `members.rider`/`members.rider2`: every group lesson
 * here enrols three riders and the shared fixtures plant two. The three names are mutually
 * non-substring and share no prefix with 'Test Manager'/'Test Trainer'/'Test Rider'/'Test Sutton',
 * deliberately — every locator below that reaches a rider's row by name uses
 * `filter({ hasText })` or `getByRole(..., { name })`, both of which are substring matchers by
 * default, so an overlapping pair would let one name select the other's row (#1202).
 *
 * `addManagedMember` leaves `user_id` null, which is what keeps `teardownBarn`'s profile sweep
 * able to see them (#1282 moved that filter off `is_managed`, which any caller can flip, onto
 * `user_id IS NULL`, which none can) — the leak class the batch has now hit three times.
 */
const RIDERS = ['Ivy Bramble', 'Juno Clover', 'Kai Thistle'] as const

/**
 * One distinct three-digit fee per lesson, none of them 0 and none of them TIER_PRICE.
 *
 * The design-time form of the break-the-code check (#1196/#1240), applied to a computed money
 * value. Two of the fee outcomes asserted here are `$0`, which is exactly the shape that can be
 * accidentally correct: a test that read the wrong lesson, or a Confirm that silently no-opped,
 * would still find a zero if zero were reachable any other way. With every seeded fee distinct
 * and non-zero, `$0` can only mean "this lesson's fee was zeroed", and each retained-fee
 * assertion can only mean "this lesson's fee survived".
 */
const FEES = {
  toggle: 301,
  picker: 302,
  wholeCancel: 303,
  wholeFee: 304,
  riderBadge: 305,
  restUnaffected: 306,
  feePolicyFar: 307,
  feePolicyNear: 308,
  nearLabel: 309,
  farLabel: 310,
  listNoBadge: 311,
  listBadge: 312,
  detailBadge: 313,
  cancelledSibling: 314,
  wholePending: 315,
} as const

type LessonKey = keyof typeof FEES

/** Typed into the whole-lesson confirmation page, read back off every rider's row. */
const WHOLE_LESSON_NOTE = 'Arena flooded, the whole group is off.'

// The app's own strings, quoted rather than imported: an expected value derived from the code
// under test agrees with any bug in it.
const GROUP_FEE_WARNING =
  'Warning: No late cancellation fees are currently leveraged for group lessons.'
const CANCELLED_BADGE = 'Cancelled'
const GROUP_BADGE = 'Group'

// Filled in by the seed.
const lessonIds: Record<LessonKey, string> = {} as Record<LessonKey, string>

/**
 * Placement across the 24-hour cancellation boundary is by **explicit instant**, never a day
 * offset: `daysFromNow(1, tz)` lands at barn-local noon, which is more than 24 hours away in the
 * morning and less than 24 hours away in the evening, so a day offset cannot express "just
 * inside" or "just outside" the window at all.
 *
 * `new Date(ms)` is zone-free arithmetic on an instant — the eslint date fence bans the host's
 * calendar getters and the multi-argument constructor, neither of which appears here (and the
 * fence covers `src/**` only in any case).
 */
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

/**
 * Both values must stay strictly inside their half of the boundary, and NEAR's lower bound is
 * the one that is easy to lose, because breaking it fails **silently**.
 *
 * `isWithinLateCancellationWindow` is `lesson_at - now <= 24h`, so it is also true of a lesson
 * already in the *past* — which makes "move NEAR back to be safely inside the window" look like a
 * free simplification. It is not. `isLessonCancellationEligible` gates the cancel page on
 * `lesson_at > now` **or** `payment_type === null`, and every lesson here comes from
 * `addUnpaidLesson`, so a past NEAR would keep the page reachable through the unpaid escape hatch
 * while no longer testing "booked <24h away" at all. Every assertion would go on passing.
 *
 * So NEAR is `+3h`: future (eligibility satisfied by the *upcoming* branch, not the unpaid one)
 * and inside the window, with ~3h of margin below and ~21h above. FAR is `+72h`, 48h clear of the
 * boundary, so neither can drift across it however long a run takes.
 */
const NEAR = () => hoursFromNow(3) // inside the 24h window
const FAR = () => hoursFromNow(72) // outside it

/**
 * Fourteen group lessons, one page state each. Every test that needs a *cancelled* lesson, or a
 * cancelled rider, produces it on a lesson of its own through the UI rather than sharing one
 * with its neighbours.
 *
 * Cancelling is one-way — `/lessons/[id]/cancel` calls notFound() once `cancelled_at` is set —
 * so a shared lesson would force a `describe.serial` chain, and that is precisely where this
 * batch's two nastiest mutation blind spots bite: serial skips every test after the first
 * failure, and a failing test restarts the Playwright worker, which re-runs `beforeAll` and
 * re-seeds the barn. Designing the chain out of existence costs thirteen extra seed rows and
 * removes both.
 *
 * **Who instructs which lesson is chosen per test, and the rule is not "always the trainer".**
 * `CancelLessonPage` computes `cancelledByInstructorDefault = isInstructorOfLesson(membership.id,
 * lesson)`, so on a lesson the manager does *not* instruct, the Type toggle already defaults to
 * **Cancelled by Rider** — meaning `CancelLessonFields` renders the picker, and suppresses or
 * shows the amber label, **during the server render**. Which default a test wants depends on
 * whether its checklist line is about an *absence* or about a *reveal*, and the two want opposite
 * things:
 *
 * - **Absence claims are seeded so the state under test is the SSR default** (`farLabel`, and
 *   `nearLabel` as its positive control). #1191 found the failure this avoids: an unhydrated
 *   `.check()` sets the DOM but never reaches React, so the label is absent and the count reads
 *   the same `0` a correct pass produces. Those `.check()` calls are no-ops confirming an
 *   already-selected state, kept because the lines say "select Cancelled by Rider".
 *
 * - **Reveal claims are seeded so the state under test is NOT the default**, so the `.check()` is
 *   a real transition and the test actually observes the thing its line names. `toggle`
 *   (the "shows the count of enrolled riders who'll be affected" line, whose claim is about
 *   *choosing* rather than confirming) is therefore **trainer**-instructed, and `picker` (the
 *   "reveals a rider picker listing the still-active enrolled riders" line, likewise about the
 *   *reveal*) is **manager**-instructed. #1191's hazard does not reach these: it is specific
 *   to absence assertions, where the unhydrated reading and the correct reading coincide. Here an
 *   unhydrated click leaves the *other* state on screen — the rider sentence instead of the count
 *   sentence, an empty picker instead of two labels — which every one of these assertions fails
 *   loudly on. Seeding these as SSR defaults too would mean no test in this file ever exercises
 *   `setCancelType` in the rider direction, while three checklist lines whose verb *is* that
 *   interaction read as covered.
 */
const barn = withBarn('phase4-lessons-cancel-group', async ({ supabase, barn, members }) => {
  // `instructorCut: 0` overrides `addTier`'s default of 25, and only the Pending income check
  // below cares: that figure is *net* of the per-lesson instructor cut
  // (`splitNetFee`, `lesson-finances.ts`), so a non-zero cut would make the drop it asserts
  // `fee - cut` — a number derived from a fixture default rather than from anything this file
  // states. At zero the drop is the seeded fee itself, which is the distinct three-digit value
  // FEES already guarantees. No other assertion here reads a payout.
  const tier = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true, instructorCut: 0 })
  const apple = await addHorse(supabase, barn.id, APPLE)

  const riderIds: string[] = []
  for (const name of RIDERS) {
    const [firstName, lastName] = name.split(' ')
    const member = await addManagedMember(supabase, barn.id, { firstName, lastName, role: 'rider' })
    riderIds.push(member.membershipId)
  }

  const seed = async (key: LessonKey, at: Date, instructorId: string) => {
    const lesson = await addUnpaidLesson(supabase, barn, {
      at,
      tierName: tier.name,
      lessonType: 'group',
      horseIds: [apple.id],
      riderIds,
      instructorId,
      fee: FEES[key],
    })
    lessonIds[key] = lesson.id
  }

  const manager = members.manager.membershipId
  const trainer = members.trainer.membershipId

  // Read-only page states. `toggle` and `picker` are instructed by whoever makes the state each
  // one's line is about the *reveal* of the non-default (see the docstring above).
  await seed('toggle', FAR(), trainer)
  await seed('picker', FAR(), manager)
  await seed('nearLabel', NEAR(), trainer)
  await seed('farLabel', FAR(), trainer)

  // Whole-lesson cancellation. Both are <24h out, so `$0` cannot be explained by anything the
  // rider-side 24-hour rule does — only by the group branch's unconditional waiver.
  await seed('wholeCancel', NEAR(), manager)
  await seed('wholeFee', NEAR(), manager)

  // Its own lesson because cancelling is one-way, and NEAR rather than FAR because Pending
  // income is a *this-month* figure (`isCurrentMonth`, finances/page.tsx) counting uncollected
  // transactions whose occurred_at is still ahead of now — +3h satisfies both.
  await seed('wholePending', NEAR(), manager)

  // Per-rider cancellation. `restUnaffected` is >24h out **on purpose**, and that is the side
  // of the boundary #1278 broke: cancel_rider_participation used to zero the *whole lesson's*
  // fee on any non-late cancellation, group or not, so "the rest of the lesson is unaffected"
  // was false of the fee on exactly this lesson. It was seeded NEAR to dodge that; putting it
  // back on the far side is what makes the check guard the fix rather than route around it.
  await seed('riderBadge', NEAR(), trainer)
  await seed('restUnaffected', FAR(), trainer)
  await seed('feePolicyFar', FAR(), trainer)
  await seed('feePolicyNear', NEAR(), trainer)

  // The Cancelled-badge progression.
  await seed('listNoBadge', NEAR(), trainer)
  await seed('listBadge', NEAR(), trainer)
  await seed('detailBadge', NEAR(), trainer)

  // A lesson that is already cancelled at seed time, never touched by any test. It is the
  // positive control for the "no badge yet" check, and it is seeded rather than borrowed from a
  // sibling test so that check depends on nothing having run before it. `isLate: true` keeps its
  // fee, so it stays distinct from every other seeded lesson in the barn.
  await seed('cancelledSibling', NEAR(), manager)
  await cancelLesson(supabase, barn, { lessonId: lessonIds.cancelledSibling, isLate: true })

  // One rider already cancelled on the picker lesson, so "lists the still-active enrolled
  // riders" has something to exclude. `isLate: true` leaves the lesson's own fee alone.
  await cancelLessonRider(supabase, barn, {
    lessonId: lessonIds.picker,
    riderId: riderIds[2],
    isLate: true,
  })
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function detailPath(key: LessonKey): string {
  return `/barn/${barn.slug}/lessons/${lessonIds[key]}`
}

function cancelPath(key: LessonKey): string {
  return `${detailPath(key)}/cancel`
}

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

function detailHeader(page: Page): Locator {
  return page.locator('main div:has(> h1)')
}

/** The Cancelled badge in the detail page header — not a rider row's badge, which is separate. */
function headerCancelledBadge(page: Page): Locator {
  return detailHeader(page).getByText(CANCELLED_BADGE, { exact: true })
}

/**
 * The lesson-type badge, which every group lesson's header carries unconditionally. It exists
 * only to be the positive control for a *zero* read of `headerCancelledBadge` — those two share
 * the `main div:has(> h1)` root, so a header markup change that made the root resolve to nothing
 * would otherwise let an absence claim pass while proving nothing.
 */
function headerTypeBadge(page: Page): Locator {
  return detailHeader(page).getByText(GROUP_BADGE, { exact: true })
}

/** One `<li>` per enrolled rider, inside the detail page's Rider(s) field. */
function riderRows(page: Page): Locator {
  return detailField(page, 'Rider(s)').locator('li')
}

/** A single rider's row, addressed by the name it displays. */
function riderRow(page: Page, name: string): Locator {
  return riderRows(page).filter({ hasText: name })
}

/** The cancel page's Type toggle, as a whole, so its options can be asserted in one string. */
function cancelTypeFieldset(page: Page): Locator {
  return page.locator('main fieldset:has(input[name="cancel_type"])')
}

function cancelTypeRadio(page: Page, value: 'instructor' | 'rider'): Locator {
  return page.locator(`input[name="cancel_type"][value="${value}"]`)
}

/**
 * The group-only description paragraph, addressed by **position** rather than by the text it is
 * about to be asserted on — selecting an element *by* the string you then assert is #1202's
 * tautology, and it would pass against a page rendering nothing else at all.
 *
 * `CancelLessonFields` emits this `<p>` ahead of the Type fieldset, and it renders for *every*
 * group lesson — only its string swaps with the toggle. The amber label is a second `<p>` under
 * the same `<form>`, so a bare `main form > p` is ambiguous on any near lesson with Rider
 * selected, and `:first-of-type` is what disambiguates: the description is always the first
 * `<p>`, the amber label always the second.
 *
 * It is `:first-of-type` and **not** `:nth-child(1)` for a reason worth recording, because the
 * first version of this locator was `:nth-child(1)` and matched nothing at all: React 19 injects
 * a hidden `$ACTION_ID` input as the first child of a form bound to a Server Action, so the
 * description is not the form's first *child* even though it is its first `<p>`.
 *
 * `:first-of-type` does share `.first()`'s weakness in principle — it would silently read the
 * amber `<p>` if the description ever stopped rendering. What removes that is the assertion
 * rather than the locator: both call sites match an anchored `^This will mark the lesson…`
 * prefix, which the amber sentence cannot satisfy, so a wrong read fails loudly instead of
 * quietly agreeing.
 */
function groupDescription(page: Page): Locator {
  return page.locator('main form > p:first-of-type')
}

/** The rider picker's own labels — one per still-active rider, or nothing when it is hidden. */
function pickerLabels(page: Page): Locator {
  return page.locator('main form fieldset:has(input[name="rider_id"]) label')
}

/**
 * The amber group-lesson fee note, addressed by **position** for the same reason
 * `groupDescription` is: selecting an element *by* the string you then assert on is #1202's
 * tautology, and `toHaveText(GROUP_FEE_WARNING)` against a locator that already matched that
 * exact text cannot fail except by resolving to nothing — it is `toBeVisible()` wearing a text
 * matcher.
 *
 * `CancelLessonFields` emits the amber `<p>` after the Type fieldset, and the description `<p>`
 * before it, so the amber label is always the form's **second** `<p>` when it renders and there
 * is no second `<p>` at all when it does not. That makes the same locator serve both the presence
 * assertion and the absence counts, and leaves the text a real claim rather than a restatement.
 */
function groupFeeWarning(page: Page): Locator {
  return page.locator('main form > p:nth-of-type(2)')
}

/** A lesson card in one of the Lessons list's `<ul>`s, addressed by the lesson it points at. */
function listCard(page: Page, key: LessonKey): Locator {
  return page.locator(`main ul a[href$="/lessons/${lessonIds[key]}"]`)
}

/** The detail page's rendered Fee, e.g. `$306`. */
async function feeOnDetailPage(page: Page): Promise<string> {
  return (await settledTextContents(detailField(page, 'Fee')))[0].trim()
}

/**
 * The Finances page's Pending income figure, as a number.
 *
 * The block is addressed by its label and then by position within itself — the same
 * "label `<p>` above a big-figure `<p>`" structure `checklist-phase4-finances-page-chrome`
 * reads, whose own checkboxes own the claim that the label and the layout are right. The
 * `^` anchor keeps `hasText` from matching an ancestor that merely contains the phrase.
 */
async function pendingIncome(page: Page): Promise<number> {
  const block = page.locator('main > div').filter({ hasText: /^Pending income/ })
  const text = (await settledTextContents(block.locator('p').nth(1)))[0].trim()
  return Number(text.replace(/[$,]/g, ''))
}

/**
 * Raise the budget for whichever test pays the cold compile of `/lessons/[id]/cancel`.
 *
 * This sits on the **route**, not on one helper, because the route has two entry points —
 * clicked through from the detail header, and navigated to directly — and attaching the budget
 * to only one of them is #1206's bug (`a97bd435`) wearing a different hat. Six of this file's
 * tests reach the cancel page directly and never touch `openCancelPage`; under a standalone
 * `--grep` any one of them is the run that compiles the route cold, on a bare budget, against a
 * dev server shared with three other workers. The first version of this file attached
 * `test.slow()` to `openCancelPage` alone and its comment claimed the coverage this pair of
 * helpers actually provides.
 *
 * No explicit timeout anywhere in this file. For every `waitFor*` that is because
 * `actionTimeout` is 0, so the wait is already unbounded and a number could only tighten it
 * (#1211). The one `expect.poll` is the exception worth naming: `expect.poll` is bounded by
 * **expect's** own budget, not by `actionTimeout`, and `playwright.config.ts` sets no
 * `expect.timeout` -- so it runs on Playwright's 5s default. Still no number here, because it
 * has not needed one; if it ever does, a named `{ timeout }` on that call is the right lever
 * and the one #1211 does not forbid, since on this tier a number *loosens*. What will not
 * work is `test.slow()`: it triples the test timeout and leaves expect's budget alone (#1279).
 */
async function gotoCancelPage(page: Page, key: LessonKey) {
  test.slow()
  await page.goto(cancelPath(key))
}

/** Open a lesson's Cancel page from its detail header, and leave the form ready to submit. */
async function openCancelPage(page: Page, key: LessonKey) {
  test.slow()
  await page.goto(detailPath(key))
  // `exact: true` is load-bearing, not decoration: `getByRole`'s name match is a
  // case-insensitive **substring** by default, so a bare 'Cancel' also matches a
  // 'Cancel Lesson' or 'Cancel Participation' control — and a locator resolving to the wrong
  // sibling is a no-op wearing the costume of a synchronisation point (#1205).
  await page.locator('main').getByRole('link', { name: 'Cancel', exact: true }).click()
  // Pins WHICH lesson's cancel page the link led to. The fieldset assertion downstream proves a
  // group cancel page *rendered*, but a `Cancel` href wired to the wrong lesson id renders an
  // identical fieldset and would satisfy it — 'commit' resolves before render, so the two halves
  // are complementary and neither replaces the other (`e2e/support/test.ts`'s convention block).
  await page.waitForURL(new RegExp(`/lessons/${lessonIds[key]}/cancel$`), { waitUntil: 'commit' })
}

/**
 * Land back on a lesson's detail page after a Confirm.
 *
 * Both halves are needed and neither replaces the other, which is the pairing
 * `checklist-phase4-lessons-detail.spec.ts` already uses and `e2e/support/test.ts`'s convention
 * block mandates after a click. `waitForURL` pins **which** lesson the server redirected to — a
 * redirect wired to the wrong id lands on a real, rendering detail page and would satisfy any
 * content check. `'commit'` resolves before that document renders, though, so a 404 or a 500 at
 * the right URL satisfies the URL half equally; the `<dl>` is the render proof, and `/cancel`
 * has none, so a submit that failed and re-rendered the confirmation page fails here rather than
 * sailing through.
 */
async function landOnDetail(page: Page, key: LessonKey) {
  await page.waitForURL(new RegExp(`/lessons/${lessonIds[key]}$`), { waitUntil: 'commit' })
  await page.locator('main dl').waitFor()
}

/**
 * Cancel a whole group lesson. Only reachable as **Cancelled by Instructor**:
 * `cancelLessonAction` re-routes a group lesson submitted with `cancel_type=rider` to the
 * per-rider action instead, so "cancel the whole thing" and "cancel one rider" are the toggle's
 * two branches rather than two pages.
 */
async function cancelWholeLesson(page: Page, key: LessonKey, notes?: string) {
  await openCancelPage(page, key)
  await cancelTypeRadio(page, 'instructor').check()
  if (notes !== undefined) await page.getByLabel('Cancellation notes (optional)', { exact: true }).fill(notes)
  await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()
  await landOnDetail(page, key)
}

/**
 * Cancel one rider's participation through the group cancel page's picker.
 *
 * The `cancel_type` check is a no-op on these lessons (see the seed comment) and is kept because
 * the checklist lines describe choosing it. The `rider_id` radio is a plain uncontrolled input
 * with no React state behind it, so selecting it needs no hydration either.
 */
async function cancelOneRider(page: Page, key: LessonKey, riderName: string) {
  await openCancelPage(page, key)
  await cancelTypeRadio(page, 'rider').check()
  await page.getByRole('radio', { name: riderName, exact: true }).check()
  await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()
  await landOnDetail(page, key)
}

// ---------------------------------------------------------------------------
// The confirmation page and its toggle
// ---------------------------------------------------------------------------

// Full-string equality on the whole fieldset, so this pins the two options, their order, and
// that nothing else is in the group. The fieldset exists on the cancel page and nowhere else, so
// asserting its contents is also the proof that the click navigated somewhere that rendered — no
// separate URL check, which could not have distinguished a rendered confirmation page from a 404
// at the same path.
test('clicking_cancel_on_a_group_lesson_opens_the_same_cancel_type_toggle @manager', async ({ page }) => {
  await openCancelPage(page, 'toggle')
  await expect(cancelTypeFieldset(page)).toHaveText(/^Type\s*Cancelled by Instructor\s*Cancelled by Rider$/)
})

// Anchored at the start of the paragraph rather than matched loosely, because the expected value
// is a bare digit: an unanchored /3 enrolled riders/ is a substring of "13 enrolled riders", and
// Playwright's text matching is substring-based (#1202). Requiring "…its fee for 3 enrolled
// riders: " from the first character leaves no wrong count that satisfies it.
test('choosing_cancelled_by_instructor_on_a_group_lesson_shows_the_affected_rider_count @manager', async ({ page }) => {
  await gotoCancelPage(page, 'toggle')
  await cancelTypeRadio(page, 'instructor').check()
  await expect(groupDescription(page)).toHaveText(
    /^This will mark the lesson as cancelled and zero out its fee for 3 enrolled riders: /
  )
})

// Sorted full-set equality, for two independent reasons. Order: `getLessonById` embeds
// `lesson_riders` with no `ORDER BY`, so the join's row order is not a guarantee to assert on —
// the same gap #1194 hit in `attachHorseNames`. Completeness: a positive containment check
// ("Ivy appears") is satisfied by both a subset and a superset render (#1188), and full-set
// equality on the parsed names is the one form that kills both.
test('the_cancelled_by_instructor_description_lists_the_affected_riders_by_name @manager', async ({ page }) => {
  await gotoCancelPage(page, 'toggle')
  await cancelTypeRadio(page, 'instructor').check()
  const description = (await settledTextContents(groupDescription(page)))[0]
  const listed = description
    .replace(/^.*enrolled riders?: /, '')
    .replace(/\. This cannot be undone\.$/, '')
    .split(', ')
  expect([...listed].sort()).toEqual([...RIDERS].sort())
})

// ---------------------------------------------------------------------------
// Cancelling the whole group lesson
// ---------------------------------------------------------------------------

// Four readings in one assertion, because the line is a conjunction — *cancels the whole lesson*,
// **and** *every enrolled rider included* — and the consequent alone would pass against any
// cancelled lesson whatever happened to its riders.
//
// The rider half is read two ways on purpose. In the DOM it is the per-rider **Cancellation
// Notes** block, because the per-rider Cancelled badge is deliberately hidden once the lesson
// itself is cancelled (`showManagerRiderActions` gates on `lesson.cancelled_at === null`), so the
// note is the only manager-visible per-rider evidence there is. The note is written by the very
// `UPDATE lesson_riders SET cancelled_at = now(), cancellation_notes = p_notes` that cancels the
// row — but a proxy is still a proxy, and a change that wrote one column without the other would
// satisfy it. The service-role read of `cancelled_at` alongside it turns the proxy into the
// actual claim; the DOM half stays because the checklist line is about what a manager sees.
test('confirming_cancelled_by_instructor_on_a_group_lesson_cancels_every_enrolled_rider @manager', async ({ page }) => {
  await cancelWholeLesson(page, 'wholeCancel', WHOLE_LESSON_NOTE)

  const rows = riderRows(page)
  await rows.first().waitFor()
  const { data, error } = await barn.data.supabase
    .from('lesson_riders')
    .select('cancelled_at')
    .eq('barn_id', barn.data.barn.id)
    .eq('lesson_id', lessonIds.wholeCancel)
  if (error) throw error

  expect({
    lessonCancelledBadges: await headerCancelledBadge(page).count(),
    riderRows: await rows.count(),
    riderRowsShowingTheCancellationNote: await rows.filter({ hasText: WHOLE_LESSON_NOTE }).count(),
    riderRowsCancelledInTheDatabase: data.filter((lr) => lr.cancelled_at !== null).length,
  }).toEqual({
    lessonCancelledBadges: 1,
    riderRows: 3,
    riderRowsShowingTheCancellationNote: 3,
    riderRowsCancelledInTheDatabase: 3,
  })
})

// `$0` against a lesson seeded at $304, and seeded **inside** the 24-hour window specifically:
// `cancelLessonAction` passes `isLate = false` unconditionally for a group lesson, so the waiver
// here is the group branch's own and not the 24-hour rule agreeing with it by coincidence.
test('whole_lesson_cancellation_of_a_group_lesson_waives_the_fee @manager', async ({ page }) => {
  await cancelWholeLesson(page, 'wholeFee')
  expect(await feeOnDetailPage(page)).toEqual('$0')
})

// The other half of that waiver, and the half #1278 was actually about. `lessons.fee` and the
// lesson's single `lesson_fee` transaction are separate rows; zeroing the column while leaving
// the transaction alone makes the lesson read `$0` while the barn is still owed the money.
//
// Pending income is the only surface that shows it: `getOutstandingLessonRows` filters
// `fee !== 0`, so the Outstanding table drops the row the moment the column is zeroed, whereas
// `getFinancialSummary` sums uncollected future transactions and goes on counting it.
//
// A **delta** rather than an absolute, because the figure also carries the thirteen other
// lessons this barn seeds and whatever earlier tests in this file have already cancelled. The
// two reads bracket one cancellation and nothing else — `playwright.config.ts` sets
// `fullyParallel: false`, so a file's tests are serial within one worker. That the drop equals
// this lesson's own distinct three-digit fee is what says the right row cleared: a drop of any
// other size, or of zero, fails.
test('cancelling_a_whole_group_lesson_clears_its_fee_from_pending_income @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/finances`)
  const before = await pendingIncome(page)

  await cancelWholeLesson(page, 'wholePending')

  await page.goto(`/barn/${barn.slug}/finances`)
  expect(before - (await pendingIncome(page))).toEqual(FEES.wholePending)
})

// ---------------------------------------------------------------------------
// The rider picker and per-rider cancellation
// ---------------------------------------------------------------------------

// The line has two halves and this reads both, because each is satisfied by a different bug.
//
// *Reveals* — this lesson is manager-instructed, so Instructor is the SSR default and the picker
// genuinely is not on the page until the click. `hiddenBeforeChoosing: 0` is what makes the
// `.check()` a real transition rather than a no-op confirming an already-rendered picker, and it
// is the only assertion in this file that exercises `setCancelType` in the rider direction. The
// `cancelTypeFieldset` wait before it is the render proof, so that zero is a measured absence on
// a page that drew rather than a zero from a page that never arrived.
//
// *Still-active* — sorted full-set equality, where the *negative* half is the point: this lesson
// has three enrolled riders, one already cancelled in the seed, so a picker listing every
// enrolled rider rather than the still-active ones fails on the extra name. A containment check
// would have passed against exactly that bug.
test('choosing_cancelled_by_rider_on_a_group_lesson_reveals_a_picker_of_still_active_riders @manager', async ({ page }) => {
  await gotoCancelPage(page, 'picker')
  await cancelTypeFieldset(page).waitFor()
  const hiddenBeforeChoosing = await pickerLabels(page).count()
  await cancelTypeRadio(page, 'rider').check()
  const listed = (await settledTextContents(pickerLabels(page))).map((s) => s.trim())
  expect({ hiddenBeforeChoosing, listed: [...listed].sort() }).toEqual({
    hiddenBeforeChoosing: 0,
    listed: [RIDERS[0], RIDERS[1]].sort(),
  })
})

// Each rider is read as a **pair** — is the row there, and does it carry a badge — rather than
// as a bare badge count, and the difference is the whole vacuity guard. A bare
// `{ Ivy: 1, Juno: 0, Kai: 0 }` has a real positive control for the locator (Ivy's `1` proves
// rows render and the badge matcher works), but it still reads `0` for a rider whose row is
// **absent entirely**, which is a different bug reported as a pass. Pinning `row: 1` on all
// three says the zeros are about the badge and not about the row.
test('cancelling_one_group_rider_shows_a_cancelled_badge_on_only_that_riders_row @manager', async ({ page }) => {
  await cancelOneRider(page, 'riderBadge', RIDERS[0])
  await riderRows(page).first().waitFor()
  const reading = async (name: string) => ({
    row: await riderRow(page, name).count(),
    cancelledBadge: await riderRow(page, name).getByText(CANCELLED_BADGE, { exact: true }).count(),
  })
  expect({
    [RIDERS[0]]: await reading(RIDERS[0]),
    [RIDERS[1]]: await reading(RIDERS[1]),
    [RIDERS[2]]: await reading(RIDERS[2]),
  }).toEqual({
    [RIDERS[0]]: { row: 1, cancelledBadge: 1 },
    [RIDERS[1]]: { row: 1, cancelledBadge: 0 },
    [RIDERS[2]]: { row: 1, cancelledBadge: 0 },
  })
})

// "The rest of the lesson" and "its other riders" are two subjects, so both are read here; the
// fee is what makes the pair more than a restatement of the test above it — and #1278 turned that
// reading from a formality into the point. The lesson is seeded >24h out (see the seed), which is
// the side where `cancel_rider_participation` used to run `IF NOT v_effective_is_late THEN UPDATE
// lessons SET fee = 0` for a rider of any lesson type, zeroing the **whole group's** fee. That
// write is now gated on `lesson_type = 'normal' OR` the cascade, so the seeded fee survives here.
// The fee string and the count of still-active rows are positive readings, but they come off
// the `<dl>` and the zero comes off the header — a different locator root, so they prove the
// page rendered without proving `main div:has(> h1)` resolves. `headerTypeBadges: 1` closes
// that: it is the same root, unconditionally present on a group lesson, and it fails on exactly
// the header markup change that would make the zero meaningless.
test('the_rest_of_a_group_lesson_is_unaffected_when_one_of_its_riders_cancels @manager', async ({ page }) => {
  await cancelOneRider(page, 'restUnaffected', RIDERS[0])
  const rows = riderRows(page)
  await rows.first().waitFor()
  expect({
    lessonCancelledBadges: await headerCancelledBadge(page).count(),
    headerTypeBadges: await headerTypeBadge(page).count(),
    fee: await feeOnDetailPage(page),
    riderRows: await rows.count(),
    ridersWithoutACancelledBadge: await rows.filter({ hasNotText: CANCELLED_BADGE }).count(),
  }).toEqual({
    lessonCancelledBadges: 0,
    headerTypeBadges: 1,
    fee: `$${FEES.restUnaffected}`,
    riderRows: 3,
    ridersWithoutACancelledBadge: 2,
  })
})

// Both sides of the boundary in one assertion, because the claim is that the boundary does not
// matter here — and "nothing happens on either side" is not testable from one side, where a
// system that never zeroed the fee and one that zeroed it only on the *other* side agree.
// #1278 was exactly the second of those: the far half read `$0` before the fix.
//
// The two lessons carry different seeded fees, so each retained value also proves which lesson
// was read. But a retained fee **is** the seeded value, and every early bail in
// `cancelRiderParticipationAction` redirects to the same URL the success path does — so a
// regression that refused to cancel at all would leave the seeded fee on a real, rendering
// detail page and satisfy a bare fee check. Since the fix, that hazard is symmetric, so both
// halves read the rider's Cancelled badge; it is what distinguishes "the fee was left alone"
// from "nothing happened", and it is readable precisely because one of three riders cancelling
// does not cascade the lesson.
test('a_group_riders_cancellation_leaves_the_lesson_fee_alone_on_both_sides_of_24h @manager', async ({ page }) => {
  await cancelOneRider(page, 'feePolicyFar', RIDERS[0])
  const moreThan24hOut = await feeOnDetailPage(page)
  const moreThan24hRiderCancelled = await riderRow(page, RIDERS[0])
    .getByText(CANCELLED_BADGE, { exact: true })
    .count()
  await cancelOneRider(page, 'feePolicyNear', RIDERS[0])
  const within24h = await feeOnDetailPage(page)
  const within24hRiderCancelled = await riderRow(page, RIDERS[0])
    .getByText(CANCELLED_BADGE, { exact: true })
    .count()
  expect({ moreThan24hOut, moreThan24hRiderCancelled, within24h, within24hRiderCancelled }).toEqual({
    moreThan24hOut: `$${FEES.feePolicyFar}`,
    moreThan24hRiderCancelled: 1,
    within24h: `$${FEES.feePolicyNear}`,
    within24hRiderCancelled: 1,
  })
})

// ---------------------------------------------------------------------------
// The amber group-lesson fee label
// ---------------------------------------------------------------------------

// Full-string equality rather than a substring match: the label's text is a complete sentence and
// any looser matcher would also accept a longer string that happened to contain it.
test('selecting_cancelled_by_rider_on_a_group_lesson_within_24h_shows_the_group_fee_warning @manager', async ({ page }) => {
  await gotoCancelPage(page, 'nearLabel')
  await cancelTypeRadio(page, 'rider').check()
  await expect(groupFeeWarning(page)).toHaveText(GROUP_FEE_WARNING)
})

// Two controls, because `before` and `formStillThere` defend against different things and
// neither covers the other. `before` is captured only after the label has actually appeared, so
// a locator that were simply wrong reports 0 there and fails, instead of reading as a clean pass
// on `after: 0` — but it is a *prior* reading, and it says nothing about the state of the
// document at the moment `after` is taken. `formStillThere` is concurrent: if clicking the
// instructor radio blew up the client and blanked `main`, `after` would read 0 and this test
// would report "switching hides the warning" about a page that had died. `expect.poll` re-reads
// both until they settle, which is what makes the unmount observable without an explicit timeout.
//
// This lesson is trainer-instructed, so Rider is the *server-rendered* default and `before: 1`
// no longer depends on React having processed the first `.check()`. Only the disappearance does
// — and that is the claim the checklist line makes, so hydration is load-bearing here by design
// rather than by accident.
test('switching_a_group_lesson_to_cancelled_by_instructor_hides_the_group_fee_warning @manager', async ({ page }) => {
  await gotoCancelPage(page, 'nearLabel')
  await cancelTypeRadio(page, 'rider').check()
  await groupFeeWarning(page).waitFor()
  const before = await groupFeeWarning(page).count()

  await cancelTypeRadio(page, 'instructor').check()
  await expect.poll(async () => ({
    before,
    after: await groupFeeWarning(page).count(),
    formStillThere: await cancelTypeFieldset(page).count(),
  })).toEqual({ before: 1, after: 0, formStillThere: 1 })
})

// Two defences, because the near-lesson half only covers one of the two ways an absence check can
// be true for the wrong reason.
//
// Against a *broken locator*: the same locator is pointed first at a lesson where the label
// genuinely renders, so one that matched nothing anywhere reports 0 on both pages and fails the
// first half rather than reading as a clean pass.
//
// Against an *unhydrated page*, which the near-lesson half does not cover at all — it is a
// different document, and proving that one hydrated says nothing about this one (#1191). The far
// lesson is trainer-instructed **specifically so its toggle already defaults to Rider**, which
// makes the absence a property of the server-rendered markup: `CancelLessonFields` evaluates
// `isWithinLateCancellationWindow` during the server render as well as on the client. The
// `.check()` below is a no-op confirming an already-selected state — the line's "select Cancelled
// by Rider" is honoured, but the reading no longer depends on React having processed a click.
// Pointing this half at a manager-instructed lesson would make an unhydrated click produce `0`
// for a reason that has nothing to do with the 24-hour window: the same value a correct pass
// produces.
test('selecting_cancelled_by_rider_on_a_group_lesson_more_than_24h_out_shows_no_group_fee_warning @manager', async ({ page }) => {
  await gotoCancelPage(page, 'nearLabel')
  await cancelTypeRadio(page, 'rider').check()
  await groupFeeWarning(page).waitFor()
  const onNearLesson = await groupFeeWarning(page).count()

  // `.check()` is itself the render proof for this page: it auto-waits and throws if the radio
  // never appears, so a 404 or an unrendered route fails here rather than reaching the count.
  await gotoCancelPage(page, 'farLabel')
  await cancelTypeRadio(page, 'rider').check()
  const onFarLesson = await groupFeeWarning(page).count()

  expect({ onNearLesson, onFarLesson }).toEqual({ onNearLesson: 1, onFarLesson: 0 })
})

// ---------------------------------------------------------------------------
// The Cancelled badge arrives only with the last rider
// ---------------------------------------------------------------------------

// Two of three riders cancelled, one still active. The positive control is a *different card in
// the same document* — a lesson cancelled in the seed and touched by nothing — which is what a
// positive control on another page could not be (#1191): it proves this render produced badges
// at all, so the zero is about this lesson rather than about the list failing to draw. The
// card's own count is pinned alongside it for the remaining gap the sibling cannot close — a
// list that drew badges fine but simply had no card for *this* lesson would also report zero.
test('a_group_lesson_shows_no_cancelled_badge_while_any_rider_is_still_active @manager', async ({ page }) => {
  await cancelOneRider(page, 'listNoBadge', RIDERS[0])
  await cancelOneRider(page, 'listNoBadge', RIDERS[1])

  await page.goto(`/barn/${barn.slug}/lessons`)
  await listCard(page, 'cancelledSibling').waitFor()
  expect({
    cardsForThisLesson: await listCard(page, 'listNoBadge').count(),
    cancelledBadgesOnThisLesson: await listCard(page, 'listNoBadge').getByText(CANCELLED_BADGE, { exact: true }).count(),
    cancelledInTheSeed: await listCard(page, 'cancelledSibling').getByText(CANCELLED_BADGE, { exact: true }).count(),
  }).toEqual({ cardsForThisLesson: 1, cancelledBadgesOnThisLesson: 0, cancelledInTheSeed: 1 })
})

// Its own lesson, cancelled rider by rider the way the line describes, rather than a reading of
// whatever the test above left behind: sharing a lesson would make this result depend on another
// test having run first, and on the worker not having restarted and re-seeded in between.
test('a_group_lesson_shows_a_cancelled_badge_on_the_lessons_list_once_its_final_rider_is_cancelled @manager', async ({ page }) => {
  for (const rider of RIDERS) await cancelOneRider(page, 'listBadge', rider)
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect(listCard(page, 'listBadge').getByText(CANCELLED_BADGE, { exact: true })).toBeVisible()
})

// Same manner of cancellation, its own row, for the reason above. The detail page this lands on
// is the one the final rider's Confirm redirected to, so the badge is read off a fresh server
// render of the cascaded lesson rather than a re-navigation.
test('a_fully_cancelled_group_lesson_shows_the_cancelled_badge_on_its_detail_page @manager', async ({ page }) => {
  for (const rider of RIDERS) await cancelOneRider(page, 'detailBadge', rider)
  await expect(headerCancelledBadge(page)).toBeVisible()
})
