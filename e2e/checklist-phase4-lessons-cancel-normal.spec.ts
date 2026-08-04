// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/components/calendar/**
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, daysFromNow, E2E_USERS } from './support/fixtures'
import { settledTextContents } from './support/read'
import { instantToLocalWallClock } from '@/lib/barn-timezone'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const STANDARD_TIER = 'Standard'

// The tier's own price, and deliberately not any lesson's fee below. An expected fee that
// happened to equal the tier default could be produced by a lesson that was never touched.
const TIER_PRICE = 80

const TRAINER_NAME = `${E2E_USERS.trainer.firstName} ${E2E_USERS.trainer.lastName}`

/**
 * One distinct three-digit fee per lesson, none of them 0 and none of them TIER_PRICE.
 *
 * This is the design-time form of the break-the-code check (#1196/#1240) applied to a computed
 * money value. Three of the four fee outcomes this slice asserts are `$0`, which is exactly the
 * shape that can be accidentally correct — a test that read the wrong lesson, or a Confirm that
 * silently no-opped, would still find a zero if zero were reachable any other way. With every
 * seeded fee distinct and non-zero, `$0` can only mean "this lesson's fee was zeroed", and the
 * one retained-fee assertion (`$152`) can only mean "this lesson's fee survived".
 */
const FEES = {
  header: 101,
  trainer: 112,
  nearLabel: 123,
  riderFar: 141,
  riderNear: 152,
  riderNearBadge: 185,
  riderNearNotes: 196,
  instructorFar: 163,
  instructorNear: 174,
  listBadge: 207,
  detailBadge: 218,
  dashCancel: 229,
  dashSibling: 240,
} as const

/** Typed into the confirmation page's notes textarea, read back verbatim from the detail page. */
const CANCELLATION_NOTE = 'Trainer is away at a clinic this weekend.'

// The app's own strings, quoted rather than imported: an expected value derived from the code
// under test agrees with any bug in it.
const LATE_FEE_WARNING = 'The rider will be due a late cancellation fee.'
const CANCELLED_BADGE = 'Cancelled'

// Filled in by the seed.
const lessonIds: Record<keyof typeof FEES, string> = {} as Record<keyof typeof FEES, string>
let dashDay: string

/**
 * Placement across the 24-hour cancellation boundary is by **explicit instant**, never by a day
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
 * Thirteen lessons, one per page state. Every test that needs a *cancelled* lesson cancels one
 * of its own through the UI rather than sharing one with its neighbours.
 *
 * Cancelling is one-way — `/lessons/[id]/cancel` calls notFound() once `cancelled_at` is set — so
 * a shared lesson would force a `describe.serial` chain, and that is precisely where this batch's
 * two nastiest mutation blind spots bite: serial skips every test after the first failure, and a
 * failing test restarts the Playwright worker, which re-runs `beforeAll` and re-seeds the barn.
 * Designing the chain out of existence costs twelve extra seed rows and removes both.
 *
 * The three dashboard/list lessons are the exception to the explicit-instant rule above, and for
 * a reason that doesn't conflict with it: they need a known barn-local *calendar day* rather than
 * a position relative to the 24h boundary, and `daysFromNow(3|4)` is at minimum 36 hours out, so
 * it cannot straddle that boundary however the clock falls.
 */
const barn = withBarn('phase4-lessons-cancel-normal', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true })
  const apple = await addHorse(supabase, barn.id, APPLE)

  const defaults = {
    tierName: tier.name,
    horseIds: [apple.id],
    riderIds: [members.rider.membershipId],
    instructorId: members.manager.membershipId,
  }

  const seed = async (key: keyof typeof FEES, at: Date, extra: { instructorId?: string; time?: string } = {}) => {
    const lesson = await addUnpaidLesson(supabase, barn, { ...defaults, ...extra, at, fee: FEES[key] })
    lessonIds[key] = lesson.id
  }

  // Read-only page states.
  await seed('header', FAR())
  await seed('trainer', FAR(), { instructorId: members.trainer.membershipId })
  await seed('nearLabel', NEAR())

  // One lesson per destructive fee outcome.
  await seed('riderFar', FAR())
  await seed('riderNear', NEAR())
  await seed('riderNearBadge', NEAR())
  await seed('riderNearNotes', NEAR())
  await seed('instructorFar', FAR())
  await seed('instructorNear', NEAR())

  // The Lessons-list and detail-page badge checks. Day +3, pinned times so neither can drift
  // onto a neighbouring barn-local day.
  const badgeDay = daysFromNow(3, barn.timezone)
  await seed('listBadge', badgeDay, { time: '10:00' })
  await seed('detailBadge', badgeDay, { time: '11:00' })

  // Day +4 carries the dashboard pair: one lesson the test cancels, and one it never touches.
  // The untouched sibling is the positive control — a day view that failed to render at all
  // would report zero cancelled lessons too, and a bare `cancelled: 0` would sail through.
  const dashInstant = daysFromNow(4, barn.timezone)
  dashDay = instantToLocalWallClock(dashInstant, barn.timezone).slice(0, 10)
  await seed('dashCancel', dashInstant, { time: '10:00' })
  await seed('dashSibling', dashInstant, { time: '11:00' })
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function detailPath(key: keyof typeof FEES): string {
  return `/barn/${barn.slug}/lessons/${lessonIds[key]}`
}

function cancelPath(key: keyof typeof FEES): string {
  return `${detailPath(key)}/cancel`
}

/**
 * The detail page header's action group, addressed as the sibling of the block that holds the
 * `<h1>` rather than by its Tailwind classes. That relationship is what makes "a single Cancel
 * button *next to* Edit/Delete" an assertion about the header rather than about the page: a
 * Cancel control rendered anywhere else is outside this locator entirely.
 */
function headerActions(page: Page): Locator {
  return page.locator('main div:has(> h1) + div')
}

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

/** The Cancelled badge in the detail page header — not a rider row's badge, which is separate. */
function headerCancelledBadge(page: Page): Locator {
  return page.locator('main div:has(> h1)').getByText(CANCELLED_BADGE, { exact: true })
}

/** The cancel page's Type toggle, as a whole, so its options can be asserted in one string. */
function cancelTypeFieldset(page: Page): Locator {
  return page.locator('main fieldset:has(input[name="cancel_type"])')
}

function cancelTypeRadio(page: Page, value: 'instructor' | 'rider'): Locator {
  return page.locator(`input[name="cancel_type"][value="${value}"]`)
}

/** The amber late-cancellation-fee note, which only ever renders on the cancel page. */
function lateFeeWarning(page: Page): Locator {
  return page.locator('main').getByText(LATE_FEE_WARNING, { exact: true })
}

/** A lesson card in one of the Lessons list's `<ul>`s, addressed by the lesson it points at. */
function listCard(page: Page, key: keyof typeof FEES): Locator {
  return page.locator(`main ul a[href$="/lessons/${lessonIds[key]}"]`)
}

/** A dashboard day-view card, addressed by the lesson it points at. */
function dayViewCard(page: Page, key: keyof typeof FEES): Locator {
  return page.locator(`main a[href$="/lessons/${lessonIds[key]}"]`)
}

/**
 * Drive one whole cancellation from the detail page, and land back on it.
 *
 * The wait after Confirm is deliberately *not* `toHaveURL` and not `waitForURL` either: the
 * detail page's `<dl>` is the only thing here that proves the destination actually rendered.
 * `/cancel` renders no `<dl>` at all, so a submit that failed and re-rendered the confirmation
 * page — or one that redirected to a 404 — resolves this locator to nothing and fails, where a
 * URL assertion would have passed on both. The `<dl>` is also what every caller reads next, so
 * the proof and the read are the same auto-waiting locator rather than two hopeful steps.
 */
async function cancelFromDetail(
  page: Page,
  key: keyof typeof FEES,
  cancelType: 'instructor' | 'rider',
  notes?: string
) {
  await page.goto(detailPath(key))
  await page.locator('main').getByRole('link', { name: 'Cancel', exact: true }).click()
  await cancelTypeRadio(page, cancelType).check()
  if (notes !== undefined) await page.getByLabel('Cancellation notes (optional)').fill(notes)
  await page.getByRole('button', { name: 'Confirm Cancellation' }).click()
  await page.locator('main dl').waitFor()
}

/** The detail page's rendered Fee, e.g. `$152`. */
async function feeOnDetailPage(page: Page): Promise<string> {
  return (await settledTextContents(detailField(page, 'Fee')))[0].trim()
}

// ---------------------------------------------------------------------------
// The Cancel button in the detail header
// ---------------------------------------------------------------------------

// Full-string equality on the whole action group, so this pins four things at once that
// separate assertions would each pin only partly: that Cancel is present, that there is exactly
// one of it, that it sits between Edit and Delete, and that nothing else is in the group. The
// Delete control here is DeleteLessonButton's submit (this lesson is unpaid with a non-zero
// fee), which contributes its own text and no other.
test('lesson_detail_header_shows_a_single_cancel_button_beside_edit_and_delete @manager', async ({ page }) => {
  await page.goto(detailPath('header'))
  await expect(headerActions(page)).toHaveText(/^Edit\s*Cancel\s*Delete$/)
})

// The instructor half is not decoration: it is what proves this really is a lesson someone else
// instructs, and it doubles as the vacuity control for the count — a detail page that rendered
// nothing would report `cancel: 0` *and* fail the instructor comparison, rather than reading as
// a clean pass on a count of zero.
test('the_manager_sees_the_cancel_button_on_a_lesson_another_trainer_instructs @manager', async ({ page }) => {
  await page.goto(detailPath('trainer'))
  const instructor = (await settledTextContents(detailField(page, 'Instructor')))[0].trim()
  const cancel = await page.locator('main').getByRole('link', { name: 'Cancel', exact: true }).count()
  expect({ instructor, cancel }).toEqual({ instructor: TRAINER_NAME, cancel: 1 })
})

// ---------------------------------------------------------------------------
// The confirmation page and its toggle
// ---------------------------------------------------------------------------

// The fieldset exists on the cancel page and nowhere else, so asserting its contents is also the
// proof that the click navigated somewhere that rendered — no separate URL check, which could
// not have distinguished a rendered confirmation page from a 404 at the same path.
test('clicking_cancel_on_a_normal_lesson_opens_the_cancel_type_confirmation_page @manager', async ({ page }) => {
  await page.goto(detailPath('header'))
  await page.locator('main').getByRole('link', { name: 'Cancel', exact: true }).click()
  await expect(cancelTypeFieldset(page)).toHaveText(/^Type\s*Cancelled by Instructor\s*Cancelled by Rider$/)
})

// `toBeChecked` fails when the locator resolves to nothing, so this cannot pass vacuously; and
// because the two inputs are one radio group, pinning the checked one pins the other by
// construction. The manager login instructs this lesson (seeded with their own membership id).
test('the_cancel_type_toggle_defaults_to_instructor_on_a_lesson_you_instruct @manager', async ({ page }) => {
  await page.goto(cancelPath('header'))
  await expect(cancelTypeRadio(page, 'instructor')).toBeChecked()
})

test('the_cancel_type_toggle_defaults_to_rider_on_a_lesson_you_do_not_instruct @manager', async ({ page }) => {
  await page.goto(cancelPath('trainer'))
  await expect(cancelTypeRadio(page, 'rider')).toBeChecked()
})

// ---------------------------------------------------------------------------
// The amber late-cancellation-fee label
// ---------------------------------------------------------------------------

// Full-string equality rather than a substring match: the label's text is a complete sentence
// and any looser matcher would also accept a longer string that happened to contain it.
test('selecting_cancelled_by_rider_within_24h_shows_the_late_fee_warning @manager', async ({ page }) => {
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await expect(lateFeeWarning(page)).toHaveText(LATE_FEE_WARNING)
})

// `before` is captured only after the label has actually appeared, so the positive control lives
// inside the same assertion as the disappearance claim. A locator that were simply wrong would
// report 0 for `before` and fail there, instead of reading as a clean pass on `after: 0`.
// expect.poll re-reads `after` until it settles, which is what makes the unmount observable
// without an explicit timeout.
test('switching_to_cancelled_by_instructor_hides_the_late_fee_warning @manager', async ({ page }) => {
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await lateFeeWarning(page).waitFor()
  const before = await lateFeeWarning(page).count()

  await cancelTypeRadio(page, 'instructor').check()
  await expect.poll(async () => ({ before, after: await lateFeeWarning(page).count() })).toEqual({
    before: 1,
    after: 0,
  })
})

// The same locator is pointed first at a lesson where the label genuinely renders and only then
// at the one where it must not — the structural defence against a vacuous absence check, since a
// locator that matched nothing anywhere would report 0 on both pages and fail the first half.
test('selecting_cancelled_by_rider_more_than_24h_out_shows_no_late_fee_warning @manager', async ({ page }) => {
  await page.goto(cancelPath('nearLabel'))
  await cancelTypeRadio(page, 'rider').check()
  await lateFeeWarning(page).waitFor()
  const onNearLesson = await lateFeeWarning(page).count()

  await page.goto(cancelPath('header'))
  await cancelTypeRadio(page, 'rider').check()
  const onFarLesson = await lateFeeWarning(page).count()

  expect({ onNearLesson, onFarLesson }).toEqual({ onNearLesson: 1, onFarLesson: 0 })
})

// ---------------------------------------------------------------------------
// Confirming a cancellation — the four fee outcomes across the 24-hour boundary
//
// The rule, and it is the opposite of what checklist lines 294/295 said before this PR: a rider
// who cancels *inside* the 24-hour window still owes the fee, and one who cancels earlier has it
// waived. `cancel_lesson_with_transactions` is `fee = CASE WHEN p_is_late THEN fee ELSE 0 END`,
// and `isLateCancellation` returns true for rider + <24h — so "late" means "the fee stands".
// An instructor cancellation waives it either side of the boundary, because `isLateCancellation`
// short-circuits on that branch before it ever consults the window.
//
// The two lines were swapped in place under the user's ruling; see the PR body for the four
// sources, the sharpest of which is line 300 four lines below — the amber "the rider will be due
// a late cancellation fee" warning, which fires on exactly the rider + <24h case that line 295
// used to claim zeroed the fee.
// ---------------------------------------------------------------------------

// `$0` against a lesson seeded at $141. The zero is the *waiver*: this rider cancelled with more
// than 24 hours' notice, so no fee is owed.
test('confirming_cancelled_by_rider_more_than_24h_out_zeroes_the_fee @manager', async ({ page }) => {
  await cancelFromDetail(page, 'riderFar', 'rider')
  expect(await feeOnDetailPage(page)).toEqual('$0')
})

// The strongest assertion in the file, and deliberately so: `$152` is the only expected value
// here that is neither zero, nor the tier default, nor any other lesson's fee — so it cannot be
// produced by a cancellation that no-opped, by a read of the wrong lesson, or by any fallback
// the system has. A late rider cancellation is the one case where the fee survives.
test('confirming_cancelled_by_rider_within_24h_leaves_the_fee_unaffected @manager', async ({ page }) => {
  await cancelFromDetail(page, 'riderNear', 'rider')
  expect(await feeOnDetailPage(page)).toEqual('$152')
})

// `$0` against a lesson seeded at $163 — the zero can only have come from this cancellation,
// because no other seeded fee in the barn is zero and none of them is $163 either.
test('confirming_cancelled_by_instructor_more_than_24h_out_zeroes_the_fee @manager', async ({ page }) => {
  await cancelFromDetail(page, 'instructorFar', 'instructor')
  expect(await feeOnDetailPage(page)).toEqual('$0')
})

// The instructor override is unconditional — inside the 24h window it waives the fee just the
// same — which is the whole point of this line sitting next to the one above it.
test('confirming_cancelled_by_instructor_within_24h_zeroes_the_fee_too @manager', async ({ page }) => {
  await cancelFromDetail(page, 'instructorNear', 'instructor')
  expect(await feeOnDetailPage(page)).toEqual('$0')
})

// ---------------------------------------------------------------------------
// What a cancellation leaves behind
// ---------------------------------------------------------------------------

// Its own lesson, cancelled the same way the line describes, rather than a reading of whatever
// the fee test above left behind. "A lesson cancelled that way" is read as *that manner of
// cancellation* — Cancelled by Rider, inside the 24h window — not as that same row: sharing the
// row would make this test's result depend on another test having run first, and on the worker
// not having restarted and re-seeded in between.
test('a_rider_cancellation_shows_the_cancelled_badge_on_the_lesson_detail_page @manager', async ({ page }) => {
  await cancelFromDetail(page, 'riderNearBadge', 'rider')
  await expect(headerCancelledBadge(page)).toBeVisible()
})

// The note is typed into the confirmation page's own textarea and read back off the detail page
// the redirect lands on, so this is a genuine round trip through cancelLessonAction rather than
// a re-read of something the seed planted.
test('cancellation_notes_entered_on_the_confirmation_page_appear_on_the_detail_page @manager', async ({ page }) => {
  await cancelFromDetail(page, 'riderNearNotes', 'rider', CANCELLATION_NOTE)
  const notes = (await settledTextContents(detailField(page, 'Cancellation Notes')))[0].trim()
  expect(notes).toEqual(CANCELLATION_NOTE)
})

// ---------------------------------------------------------------------------
// The Cancelled badge on the list, the detail page, and the dashboard's day view
// ---------------------------------------------------------------------------

test('cancelling_a_normal_lesson_shows_a_cancelled_badge_on_the_lessons_list @manager', async ({ page }) => {
  test.slow()
  await cancelFromDetail(page, 'listBadge', 'instructor')
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect(listCard(page, 'listBadge').getByText(CANCELLED_BADGE, { exact: true })).toBeVisible()
})

// Same manner of cancellation, its own row, for the reason spelled out above the rider-badge
// test: "that same lesson" is honoured as the same kind of lesson cancelled the same way, which
// keeps this check independent of whether the list check above it ran, passed, or re-seeded.
test('a_cancelled_normal_lesson_shows_the_cancelled_badge_on_its_detail_page @manager', async ({ page }) => {
  test.slow()
  await cancelFromDetail(page, 'detailBadge', 'instructor')
  await expect(headerCancelledBadge(page)).toBeVisible()
})

// #1015. Navigated by `?date=` computed from this lesson's own seeded instant rather than by
// clicking "Next day" N times from today — which is what the checklist line asks for ("even
// navigating directly to that day"), and which also sidesteps the midnight window a
// count-from-today navigation carries when a run crosses barn-local midnight mid-file.
//
// The sibling lesson shares the day and is never cancelled, so the two counts are asserted
// together: a day view that failed to render, or a `?date=` that landed on the wrong day, would
// report `cancelled: 0` as readily as a correct one, and only the sibling half catches it.
test('a_cancelled_lesson_is_absent_from_the_dashboard_day_view_for_its_date @manager', async ({ page }) => {
  test.slow()
  await cancelFromDetail(page, 'dashCancel', 'instructor')

  await page.goto(`/barn/${barn.slug}?date=${dashDay}`)
  await dayViewCard(page, 'dashSibling').waitFor()
  expect({
    cancelled: await dayViewCard(page, 'dashCancel').count(),
    sibling: await dayViewCard(page, 'dashSibling').count(),
  }).toEqual({ cancelled: 0, sibling: 1 })
})
