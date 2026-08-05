// covers: src/app/barn/[slug]/(protected)/lessons/**

import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import type { Lesson } from '@/lib/db/types'

// The trainer's Lessons list, and the four permission claims reachable from it
// (PRE_RELEASE_TEST_CHECKLIST.md Phase 5, lines 826-828 and 851-854).
//
// Four of the seven lines are only meaningful against *another instructor's* lesson. That
// instructor is `members.manager`: addMemberships already gives it `can_instruct: true`, so a
// lesson seeded with its membership id is another instructor's lesson as far as every
// trainer-side check is concerned — no fourth persona, and no name added to the set
// support/fixtures.test.ts holds to its collision constraint.
//
// Every seeded lesson is in the *future*, which keeps the page's 7-day recent/older split out
// of this file entirely: `recentLessons` is `lesson_at >= now - 7d`, so all four render in the
// first <ul> and OlderLessonsToggle returns null. The split is checklist-phase4-lessons-list's
// subject, not this slice's.

const APOLLO = 'Apollo'
const WILLOW = 'Willow'
const STANDARD_TIER = 'Standard'
const TIER_PRICE = 80

// Whole rows rather than bare ids: the 853 read-back below compares the seeded fee,
// instructor and lesson_at against what the row still holds, and Lesson.lesson_at is a plain
// timestamptz string (src/lib/db/types.ts), so the builder's own return value is the
// comparison baseline. Expected values are never hardcoded strings.
let myFirst: Lesson
let mySecond: Lesson
let othersFirst: Lesson
let othersSecond: Lesson

const barn = withBarn('phase5-lessons-list', async ({ supabase, barn, members }) => {
  // A tier is not decoration here: LessonForm short-circuits its entire render to "No lesson
  // tiers have been configured…" when `tiers` is empty, so a tier-less barn has no edit form
  // at all — which would have made the 851 assertion below (no Instructor label) and the 853
  // assertion (no Save button behind the 404) both pass against a page that renders no form
  // for anyone. Measured, not assumed: a first run without this seeded exactly that page.
  const standard = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: TIER_PRICE, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, APOLLO)
  const willow = await addHorse(supabase, barn.id, WILLOW)

  const lessonDefaults = { fee: standard.price, tierName: standard.name }

  myFirst = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: daysFromNow(1, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider.membershipId],
  })

  mySecond = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: daysFromNow(2, barn.timezone),
    time: '11:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apollo.id],
    riderIds: [members.rider2.membershipId],
  })

  othersFirst = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: daysFromNow(3, barn.timezone),
    time: '13:00',
    instructorId: members.manager.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider.membershipId],
  })

  othersSecond = await addUnpaidLesson(supabase, barn, {
    ...lessonDefaults,
    at: daysFromNow(4, barn.timezone),
    time: '14:00',
    instructorId: members.manager.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider2.membershipId],
  })
})

// ---------------------------------------------------------------------------
// Locators and readers
// ---------------------------------------------------------------------------

function lessonsPath(): string {
  return `/barn/${barn.slug}/lessons`
}

function lessonPath(lesson: Lesson): string {
  return `/barn/${barn.slug}/lessons/${lesson.id}`
}

/** Every lesson card currently rendered. */
function lessonCards(page: Page): Locator {
  return page.locator('main ul a[href*="/lessons/"]')
}

/**
 * The set of lessons the list is currently showing. Sorted, because what these checkboxes
 * claim is *which* lessons appear, not in what order — and #1286 is still moving `ORDER BY`
 * around in the DAL, so a membership assertion is correct either side of it.
 *
 * evaluateAll is one-shot and does not auto-retry, so an unsettled read yields [] and any
 * assertion that happens to accept an empty array passes on nothing (#1243). support/read.ts
 * leaves evaluateAll its inline guard deliberately, so the guard belongs here; it doubles as
 * the assertion, since waitFor throws rather than handing back an empty list.
 */
async function visibleLessonIds(page: Page): Promise<string[]> {
  await lessonCards(page).first().waitFor()
  const ids = await lessonCards(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('href')!.split('/').pop()!)
  )
  return ids.sort()
}

function sortedIds(lessons: Lesson[]): string[] {
  return lessons.map((l) => l.id).sort()
}

/** The top-row filter pills. Their hrefs are the only `?filter=`-relative links on the page. */
function filterPills(page: Page): Locator {
  return page.locator('main a[href^="?filter="]')
}

/**
 * Switching filter is a click on the Pill's Link, not a re-goto with a different query param
 * (e2e/CLAUDE.md fact 11) — the app's switcher costs no document load, so a spec that
 * re-navigates pays for one the UI never asks for. No timeout on waitForURL: navigationTimeout
 * is already unbounded, so a number could only tighten it (#1211).
 */
async function pickFilter(page: Page, label: string, expected: string) {
  await page.getByRole('link', { name: label, exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('filter') === expected, { waitUntil: 'commit' })
}

/**
 * The Edit/Delete controls in a lesson detail page's header, counted together with the page
 * heading. The heading is waited on first, so a 404 or an unrendered route fails here instead
 * of reporting a comfortable pair of zeroes — an absence check whose page never rendered is
 * the vacuous-pass shape this suite has shipped before (#1243).
 *
 * Delete is matched by visible text rather than by role: a manager gets it as either a Link
 * (paid/free lesson) or a DeleteLessonButton (`<button>`), and a trainer must see neither.
 */
async function headerControls(page: Page): Promise<{ edit: number; delete: number }> {
  await page.getByRole('heading', { name: 'Lesson Detail' }).waitFor()
  return {
    edit: await page.getByRole('link', { name: 'Edit', exact: true }).count(),
    delete: await page.locator('main').getByText('Delete', { exact: true }).count(),
  }
}

// ---------------------------------------------------------------------------
// The list and its filters (lines 826-828)
// ---------------------------------------------------------------------------

// No `?filter=` in the URL: lessons/page.tsx defaults a trainer to 'mine' (a manager to 'all'),
// so this is the default the checkbox names, not a filter this test selected.
test('trainer_lessons_list_defaults_to_my_lessons @trainer', async ({ page }) => {
  await page.goto(lessonsPath())
  await expect.poll(() => visibleLessonIds(page)).toEqual(sortedIds([myFirst, mySecond]))
})

// "every barn lesson, including another instructor's" is literally all four seeded lessons —
// both of the trainer's own and both of the other instructor's.
test('trainer_all_filter_shows_every_barn_lesson_including_another_instructors @trainer', async ({ page }) => {
  await page.goto(lessonsPath())
  await pickFilter(page, 'All', 'all')
  await expect
    .poll(() => visibleLessonIds(page))
    .toEqual(sortedIds([myFirst, mySecond, othersFirst, othersSecond]))
})

// The same six labels, in the same order, that
// checklist-phase4-lessons-list.spec.ts's filter_pills_show_the_six_expected_filters asserts
// for the manager — which is what makes "the same bar as the manager view" a comparison rather
// than a restatement. Only the top row is on screen here: the default 'mine' filter renders no
// sub-filter row, so every `?filter=`-relative link on the page is one of these six.
test('trainer_filter_pills_show_the_same_six_filters_as_the_manager_view @trainer', async ({ page }) => {
  await page.goto(lessonsPath())
  await expect(filterPills(page)).toHaveText([
    'My Lessons',
    'All',
    'By Instructor',
    'By Rider',
    'By Horse',
    'By Tier',
  ])
})

// ---------------------------------------------------------------------------
// What a trainer may edit from the list (lines 851-854)
// ---------------------------------------------------------------------------

/**
 * Hidden *entirely* — LessonForm renders the label + <select> only under `isManager` and falls
 * back to a bare hidden input, so what has to be absent is the word, not an enabled control.
 * The count is taken off main's innerText so a label, a read-only value and stray prose are all
 * caught by one read; getByText would match each nesting level of the same string separately.
 *
 * Paired with the Save button in one object: the form having rendered at all is what stops
 * `instructorMentions: 0` from passing on a page that never loaded, and waiting for that button
 * is also the settle point the one-shot innerText read needs.
 */
test('trainer_edit_form_hides_the_instructor_field_on_their_own_lesson @trainer', async ({ page }) => {
  await page.goto(`${lessonPath(myFirst)}/edit`)
  const save = page.getByRole('button', { name: 'Save', exact: true })
  await save.waitFor()
  const form = {
    saveButtons: await save.count(),
    instructorMentions: await page
      .locator('main')
      .evaluate((el) => ((el as HTMLElement).innerText.match(/instructor/gi) ?? []).length),
  }
  expect(form).toEqual({ saveButtons: 1, instructorMentions: 0 })
})

// Opened from the Lessons list, as the checkbox says, rather than by URL — so this also proves
// the trainer can reach another instructor's lesson at all, which is what makes the missing
// Edit link a permission boundary rather than an unreachable page.
test('trainer_sees_no_edit_link_on_another_instructors_lesson @trainer', async ({ page }) => {
  await page.goto(lessonsPath())
  await pickFilter(page, 'All', 'all')
  await page.locator(`main ul a[href$="/lessons/${othersFirst.id}"]`).click()
  await page.waitForURL(new RegExp(`/lessons/${othersFirst.id}$`), { waitUntil: 'commit' })
  await expect.poll(() => headerControls(page)).toEqual({ edit: 0, delete: 0 })
})

/**
 * Narrowed from the checklist's original wording, which had this URL rendering a form whose
 * save is rejected by RLS. The route does not get that far: edit/page.tsx notFound()s on
 * `role === 'trainer' && lesson.instructor_id !== membership.id`, one layer above the lessons
 * UPDATE policy, so no form renders and no save is submittable. The line was rewritten to that
 * invariant under the standing precedent for a checklist line whose claim assumes behaviour the
 * code deliberately doesn't have.
 *
 * There is no forging path around the 404 either, which is what makes the narrowing lossless:
 * the edit page binds `updateLessonAction.bind(null, lesson.id, …)`, so the target lesson id
 * travels as Next's encrypted closure blob and cannot be retargeted from a page the trainer
 * *can* open.
 *
 * The service-role read-back keeps the line's persistence half rather than only its surface: a
 * 404 with the row quietly mutated behind it would still fail here. Direct reads verify state,
 * never the expected answer — every figure it is compared against came out of the builder.
 */
test('trainer_cannot_save_changes_via_another_instructors_edit_url @trainer', async ({ page }) => {
  const response = await page.goto(`${lessonPath(othersFirst)}/edit`)
  const outcome = {
    status: response!.status(),
    saveButtons: await page.getByRole('button', { name: 'Save', exact: true }).count(),
    row: mustSucceed<Pick<Lesson, 'fee' | 'instructor_id' | 'lesson_at'>>(
      await barn.data.supabase
        .from('lessons')
        .select('fee, instructor_id, lesson_at')
        .eq('id', othersFirst.id)
        .single(),
      'read back the lesson a trainer could not edit'
    ),
  }
  expect(outcome).toEqual({
    status: 404,
    saveButtons: 0,
    row: {
      fee: othersFirst.fee,
      instructor_id: othersFirst.instructor_id,
      lesson_at: othersFirst.lesson_at,
    },
  })
})

// "any lesson, your own included" — so both sides are read in one test. `edit: 1` on the
// trainer's own lesson is the positive control: it proves the header's action group rendered
// and that this role does get *some* control there, so the two zeroes are a role boundary
// rather than an empty page.
test('trainer_sees_no_delete_button_on_any_lesson @trainer', async ({ page }) => {
  await page.goto(lessonPath(myFirst))
  const own = await headerControls(page)
  await page.goto(lessonPath(othersSecond))
  const others = await headerControls(page)
  expect({ own, others }).toEqual({
    own: { edit: 1, delete: 0 },
    others: { edit: 0, delete: 0 },
  })
})
