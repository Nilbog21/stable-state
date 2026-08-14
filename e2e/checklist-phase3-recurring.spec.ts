// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-form-parsing.ts
// covers: src/lib/db/lessons.ts
// covers: src/lib/db/lesson-series.ts
// covers: src/components/calendar/MonthCalendarPicker.tsx
// covers: src/lib/barn-timezone.ts
// covers: src/lib/local-day.ts
//
// Phase 3's recurring-lesson block (checklists/pre-release/phase-3-manager-lesson-entry.md, from
// "Check **Recurring (weekly)** — the Date field label changes to "Starting Date"" through "The
// lesson itself keeps its **Recurring** badge after stopping"): the checkbox's effect on the date
// field's label and its placement above that field, the recurring lesson created through the form,
// the **Recurring** badge on the list row and the detail page, and the "part of a recurring series"
// indicator and **Stop Recurring Lessons** button appearing on the edit page and disappearing once
// the series is stopped — while the lesson keeps its badge.
//
// Adjacent prior art, not a duplicate of it: checklist-phase5-lessons-cancel.spec.ts owns the
// *trainer's* copies of the badge, indicator and Stop-button lines, against a hand-planted
// `lesson_series` row. Everything here is the manager's, and every row under test is produced by
// the app itself — the series by `submitLesson`'s `createLessonSeries` branch, the stop by the
// button. The two files' locator *shapes* are shared deliberately (see `lessonForm`/`seriesBlock`
// below); their fixtures and personas are not.
//
// ## Why nothing is seeded through `create_lesson_series_with_participants` directly
//
// #1465 permits a slice to open mid-chain by calling the RPC the form submits. This one does not
// need to: "Create a **recurring lesson** … it saves" is itself a checkbox, so the series has to
// come through the form anyway, and every line below it in the checklist is about *that* lesson.
// Seeding a second series would mean asserting the read and stop lines against a lesson the
// checklist does not describe, for no gain.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Not an oversight, and the reason is structural rather than local. Spec-maintenance rule 5 binds
// a fixture `.update(`/`.delete(` whose zero-row result would go unnoticed; this file's seed
// callback contains neither. It contains `addTier` twice and `addHorse` once (called with no
// options, so its conditional second write never fires) — all insert-only. The one state
// transition asserted across, stopping the series, is a checkbox in its own right and is therefore
// driven **through the UI**, not reseeded by mutation.
//
// The general form, worth stating because five sibling slices reported the same zero: a slice that
// opens at the *top* of its chain has no predecessor state to reseed, so rule 5 has nothing to
// bind to however it is written. That is a different mechanism from the one #1454 reported (rule
// 3 converts a would-be `.update()` into an RPC call, which `mustAffect` cannot take), reaching
// the same place.
//
// ## Why the badge-kept line is asserted on the detail page and not "on the same reload"
//
// #1465's acceptance criteria ask for the **Recurring** badge to be asserted on the same reload
// that proves the indicator and the Stop button are gone. No such reload exists:
// `lessons/[id]/edit/page.tsx` renders no badge at all — the badge is rendered only by
// `LessonListItem` and `lessons/[id]/page.tsx`, while the indicator and the button live only on
// the edit page. What the criterion is protecting is that the badge is read against
// genuinely-stopped state rather than against declaration-order luck, and
// `the_stopped_lesson_keeps_its_recurring_badge_on_its_detail_page` closes that directly: it reads
// `lesson_series.is_active` as a precondition, so a reordering that ran it before the stop fails
// there instead of passing vacuously. The checklist line itself ("The lesson itself **keeps** its
// **Recurring** badge after stopping") is true as written and is not narrowed.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import { detailHeader, lessonCards } from './support/lesson-pages'
import { mustSucceed } from '@/lib/db/service-role'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'
import { addDays, calendarDate, formatCalendarDate, formatMonthHeading } from '@/lib/local-day'
import type { CalendarDate, Horse, LessonTier } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// The barn this file seeds, and why each piece of it is there
// ---------------------------------------------------------------------------

/** The checklist names this horse; it is also the barn's only one, so the single lesson created
 *  below is the list's only card and can be reached without any filter. */
const APPLE = 'Apple'

/** The named tier the checklist calls Beginner. Its id is read back off `addTier`'s return
 *  everywhere below, never re-typed. */
const BEGINNER = { name: 'Beginner', price: 60 }

/**
 * The barn's *default* tier, load-bearing rather than scenery. `LessonForm` seeds `selectedId`
 * from `tiers.find(t => t.is_default)`, so without a second, defaulted tier the form would already
 * be on Beginner when it opened and "Beginner tier" would be a selection that never happened. The
 * $90 price also keeps the two tiers' prefills distinguishable.
 */
const HOUSE_DEFAULT = { name: 'Group Special', price: 90 }

/** How far out the checklist dates the recurring lesson. */
const DAYS_AHEAD = 7

// The two states of `MonthCalendarPicker`'s `label` prop, which is what these checkboxes are about.
const DATE_LABEL = 'Date'
const STARTING_DATE_LABEL = 'Starting Date'

// The strings the app renders. `RECURRING_CHECKBOX` is an `aria-label` rather than visible text —
// `LessonForm` labels the input that way and prints the same words beside it.
const RECURRING_CHECKBOX = 'Recurring (weekly)'
const RECURRING_BADGE = 'Recurring'
const RECURRING_INDICATOR = 'This is part of a recurring series'
const STOP_SERIES_BUTTON = 'Stop Recurring Lessons'

/**
 * `stopLessonSeriesAction` ends in `redirect()`, so its POST answers 303 — which is what separates
 * it from the two Server Action POSTs `LessonForm` fires to this same URL at hydration. See the
 * stop test's comment; the full statement is framework fact 14.
 */
const STOP_SERIES_REDIRECT_STATUS = 303

/**
 * Barn-local wall clock typed into the start-time field purely as a hydration barrier. Its minutes
 * must not be `:00`: `LessonStartTime` defaults `time` to the top of the barn's current hour and
 * runs that initializer on the server too, so an `HH:00` barrier already matches for one hour a
 * day, the fill is never dispatched, and the barrier resolves having proved nothing.
 */
const BARRIER_TIME = '10:37'

let beginner: LessonTier
let apple: Horse
let trainerMembershipId: string
let riderMembershipId: string

/**
 * The barn-local day the recurring lesson is created on, and the month the grid may have to be
 * paged forward to reach it.
 *
 * `barnToday` + `local-day.ts`'s `addDays` rather than any arithmetic on a host-zone `Date`: a
 * calendar date is zoneless (#1223), and adding `7 × 24h` to an instant drifts by a DST
 * transition's offset change. The pair is computed once in the seed callback so every test names
 * the same day even if the run crosses barn midnight.
 */
let targetDay: CalendarDate
let targetMonth: string
let todayMonth: string

/** Captured by the create test; every test after it addresses this lesson. */
let createdLessonId = ''

const barn = withBarn('phase3-recurring', async ({ supabase, barn: seeded, members }) => {
  // Not decoration: `LessonForm` short-circuits its whole render to "No lesson tiers have been
  // configured…" on a tier-less barn, so every assertion below would run against a page holding
  // none of what it names.
  await addTier(supabase, seeded.id, { ...HOUSE_DEFAULT, isDefault: true })
  beginner = await addTier(supabase, seeded.id, BEGINNER)

  apple = await addHorse(supabase, seeded.id, APPLE)

  // The two fixture members standing in for the checklist's "trainer Alex" and "rider Dana" — the
  // barn's own seeded people, as in checklist-phase3-lesson-fees.spec.ts.
  trainerMembershipId = members.trainer.membershipId
  riderMembershipId = members.rider.membershipId

  const today = calendarDate(barnToday(seeded.timezone))
  targetDay = addDays(today, DAYS_AHEAD)
  targetMonth = targetDay.slice(0, 7)
  todayMonth = today.slice(0, 7)
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function newLessonPath(): string {
  return `/barn/${barn.slug}/lessons/new`
}

function detailPath(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}`
}

function editPath(lessonId: string): string {
  return `${detailPath(lessonId)}/edit`
}

/** The **Recurring (weekly)** checkbox itself. */
function recurringCheckbox(page: Page): Locator {
  return page.getByRole('checkbox', { name: RECURRING_CHECKBOX, exact: true })
}

/**
 * The `<label>` wrapping that checkbox, addressed through the hidden field it also contains —
 * which is the element whose position "sits directly above the date field" is a claim about.
 */
function recurringLabel(page: Page): Locator {
  return page.locator('label:has(input[name="is_recurring"])')
}

/**
 * The date field's own label, which is `MonthCalendarPicker`'s `label` prop and the thing these
 * two checkboxes claim changes.
 *
 * Reached by walking up from the month-nav button — `button[aria-label="Previous month"]` sits in
 * the picker's header row, whose parent is the bordered grid box, whose preceding sibling is the
 * label `<span>`. That path is stated in DOM terms rather than by class, and it is what stops this
 * locator from resolving to some other "Date" text on the form.
 */
function dateFieldLabel(page: Page): Locator {
  return page
    .locator('button[aria-label="Previous month"]')
    .locator('xpath=../../preceding-sibling::span[1]')
}

/**
 * `LessonForm`'s own `<form>`, disambiguated from `StopSeriesButton`'s by the fact that only one
 * of the two contains a `<textarea>`. Both are plain `<form>` elements under `<main>` on a
 * recurring lesson's edit page.
 *
 * Copied in shape from checklist-phase5-lessons-cancel.spec.ts, which states the reasoning in
 * full, rather than hoisted into `support/lesson-pages.ts`: `e2e/support/**` is in
 * `scripts/select-specs.sh`'s `ALWAYS_FULL`, so editing it would force `mode=full` and take the
 * fleet-wide suite mutex for two locators.
 */
function lessonForm(page: Page): Locator {
  return page.locator('main form:has(textarea)')
}

/**
 * The recurring-series block — the indicator paragraph and the Stop button — addressed as the
 * `<div>` immediately preceding the lesson form. That adjacency is what gives "That edit page
 * **also** shows a **Stop Recurring Lessons** button" a subject: a Stop control rendered anywhere
 * else on the page falls outside this locator. Safe to read positionally because
 * `HorseStatusBanner` renders `null` for this barn (Apple is active and available), so nothing
 * else sits between the `<h1>` and the form.
 *
 * Used only for the two *presence* lines. The absence lines below scope to `main` instead — an
 * absence asserted inside a locator derived from the block being removed would be satisfied by the
 * block's own disappearance rather than by the element's.
 */
function seriesBlock(page: Page): Locator {
  return lessonForm(page).locator('xpath=preceding-sibling::div[1]')
}

// ---------------------------------------------------------------------------
// Drives
// ---------------------------------------------------------------------------

/**
 * Opens the New Lesson form and blocks until React has taken it over.
 *
 * Every control this file touches afterwards is React-controlled — the recurring checkbox, the
 * tier `<select>`, the horse checkboxes, the rider `<select>` and the calendar's day buttons all
 * read from `useState` — so a click landing before hydration is either lost outright or is
 * overwritten the moment React reconciles (facts 9 and 10). Waiting on `#lesson-start-time` to
 * merely *exist* would prove nothing: since #1021 the day panel is `dayPanelAlwaysOpen`, so that
 * input is in the server-rendered HTML. The barrier therefore waits on the hidden `lesson_at`
 * input carrying the combination of the barn's today and the time just entered, which only
 * client-side `LessonStartTime` can write.
 *
 * `test.slow()` rather than a number on any wait: every `waitFor*` is unbounded already, so a
 * number could only tighten it (fact 1). Body and reasoning from
 * checklist-phase3-lesson-fees.spec.ts's `openNewLessonForm`.
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
 * Ticks **Recurring (weekly)**, settling on the hidden field the form actually submits rather than
 * on the checkbox's own `checked` state — `is_recurring` is what `submitLesson` branches on, so a
 * checkbox whose change handler stopped writing it would still settle if the settle read the box.
 */
async function checkRecurring(page: Page): Promise<void> {
  await recurringCheckbox(page).check()
  await expect(page.locator('input[name="is_recurring"]')).toHaveValue('true')
}

/** Picks a named tier, settling on the `<select>`'s own value. */
async function selectTier(page: Page, tierId: string): Promise<void> {
  await page.locator('#tier_name').selectOption(tierId)
  await expect(page.locator('#tier_name')).toHaveValue(tierId)
}

/**
 * Pages the grid forward when the target day is in next month and taps that day.
 *
 * The month test is on the *seeded* pair rather than on whatever the header reads, so it makes one
 * click or none — deterministic, unlike a retry loop around a monotonic control (`Next month` is
 * not idempotent, so a loop whose read merely lagged one successful click would page a second
 * month forward and never satisfy itself). `openNewLessonForm`'s barrier has already proved React
 * is listening, which is what makes the single click enough.
 *
 * The day settle is the panel's rendered heading, not `aria-pressed`: React 19 does not reconcile
 * an attribute that mismatched at hydration, and #1252 measured exactly that on these cells.
 */
async function pickTargetDay(page: Page): Promise<void> {
  if (targetMonth !== todayMonth) {
    await page.getByRole('button', { name: 'Next month' }).click()
    await page.getByText(formatMonthHeading(targetMonth), { exact: true }).waitFor()
  }
  await page.getByRole('button', { name: targetDay, exact: true }).click()
  await page.getByText(formatCalendarDate(targetDay), { exact: true }).waitFor()
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
 * from — and it doubles as the "it saves" half of the create checkbox: `submitLesson` re-renders
 * the form with a `role="alert"` and no navigation on every failure path, and only redirects on
 * success.
 */
async function submitNewLesson(page: Page): Promise<void> {
  const submit = page.getByRole('button', { name: 'Submit', exact: true })
  await submit.focus()
  await submit.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
}

/**
 * Walks from the Lessons list to the barn's only lesson's edit form, the way a manager reaches it,
 * and reports that lesson's id.
 *
 * No filter pill is clicked and no query param is typed: this barn holds exactly one lesson, so
 * the list's default `all` view shows one card and `lessonCards`' strict-mode click is what
 * enforces that — a second match fails the test rather than picking whichever came first.
 *
 * The `#tier_name` wait after the second navigation is render proof, not decoration:
 * `waitUntil: 'commit'` resolves before the document renders, so a 500 at the right URL would
 * satisfy the URL half on its own.
 */
async function openEditFormForOnlyLesson(page: Page): Promise<string> {
  await lessonCards(page).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
  const lessonId = page.url().split('/').pop()!

  await page.getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/lessons\/[0-9a-f-]{36}\/edit$/, { waitUntil: 'commit' })
  await page.locator('#tier_name').waitFor()

  return lessonId
}

/**
 * What the created lesson's edit form holds, as one object.
 *
 * Read together and asserted as a single `toEqual` because the checkbox is a conjunction — "dated
 * 7 days out … Beginner tier, trainer Alex, horse Apple, rider Dana" is five claims about one
 * lesson, and splitting them would let four pass while the fifth silently named a different
 * lesson.
 *
 * Called inside `expect.poll`, which is what makes the composite safe: every member read here is
 * **one-shot**. `inputValue()` and `getAttribute()` do not retry once they have an element, and
 * `evaluateAll` does not retry at all — it yields `[]` on an unsettled page, which is rule 3's
 * pass-on-nothing hazard. The poll re-reads the whole object instead. Body from
 * checklist-phase3-lesson-fees.spec.ts's `editFormSelection`.
 *
 * `aria-pressed` is safe to read here — the server and the client compute it from the same
 * `initialLesson` prop, so fact 7's non-reconciliation has no mismatch to preserve, and nothing on
 * this page ever changes the selected day.
 */
async function editFormSelection(page: Page) {
  return {
    day: await page.locator('button[data-past][aria-pressed="true"]').getAttribute('aria-label'),
    tier: await page.locator('#tier_name').inputValue(),
    instructor: await page.locator('#instructor_id').inputValue(),
    horses: await page
      .locator('input[name="horse_id"]')
      .evaluateAll((els) =>
        els
          .filter((el) => (el as HTMLInputElement).checked)
          .map((el) => (el as HTMLInputElement).value)
      ),
    rider: await page.locator('#rider_id').inputValue(),
  }
}

/**
 * Whether this barn's one series is still running, read service-role.
 *
 * A **precondition** read and never an expected answer: the badge-kept test asserts what the page
 * renders, and uses this only to pin that it is rendering it against stopped state.
 */
async function seriesIsActive(): Promise<boolean> {
  const row = mustSucceed<{ is_active: boolean }>(
    await barn.data.supabase
      .from('lesson_series')
      .select('is_active')
      .eq('barn_id', barn.data.barn.id)
      .single(),
    'read the barn lesson series'
  )
  return row.is_active
}

// ---------------------------------------------------------------------------
// The checkbox and the date field's label — three claims about the New Lesson form alone
// ---------------------------------------------------------------------------

test.describe('New Lesson — the Recurring (weekly) checkbox and the date field', () => {
  test('checking_recurring_relabels_the_date_field_to_starting_date @manager', async ({ page }) => {
    await openNewLessonForm(page)
    await recurringCheckbox(page).check()

    await expect(dateFieldLabel(page)).toHaveText(STARTING_DATE_LABEL)
  })

  // The `Starting Date` read is a precondition, not a duplicate of the test above: "reverts" is
  // satisfied by a label that never changed, so without proving the label moved first this would
  // pass against a checkbox whose handler had been dropped entirely.
  test('unchecking_recurring_reverts_the_date_field_label_to_date @manager', async ({ page }) => {
    await openNewLessonForm(page)
    await recurringCheckbox(page).check()
    await expect(dateFieldLabel(page)).toHaveText(STARTING_DATE_LABEL)

    await recurringCheckbox(page).uncheck()

    await expect(dateFieldLabel(page)).toHaveText(DATE_LABEL)
  })

  // "Directly above" read as both halves it claims. *Directly*: the element immediately following
  // the checkbox's own `<label>` is the date field itself — proved by that element carrying the
  // picker's label `<span>` and its month nav, so a wrapper or a field inserted between the two
  // fails here. *Above*: the checkbox's box ends before the field's begins, which is a geometric
  // reading DOM order alone cannot give.
  test('the_recurring_checkbox_sits_directly_above_the_date_field @manager', async ({ page }) => {
    await openNewLessonForm(page)

    const field = recurringLabel(page).locator('xpath=following-sibling::*[1]')
    await field.waitFor()

    const label = await field.locator('xpath=./span[1]').textContent()
    const monthNav = await field.locator('button[aria-label="Previous month"]').count()
    const checkboxBox = (await recurringCheckbox(page).boundingBox())!
    const fieldBox = (await field.boundingBox())!

    expect({ label, monthNav, above: checkboxBox.y + checkboxBox.height <= fieldBox.y }).toEqual({
      label: DATE_LABEL,
      monthNav: 1,
      above: true,
    })
  })
})

// ---------------------------------------------------------------------------
// The recurring lesson — creation, badges, the series block, and stopping it
// ---------------------------------------------------------------------------
//
// Serial, and ordered: every test below reads the lesson the create test made, and the last three
// read the state the stop test produced. Under `fullyParallel: false` declaration order is run
// order, and a failure anywhere restarts the worker and re-seeds the barn (fact 15) — so the first
// ✘ here is the finding and everything below it is noise until that one is fixed.

test.describe.serial('The recurring lesson — badges, series indicator and Stop Recurring', () => {
  // Every expectation is a builder return value, a seeded membership id, or the day computed in
  // the seed callback — nothing here is a string this file also typed into the form by hand.
  test('creating_a_recurring_lesson_stores_its_day_tier_instructor_horse_and_rider @manager', async ({
    page,
  }) => {
    await openNewLessonForm(page)
    await checkRecurring(page)
    await selectTier(page, beginner.id)
    await pickTargetDay(page)
    await page.locator('#instructor_id').selectOption(trainerMembershipId)
    await selectHorse(page, apple)
    await page.locator('#rider_id').selectOption(riderMembershipId)
    await submitNewLesson(page)

    createdLessonId = await openEditFormForOnlyLesson(page)

    await expect
      .poll(() => editFormSelection(page))
      .toEqual({
        day: targetDay,
        tier: beginner.id,
        instructor: trainerMembershipId,
        horses: [apple.id],
        rider: riderMembershipId,
      })
  })

  // Absence, so it carries a same-page-state positive anchor (rule 4): the tier select holding the
  // seeded Beginner id proves *this lesson's* edit form rendered, which a `waitForURL` or a bare
  // `goto` could not. Both spellings of the control are counted — the checkbox the manager would
  // tick and the hidden field `submitLesson` reads — because "doesn't appear when editing" is a
  // claim about the form's payload as much as about its surface.
  test('the_recurring_checkbox_is_absent_when_editing_the_recurring_lesson @manager', async ({
    page,
  }) => {
    await page.goto(editPath(createdLessonId))
    await page.locator('#tier_name').waitFor()

    const anchor = await page.locator('#tier_name').inputValue()
    const checkbox = await recurringCheckbox(page).count()
    const hidden = await page.locator('input[name="is_recurring"]').count()

    expect({ anchor, checkbox, hidden }).toEqual({ anchor: beginner.id, checkbox: 0, hidden: 0 })
  })

  // The card is addressed by the lesson it links to rather than by any text on it, so the badge
  // assertion is not selecting the element by the string it then asserts. The manager's list
  // defaults to `all` and the lesson is 7 days out, so it is in the main list rather than behind
  // `OlderLessonsToggle`, whose cutoff is backwards-looking — no pill click is needed to reach it.
  test('the_recurring_lesson_shows_a_recurring_badge_on_its_lessons_list_row @manager', async ({
    page,
  }) => {
    await page.goto(`/barn/${barn.slug}/lessons`)

    const card = page.locator(`main ul a[href$="/lessons/${createdLessonId}"]`)
    await expect(card.getByText(RECURRING_BADGE, { exact: true })).toBeVisible()
  })

  // Scoped to the header block rather than to `main`: the detail page's badges sit beside the
  // `<h1>`, and this line is about that row rather than about the word appearing anywhere.
  test('the_recurring_lesson_shows_a_recurring_badge_on_its_detail_page @manager', async ({
    page,
  }) => {
    await page.goto(detailPath(createdLessonId))

    await expect(detailHeader(page).getByText(RECURRING_BADGE, { exact: true })).toBeVisible()
  })

  test('the_edit_page_shows_the_part_of_a_recurring_series_indicator @manager', async ({ page }) => {
    await page.goto(editPath(createdLessonId))

    await expect(seriesBlock(page).getByText(RECURRING_INDICATOR, { exact: true })).toBeVisible()
  })

  test('the_edit_page_also_shows_the_stop_recurring_lessons_button @manager', async ({ page }) => {
    await page.goto(editPath(createdLessonId))

    await expect(
      seriesBlock(page).getByRole('button', { name: STOP_SERIES_BUTTON, exact: true })
    ).toBeVisible()
  })

  // `before` is captured only once the block has actually rendered, so a locator that were simply
  // wrong reports zero there and fails, instead of reading as a clean pass on `after`. The tier
  // value is rule 4's positive anchor and is read **after the reload**, on the same page state as
  // the absence — `before` cannot serve as one, since it belongs to the page the stop replaced.
  //
  // The synchronisation is a POST await followed by an explicit reload, and neither half is
  // optional. `stopLessonSeriesAction` redirects to the `/edit` URL it was already on, so
  // `waitForURL` would resolve against the current URL before it ever waited (fact 3); and a
  // Server Action POST resolving does not imply React has committed the resulting state (fact 8),
  // so the reload is what makes the second reading a reading of the server's new answer.
  //
  // **The POST await names *which* POST** (fact 14). This page issues three Server Action POSTs to
  // this one URL: `LessonForm`'s two mount effects fire `getProjectedExhaustion` and
  // `getScheduleRange` at hydration, and both post to the page's own URL exactly as the stop
  // submission does. Resolving on one of those lets `page.reload()` abort the stop's own in-flight
  // POST, so the mutation never runs — measured at 1-in-470 under 4-worker load by #1409, whose
  // full statement is `checklist-phase5-lessons-cancel.spec.ts`'s stop test. The discriminator is
  // the 303: `stopLessonSeriesAction` ends in `redirect()`, both hydration actions return data and
  // answer 200.
  //
  // The `dialog` handler answers `StopSeriesButton`'s `window.confirm` — the "Confirm and click"
  // half of this line. It is registered before the click and left in place: an unanswered dialog
  // blocks the page indefinitely.
  test('stopping_the_series_removes_the_recurring_series_indicator_on_reload @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(editPath(createdLessonId))
    const stopButton = seriesBlock(page).getByRole('button', { name: STOP_SERIES_BUTTON, exact: true })
    await stopButton.waitFor()
    const before = await page.locator('main').getByText(RECURRING_INDICATOR, { exact: true }).count()

    page.on('dialog', (dialog) => void dialog.accept())
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes(`/lessons/${createdLessonId}`) &&
          r.status() === STOP_SERIES_REDIRECT_STATUS
      ),
      stopButton.click(),
    ])
    await page.reload()
    await lessonForm(page).waitFor()

    const anchor = await page.locator('#tier_name').inputValue()
    const after = await page.locator('main').getByText(RECURRING_INDICATOR, { exact: true }).count()

    expect({ before, anchor, after }).toEqual({ before: 1, anchor: beginner.id, after: 0 })
  })

  // The checklist says "that same reload". A test gets its own `page`, so this is its own load of
  // the same post-stop state — sound because stopping a series is one-way and nothing between the
  // two tests can restart it, and because this test carries its own anchor rather than borrowing
  // the one above. Splitting rather than merging is the standing one-test-per-checkbox rule:
  // checklist-phase5-lessons-cancel.spec.ts merges its trainer copies of these two lines into one
  // test, but the indivisibility carve-out is for a pre-state that cannot be re-observed, and this
  // post-stop state persists.
  //
  // Scoped to `main`, not to `seriesBlock`: an absence read inside a locator derived from the
  // vanished block would be satisfied by the block's disappearance rather than by the button's.
  // The `<form>` count is the other half of the same discrimination — post-stop exactly one form
  // remains under `main`, `LessonForm`'s, so the form that hosted the button is gone rather than
  // merely emptied.
  test('the_stopped_series_edit_page_shows_no_stop_recurring_lessons_button @manager', async ({
    page,
  }) => {
    await page.goto(editPath(createdLessonId))
    await lessonForm(page).waitFor()

    const anchor = await page.locator('#tier_name').inputValue()
    const button = await page
      .locator('main')
      .getByRole('button', { name: STOP_SERIES_BUTTON, exact: true })
      .count()
    const forms = await page.locator('main form').count()

    expect({ anchor, button, forms }).toEqual({ anchor: beginner.id, button: 0, forms: 1 })
  })

  // The point of the line: stopping the series must not retroactively un-badge the lesson, because
  // `lessons.series_id` is untouched by `stopLessonSeries` — only `lesson_series.is_active` moves.
  // That column is read here as a **precondition**, which is what makes this a claim about the
  // post-stop state rather than about declaration order: a reordering that ran this before the
  // stop fails on `seriesActive` instead of passing on a badge that was never at risk. It is never
  // the expected answer — the badge is.
  test('the_stopped_lesson_keeps_its_recurring_badge_on_its_detail_page @manager', async ({
    page,
  }) => {
    const seriesActive = await seriesIsActive()

    await page.goto(detailPath(createdLessonId))
    await page.locator('main dl').waitFor()
    const badge = await detailHeader(page).getByText(RECURRING_BADGE, { exact: true }).count()

    expect({ seriesActive, badge }).toEqual({ seriesActive: false, badge: 1 })
  })
})
