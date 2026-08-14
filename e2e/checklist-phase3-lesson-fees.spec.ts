// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-form-parsing.ts
// covers: src/lib/db/lessons.ts
//
// Phase 3's opening block (checklists/pre-release/phase-3-manager-lesson-entry.md, from
// "Create a **past lesson**" through "That lesson keeps the tier's name (not \"Custom\")"): the
// past lesson driven through /lessons/new, the Fee field's rejection of a blank value on create
// and again in edit mode, and the named-tier prefill that a manager then overrides without the
// lesson falling back to Custom.
//
// Adjacent prior art, not a duplicate of it: checklist-phase5-lessons-new.spec.ts owns the
// *trainer's* view of this same form — the month calendar's shading and conflict dots, the
// locked instructor field, and the nearby-instructor notification. It creates lessons only as a
// means to those ends and asserts nothing about tiers or fees. Every test here is a fee or a
// tier claim.
//
// ## Why the assertions read off each lesson's EDIT form, not its detail page
//
// Deliberate, and worth keeping. `/lessons/[id]` renders no Tier field at all, so
// "keeps the tier's name" is unobservable there; and its Fee `<dd>` concatenates the `Unpaid`
// badge into its own text, so a `$60` expectation would have to be spelled `$60Unpaid` and would
// then be coupled to a badge no checkbox here is about. The edit form carries every fact these
// lines name as a plain input value. A later reader "simplifying" these reads onto the detail
// page gets a passing test that asserts something else.
//
// ## Why the blank-fee lines assert the FIELD's rejection rather than "fee is required"
//
// The checklist quoted `lesson-form-parsing.ts`'s message. That string is unreachable through a
// browser: `#fee` carries `required`, and the form is a `<form action={formAction}>`, so
// Chromium's constraint validation blocks the submit before React dispatches and the Server
// Action never runs. Measured, not reasoned — the two tests below assert `invalidFired: 'yes'`,
// which only the browser blocking the submit can produce. Both lines were narrowed in the same
// PR to what actually happens. Same shape, and the same reasoning, as
// checklist-phase4-settings-fields.spec.ts's `blank_instructor_cut_is_rejected_by_the_field`;
// `valueMissing` alone is not an assertion about rejection at all, since it is already true of
// an empty `required` input before any submit is attempted.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Not an oversight. Spec-maintenance rule 5 binds a fixture `.update(`/`.delete(` whose zero-row
// result would go unnoticed; this file's seed callback contains neither. The past lesson is
// *created through the form* rather than backdated, which is what the checkbox says, so there is
// no row to reseed by mutation at all. What is left is `addTier` and `addHorse` (called with no
// options, so its conditional second write never fires) — both insert-only — and
// `addUnpaidLesson`, which bottoms out in `create_lesson_with_participants`. None of them can
// silently match zero rows.
//
// ## Why nothing here needs a positive anchor (#1434)
//
// Also not an oversight. Rule 4 binds absence assertions; this file makes none. Every claim is
// positive — a value reads back off a stored lesson's form, or the browser fires `invalid` on a
// field — so there is no matcher here that could be satisfied on its first poll.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, daysFromNow, resolveWhen } from './support/fixtures'
import { hydrateByDriving, waitForBarnPageHydrated } from './support/hydration'
import { lessonCards, saveLessonForm, waitForEditFormHydrated } from './support/lesson-pages'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import type { Horse, Lesson, LessonTier } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn this file seeds, and why each piece of it is there
// ---------------------------------------------------------------------------

// One horse per lesson, which is what lets each test reach *its own* lesson through the list's
// By Horse filter without the other two being candidates. Three names with no containment and no
// shared initial, per the collision constraint support/fixtures.ts states on E2E_STUB_RIDER.
const APPLE = 'Apple'
const WILLOW = 'Willow'
const CLOVER = 'Clover'

// The named tier the checklist calls Beginner. Its price is read back off `addTier`'s return
// everywhere below, never re-typed: a prefill assertion against a literal passes when the prefill
// breaks and the seeded price happens to match.
const BEGINNER = { name: 'Beginner', price: 60 }

// The barn's *default* tier, and it is load-bearing rather than scenery. `LessonForm` seeds
// `selectedId` from `tiers.find(t => t.is_default)`, so without a second, defaulted tier the form
// would open on Beginner with the fee already at 60 — and "selecting a named tier prefills the fee
// with that tier's price" would pass against a form that had done nothing. At 90 it cannot: a
// prefill that never ran reads 90, and one that ran reads 60.
const HOUSE_DEFAULT = { name: 'Group Special', price: 90 }

const SEEDED_LESSON_FEE = 40
/** What the manager overwrites the prefilled 60 with. Distinct from both tier prices. */
const EDITED_FEE = '75'
/** Typed into the fee field to prove "editable" as a round trip rather than as an attribute. */
const TYPED_FEE_PROBE = '123'

// Barn-local wall clocks. BARRIER_TIME's minutes must not be `:00`: `LessonStartTime` defaults
// `time` to the top of the barn's current hour and runs that initializer on the server too, so a
// `HH:00` barrier already matches for one hour a day, the fill is never dispatched, and the
// barrier resolves having proved nothing — leaving every click after it exposed to the lost-click
// hazard (facts 9 and 10). Non-zero minutes cannot be produced by that default at any hour.
const BARRIER_TIME = '10:37'
const SEEDED_LESSON_TIME = '09:15'

let beginner: LessonTier
let apple: Horse
let willow: Horse
let clover: Horse
let seededLesson: Lesson
let trainerMembershipId: string
let riderMembershipId: string

/**
 * The day the past lesson is created on, and the month the grid has to be paged back to.
 *
 * `resolveWhen({ monthsAgo: 1 })` rather than any arithmetic on the host clock — #1150 and #1151
 * both came from exactly that. It bottoms out in `monthAnchor`, whose returned Date is a UTC
 * midnight whose *digits* are the barn's month, so slicing its ISO form yields the barn-local
 * calendar day it names. Day 15 of the previous barn month is also never an outside-month spill
 * cell on that month's own grid, and is at minimum 14 days back on any calendar day of the year —
 * comfortably past `OLDER_LESSON_CUTOFF_DAYS`, which is what makes "it lands in the Older lessons
 * bucket" a certainty rather than a coincidence of when the suite runs.
 */
let pastDay: string
let previousMonth: string

/** Captured by the edited-fee test, read again by the tier-name test that follows it. */
let editedLessonId = ''

const barn = withBarn('phase3-lesson-fees', async ({ supabase, barn: seeded, members }) => {
  // Not decoration: `LessonForm` short-circuits its whole render to "No lesson tiers have been
  // configured…" on a tier-less barn, so every assertion below would run against a page holding
  // none of what it names.
  await addTier(supabase, seeded.id, { ...HOUSE_DEFAULT, isDefault: true })
  beginner = await addTier(supabase, seeded.id, BEGINNER)

  apple = await addHorse(supabase, seeded.id, APPLE)
  willow = await addHorse(supabase, seeded.id, WILLOW)
  clover = await addHorse(supabase, seeded.id, CLOVER)

  trainerMembershipId = members.trainer.membershipId
  riderMembershipId = members.rider.membershipId

  pastDay = resolveWhen({ monthsAgo: 1 }, seeded.timezone).toISOString().slice(0, 10)
  previousMonth = pastDay.slice(0, 7)

  // The existing lesson "In edit mode, a blank fee is rejected too" needs. Seeded rather than
  // created through the form, per the issue's note: the create path is already a checkbox of its
  // own above and running this one against that lesson would couple the two.
  //
  // Future-dated, and that is deliberate twice over. It keeps this lesson out of the Older
  // lessons bucket, so the past-lesson test finds exactly one card there; and an unpaid *past*
  // lesson arms `computeUnpaidWarn`, whose navigation guard would sit between this test and the
  // page it is trying to leave.
  seededLesson = await addUnpaidLesson(supabase, seeded, {
    at: daysFromNow(3, seeded.timezone),
    time: SEEDED_LESSON_TIME,
    instructorId: members.trainer.membershipId,
    horseIds: [clover.id],
    riderIds: [members.rider2.membershipId],
    fee: SEEDED_LESSON_FEE,
    tierName: HOUSE_DEFAULT.name,
  })
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

function newLessonPath(): string {
  return `/barn/${barn.slug}/lessons/new`
}

function editPath(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}/edit`
}

/**
 * Opens the New Lesson form and blocks until React has taken it over.
 *
 * Every control this file touches afterwards is React-controlled — the tier `<select>`, the fee
 * input, the horse checkboxes, the rider `<select>`, and the calendar's day buttons all read from
 * `useState` — so a click or a fill landing before hydration is either lost outright or is
 * overwritten the moment React reconciles (facts 9 and 10). Waiting on `#lesson-start-time` to
 * merely *exist* would prove nothing: since #1021 the day panel is `dayPanelAlwaysOpen`, so that
 * input is in the server-rendered HTML. The barrier therefore waits on the hidden `lesson_at`
 * input carrying the combination of the barn's today and the time just entered, which only
 * client-side `LessonStartTime` can write.
 *
 * `test.slow()` rather than a number on any wait: every `waitFor*` is unbounded already, so a
 * number could only tighten it (fact 1).
 */
async function openNewLessonForm(page: Page): Promise<void> {
  test.slow()
  const timezone = barn.data.barn.timezone
  await page.goto(newLessonPath())
  await page.getByRole('heading', { level: 1, name: 'New Lesson' }).waitFor()

  const expected = wallClockToInstant(
    `${barnToday(timezone)}T${BARRIER_TIME}:00`,
    timezone
  ).toISOString()
  await hydrateByDriving(
    () => page.locator('#lesson-start-time').fill(BARRIER_TIME),
    () =>
      page.evaluate((want) => {
        const el = document.querySelector('input[name="lesson_at"]')
        return el instanceof HTMLInputElement && el.value === want
      }, expected)
  )
}

/**
 * Picks a named tier, settling on the `<select>`'s own value.
 *
 * The settle is on the select rather than on the fee it cascades into, because the fee is what
 * two of the checkboxes below actually claim — settling on it would make those assertions wait
 * for themselves.
 */
async function selectTier(page: Page, tierId: string): Promise<void> {
  await page.locator('#tier_name').selectOption(tierId)
  await expect(page.locator('#tier_name')).toHaveValue(tierId)
}

/**
 * Picks Custom, settling on the fee field clearing — which is `handleTierChange`'s Custom branch
 * doing its work, and the precondition (not the claim) of the blank-fee rejection test below.
 *
 * By label, not by value: `CUSTOM_ID` is a module-private constant in `LessonForm`, and copying
 * its literal here would be a second definition free to drift from the first.
 */
async function selectCustomTier(page: Page): Promise<void> {
  await page.locator('#tier_name').selectOption({ label: 'Custom' })
  await expect(page.locator('#fee')).toHaveValue('')
}

/**
 * Pages the grid back one month and taps day 15 of it.
 *
 * Plain clicks, deliberately not `hydrateByDriving`: the month button is *monotonic*, not
 * idempotent, so a retry loop whose read merely lagged one successful click would page a second
 * month back and never satisfy its own predicate. `openNewLessonForm`'s barrier has already
 * proved React is listening, which is what makes one click enough.
 *
 * The day settle is the panel's rendered heading, not `aria-pressed`: React 19 does not reconcile
 * an attribute that mismatched at hydration, and #1252 measured exactly that on these cells.
 */
async function pickPastDay(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByText(formatMonthHeading(previousMonth), { exact: true }).waitFor()

  await page.getByRole('button', { name: pastDay, exact: true }).click()
  await page.getByText(formatCalendarDate(calendarDate(pastDay)), { exact: true }).waitFor()
}

/** Ticks a horse, settling on the per-horse exertion input — `useState`-gated markup that cannot
 *  exist until React has the horse checked. */
async function selectHorse(page: Page, horse: Horse): Promise<void> {
  await page.getByRole('checkbox', { name: horse.name, exact: true }).check()
  await page.locator(`#exertion_${horse.id}`).waitFor()
}

/**
 * Submits the New Lesson form and waits out the redirect to the Lessons list.
 *
 * Keyboard activation rather than a pointer click: the submit sits at the bottom of a long
 * scrollable form, the shape #501 (04c64505) diagnosed, where Chromium's scroll-into-view
 * animation races Playwright's actionability check. `exact: true` because `getByRole`'s name match
 * is a case-insensitive substring and the button relabels itself to "Submitting…" while pending.
 *
 * The `waitForURL` cannot no-op (fact 3) — the pattern excludes the `/lessons/new` it is called
 * from — and it doubles as the "the save succeeded" half: `submitLesson` re-renders the form with
 * a `role="alert"` and no navigation on every failure path, and only redirects on success.
 */
async function submitNewLesson(page: Page): Promise<void> {
  const submit = page.getByRole('button', { name: 'Submit', exact: true })
  await submit.focus()
  await submit.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
}

/**
 * Walks from the Lessons list to a created lesson's own edit form, the way a manager reaches it,
 * and reports the lesson's id.
 *
 * The By Horse filter is *addressing*, not assertion: each lesson in this barn has a horse no
 * other lesson uses, so filtering to one horse leaves exactly one card, and `lessonCards`'
 * strict-mode click is what enforces that — a second match fails the test rather than picking
 * whichever came first. A lesson that saved against the wrong horse fails here loudly, at the
 * click, rather than passing something weaker further down.
 *
 * `past` opens the Older lessons toggle first. That toggle is `useState`, so it needs a hydrated
 * page; the nav-bar barrier is used rather than a page-local signal because the list renders the
 * same markup before and after hydration (fact 13). Reaching a card *through* that toggle is also
 * the structural half of the past-lesson claim: only a lesson older than the list's cutoff is
 * behind it at all.
 */
async function openEditFormForHorse(page: Page, horseId: string, past: boolean): Promise<string> {
  await page.goto(`/barn/${barn.slug}/lessons?filter=horse&id=${horseId}`)

  if (past) {
    await waitForBarnPageHydrated(page)
    await page.getByRole('button', { name: 'Show older lessons', exact: true }).click()
  }

  await lessonCards(page).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
  const lessonId = page.url().split('/').pop()!

  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}\/edit$/, { waitUntil: 'commit' })
  // Render proof, not decoration: `waitUntil: 'commit'` resolves before the document renders, so
  // a 500 at the right URL would satisfy the URL half on its own.
  await page.locator('#tier_name').waitFor()

  return lessonId
}

/**
 * What a stored lesson's edit form holds, as one object.
 *
 * Read together and asserted as a single `toEqual` because the checkbox is a conjunction —
 * "Beginner tier, trainer Alex, horse Apple, rider Dana" on a day in the previous calendar month
 * is five claims about one lesson, and splitting them would let four pass while the fifth silently
 * named a different lesson.
 *
 * Every field is seeded from a server prop, so these values are in the server-rendered markup and
 * need no hydration barrier; the `waitFor` is there so a form that never rendered fails here
 * instead of returning empties. `aria-pressed` is safe to read for the same reason — the server
 * and the client compute it from the same prop, so fact 7's non-reconciliation has no mismatch to
 * preserve, and nothing on this page ever changes the selected day.
 */
async function editFormSelection(page: Page) {
  const horseInputs = page.locator('input[name="horse_id"]')
  await horseInputs.first().waitFor()

  // `evaluateAll` is one-shot and does not auto-retry, so an unsettled read yields `[]` and any
  // assertion that happens to accept an empty array passes on nothing (rule 3). The `waitFor`
  // above is that guard, and it doubles as the assertion: it throws rather than returning `[]`.
  const horses = await horseInputs.evaluateAll((els) =>
    els
      .filter((el) => (el as HTMLInputElement).checked)
      .map((el) => (el as HTMLInputElement).value)
  )

  return {
    day: await page.locator('button[data-past][aria-pressed="true"]').getAttribute('aria-label'),
    tier: await page.locator('#tier_name').inputValue(),
    instructor: await page.locator('#instructor_id').inputValue(),
    horses,
    rider: await page.locator('#rider_id').inputValue(),
  }
}

/**
 * Arms the browser's own rejection signal on a field.
 *
 * The `invalid` event fires on a field whose constraint blocks a submit attempt. That event *is*
 * the rejection, rather than a symptom of it — and it is what makes the submit below load-bearing:
 * `valueMissing` alone is already true of an empty `required` input before anything is submitted.
 */
async function armInvalidListener(field: Locator): Promise<void> {
  await field.evaluate((el) => {
    el.removeAttribute('data-invalid-fired')
    el.addEventListener('invalid', () => el.setAttribute('data-invalid-fired', 'yes'))
  })
}

async function rejectionOf(field: Locator) {
  return field.evaluate((el) => ({
    invalidFired: el.getAttribute('data-invalid-fired'),
    valueMissing: (el as HTMLInputElement).validity.valueMissing,
  }))
}

const REJECTED = { invalidFired: 'yes', valueMissing: true }

// ---------------------------------------------------------------------------
// The past lesson, the fee's validation, and the tier prefill
// ---------------------------------------------------------------------------
//
// Serial, and ordered: the tier-name item asserts on the lesson the edited-fee item above it
// created. Under `fullyParallel: false` declaration order is run order, and a failure anywhere
// restarts the worker and re-seeds the barn (fact 15) — so the first ✘ here is the finding and
// everything below it is noise until that one is fixed.

test.describe.serial('New Lesson — the past lesson, fee validation and tier prefill', () => {
  test('creating_a_past_lesson_stores_its_date_tier_instructor_horse_and_rider @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page)
    await selectTier(page, beginner.id)
    await pickPastDay(page)
    await page.locator('#instructor_id').selectOption(trainerMembershipId)
    await selectHorse(page, apple)
    await page.locator('#rider_id').selectOption(riderMembershipId)
    await submitNewLesson(page)

    await openEditFormForHorse(page, apple.id, true)

    // Every expectation is a builder return value or a seeded membership id — nothing here is a
    // string this file also typed into the form by hand.
    expect(await editFormSelection(page)).toEqual({
      day: pastDay,
      tier: beginner.id,
      instructor: trainerMembershipId,
      horses: [apple.id],
      rider: riderMembershipId,
    })
  })

  test('saving_a_new_lesson_with_a_blank_fee_is_rejected_by_the_fee_field @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page)
    await selectHorse(page, apple)
    await page.locator('#rider_id').selectOption(riderMembershipId)

    // Custom last, so its fee-clearing is the final state the submit sees. The rest of the form is
    // filled in properly first: with a horse and a rider in hand, `#fee` is the only field left
    // that can block the submit, which is what pins this rejection to the fee.
    await selectCustomTier(page)

    const fee = page.locator('#fee')
    await armInvalidListener(fee)
    const submit = page.getByRole('button', { name: 'Submit', exact: true })
    await submit.focus()
    await submit.press('Enter')

    expect(await rejectionOf(fee)).toEqual(REJECTED)
  })

  test('editing_a_lesson_to_a_blank_fee_is_rejected_by_the_fee_field @manager', async ({ page }) => {
    test.slow()
    await page.goto(editPath(seededLesson.id))
    // The fill has to reach React, not just the DOM: `#fee` is `value={fee}` over a `useState`, so
    // a pre-hydration clear is overwritten with the stored 40 the moment React reconciles — and
    // the submit would then be rejected by nothing at all.
    await waitForEditFormHydrated(page)

    const fee = page.locator('#fee')
    await fee.fill('')
    await armInvalidListener(fee)
    // The edit path validates through the same `required` attribute but a separate submit — this
    // is `updateLessonAction`'s form, not `submitLesson`'s, which is the whole reason this item
    // exists alongside the create one above.
    await saveLessonForm(page)

    expect(await rejectionOf(fee)).toEqual(REJECTED)
  })

  test('selecting_a_named_tier_leaves_the_fee_field_visible_and_editable @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page)
    await selectTier(page, beginner.id)

    const fee = page.locator('#fee')
    // Visibility is captured before the fill, so the two halves stay independent claims rather
    // than one of them being a precondition of reading the other.
    const visible = await fee.isVisible()
    // "Editable" as a round trip rather than as an attribute: a React-controlled input that had
    // been switched to readOnly, or whose onChange had been dropped, keeps its old value here.
    await fee.fill(TYPED_FEE_PROBE)

    expect({ visible, value: await fee.inputValue() }).toEqual({
      visible: true,
      value: TYPED_FEE_PROBE,
    })
  })

  test('selecting_a_named_tier_prefills_the_fee_with_that_tiers_price @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page)
    await selectTier(page, beginner.id)

    // `beginner.price` off `addTier`'s return, never a literal — and discriminating, because the
    // form opened on the $90 default tier, so an unfired prefill reads 90 rather than 60.
    await expect(page.locator('#fee')).toHaveValue(String(beginner.price))
  })

  test('an_edited_fee_is_stored_on_the_created_lesson @manager', async ({ page }) => {
    await openNewLessonForm(page)
    // Tier first, then the fee: `handleTierChange` overwrites the fee, so filling in the other
    // order would submit the tier's price and the item would assert nothing.
    await selectTier(page, beginner.id)
    await page.locator('#fee').fill(EDITED_FEE)
    await selectHorse(page, willow)
    await page.locator('#rider_id').selectOption(riderMembershipId)
    await submitNewLesson(page)

    editedLessonId = await openEditFormForHorse(page, willow.id, false)

    await expect(page.locator('#fee')).toHaveValue(EDITED_FEE)
  })

  test('an_edited_fee_leaves_the_lesson_on_the_selected_tier @manager', async ({ page }) => {
    await page.goto(editPath(editedLessonId))
    await page.locator('#tier_name').waitFor()

    // Equality with the seeded tier, not `not('Custom')`, which is the item's actual claim and is
    // strictly stronger: `LessonForm` resolves the selection from the stored `tier_name` **by
    // name**, so a lesson that fell back to Custom selects the Custom option and fails this — while
    // an inequality check would pass on almost any other breakage too.
    await expect(page.locator('#tier_name')).toHaveValue(beginner.id)
  })
})
