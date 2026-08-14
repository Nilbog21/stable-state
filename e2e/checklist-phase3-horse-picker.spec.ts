// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/components/ExhaustionBar.tsx
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-form-parsing.ts
// covers: src/lib/db/horses.ts
// covers: src/lib/db/lessons.ts
// covers: src/lib/db/lesson-participants.ts
// covers: src/lib/db/schedule.ts
// covers: src/lib/month-calendar.ts
// covers: src/lib/barn-timezone.ts
// covers: src/lib/local-day.ts
//
// Phase 3's horse-picker block (checklists/pre-release/phase-3-manager-lesson-entry.md, the run
// from "Create a **group lesson** (dated a few days ago)" through "Set the date/start time back to
// the future — the bars reappear", plus the run from "Open Willow's seeded upcoming lesson's edit
// page" through "Willow's bar disappears once unchecked"): the group legend, the fee-driven
// Payment Type toggle, the unavailable horse's disabled box and its position, the least-to-most-
// worked order a checked horse jumps out of, the bars a past date removes, and the inactive horse
// that stays checked and first on an edit form until it is unchecked.
//
// The two ranges are non-contiguous by design. Everything between them — the day panel, the month
// arrows and the whole Recurring chain — belongs to other slices of the same fan-out, and no line
// outside the two runs above is touched here.
//
// ## What ONE horse picker is, in two sort orders
//
// `LessonForm`'s picker sorts on `horseSortBucket(a) - horseSortBucket(b) || horseTotalExertion(a)
// - horseTotalExertion(b)`, where the bucket is `checked -> 0`, `unavailable or inactive -> 2`,
// everything else `1`. That single comparator is what makes the checklist's two headline claims
// look contradictory and be the same rule: an *unavailable* horse sorts to the bottom (bucket 2),
// while an *inactive* horse that is already on the lesson being edited sorts to the top — because
// being checked wins the bucket before its inactivity is ever consulted. Unchecking it drops it
// straight from bucket 0 to bucket 2, which is the transition the last two tests below drive. Both
// orders are asserted here so the contrast is visible in one file rather than inferred across two.
//
// ## Why the horse locators are CSS, not `getByRole`
//
// `horseCheckbox` addresses `input[type="checkbox"][name="horse_id"][value="{id}"]`. The two halves
// of that carry different weight, and saying which is which is the honest version:
//
//   - **`[value="{id}"]` is what carries this file.** The same horse's accessible name differs by
//     page: an unavailable horse's carries its reason ("Daisy — Thrown shoe"), and the edit route
//     renames an inactive horse to "Willow (inactive)". A `getByRole` name would have to be spelled
//     two ways for one horse, while the builder-returned id is one expression on both pages — and
//     keeps the expected values on the "comes from a builder return value" side of the convention.
//   - **`[type="checkbox"]` is defensive, not load-bearing here.** The picker does render a second,
//     *hidden* `input[name="horse_id"]` for a horse that is checked **and** unavailable — but no
//     test in this file reaches that state. Daisy is disabled and so is never checked, and the edit
//     route hardcodes `is_available: true` on the inactive row it re-adds, so Willow is never
//     `isUnavailable`. The pin costs nothing and closes the ambiguity for anyone who later drives a
//     checked unavailable horse; it is not what makes today's assertions correct.
//
// ## Why this file mutates almost nothing, and needs no `describe.serial`
//
// Twelve of the thirteen tests only drive a form and read it back; each opens its own page from
// scratch, so there is no ordering between them and a failure anywhere is a finding rather than a
// cascade (fact 15). The thirteenth *creates* a group lesson, and it is dated three days back
// specifically so its horse's exertion lands outside the +4..+10 day window every ordering
// assertion here reads through — the one mutation in the file cannot perturb the tests around it,
// whichever order they run in.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { mustAffect } from './support/must-affect'
import { hydrateByDriving } from './support/hydration'
import { waitForEditFormHydrated } from './support/lesson-pages'
import { BARRIER_TIME, editPath, newLessonPath, submitNewLesson } from './support/lesson-form'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { shiftMonth } from '@/lib/month-calendar'
import { addDays, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import type { CalendarDate, Horse, Lesson, LessonTier } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn, and why each horse in it is there
// ---------------------------------------------------------------------------

// Five names with no containment and no shared first initial, per the collision constraint
// support/fixtures.ts states on E2E_STUB_RIDER. The four the checklist names by hand — Butter for
// the group lesson, Daisy unavailable, Willow inactive, Apple as the horse that gets checked — plus
// Clover, which exists to sit *between* Butter and Apple in the worked order.
const APPLE = 'Apple'
const BUTTER = 'Butter'
const CLOVER = 'Clover'
const DAISY = 'Daisy'
const WILLOW = 'Willow'

/**
 * Daisy's reason string, matching the one Phase 2's already-automated chain enters
 * ("set status pill to **Unavailable**, enter reason "Thrown shoe""). Daisy is not a seed horse —
 * `scripts/seed-barn.ts` has no Daisy at all; she is created by the manager during Phase 2 and is
 * still unavailable by the time Phase 3 opens this form. Paired with `isAvailable: false` because
 * `HorseOptions` says to pair them.
 */
const DAISY_REASON = 'Thrown shoe'

/** The barn's default tier. Its price is what the Fee field prefills with, which is what makes the
 *  fee-to-zero test start from a non-zero fee rather than from an empty one. */
const HOUSE_DEFAULT = { name: 'Standard', price: 80 }
/** The tier the checklist's group lesson is created on. */
const GROUP_SPECIAL = { name: 'Group Special', price: 90 }

/** The legend `LessonForm` renders for a group lesson — `Horses ` plus a `<span>` the textContent
 *  read below concatenates. A Normal lesson reads plain "Horse", which an earlier slice owns. */
const GROUP_HORSE_LEGEND = 'Horses (select at least one)'

// Day offsets from the barn's today. Every one of them is resolved through `addDays(barnToday(tz))`
// at test time and `daysFromNow(tz)` at seed time — the same barn-local calendar day either way,
// never host-zone arithmetic on a Date.
//
// The +7 target and its ±3-day exertion window (+4..+10) are the frame the whole ordering block is
// read in: Apple's lesson at +6 and Clover's at +8 are inside it, and every other lesson this barn
// holds is outside it. A run that crosses barn midnight between the seed and the test shifts the
// window by a day and both stay inside, which is the slack the choice of +6/+8 buys.
const TARGET_OFFSET = 7
const APPLE_LESSON_OFFSET = 6
const CLOVER_LESSON_OFFSET = 8
/** Where the "set the date to the past" tests go. A week back, so it is unambiguously past whatever
 *  hour the form's start time carries. */
const PAST_OFFSET = -7
/** The checklist's "dated a few days ago" for the created group lesson. Outside +4..+10, so the one
 *  mutating test in this file cannot move any ordering assertion. */
const GROUP_LESSON_OFFSET = -3
/** Willow's upcoming lesson — the one whose edit page the second checklist run opens. */
const WILLOW_LESSON_OFFSET = 20
/** Willow's *other* lesson, and it is determinism machinery rather than scenery: see WILLOW_HISTORY
 *  _EXERTION below. Inside +17..+23, the window Willow's edit lesson is read through. */
const WILLOW_HISTORY_OFFSET = 19

// Exertion levels, which are the only thing separating the three available horses in the picker's
// order. Butter deliberately gets no lesson at all, so the unchecked order is Butter(0), Clover(2),
// Apple(5) — least to most worked, with Apple last, which is what makes "check one horse and it
// jumps to the top" a real transition rather than a horse that was already first.
const APPLE_EXERTION = 5
const CLOVER_EXERTION = 2

/**
 * Willow's second lesson's exertion, and the reason that lesson exists at all.
 *
 * Without it Willow and Daisy both total 0 once Willow is unchecked, they share bucket 2, the
 * secondary sort ties, and "Willow moves to the bottom" would hold only by `Array.sort`'s stability
 * over the order `horsesForForm` happened to append in — a pass for a reason the checklist line
 * does not claim. At 4 against Daisy's 0 the bottom position is arithmetic.
 *
 * It buys a second thing: the edit page excludes the lesson being edited from its own exertion
 * window, so on that page Willow's bar is the only one reading anything but "0 points from 0
 * lessons". That makes `willowBar` below address *Willow's* bar by name rather than by position.
 */
const WILLOW_HISTORY_EXERTION = 4

/** Barn-local wall clock for every seeded lesson. Pinned rather than inherited from the runner's
 *  clock, per LessonOptions.time's note (#1150). */
const SEEDED_LESSON_TIME = '09:00'

/** Typed into the Fee field to make `feeIsZero` true. `LessonForm` reads it as `fee !== '' &&
 *  Number(fee) === 0`, so the empty string is a different state and is not what this drives. */
const ZERO_FEE = '0'
/** What the fee is raised back to. Distinct from both tier prices, so a Payment Type field that
 *  reappeared because the form reset rather than because the fee moved would still be wrong. */
const RESTORED_FEE = '25'

/**
 * How many exhaustion bars the New Lesson form renders once its projection has arrived.
 *
 * Three, not four: `LessonForm` renders a bar for a horse that is checked, or available *and*
 * active — Daisy is neither checked nor available, so she never carries one. Willow is not on this
 * form at all, since `getHorsesByBarn` filters `is_active`.
 */
const AVAILABLE_BAR_COUNT = 3

/**
 * `expect.poll` and web-first matchers run on expect's own 5s default, which `test.slow()` does not
 * raise (fact 1) — so unlike every `waitFor*` here, a number *loosens* rather than tightens. Every
 * matcher carrying it waits on `getProjectedExhaustionForBarn`, one Server Action round trip per
 * changed start instant, behind a `next dev` compile of a route the run may be touching for the
 * first time. 30s rather than 5 for the reason checklist-phase3-calendar-shading.spec.ts's
 * `SCHEDULE_FETCH_BUDGET` records: a cold compile was measured at ~16.6s inside a test's own budget
 * (#1482), and worker contention compounds it. Warm, these settle in well under a second, so the
 * headroom costs a passing run nothing; a fetch that never resolves still fails the test.
 */
const EXHAUSTION_FETCH_BUDGET = 30_000

let groupSpecial: LessonTier
let apple: Horse
let butter: Horse
let clover: Horse
let daisy: Horse
let willow: Horse
let willowLesson: Lesson
let trainerMembershipId: string
let riderMembershipId: string
let rider2MembershipId: string

const barn = withBarn('phase3-horse-picker', async ({ supabase, barn: seeded, members }) => {
  // Not decoration: `LessonForm` short-circuits its whole render to "No lesson tiers have been
  // configured…" on a tier-less barn, so every assertion below would run against a page holding
  // none of what it names.
  await addTier(supabase, seeded.id, { ...HOUSE_DEFAULT, isDefault: true })
  groupSpecial = await addTier(supabase, seeded.id, GROUP_SPECIAL)

  apple = await addHorse(supabase, seeded.id, APPLE)
  butter = await addHorse(supabase, seeded.id, BUTTER)
  clover = await addHorse(supabase, seeded.id, CLOVER)
  daisy = await addHorse(supabase, seeded.id, DAISY, {
    isAvailable: false,
    unavailabilityReason: DAISY_REASON,
  })
  willow = await addHorse(supabase, seeded.id, WILLOW)

  trainerMembershipId = members.trainer.membershipId
  riderMembershipId = members.rider.membershipId
  rider2MembershipId = members.rider2.membershipId

  // The asymmetric load the least-to-most-worked order is read off. Butter is deliberately absent
  // from this pair.
  for (const [horse, offset, exertion] of [
    [apple, APPLE_LESSON_OFFSET, APPLE_EXERTION],
    [clover, CLOVER_LESSON_OFFSET, CLOVER_EXERTION],
  ] as const) {
    await addUnpaidLesson(supabase, seeded, {
      at: daysFromNow(offset, seeded.timezone),
      time: SEEDED_LESSON_TIME,
      instructorId: trainerMembershipId,
      horseIds: [horse.id],
      exertionLevels: [exertion],
      riderIds: [riderMembershipId],
      fee: HOUSE_DEFAULT.price,
      tierName: HOUSE_DEFAULT.name,
    })
  }

  // Willow's pair: the lesson whose edit page the second checklist run opens, and the neighbour
  // that gives Willow a non-zero total once the edit page excludes the first from its own window.
  willowLesson = await addUnpaidLesson(supabase, seeded, {
    at: daysFromNow(WILLOW_LESSON_OFFSET, seeded.timezone),
    time: SEEDED_LESSON_TIME,
    instructorId: trainerMembershipId,
    horseIds: [willow.id],
    exertionLevels: [3],
    riderIds: [riderMembershipId],
    fee: HOUSE_DEFAULT.price,
    tierName: HOUSE_DEFAULT.name,
  })
  await addUnpaidLesson(supabase, seeded, {
    at: daysFromNow(WILLOW_HISTORY_OFFSET, seeded.timezone),
    time: SEEDED_LESSON_TIME,
    instructorId: trainerMembershipId,
    horseIds: [willow.id],
    exertionLevels: [WILLOW_HISTORY_EXERTION],
    riderIds: [riderMembershipId],
    fee: HOUSE_DEFAULT.price,
    tierName: HOUSE_DEFAULT.name,
  })

  // Retiring Willow, inline and last.
  //
  // Inline because no builder reaches this column: `HorseOptions` carries `isAvailable`
  // (`is_available`, which is Daisy's case above) and nothing that writes `is_active` — the two are
  // different columns with different sort consequences, and `is_active` appears nowhere in
  // support/fixtures.ts. Not routed through `updateHorseDetails` either, which is the DAL function
  // the Horses page calls: it takes no client parameter, so a service-role client cannot be
  // injected into it. What is left is the write `scripts/seed-barn.ts` itself performs to retire
  // its own Willow, mirrored here including `deactivated_at`.
  //
  // Last for the standing mid-chain reason, and not for a constraint that does not exist:
  // `create_lesson_with_participants` never looks at `is_active`, so seeding these two lessons
  // after the retirement would have succeeded. It would have planted a midpoint the app itself
  // cannot produce, since the picker never offers a retired horse — retiring after the lessons is
  // the order a real barn reaches this state in.
  //
  // `mustAffect` with an exact 1 rather than `mustSucceed` (rule 5): every assertion in the second
  // checklist run depends on this row having been matched, and a PostgREST update that matches
  // nothing returns `data: [], error: null` — it would leave Willow active, put her in bucket 1
  // instead of bucket 2, and the "moves to the bottom" test would fail for a reason with no
  // relation to what it claims. One row, addressed by primary key, so the exact count is safe.
  mustAffect(
    await supabase
      .from('horses')
      .update({ is_active: false, deactivated_at: new Date().toISOString() })
      .eq('id', willow.id)
      .select('id'),
    'retire the inactive-horse fixture',
    1
  )
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** The barn's calendar day `delta` days from its today. Barn-framed and branded, never host-zone
 *  arithmetic on a Date — the fence `eslint.config.mjs` enforces. */
function barnDayOffset(delta: number): CalendarDate {
  return addDays(barnToday(barn.data.barn.timezone), delta)
}

/**
 * Opens the New Lesson form and blocks until React has taken it over.
 *
 * Copied in shape from e2e/support/lesson-form.ts's shared helper of the same name, whose
 * docstring reasons the choice of signal: every control touched afterwards is React-controlled, and
 * waiting on `#lesson-start-time` to merely *exist* proves nothing, since `dayPanelAlwaysOpen` puts
 * it in the server-rendered HTML. The barrier is the hidden `lesson_at` input carrying the
 * combination of the barn's today and the time just filled, which only client-side
 * `LessonStartTime` can write.
 *
 * `test.slow()` rather than a number on the wait: every `waitFor*` is unbounded already, so a
 * number could only tighten it (fact 1).
 */
async function openNewLessonForm(page: Page): Promise<void> {
  test.slow()
  const timezone = barn.data.barn.timezone
  await page.goto(newLessonPath(barn))
  await page.getByRole('heading', { level: 1, name: 'New Lesson' }).waitFor()

  const expected = wallClockToInstant(`${barnToday(timezone)}T${BARRIER_TIME}:00`, timezone).toISOString()
  await hydrateByDriving(
    () => page.locator('#lesson-start-time').fill(BARRIER_TIME),
    () =>
      page.evaluate((want) => {
        const el = document.querySelector('input[name="lesson_at"]')
        return el instanceof HTMLInputElement && el.value === want
      }, expected)
  )
  displayedMonth.set(page, String(barnToday(timezone)).slice(0, 7))
}

/**
 * Opens Willow's upcoming lesson's edit form, hydrated.
 *
 * `waitForEditFormHydrated` (support/lesson-pages.ts) waits on an ExhaustionBar, which is the right
 * signal for a second reason here beyond the hydration one its own docstring gives: a bar exists
 * only once the exertion projection has arrived, and every order assertion below is read out of the
 * same `exhaustionData` that projection populates. So the barrier doubles as the settle for the
 * picker's secondary sort, and nothing here reads an order that is still mid-fetch.
 */
async function openWillowEditForm(page: Page): Promise<void> {
  test.slow()
  await page.goto(editPath(barn, willowLesson.id))
  await waitForEditFormHydrated(page)
}

/**
 * The month each page's grid is currently showing.
 *
 * `calendarMonth` is `LessonForm` state that only the month arrows move, so it cannot be derived
 * from the day a test last picked, and two tests below cross a month boundary twice in opposite
 * directions within one page. Tracking it per page is what lets `pickDay` compute the direction and
 * the number of hops from wherever the grid actually is, rather than from the barn's today.
 */
const displayedMonth = new WeakMap<Page, string>()

/**
 * Selects a calendar day, paging the grid to that day's month first.
 *
 * Plain clicks on the arrows, deliberately not `hydrateByDriving`: a month button is *monotonic*,
 * not idempotent, so a retry loop whose read merely lagged one successful click would page a second
 * month and never satisfy its own predicate. `openNewLessonForm`'s barrier has already proved React
 * is listening, which is what makes one click enough.
 *
 * The day settle is the panel's rendered heading, not `aria-pressed`: React 19 does not reconcile an
 * attribute that mismatched at hydration, and #1252 measured exactly that on these cells.
 */
async function pickDay(page: Page, day: CalendarDate): Promise<void> {
  const target = String(day).slice(0, 7)
  let current = displayedMonth.get(page)!
  while (current !== target) {
    const forward = target > current
    await page.getByRole('button', { name: forward ? 'Next month' : 'Previous month', exact: true }).click()
    current = shiftMonth(current, forward ? 1 : -1)
    await page.getByText(formatMonthHeading(current), { exact: true }).waitFor()
  }
  displayedMonth.set(page, current)

  await page.getByRole('button', { name: String(day), exact: true }).click()
  await page.getByText(formatCalendarDate(day), { exact: true }).waitFor()
}

/** One horse's checkbox, addressed by the id its builder returned. See the header block for why
 *  this is CSS rather than `getByRole`. */
function horseCheckbox(page: Page, horse: Horse): Locator {
  return page.locator(`input[type="checkbox"][name="horse_id"][value="${horse.id}"]`)
}

/** The horse picker's `<fieldset>`, addressed by the control it contains rather than by position —
 *  it holds `input[name="horse_id"]` in both Normal and Group mode, so this resolves to the same
 *  element in the state the legend claim is about and in the state it is not. */
function horseFieldset(page: Page): Locator {
  return page.locator('fieldset:has(input[name="horse_id"])')
}

/** Every exhaustion bar currently rendered. The bar is a button whose accessible name states its
 *  own totals, so this needs no test id and no class. */
function bars(page: Page): Locator {
  return page.getByRole('button', { name: /^Exhaustion: / })
}

/**
 * Blocks until the projection for the day just picked has actually replaced the one for the day
 * just left.
 *
 * A bar *count* cannot do this, and that is the whole reason this exists. `pickDay` settles on the
 * calendar's own day-panel heading, but `lessonAt` is not updated in that commit — it is written
 * one commit later by `LessonStartTime`'s `onChange` effect, and `exhaustionByHorseId` is keyed on
 * `lessonAt`, so until the effect flushes the *previous* instant's projection is still on screen.
 * Three bars render in every future window this file selects, so `toHaveCount(3)` is satisfied by
 * the stale render and by the fresh one alike — a shared signal, which is exactly what fact 11's
 * settle clause warns against, and the read it guards (`renderedHorseOrder`) is one-shot.
 *
 * Apple's total discriminates them: its single seeded lesson sits inside the +4..+10 window the
 * TARGET_OFFSET day is read through and outside every other window this file selects, so this name
 * can only be produced by the projection for that day. Both numbers come from the seed.
 */
function settleProjection(page: Page): Promise<void> {
  return expect(
    page.getByRole('button', {
      name: `Exhaustion: ${APPLE_EXERTION} points from 1 lessons`,
      exact: true,
    })
  ).toBeVisible({ timeout: EXHAUSTION_FETCH_BUDGET })
}

/**
 * Willow's bar specifically, by the totals only Willow's bar can carry.
 *
 * On the edit page the projection excludes the lesson being edited, so Willow's remaining row is
 * the single WILLOW_HISTORY_OFFSET lesson and every other bar on the page reads "0 points from 0
 * lessons". Both numbers come from the seed rather than from a literal.
 */
function willowBar(page: Page): Locator {
  return page.getByRole('button', {
    name: `Exhaustion: ${WILLOW_HISTORY_EXERTION} points from 1 lessons`,
    exact: true,
  })
}

/**
 * The picker's rendered order, as horse ids.
 *
 * `evaluateAll` is one-shot and does not auto-retry, so an unsettled read yields `[]` and any
 * assertion that happens to accept an empty array passes on nothing (#1243). support/read.ts wraps
 * `allInnerTexts`/`allTextContents` for exactly this and leaves `evaluateAll` its inline guard, so
 * the guard belongs here — and it doubles as an assertion, since `waitFor` throws on timeout rather
 * than letting a picker that rendered nothing satisfy an order claim.
 *
 * Ids rather than the rendered labels: a label carries an unavailable horse's reason and an inactive
 * horse's "(inactive)" suffix, so an order expressed in names would have to be spelled differently
 * per page for the same list.
 */
async function renderedHorseOrder(page: Page): Promise<string[]> {
  const boxes = page.locator('input[type="checkbox"][name="horse_id"]')
  await boxes.first().waitFor()
  return boxes.evaluateAll((els) => els.map((el) => (el as HTMLInputElement).value))
}

/** Ticks a horse, settling on the per-horse exertion input — `useState`-gated markup that cannot
 *  exist until React has the horse checked. */
async function checkHorse(page: Page, horse: Horse): Promise<void> {
  await horseCheckbox(page, horse).check()
  await page.locator(`#exertion_${horse.id}`).waitFor()
}

// ---------------------------------------------------------------------------
// The group lesson, and the fee-driven Payment Type field
// ---------------------------------------------------------------------------

test('group_lesson_horse_picker_legend_reads_select_at_least_one @manager', async ({ page }) => {
  await openNewLessonForm(page)
  await page.getByRole('button', { name: 'Group', exact: true }).click()
  // Settled on the rider checkboxes, which replace the Normal mode `<select>` — deliberately not on
  // the legend, which is what this test claims.
  await page.locator('input[type="checkbox"][name="rider_id"]').first().waitFor()

  await expect(horseFieldset(page).locator('legend')).toHaveText(GROUP_HORSE_LEGEND)

  // The rest of the checklist line: it says *create* a group lesson, so the form is driven all the
  // way through rather than toggled and read. `submitNewLesson`'s redirect is the save proof.
  await page.locator('#tier_name').selectOption(groupSpecial.id)
  await expect(page.locator('#tier_name')).toHaveValue(groupSpecial.id)
  await page.locator('#instructor_id').selectOption(trainerMembershipId)
  await checkHorse(page, butter)
  for (const riderId of [riderMembershipId, rider2MembershipId]) {
    await page.locator(`input[type="checkbox"][name="rider_id"][value="${riderId}"]`).check()
  }
  await pickDay(page, barnDayOffset(GROUP_LESSON_OFFSET))
  await submitNewLesson(page, barn)
})

// Absence, so it carries a same-page-state positive anchor on the identical locator (rule 4): the
// Payment Type field is read once while the fee is still the default tier's price, and again after
// the fee moves to zero. Without it `toHaveCount(0)` is satisfied on its first poll (fact 18) and
// would be equally green on a form that never rendered — which is the specific trap the issue names
// for this line.
test('setting_the_fee_to_zero_removes_the_payment_type_field @manager', async ({ page }) => {
  await openNewLessonForm(page)
  const paymentType = page.locator('#payment_type')
  await expect(paymentType).toBeVisible()

  await page.locator('#fee').fill(ZERO_FEE)

  await expect(paymentType).toHaveCount(0)
})

test('raising_the_fee_above_zero_restores_the_payment_type_field @manager', async ({ page }) => {
  await openNewLessonForm(page)
  // The guard below is itself an absence assertion, so rule 4 binds it too — it gets its own
  // same-page-state anchor on the identical locator, exactly as the sibling test's claim does.
  await expect(page.locator('#payment_type')).toBeVisible()

  await page.locator('#fee').fill(ZERO_FEE)
  // A guard, not the claim: without it a Payment Type field that had never gone away would satisfy
  // the assertion below.
  await expect(page.locator('#payment_type')).toHaveCount(0)

  await page.locator('#fee').fill(RESTORED_FEE)

  await expect(page.locator('#payment_type')).toBeVisible()
})

// ---------------------------------------------------------------------------
// The unavailable horse: disabled, and where it sorts
// ---------------------------------------------------------------------------
//
// Two checkboxes about one horse, asserted separately because they fail independently: a horse can
// render disabled and still sort into the available group, and vice versa.

test('an_unavailable_horse_renders_disabled_in_the_horse_picker @manager', async ({ page }) => {
  await openNewLessonForm(page)

  await expect(horseCheckbox(page, daisy)).toBeDisabled()
})

test('an_unavailable_horse_sorts_below_every_available_horse @manager', async ({ page }) => {
  await openNewLessonForm(page)
  await pickDay(page, barnDayOffset(TARGET_OFFSET))
  await settleProjection(page)

  const order = await renderedHorseOrder(page)

  // "Below every available horse", not "last": bucket 2 holds every unavailable *and* inactive
  // horse, and which of them is literally last is decided by the secondary exertion sort and, on a
  // tie, by input order. The checklist line was narrowed to this in the same PR — see its own note.
  expect(order.indexOf(daisy.id)).toBeGreaterThan(
    Math.max(...[apple, butter, clover].map((h) => order.indexOf(h.id)))
  )
})

test('checking_a_horse_moves_it_above_the_unchecked_available_horses @manager', async ({ page }) => {
  await openNewLessonForm(page)
  await pickDay(page, barnDayOffset(TARGET_OFFSET))
  await settleProjection(page)

  // The "(ordered least-to-most worked)" half of the same checkbox, and the precondition that makes
  // the other half a real transition: Apple is the *most* worked of the three, so it starts last of
  // the available group and cannot reach the top by standing still.
  expect(await renderedHorseOrder(page)).toEqual([butter.id, clover.id, apple.id, daisy.id])

  await checkHorse(page, apple)

  await expect
    .poll(() => renderedHorseOrder(page), { timeout: EXHAUSTION_FETCH_BUDGET })
    .toEqual([apple.id, butter.id, clover.id, daisy.id])
})

// ---------------------------------------------------------------------------
// The bars a past start instant removes
// ---------------------------------------------------------------------------

// Absence, anchored in the same test on the identical locator (rule 4): the bars are counted on the
// future day before the grid is paged back.
//
// The limit that anchor does *not* close, stated rather than papered over: a changed start instant
// clears `exhaustionByHorseId` until the refetch for the new instant lands, so the count is zero
// transiently as well as permanently, and there is no observable settle for "the projection for a
// past date resolved" — nothing renders from it. What the anchor rules out is the hole rule 4 is
// about, a page that never drew the picker at all; the sibling test below is what proves the bars
// come back, so a locator that stopped matching anything could not pass both.
test('a_past_start_instant_renders_no_exhaustion_bars @manager', async ({ page }) => {
  await openNewLessonForm(page)
  await pickDay(page, barnDayOffset(TARGET_OFFSET))
  await settleProjection(page)
  await expect(bars(page)).toHaveCount(AVAILABLE_BAR_COUNT)

  await pickDay(page, barnDayOffset(PAST_OFFSET))

  await expect(bars(page)).toHaveCount(0)
})

// The future day is selected explicitly before the past one, rather than the test leaning on the
// form's opening state, and that is not ceremony: `openNewLessonForm` pins the start time to
// BARRIER_TIME on the barn's *today*, so on any run after that hour the form opens already-past
// and renders no bars at all. Anchoring on the opening state would therefore assert nothing for
// most of the day, and the zero-guard below — itself an absence assertion, so bound by rule 4 —
// would be satisfied without a bar ever having been drawn. Going future → past → future makes the
// round trip the checklist line names the thing actually asserted.
test('returning_the_start_instant_to_the_future_restores_the_exhaustion_bars @manager', async ({
  page,
}) => {
  await openNewLessonForm(page)
  await pickDay(page, barnDayOffset(TARGET_OFFSET))
  await settleProjection(page)
  await expect(bars(page)).toHaveCount(AVAILABLE_BAR_COUNT)

  await pickDay(page, barnDayOffset(PAST_OFFSET))
  // A guard, not the claim: without it the assertion below would be equally green on a form whose
  // bars had never gone away.
  await expect(bars(page)).toHaveCount(0)

  await pickDay(page, barnDayOffset(TARGET_OFFSET))

  await expect(bars(page)).toHaveCount(AVAILABLE_BAR_COUNT, { timeout: EXHAUSTION_FETCH_BUDGET })
})

// ---------------------------------------------------------------------------
// The inactive horse on its own lesson's edit form
// ---------------------------------------------------------------------------
//
// Willow is absent from the New Lesson form entirely — `getHorsesByBarn` filters `is_active` — and
// reaches this page only because the edit route re-adds an inactive horse the lesson already names,
// renamed "Willow (inactive)". Every claim below is about that re-added row.

test('an_inactive_horse_on_its_lessons_edit_page_is_still_checked @manager', async ({ page }) => {
  await openWillowEditForm(page)

  await expect(horseCheckbox(page, willow)).toBeChecked()
})

test('the_checked_inactive_horse_sorts_first_in_the_edit_pages_picker @manager', async ({ page }) => {
  await openWillowEditForm(page)

  // First despite being inactive, which is the whole point: `horseSortBucket` consults `checked`
  // before it consults `is_active`, so bucket 0 wins over the bucket 2 that the same horse falls to
  // the moment it is unchecked, two tests below.
  expect((await renderedHorseOrder(page))[0]).toBe(willow.id)
})

test('the_checked_inactive_horse_still_renders_its_exhaustion_bar @manager', async ({ page }) => {
  await openWillowEditForm(page)

  await expect(willowBar(page)).toBeVisible()
})

test('unchecking_the_inactive_horse_moves_it_to_the_bottom_of_the_picker @manager', async ({
  page,
}) => {
  await openWillowEditForm(page)
  // A guard, not the claim: a horse that was already at the bottom could not be observed moving
  // there.
  expect((await renderedHorseOrder(page))[0]).toBe(willow.id)

  await horseCheckbox(page, willow).uncheck()

  // Both halves of the line in one comparison — "moves to the bottom" and "(grouped with
  // Unavailable)" — since Daisy is the barn's only other bucket-2 horse and Willow's seeded history
  // puts it after her.
  await expect
    .poll(async () => (await renderedHorseOrder(page)).slice(-2), { timeout: EXHAUSTION_FETCH_BUDGET })
    .toEqual([daisy.id, willow.id])
})

// Absence, anchored in the same test on the identical locator (rule 4). Unlike the past-date pair
// above there is no transient here: unchecking is synchronous React state, and `uncheck()` does not
// resolve until the controlled input reports itself unchecked — which only a committed re-render
// can produce.
test('unchecking_the_inactive_horse_removes_its_exhaustion_bar @manager', async ({ page }) => {
  await openWillowEditForm(page)
  await expect(willowBar(page)).toBeVisible()

  await horseCheckbox(page, willow).uncheck()

  await expect(willowBar(page)).toHaveCount(0)
})
