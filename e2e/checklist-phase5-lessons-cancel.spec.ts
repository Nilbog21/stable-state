// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/lessons.ts
// covers: src/app/actions/lesson-cancellation.ts
// covers: src/components/ExhaustionBar.tsx
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import {
  addHorse,
  addTier,
  addUnpaidLesson,
  cancelLesson,
  E2E_USERS,
  E2E_STUB_RIDER,
} from './support/fixtures'
import { settledTextContents } from './support/read'
import { hydrateByDriving, waitForHydrated } from './support/hydration'
import { mustSucceed } from '@/lib/db/service-role'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

const TRAINER_NAME = `${E2E_USERS.trainer.firstName} ${E2E_USERS.trainer.lastName}`
const MANAGER_NAME = `${E2E_USERS.manager.firstName} ${E2E_USERS.manager.lastName}`
const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const STUB_RIDER_NAME = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`

// The app's own strings, quoted rather than imported: an expected value derived from the code
// under test agrees with any bug in it.
const RECURRING_BADGE = 'Recurring'
const RECURRING_INDICATOR = 'This is part of a recurring series'
const STOP_SERIES_BUTTON = 'Stop Recurring Lessons'
const CANCELLED_BADGE = 'Cancelled'
const CANCELLATION_NOTES_LABEL = 'Cancellation Notes'

/**
 * What a Server Action ending in `redirect()` answers with, and the only thing that tells
 * `stopLessonSeriesAction`'s POST apart from the two `LessonForm` fires on the same URL (#1409 —
 * see the stop test's comment). Not `< 400` as `checklist-phase4-settings-fields.spec.ts` uses:
 * that spec is discriminating a redirect from an error on a page with no competing action POSTs,
 * and here 200 is exactly the value that must not match.
 */
const STOP_SERIES_REDIRECT_STATUS = 303

/** Typed into the edit form's Cancellation Notes textarea, read back off the detail page. */
const SAVED_CANCELLATION_NOTE = 'Trainer cancelled — arena resurfacing ran long.'

/**
 * One distinct three-digit fee per lesson, none of them 0 and none of them TIER_PRICE.
 *
 * No assertion in this file reads a fee — the outcomes asserted here are badges, textareas and
 * button presence. The distinctness is kept anyway because it is free at seed time and it is what
 * makes a *failure* legible: a test that landed on the wrong lesson reports a page whose fee names
 * which lesson it actually reached, rather than one indistinguishable from six siblings.
 */
const FEES = {
  headerCancel: 401,
  otherInstructor: 402,
  riderSpot: 403,
  notesTextarea: 404,
  notesSave: 405,
  recurringRead: 406,
  recurringStop: 407,
} as const

type LessonKey = keyof typeof FEES

// Filled in by the seed.
const lessonIds: Record<LessonKey, string> = {} as Record<LessonKey, string>

/**
 * `new Date(ms)` is zone-free arithmetic on an instant — the eslint date fence bans the host's
 * calendar getters and the multi-argument constructor, neither of which appears here (and the
 * fence covers `src/**` only in any case).
 */
function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 60 * 60 * 1000)
}

/**
 * Every lesson here is +72h: comfortably future, so `isLessonCancellationEligible`'s *upcoming*
 * branch is what keeps the cancel page reachable rather than the unpaid escape hatch, and 48h
 * clear of the 24-hour late-cancellation boundary so no run length can drift one across it. This
 * slice makes no claim about that boundary — `checklist-phase4-lessons-cancel-normal.spec.ts` and
 * its group sibling own it — so a single distance is all this file needs.
 */
const FAR = () => hoursFromNow(72)

/**
 * Seven lessons and two `lesson_series` rows, one page state each, and **no `describe.serial`
 * anywhere**.
 *
 * Three of these ten tests mutate, and each of the three mutations is one-way: a cancelled rider
 * cannot be un-cancelled, saved notes overwrite what was there, and a stopped series stays
 * stopped. Sharing a lesson between a reading test and a mutating one would force a serial chain,
 * which is where this batch's two worst mutation blind spots live — `describe.serial` skips every
 * test after the first failure, and a failing test restarts the Playwright worker, which re-runs
 * `beforeAll` and re-seeds the barn underneath whatever the next test was about to read.
 *
 * That is why the issue's two structural constraints are met by *extra rows* rather than by
 * ordering:
 *
 * - **`notesTextarea` and `notesSave` are two separately seeded already-cancelled lessons.** The
 *   checklist says "on that same lesson", read here as *that same kind of lesson* — the reading
 *   the phase-4 cancel specs already established — because "enter cancellation notes in that
 *   textarea" saves notes onto the lesson the textarea line inspects. Both are seeded cancelled
 *   with **no** notes, so the note read back can only have come from that line's own save.
 * - **`recurringRead` and `recurringStop` carry two different series.** Stopping a series unmounts
 *   the very block the recurring-indicator and **Stop Recurring Lessons** lines assert on, so
 *   "Stopping the series from there" gets its own.
 *
 * `members.manager` is the second instructor "Blake's lesson shows no header **Cancel** button"
 * needs. `addMemberships` already seeds it
 * `can_instruct: true`, so no extra persona is created here — and `canManageLesson` is the single
 * predicate gating both the Edit link and the header Cancel button, so a lesson instructed by
 * anyone else is exactly the state that line describes.
 *
 * The tier is not optional decoration: `LessonForm` renders **nothing but** a "No lesson tiers
 * have been configured" notice on a tier-less barn, so the textarea, recurring-indicator and
 * **Stop Recurring Lessons** lines would all pass vacuously
 * without it — an absence check against a form that never rendered.
 */
const barn = withBarn('phase5-lessons-cancel', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true })
  const apple = await addHorse(supabase, barn.id, APPLE)

  const trainer = members.trainer.membershipId
  const manager = members.manager.membershipId

  const seed = async (
    key: LessonKey,
    opts: { instructorId?: string; riderIds?: string[]; lessonType?: 'normal' | 'group' } = {}
  ) => {
    const lesson = await addUnpaidLesson(supabase, barn, {
      at: FAR(),
      tierName: tier.name,
      horseIds: [apple.id],
      riderIds: opts.riderIds ?? [members.rider.membershipId],
      lessonType: opts.lessonType ?? 'normal',
      instructorId: opts.instructorId ?? trainer,
      fee: FEES[key],
    })
    lessonIds[key] = lesson.id
  }

  /**
   * A recurring lesson, planted rather than driven: there is no `lesson_series` builder, and
   * `e2e/support/fixtures.ts` is off limits to this batch's fifteen concurrent slices, so the
   * template row goes in inline and the lesson is pointed at it.
   *
   * `instructor_id` is the **trainer's** membership on purpose, and it is load-bearing twice
   * over: `EditLessonPage` renders the series block only when `series.instructor_id` matches the
   * caller (`canStopSeries`), and `lesson_series_select_trainer`/`_update_trainer` are both gated
   * on the same column — so a series belonging to anyone else would be invisible to this persona
   * rather than merely unstoppable, and the three recurring-series lines would read as absences.
   */
  const seedSeries = async (key: LessonKey) => {
    await seed(key)
    const series = mustSucceed<{ id: string }>(
      await supabase
        .from('lesson_series')
        .insert({
          barn_id: barn.id,
          instructor_id: trainer,
          fee: FEES[key],
          lesson_type: 'normal',
          tier_name: tier.name,
          horse_ids: [apple.id],
          exertion_levels: [3],
          rider_ids: [members.rider.membershipId],
          is_active: true,
        })
        .select('id')
        .single(),
      'insert lesson series'
    )
    mustSucceed(
      await supabase.from('lessons').update({ series_id: series.id }).eq('id', lessonIds[key]).eq('barn_id', barn.id),
      'attach lesson to series'
    )
  }

  // Read-only page states.
  await seed('headerCancel')
  await seed('otherInstructor', { instructorId: manager })

  // Two riders, because "only that rider" is not expressible on a normal lesson: it holds exactly
  // one rider, so cancelling their spot cascades the whole lesson (`cancelLessonRider`'s
  // `cascaded` branch, and `cancel_rider_participation`'s own). A group lesson with a second
  // still-active rider is the only shape in which "Cancelling a rider's spot (or the whole lesson)
  // from there works the same" can be falsified.
  await seed('riderSpot', {
    lessonType: 'group',
    riderIds: [members.rider.membershipId, members.rider2.membershipId],
  })

  // Both seeded already-cancelled and with no notes — see the docstring above. `isLate: true`
  // keeps each one's distinct fee rather than zeroing it, so the two stay distinguishable from
  // each other and from every other lesson in the barn on a failure.
  await seed('notesTextarea')
  await cancelLesson(supabase, barn, { lessonId: lessonIds.notesTextarea, isLate: true })
  await seed('notesSave')
  await cancelLesson(supabase, barn, { lessonId: lessonIds.notesSave, isLate: true })

  await seedSeries('recurringRead')
  await seedSeries('recurringStop')
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function detailPath(key: LessonKey): string {
  return `/barn/${barn.slug}/lessons/${lessonIds[key]}`
}

function editPath(key: LessonKey): string {
  return `${detailPath(key)}/edit`
}

/** The detail page's header block — the `<div>` that holds the `<h1>` and the badges beside it. */
function detailHeader(page: Page): Locator {
  return page.locator('main div:has(> h1)')
}

/**
 * The detail page header's action group, addressed as the sibling of the block that holds the
 * `<h1>` rather than by its Tailwind classes. That relationship is what makes "a Cancel button in
 * its detail-page header" an assertion about the header rather than about the page: a Cancel
 * control rendered anywhere else is outside this locator entirely.
 */
function headerActions(page: Page): Locator {
  return page.locator('main div:has(> h1) + div')
}

/** The header's Cancel control, which is a `<Button href>` and therefore a link. */
function headerCancelLink(page: Page): Locator {
  return headerActions(page).getByRole('link', { name: 'Cancel', exact: true })
}

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

/** The Cancelled badge in the detail page header — not a rider row's badge, which is separate. */
function headerCancelledBadge(page: Page): Locator {
  return detailHeader(page).getByText(CANCELLED_BADGE, { exact: true })
}

/** One `<li>` per enrolled rider, inside a group lesson's Rider(s) field. */
function riderRows(page: Page): Locator {
  return detailField(page, 'Rider(s)').locator('li')
}

/** A single rider's row, addressed by the name it displays. */
function riderRow(page: Page, name: string): Locator {
  return riderRows(page).filter({ hasText: name })
}

function cancelTypeRadio(page: Page, value: 'instructor' | 'rider'): Locator {
  return page.locator(`input[name="cancel_type"][value="${value}"]`)
}

/** The rider picker's own labels — one per still-active rider, or nothing when it is hidden. */
function pickerLabels(page: Page): Locator {
  return page.locator('main form fieldset:has(input[name="rider_id"]) label')
}

/**
 * `LessonForm`'s own `<form>`, disambiguated from `StopSeriesButton`'s by the fact that only one
 * of the two contains a `<textarea>`. Both are plain `<form>` elements under `<main>` on a
 * recurring lesson's edit page, so a bare `main form` is ambiguous exactly where the
 * recurring-indicator and **Stop Recurring Lessons** lines
 * need it not to be.
 */
function lessonForm(page: Page): Locator {
  return page.locator('main form:has(textarea)')
}

/**
 * The recurring-series block — the indicator paragraph and the Stop button — addressed as the
 * `<div>` immediately preceding the lesson form.
 *
 * That adjacency is what makes the indicator line's "above the lesson form" a claim about
 * placement rather than mere presence, and it is what gives "in the same place" a subject. It is
 * safe to read positionally here because `HorseStatusBanner` renders `null` for this barn (Apple
 * is active and available), so there is no other `<div>` between the `<h1>` and the form. If the
 * block ever stopped rendering, this locator resolves to nothing and every assertion under it
 * fails loudly rather than reading some other element's text.
 */
function seriesBlock(page: Page): Locator {
  return lessonForm(page).locator('xpath=preceding-sibling::div[1]')
}

/** The edit form's Cancellation Notes textarea, reached through its own `<label for>`. */
function cancellationNotesField(page: Page): Locator {
  return page.getByLabel(CANCELLATION_NOTES_LABEL, { exact: true })
}

/**
 * Blocks until the edit form has hydrated. Lifted from
 * `checklist-phase4-lessons-delete.spec.ts`, which lifted it from
 * `checklist-phase4-lessons-detail.spec.ts` — duplicated rather than extracted, per this batch's
 * convention. The signal: an ExhaustionBar cannot exist before `LessonForm`'s effects have run,
 * because it renders only once `exhaustionData` has arrived, and that state is set by an effect
 * whose input is itself produced by `LessonStartTime`'s mount effect via a server-action round
 * trip. A visible bar therefore strictly post-dates hydration rather than merely correlating
 * with it.
 *
 * Load-bearing for the save below, not a nicety: `lesson_at` is assembled client-side by
 * `LessonStartTime`'s mount effect, so a submit dispatched before hydration posts no date at all.
 *
 * Three of the four other edit-page tests skip it because they only *read* server-rendered markup
 * (the "same **Cancellation Notes** textarea the manager gets", the "This is part of a recurring
 * series" indicator, and the **Stop Recurring Lessons** button) — waiting for hydration to assert
 * one of those would be the SSR-default
 * confusion running the other way.
 *
 * The fourth — "Stopping the series from there works the same as the manager flow" — *writes*
 * and still skips it, which is the one case here that needs its reason
 * stated rather than inferred. `StopSeriesButton` is a `<form action={serverAction}>`, so a click
 * landing before React is listening is not lost the way fact 10's button is: the browser submits
 * the form natively and the action runs regardless. Hydration only decides whether the
 * `window.confirm` is raised first, and that confirm is not what "Stopping the series from
 * there works the same as the manager flow" claims. Driving it
 * through `hydrateByDriving` would also be actively wrong — `support/hydration.ts` says to prefer
 * "a control the test does not assert on, and one whose repeat is harmless", and this control is
 * both the mutation under test and one a retry would re-issue.
 */
async function waitForEditFormHydrated(page: Page) {
  await waitForHydrated(page.getByRole('button', { name: /^Exhaustion: / }))
}

/**
 * Keyboard activation rather than a pointer `.click()`. `LessonForm`'s submit sits at the bottom
 * of a long scrollable form — the shape #501 diagnosed, where Chromium's scroll-into-view
 * animation races Playwright's actionability check. `checklist-timezone.spec.ts`,
 * `checklist-phase4-lessons-detail.spec.ts` and `checklist-phase4-lessons-delete.spec.ts` all
 * drive this same component's submit this way, and in `edit` mode the form is longer still.
 *
 * `exact: true` and scoped to `main`: `getByRole`'s name match is a case-insensitive **substring**
 * by default, so a bare 'Save' would also match a future 'Save and close'.
 */
async function saveLessonForm(page: Page) {
  const save = page.locator('main').getByRole('button', { name: 'Save', exact: true })
  await save.focus()
  await save.press('Enter')
}

/**
 * Land back on a lesson's detail page after a redirect.
 *
 * Both halves are needed and neither replaces the other, which is the pairing
 * `e2e/support/test.ts`'s convention block mandates after a click. `waitForURL` pins **which**
 * lesson the server redirected to — a redirect wired to the wrong id lands on a real, rendering
 * detail page and would satisfy any content check. `'commit'` resolves before that document
 * renders, though, so a 404 or a 500 at the right URL satisfies the URL half equally; the `<dl>`
 * is the render proof, and neither `/cancel` nor `/edit` has one, so a submit that failed and
 * re-rendered its own page fails here rather than sailing through.
 *
 * That `<dl>` is also what makes this helper safe against the soft-nav hazard #1319's review
 * found: after a `waitUntil: 'commit'` the previous route can still be mounted, so a read taken
 * on markup **both** pages render can answer from the page just left. `<dl>` appears nowhere in
 * the `lessons/` route tree except the detail page itself, so it cannot resolve against `/cancel`
 * or `/edit` — and both callers then read through auto-retrying detail-only locators
 * (`riderRows`, `detailField`) rather than shared chrome. Copying this helper onto a flow whose
 * *source* page has a `<dl>` reintroduces the hazard; check that before reusing it.
 */
async function landOnDetail(page: Page, key: LessonKey) {
  await page.waitForURL(new RegExp(`/lessons/${lessonIds[key]}$`), { waitUntil: 'commit' })
  await page.locator('main dl').waitFor()
}

/** The instructor named on a detail page, e.g. `Test Trainer`. */
async function instructorOnDetailPage(page: Page): Promise<string> {
  return (await settledTextContents(detailField(page, 'Instructor')))[0].trim()
}

// ---------------------------------------------------------------------------
// The Cancel button in the detail header — "shows a **Cancel** button in its detail-page header"
// and "shows no header **Cancel** button"
// ---------------------------------------------------------------------------

// The instructor half is not decoration: it is what proves this really is a lesson this persona
// instructs, and it doubles as the vacuity control for the count — a detail page that rendered
// nothing would report `cancel: 0` *and* fail the instructor comparison, rather than reading as a
// clean pass on a count of zero.
test('trainer_sees_a_cancel_button_in_the_header_of_a_lesson_they_instruct @trainer', async ({ page }) => {
  await page.goto(detailPath('headerCancel'))
  const instructor = await instructorOnDetailPage(page)
  const cancel = await headerCancelLink(page).count()
  expect({ instructor, cancel }).toEqual({ instructor: TRAINER_NAME, cancel: 1 })
})

// The mirror of the test above, and the same pairing for the same reason: the `Test Manager`
// reading is what distinguishes "this lesson belongs to another instructor and offers no Cancel"
// from "this page did not render", which a bare `cancel: 0` cannot.
//
// It covers only one of the two ways this zero could be true for the wrong reason, though, because
// it comes off the `<dl>` while the count comes off `headerActions` — a different locator root, so
// it proves the page rendered without proving `main div:has(> h1) + div` still resolves. What
// closes that is the test above: it reads `1` through the **same** `headerActions` locator, so a
// header markup change that made this zero meaningless fails there rather than passing here. The
// two are a pair in both directions, which is why neither carries a redundant third reading.
test('trainer_sees_no_cancel_button_on_another_instructors_lesson @trainer', async ({ page }) => {
  await page.goto(detailPath('otherInstructor'))
  const instructor = await instructorOnDetailPage(page)
  const cancel = await headerCancelLink(page).count()
  expect({ instructor, cancel }).toEqual({ instructor: MANAGER_NAME, cancel: 0 })
})

// ---------------------------------------------------------------------------
// Cancelling from there — "Cancelling a rider's spot (or the whole lesson) from there"
// ---------------------------------------------------------------------------

// Each rider is read as a **pair** — is the row there, and does it carry a badge — rather than as
// a bare badge count. A bare `{ rider: 1, stub: 0 }` has a real positive control for the locator,
// but it still reads `0` for a rider whose row is **absent entirely**, which is a different bug
// reported as a pass. `lessonCancelled: 0` is the third subject: cancelling one rider's spot on a
// group lesson that still has an active rider must not cancel the lesson, which is precisely what
// "works the same as the manager flow" means here.
//
// The toggle is driven through `hydrateByDriving` rather than a bare `.check()`, and this is the
// one place in this file where that is unavoidable. `CancelLessonPage` defaults the Type toggle to
// **Instructor** whenever the viewer instructs the lesson — which a trainer reaching this page
// always does, since `canManageLesson` is what let them in — so the rider picker is never in the
// server-rendered markup for this persona and only `setCancelType` can produce it. A click landing
// before React is listening is simply lost (e2e/CLAUDE.md fact 10), so a single `.check()` could
// only run out the budget. `.check()` on an already-checked radio is a no-op, which is what makes
// it safe to re-dispatch.
test('trainer_cancelling_one_group_riders_spot_cancels_only_that_rider @trainer', async ({ page }) => {
  test.slow()
  await page.goto(detailPath('riderSpot'))
  await headerCancelLink(page).click()
  await page.waitForURL(new RegExp(`/lessons/${lessonIds.riderSpot}/cancel$`), { waitUntil: 'commit' })

  await hydrateByDriving(
    () => cancelTypeRadio(page, 'rider').check(),
    async () => (await pickerLabels(page).count()) > 0
  )
  await page.getByRole('radio', { name: RIDER_NAME, exact: true }).check()
  await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()
  await landOnDetail(page, 'riderSpot')

  await riderRows(page).first().waitFor()
  const reading = async (name: string) => ({
    row: await riderRow(page, name).count(),
    cancelledBadge: await riderRow(page, name).getByText(CANCELLED_BADGE, { exact: true }).count(),
  })
  expect({
    [RIDER_NAME]: await reading(RIDER_NAME),
    [STUB_RIDER_NAME]: await reading(STUB_RIDER_NAME),
    lessonCancelled: await headerCancelledBadge(page).count(),
  }).toEqual({
    [RIDER_NAME]: { row: 1, cancelledBadge: 1 },
    [STUB_RIDER_NAME]: { row: 1, cancelledBadge: 0 },
    lessonCancelled: 0,
  })
})

// ---------------------------------------------------------------------------
// Cancellation notes on the edit form — "the same **Cancellation Notes** textarea the manager
// gets" and "the same read-only **Cancellation Notes** row the manager gets"
// ---------------------------------------------------------------------------

// Read against two lessons in one assertion, because the claim is that this textarea is the
// *cancelled-lesson* affordance. `onCancelledLesson: 1` alone would also be true of a textarea
// `LessonForm` rendered unconditionally, and `onActiveLesson: 0` alone would also be true of a
// locator that matched nothing anywhere. Neither reading is meaningful without the other.
test('trainer_edit_page_of_a_cancelled_lesson_shows_the_cancellation_notes_textarea @trainer', async ({ page }) => {
  await page.goto(editPath('notesTextarea'))
  await lessonForm(page).waitFor()
  const onCancelledLesson = await cancellationNotesField(page).count()

  await page.goto(editPath('headerCancel'))
  await lessonForm(page).waitFor()
  const onActiveLesson = await cancellationNotesField(page).count()

  expect({ onCancelledLesson, onActiveLesson }).toEqual({ onCancelledLesson: 1, onActiveLesson: 0 })
})

// A genuine round trip: the note is typed into the edit form's own textarea and read back off the
// detail page the save redirects to. The lesson is seeded cancelled with **no** notes, so the
// string this test finds can only have been written by this test — a re-read of a seeded value is
// impossible by construction.
test('cancellation_notes_saved_by_a_trainer_render_on_the_lesson_detail_page @trainer', async ({ page }) => {
  test.slow()
  await page.goto(editPath('notesSave'))
  await waitForEditFormHydrated(page)
  await cancellationNotesField(page).fill(SAVED_CANCELLATION_NOTE)
  await saveLessonForm(page)
  await landOnDetail(page, 'notesSave')

  const notes = (await settledTextContents(detailField(page, CANCELLATION_NOTES_LABEL)))[0].trim()
  expect(notes).toEqual(SAVED_CANCELLATION_NOTE)
})

// ---------------------------------------------------------------------------
// The recurring series — "still shows its **Recurring** badge on its Lessons list row" through
// "Stopping the series from there works the same as the manager flow"
// ---------------------------------------------------------------------------

// The trainer's Lessons list defaults to the `mine` filter, and this lesson is theirs, so no pill
// click is needed to reach it. +72h also keeps it in the main list rather than behind
// `OlderLessonsToggle`, whose 7-day cutoff is backwards-looking.
//
// The card is addressed by the lesson it links to rather than by any text on it, so the badge
// assertion is not selecting the element by the string it then asserts.
test('trainer_lessons_list_row_shows_the_recurring_badge @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  const card = page.locator(`main ul a[href$="/lessons/${lessonIds.recurringRead}"]`)
  await expect(card.getByText(RECURRING_BADGE, { exact: true })).toBeVisible()
})

test('trainer_lesson_detail_page_shows_the_recurring_badge @trainer', async ({ page }) => {
  await page.goto(detailPath('recurringRead'))
  await expect(detailHeader(page).getByText(RECURRING_BADGE, { exact: true })).toBeVisible()
})

test('trainer_edit_page_shows_the_recurring_series_indicator @trainer', async ({ page }) => {
  await page.goto(editPath('recurringRead'))
  await expect(seriesBlock(page).getByText(RECURRING_INDICATOR, { exact: true })).toBeVisible()
})

// Scoped to `seriesBlock` rather than to `main`, which is what makes this line's "in the same
// place" an actual claim: a Stop button rendered anywhere else on the page is outside the locator.
test('trainer_edit_page_shows_the_stop_recurring_lessons_button @trainer', async ({ page }) => {
  await page.goto(editPath('recurringRead'))
  await expect(seriesBlock(page).getByRole('button', { name: STOP_SERIES_BUTTON, exact: true })).toBeVisible()
})

// `before` is captured only after the block has actually rendered, so the positive control lives
// inside the same assertion as the disappearance claim: a locator that were simply wrong would
// report zeros for `before` and fail there, instead of reading as a clean pass on `after`.
//
// The synchronisation is a POST await followed by an explicit reload, and neither half is
// optional. `stopLessonSeriesAction` redirects to the `/edit` URL it was already on, so
// `waitForURL` resolves against the current URL before it ever waits (e2e/CLAUDE.md fact 3) — a
// sync point that looks present and isn't. And a Server Action POST resolving does not imply React
// has committed the resulting state (fact 8), so the reload is what makes the second reading a
// reading of the server's new answer rather than a race against the router's own refresh.
//
// **The POST await must name *which* POST** (#1409). This page issues three Server Action POSTs to
// this one URL, not one: `LessonForm`'s two mount effects fire `getProjectedExhaustion` and
// `getScheduleRange` at hydration, and both post to the page's own URL exactly as the stop
// submission does. All three are `text/plain;charset=UTF-8` with `nav=false`, distinguishable at
// the request layer only by the `next-action` header, whose ids are build outputs a spec cannot
// name. A predicate of "a POST to this lesson's URL" therefore matches all three, and a hydration
// POST landing after the click resolves the wait early — which was measured, not inferred, and is
// what made this test fail 1-in-470 under 4-worker load.
//
// What that early resolve costs is worse than a stale read: `page.reload()` fires while the stop
// action's own POST is still in flight and **aborts it** (`net::ERR_ABORTED`, and no matching
// request in the dev server's log), so the mutation never runs at all. This is why the retrying
// `toHaveCount(0)` that suggests itself for the reads below is not the fix and was not applied —
// the reload's *initial HTML* was measured carrying the indicator, so there is nothing for a retry
// to converge on, and it would have passed for the next 469 runs while fixing nothing.
//
// The discriminator is the response status. `stopLessonSeriesAction` ends in `redirect()` and so
// answers 303; both hydration actions return data and answer 200. That is a property of the
// action's own code rather than of Next's request encoding, which is what makes it the durable
// half of this pair — the encoding was the first thing tried and it is identical across all three.
//
// The `dialog` handler answers `StopSeriesButton`'s `window.confirm`. It is registered before the
// click and left in place: an unanswered dialog blocks the page indefinitely.
test('trainer_stopping_a_recurring_series_removes_the_series_block_from_the_edit_page @trainer', async ({ page }) => {
  test.slow()
  await page.goto(editPath('recurringStop'))
  const stopButton = seriesBlock(page).getByRole('button', { name: STOP_SERIES_BUTTON, exact: true })
  await stopButton.waitFor()
  const before = {
    indicator: await seriesBlock(page).getByText(RECURRING_INDICATOR, { exact: true }).count(),
    button: await stopButton.count(),
  }

  page.on('dialog', (dialog) => void dialog.accept())
  await Promise.all([
    page.waitForResponse(
      (r) =>
        r.request().method() === 'POST' &&
        r.url().includes(`/lessons/${lessonIds.recurringStop}`) &&
        r.status() === STOP_SERIES_REDIRECT_STATUS
    ),
    stopButton.click(),
  ])
  await page.reload()
  await lessonForm(page).waitFor()

  const after = {
    indicator: await seriesBlock(page).getByText(RECURRING_INDICATOR, { exact: true }).count(),
    button: await seriesBlock(page).getByRole('button', { name: STOP_SERIES_BUTTON, exact: true }).count(),
  }
  expect({ before, after }).toEqual({
    before: { indicator: 1, button: 1 },
    after: { indicator: 0, button: 0 },
  })
})
