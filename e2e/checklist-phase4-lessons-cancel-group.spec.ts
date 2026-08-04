// covers: src/app/barn/[slug]/(protected)/lessons/**
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
 * They are inline managed stubs rather than `members.rider`/`members.rider2`, and the reason is
 * not cosmetic: those two render as **"Test Rider"** and **"Test Rider2"**, so one name is a
 * strict substring of the other. Every locator below that reaches a rider's row by name uses
 * `filter({ hasText })` or `getByRole(..., { name })`, both of which are substring matchers by
 * default — `hasText: 'Test Rider'` would select Test Rider2's row as well. That is #1202's
 * containment hazard living in the fixture rather than in an assertion. These three names are
 * mutually non-substring and share no prefix with 'Test Manager'/'Test Trainer'.
 *
 * `addManagedMember` writes `is_managed = true`, which is what keeps `teardownBarn`'s profile
 * sweep able to see them — the leak class the batch has now hit three times.
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
} as const

type LessonKey = keyof typeof FEES

/** Typed into the whole-lesson confirmation page, read back off every rider's row. */
const WHOLE_LESSON_NOTE = 'Arena flooded, the whole group is off.'

// The app's own strings, quoted rather than imported: an expected value derived from the code
// under test agrees with any bug in it.
const GROUP_FEE_WARNING =
  'Warning: No late cancellation fees are currently leveraged for group lessons.'
const CANCELLED_BADGE = 'Cancelled'

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
 * **Why almost every lesson is instructed by the trainer.** `CancelLessonPage` computes
 * `cancelledByInstructorDefault = isInstructorOfLesson(membership.id, lesson)`, so on a lesson
 * the manager does *not* instruct the Type toggle already defaults to **Cancelled by Rider** —
 * which means `CancelLessonFields` renders the rider picker, and suppresses or shows the amber
 * label, **during the server render**. Every per-rider flow and the far-lesson absence check
 * therefore read a property of the delivered HTML rather than of React state reached by a click.
 * #1191 found the failure this avoids: an unhydrated `.check()` sets the DOM but never reaches
 * React, leaving the label absent and the count reading the same `0` a correct pass produces.
 * The `.check()` calls stay — the checklist lines say "choose Cancelled by Rider" — but they are
 * no-ops confirming an already-selected state.
 *
 * The two lessons that *are* manager-instructed (`toggle`, `nearLabel`) are the ones whose lines
 * are about the instructor side or about switching between the two, where a click is the claim.
 */
const barn = withBarn('phase4-lessons-cancel-group', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true })
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

  // Read-only page states.
  await seed('toggle', FAR(), manager)
  await seed('picker', FAR(), trainer)
  await seed('nearLabel', NEAR(), manager)
  await seed('farLabel', FAR(), trainer)

  // Whole-lesson cancellation. Both are <24h out, so `$0` cannot be explained by anything the
  // rider-side 24-hour rule does — only by the group branch's unconditional waiver.
  await seed('wholeCancel', NEAR(), manager)
  await seed('wholeFee', NEAR(), manager)

  // Per-rider cancellation. `restUnaffected` and `riderBadge` are deliberately <24h out:
  // cancel_rider_participation zeroes the *whole lesson's* fee when the cancellation is not
  // late, so on a >24h lesson "the rest of the lesson is unaffected" would be false of the fee.
  await seed('riderBadge', NEAR(), trainer)
  await seed('restUnaffected', NEAR(), trainer)
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

/** The Cancelled badge in the detail page header — not a rider row's badge, which is separate. */
function headerCancelledBadge(page: Page): Locator {
  return page.locator('main div:has(> h1)').getByText(CANCELLED_BADGE, { exact: true })
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
 * The group-only description paragraph, addressed structurally as the form's own `<p>` rather
 * than by the text it is about to be asserted on — selecting an element *by* the string you then
 * assert is #1202's tautology, and it would pass against a page rendering nothing else at all.
 * `CancelLessonFields` emits it as a direct child of the `<form>`; the amber label is the only
 * other `<p>` there and never renders alongside it on the pages this locator is used on (both
 * are Instructor-selected, and one is >24h out besides), so a second match is a strict-mode
 * failure rather than a silent wrong read.
 */
function groupDescription(page: Page): Locator {
  return page.locator('main form > p')
}

/** The rider picker's own labels — one per still-active rider, or nothing when it is hidden. */
function pickerLabels(page: Page): Locator {
  return page.locator('main form fieldset:has(input[name="rider_id"]) label')
}

/** The amber group-lesson fee note, which only ever renders on the cancel page. */
function groupFeeWarning(page: Page): Locator {
  return page.locator('main').getByText(GROUP_FEE_WARNING, { exact: true })
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
 * Open a lesson's Cancel page from its detail header, and leave the form ready to submit.
 *
 * `test.slow()` lives here rather than on individual tests: whichever test happens to compile
 * `/lessons/[id]/cancel` cold gets the raised budget, including under a standalone `--grep` of
 * any single caller. That is #1206's fix (`a97bd435`) for exactly this shape — a budget attached
 * to some call sites of a shared helper rather than to the helper itself — and putting it back
 * on the tests reintroduces a failure that shows up only under `--grep`.
 *
 * No explicit timeout anywhere in this file: `actionTimeout` is 0, so every `waitFor*` is
 * already unbounded and a number could only tighten it (#1211).
 */
async function openCancelPage(page: Page, key: LessonKey) {
  test.slow()
  await page.goto(detailPath(key))
  await page.locator('main').getByRole('link', { name: 'Cancel', exact: true }).click()
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
  if (notes !== undefined) await page.getByLabel('Cancellation notes (optional)').fill(notes)
  await page.getByRole('button', { name: 'Confirm Cancellation' }).click()
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
  await page.getByRole('button', { name: 'Confirm Cancellation' }).click()
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
  await page.goto(cancelPath('toggle'))
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
  await page.goto(cancelPath('toggle'))
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

// ---------------------------------------------------------------------------
// The rider picker and per-rider cancellation
// ---------------------------------------------------------------------------

// Sorted full-set equality again, and here the *negative* half is the point: this lesson has
// three enrolled riders, one of them already cancelled in the seed, so a picker that listed
// every enrolled rider rather than the still-active ones fails on the extra name. A containment
// check would have passed against exactly that bug.
test('choosing_cancelled_by_rider_on_a_group_lesson_reveals_a_picker_of_still_active_riders @manager', async ({ page }) => {
  await page.goto(cancelPath('picker'))
  await cancelTypeRadio(page, 'rider').check()
  const listed = (await settledTextContents(pickerLabels(page))).map((s) => s.trim())
  expect([...listed].sort()).toEqual([RIDERS[0], RIDERS[1]].sort())
})

// The `1` and the two `0`s live in one assertion so the positive control cannot be skipped: a
// row locator that resolved to nothing would report `0` for all three and fail on the cancelled
// rider, rather than reading as a clean pass on two zeros. `N±1` is not what is mutated against
// this shape either — see the PR body's mutation report.
test('cancelling_one_group_rider_shows_a_cancelled_badge_on_only_that_riders_row @manager', async ({ page }) => {
  await cancelOneRider(page, 'riderBadge', RIDERS[0])
  await riderRows(page).first().waitFor()
  const badgesFor = (name: string) => riderRow(page, name).getByText(CANCELLED_BADGE, { exact: true })
  expect({
    [RIDERS[0]]: await badgesFor(RIDERS[0]).count(),
    [RIDERS[1]]: await badgesFor(RIDERS[1]).count(),
    [RIDERS[2]]: await badgesFor(RIDERS[2]).count(),
  }).toEqual({ [RIDERS[0]]: 1, [RIDERS[1]]: 0, [RIDERS[2]]: 0 })
})

// "The rest of the lesson" and "its other riders" are two subjects, so both are read here; the
// fee is what makes the pair more than a restatement of the test above it. This lesson is <24h
// out for a reason that is easy to miss: `cancel_rider_participation` runs
// `IF NOT v_effective_is_late THEN UPDATE lessons SET fee = 0`, so on a lesson more than 24 hours
// away one rider's cancellation zeroes the **whole group's** fee and the line would be false.
// The fee string and the count of still-active rows are both positive readings, so the
// zero-badge half cannot pass on a page that rendered nothing.
test('the_rest_of_a_group_lesson_is_unaffected_when_one_of_its_riders_cancels @manager', async ({ page }) => {
  await cancelOneRider(page, 'restUnaffected', RIDERS[0])
  const rows = riderRows(page)
  await rows.first().waitFor()
  expect({
    lessonCancelledBadges: await headerCancelledBadge(page).count(),
    fee: await feeOnDetailPage(page),
    ridersWithoutACancelledBadge: await rows.filter({ hasNotText: CANCELLED_BADGE }).count(),
  }).toEqual({ lessonCancelledBadges: 0, fee: '$306', ridersWithoutACancelledBadge: 2 })
})

// Both sides of the boundary in one assertion, because a *policy* claim is not testable from one
// side: a system that always zeroed the fee, and one that never did, each satisfy half of it.
// The two lessons carry different seeded fees, so the retained value also proves which lesson
// was read.
test('the_24_hour_fee_policy_applies_to_a_group_rider_who_cancels @manager', async ({ page }) => {
  await cancelOneRider(page, 'feePolicyFar', RIDERS[0])
  const moreThan24hOut = await feeOnDetailPage(page)
  await cancelOneRider(page, 'feePolicyNear', RIDERS[0])
  const within24h = await feeOnDetailPage(page)
  expect({ moreThan24hOut, within24h }).toEqual({ moreThan24hOut: '$0', within24h: '$308' })
})

// ---------------------------------------------------------------------------
// The amber group-lesson fee label
// ---------------------------------------------------------------------------

// Full-string equality rather than a substring match: the label's text is a complete sentence and
// any looser matcher would also accept a longer string that happened to contain it.
test('selecting_cancelled_by_rider_on_a_group_lesson_within_24h_shows_the_group_fee_warning @manager', async ({ page }) => {
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await expect(groupFeeWarning(page)).toHaveText(GROUP_FEE_WARNING)
})

// `before` is captured only after the label has actually appeared, so the positive control lives
// inside the same assertion as the disappearance claim. A locator that were simply wrong would
// report 0 for `before` and fail there, instead of reading as a clean pass on `after: 0`.
// `expect.poll` re-reads `after` until it settles, which is what makes the unmount observable
// without an explicit timeout.
test('switching_a_group_lesson_to_cancelled_by_instructor_hides_the_group_fee_warning @manager', async ({ page }) => {
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await groupFeeWarning(page).waitFor()
  const before = await groupFeeWarning(page).count()

  await cancelTypeRadio(page, 'instructor').check()
  await expect.poll(async () => ({ before, after: await groupFeeWarning(page).count() })).toEqual({
    before: 1,
    after: 0,
  })
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
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await groupFeeWarning(page).waitFor()
  const onNearLesson = await groupFeeWarning(page).count()

  // `.check()` is itself the render proof for this page: it auto-waits and throws if the radio
  // never appears, so a 404 or an unrendered route fails here rather than reaching the count.
  await page.goto(cancelPath('farLabel'))
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
// at all, so the zero is about this lesson rather than about the list failing to draw.
test('a_group_lesson_shows_no_cancelled_badge_while_any_rider_is_still_active @manager', async ({ page }) => {
  await cancelOneRider(page, 'listNoBadge', RIDERS[0])
  await cancelOneRider(page, 'listNoBadge', RIDERS[1])

  await page.goto(`/barn/${barn.slug}/lessons`)
  await listCard(page, 'cancelledSibling').waitFor()
  expect({
    stillHasAnActiveRider: await listCard(page, 'listNoBadge').getByText(CANCELLED_BADGE, { exact: true }).count(),
    cancelledInTheSeed: await listCard(page, 'cancelledSibling').getByText(CANCELLED_BADGE, { exact: true }).count(),
  }).toEqual({ stillHasAnActiveRider: 0, cancelledInTheSeed: 1 })
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
