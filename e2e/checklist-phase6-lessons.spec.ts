// covers: src/app/barn/[slug]/(protected)/lessons/**

import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addManagedMember, addUnpaidLesson, daysFromNow, E2E_STUB_RIDER, E2E_USERS } from './support/fixtures'
import { settledInnerTexts } from './support/read'
import { mustSucceed } from '@/lib/db/service-role'
import type { Lesson } from '@/lib/db/types'

// The rider's Lessons list and the detail page of a lesson she is enrolled in
// (PRE_RELEASE_TEST_CHECKLIST.md Phase 6, lines 962-967, 973 and 974 — eight checkboxes).
//
// Three lessons, and each of the three exists for a claim the other two cannot make:
//
//   mine    normal, the rider login alone, on Comet. Carries her own rider_notes and
//           private_notes, and an exertion level she must not see (965, 966, 967).
//   group   group, the rider login + two co-riders (973), so "every co-rider" is a plural
//           rather than a single name that a one-row list would satisfy by accident.
//   others  normal, the stub rider alone, on Willow — the lesson she is neither enrolled in
//           nor privileged for (974), and the one the list must leave out (962).
//
// ## Why this barn holds no member_horse_privileges rows at all
//
// #1331's slice-13 barn gave every lesson a horse its rider held a privilege on, which is
// precisely the fixture that would make `others` load rather than 404: `lessons_select_horse
// _privilege` (backed by `auth_lesson_has_privileged_horse`) is additive to the enrolled-rider
// policy, so one privileges row on that lesson's horse hands the row back through RLS. Holding
// none makes 974's "with no horse she holds lesson-read privileges on" true by construction, and
// makes 967's parenthetical ("still true for a horse Dana holds no lesson-read privilege on") true
// of Comet for the same reason.
//
// Isolating the *flag* from the *row* — slice 13's Butter-vs-Pepper argument — is that slice's
// claim and its lines own it. Repeating it here would add a row whose only effect is to make the
// 404 fixture one edit away from silently loading.
//
// ## Why no tier is seeded
//
// checklist-phase5-lessons-list.spec.ts seeds one because it opens the edit form, and LessonForm
// short-circuits its entire render on a tier-less barn. No test here opens a form; every lesson
// takes addUnpaidLesson's default 'Custom' tier name, which is what the By Tier pill would list.
//
// ## Dates
//
// Every lesson is in the future, so lessons/page.tsx's 7-day recent/older split never engages and
// all of the rider's cards render in the first <ul> — the same simplification the phase-5 sibling
// makes, and for the same reason: that split is checklist-phase4-lessons-list's subject.

const COMET = 'Comet' // mine — the enrolled normal lesson
const JUNIPER = 'Juniper' // group
const WILLOW = 'Willow' // others — the unenrolled, unprivileged lesson

// The rider login's own notes, planted on her `mine` lesson_riders row. Line 965 asserts the first
// renders read-only; line 966 asserts the second never renders at all.
const MY_RIDER_NOTES = 'Keep the canter transitions balanced through the corner.'
const MY_PRIVATE_NOTES = 'Board payment is two weeks late; handle it off the lesson.'

// Line 973's third rider — a managed stub, added inline because "every co-rider's real name" is
// only falsifiable against a plural: with one co-rider, a page rendering just the first name in
// the list would satisfy the line. `addManagedMember` rather than a fixtures.ts edit, which this
// batch's fifteen parallel slices are forbidden.
//
// The name clears both halves of E2E_STUB_RIDER's collision rule against all four seeded members:
// it contains none of them and none contains it, and its first-initial-derived form (`Robin F.`)
// collides with no other (`Test M.`/`Test T.`/`Test R.`/`Test S.`).
const THIRD_RIDER = { firstName: 'Robin', lastName: 'Fielding' } as const

const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const INSTRUCTOR_NAME = `${E2E_USERS.trainer.firstName} ${E2E_USERS.trainer.lastName}`
const STUB_RIDER_NAME = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`
const THIRD_RIDER_NAME = `${THIRD_RIDER.firstName} ${THIRD_RIDER.lastName}`

// Whole rows rather than bare ids, so every expected id below comes out of the builder that
// created it rather than being restated.
let mine: Lesson
let group: Lesson
let others: Lesson

const barn = withBarn('phase6-lessons', async ({ supabase, barn, members }) => {
  const comet = await addHorse(supabase, barn.id, COMET)
  const juniper = await addHorse(supabase, barn.id, JUNIPER)
  const willow = await addHorse(supabase, barn.id, WILLOW)

  const thirdRider = await addManagedMember(supabase, barn.id, { ...THIRD_RIDER, role: 'rider' })

  mine = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(1, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [comet.id],
    riderIds: [members.rider.membershipId],
    exertionLevels: [4],
    fee: 50,
  })

  // Group lessons require >= 2 riders (assert_lesson_participant_counts); three is what makes
  // line 973's "every" a real quantifier.
  group = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '11:00',
    instructorId: members.trainer.membershipId,
    horseIds: [juniper.id],
    riderIds: [members.rider.membershipId, members.rider2.membershipId, thirdRider.membershipId],
    lessonType: 'group',
    fee: 50,
  })

  others = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: '13:00',
    instructorId: members.trainer.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider2.membershipId],
    fee: 50,
  })

  // The rider login's own notes on her own lesson. Inline service-role writes rather than builder
  // options, the same way #1331 planted its stub rider's: create_lesson_with_participants takes
  // neither notes column, and neither of lesson-participants.ts's write paths takes an injectable
  // client. Planted on `mine` and nowhere else, so the group lesson's rider list renders names and
  // nothing else — which is what lets line 973 read those names straight off the <li>s.
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ rider_notes: MY_RIDER_NOTES, private_notes: MY_PRIVATE_NOTES })
      .eq('lesson_id', mine.id)
      .eq('rider_id', members.rider.membershipId)
      .select('id')
      .single(),
    "plant the rider login's own notes on her normal lesson"
  )
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

/** Every lesson card currently rendered — the anchor `Card href` puts around each list item. */
function lessonCards(page: Page): Locator {
  return page.locator('main ul a[href*="/lessons/"]')
}

/**
 * The set of lessons the list is showing. Sorted: what line 962 claims is *which* lessons appear,
 * not in what order, so a membership assertion is correct either side of #1286's ordering work.
 *
 * evaluateAll is one-shot and does not auto-retry, so an unsettled read yields [] and an assertion
 * that accepts an empty array passes on nothing (#1243). support/read.ts leaves evaluateAll its
 * inline guard deliberately; the guard doubles as the assertion, since waitFor throws rather than
 * handing back an empty list.
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
 * The Rider(s) row of the detail page's `<dl>`, scoped by its own label rather than by position —
 * the Horse(s) row holds a structurally identical `<ul>`, and an unscoped one would read horse
 * names into a rider-name assertion.
 */
function ridersSection(page: Page): Locator {
  return page.locator('dl > div').filter({ hasText: 'Rider(s)' })
}

/**
 * The detail page's `<h1>`. A precondition for the absence assertions below, never the claim:
 * `toHaveCount(0)` is satisfied just as happily by a 404 or an error page, and either would report
 * as the thing being withheld.
 */
function detailHeading(page: Page): Locator {
  return page.getByRole('heading', { name: 'Lesson Detail', exact: true })
}

// ---------------------------------------------------------------------------
// The Lessons list — lines 962-964
// ---------------------------------------------------------------------------

// No `?filter=` in the URL: lessons/page.tsx defaults a rider to 'all', so this is the list as she
// finds it. `others` exists in this barn and is excluded here by enrolment alone
// (getLessonsByBarn's rider branch scopes to getRiderEnrolledLessonIds), which is the same fact
// line 974 reads from the other side.
test('rider_lessons_list_shows_only_enrolled_lessons @rider', async ({ page }) => {
  await page.goto(lessonsPath())
  await expect.poll(() => visibleLessonIds(page)).toEqual(sortedIds([mine, group]))
})

// Four pills, in the rendered order, which pins the count as well as each label — so "no My
// Lessons or By Rider pill" is the same assertion as "the pills are these four" rather than a
// second one. The manager/trainer view's six-pill bar
// (checklist-phase5-lessons-list.spec.ts's trainer_filter_pills_show_the_same_six_filters_as_the
// _manager_view) is what makes the two missing labels a role boundary rather than a bar nobody has.
//
// Only the top row is on screen: the default 'all' filter renders no sub-filter row, so every
// `?filter=`-relative link on the page is one of these four.
test('rider_filter_pills_omit_my_lessons_and_by_rider @rider', async ({ page }) => {
  await page.goto(lessonsPath())
  await expect(filterPills(page)).toHaveText(['All', 'By Instructor', 'By Horse', 'By Tier'])
})

// Read card-scoped rather than page-scoped: the nav and the barn name are not what the line is
// about, and a page-wide absence check would be asserting against those too.
//
// The instructor flag in the same map is the positive control, and it is why this cannot pass
// vacuously: it proves a person's name does render on both of these cards, so the `self: false`
// beside it is a name being withheld rather than a card that renders no names to anyone. The
// array's length pins the card count, so an empty or half-rendered list fails rather than
// satisfying it.
//
// The two cards withhold it by different routes, and the line covers both: the normal card has a
// rider-names row gated on `isManager || isTrainer`, while the group card renders
// `{rider_count} riders, {horse_count} horses` and names no rider to any role (LessonListItem).
test('rider_own_name_absent_from_own_lesson_cards @rider', async ({ page }) => {
  await page.goto(lessonsPath())
  const cards = await settledInnerTexts(lessonCards(page))

  expect(cards.map((t) => ({ instructor: t.includes(INSTRUCTOR_NAME), self: t.includes(RIDER_NAME) }))).toEqual([
    { instructor: true, self: false },
    { instructor: true, self: false },
  ])
})

// ---------------------------------------------------------------------------
// The enrolled lesson's detail page — lines 965-967
// ---------------------------------------------------------------------------

// Two assertions for one line, by the indivisible-line exception: "shows … read-only" is one page
// state with two halves, and neither half means anything alone — visible text over an editable
// field is not read-only, and zero textboxes on a page showing no notes is vacuous.
//
// Read-only is asserted as the absence of a *textbox*, not of controls generally: the header
// carries a rider Cancel link on an eligible lesson (line 975, a later slice's), so a blanket
// no-controls assertion would be asserting something false. OwnRiderNotesBlock renders the value
// in a <p>, so a textbox here would mean the notes had become editable.
test('rider_own_rider_notes_render_read_only_on_the_lesson_detail_page @rider', async ({ page }) => {
  await page.goto(lessonPath(mine))

  await expect(page.getByText(MY_RIDER_NOTES, { exact: true })).toBeVisible()
  await expect(page.locator('main').getByRole('textbox')).toHaveCount(0)
})

// Her own rider notes are the precondition, not a second claim: they prove the Rider(s) section
// and her own row within it are on screen, so the missing private text is being withheld rather
// than a section that never rendered.
//
// Withheld twice over, and neither layer is OwnRiderNotesBlock — that block reads only
// `rider_notes` and has no private-notes branch at all. The page's own gate is RiderNotesBlock,
// which renders `private_notes` under `canSeeNotes` (manager/trainer) and so renders nothing here;
// behind it, get_lesson_rider_notes returns `private_notes` as NULL to any caller that is not
// manager/trainer, so the value never reaches the page to be leaked.
test('rider_private_notes_stay_hidden_on_the_lesson_detail_page @rider', async ({ page }) => {
  await page.goto(lessonPath(mine))
  await expect(page.getByText(MY_RIDER_NOTES, { exact: true })).toBeVisible()

  await expect(page.getByText(MY_PRIVATE_NOTES)).toHaveCount(0)
})

// Comet has no member_horse_privileges row for this rider, so get_lesson_horse_exertion_levels
// returns her nothing and the `(exertion N)` span never renders. The horse's own name is the
// precondition: it proves the Horse(s) list rendered, so the missing rating is a withholding
// rather than an empty page.
//
// The same locator is driven non-zero by
// checklist-phase6-horse-privileges.spec.ts's rider_privileged_horse_shows_an_exertion_rating_on
// _the_lesson_detail_page, on a horse the rider *does* hold lesson_read_privileges for — that is
// this assertion's positive case, on the same page for the same role.
test('rider_sees_no_exertion_rating_on_an_unprivileged_horse @rider', async ({ page }) => {
  await page.goto(lessonPath(mine))
  await expect(page.getByText(COMET, { exact: true })).toBeVisible()

  await expect(page.getByText(/\(exertion \d+\)/)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The enrolled group lesson — line 973
// ---------------------------------------------------------------------------

// Every name in the Rider(s) list, compared as a set against the three seeded riders — a blank
// falls to '—', an unresolved profile falls back to the raw membership id (getLessonById's
// riderName), and either fails this outright.
//
// Exact strings, per #1284: `Test Sutton` is no longer a substring of `Test Rider`, so a
// co-rider's name is distinguished by the fixture rename rather than by a local dodge. Sorted,
// because the line claims which names appear and not their order.
//
// The <li> text is the name alone: RiderNotesBlock renders nothing for a rider (canSeeNotes is
// false and no cancellation notes exist), the per-row cancelled badge renders only for a viewer
// who can manage the lesson (canManageLesson — a manager or the instructing trainer, never a
// rider), and OwnRiderNotesBlock sits outside the <ul> — which is why this lesson is the one
// carrying no planted notes.
test('rider_group_lesson_shows_every_co_riders_real_name @rider', async ({ page }) => {
  await page.goto(lessonPath(group))
  const names = await settledInnerTexts(ridersSection(page).locator('ul > li'))

  expect(names.sort()).toEqual([RIDER_NAME, STUB_RIDER_NAME, THIRD_RIDER_NAME].sort())
})

// ---------------------------------------------------------------------------
// The lesson she can reach neither way — line 974
// ---------------------------------------------------------------------------

// Both halves of the line in one assertion: "shows 404" and "rather than the lesson details" are
// separately satisfiable — a 200 rendering nothing would pass the second alone, and a 404 status
// served alongside a rendered detail page would pass the first.
//
// The 404 is RLS, not the page's own enrolment gate. `others` has a rider she is not and a horse
// she holds no privileges row for, so neither rider-facing SELECT policy on `lessons` admits it
// (`lessons_select_rider` → auth_is_enrolled_rider; `lessons_select_horse_privilege` →
// auth_lesson_has_privileged_horse), getLessonById's maybeSingle comes back empty, and
// [id]/page.tsx's `if (!lesson) notFound()` fires. Its later
// `myRiderEntry === null && !isPrivilegedViewer` gate is unreachable with this fixture — that one
// exists for a viewer who can *see* the row, which is a shape only a privileges grant produces.
//
// page.goto already resolves after redirects, so no waitForURL — on this path it would be the
// no-op sync point e2e/CLAUDE.md's fact 3 warns about.
test('rider_unenrolled_unprivileged_lesson_404s @rider', async ({ page }) => {
  const response = await page.goto(lessonPath(others))

  expect({ status: response!.status(), detailHeadings: await detailHeading(page).count() }).toEqual({
    status: 404,
    detailHeadings: 0,
  })
})
