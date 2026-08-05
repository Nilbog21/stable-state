// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/lessons/[id]/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/components/ExhaustionBar.tsx
//
// #999's `member_horse_privileges` through a rider's eye, end to end — the only automated coverage
// that table's two grants have anywhere. `checklists/pre-release/phase-6-rider.md` lines 36-50
// and 61-63 (eighteen checkboxes).
//
// `document_privileges` in three states and `lesson_read_privileges` in two, and every *absent*
// state needs a horse of its own, because a horse cannot simultaneously hold a grant and not hold
// one. Hence three horses, all in one barn:
//
//   Apple   lesson_read_privileges = true, document_privileges = 'none'
//           two future lessons, neither of which the rider login is enrolled in
//   Butter  document_privileges = 'read', raised to 'write' mid-file; lesson_read_privileges left
//           at its false default
//           one future lesson, likewise unenrolled; one seeded document (#1359)
//   Pepper  no privileges row at all
//
// The rider login is enrolled in **nothing** in this barn. That is the whole point: every lesson
// this file reaches, it reaches through a horse privilege rather than through enrolment, which is
// the claim `auth_lesson_has_privileged_horse` exists to make.
//
// ## Why Butter, and not Pepper, carries the "no lesson-read privilege" lines (956-957)
//
// Both horses satisfy the line as written. Butter is the stronger fixture because she *has* a
// privileges row — one granting document access, with `lesson_read_privileges` explicitly false —
// so her missing Exhaustion bar isolates that flag itself. On Pepper the absent row would explain
// the absence just as well, and the assertion could no longer tell the flag from the row. Butter
// also carries a real upcoming lesson, so the rows the bar would summarise genuinely exist and are
// being withheld, rather than being absent for want of data.
//
// ## Butter's seeded document (#1359)
//
// This file originally seeded no documents, because a document on a read-privileged horse took
// that horse's page down for the rider it was granted to. Measured, not inferred — a throwaway
// probe on this exact fixture returned **HTTP 500**: #999's grant was a policy on the
// `horse_documents` *table* only (`horse_documents_select_privilege`, 20260722222911), no
// `documents`-bucket storage policy admitted a rider on the `horses/` prefix, and the horse
// detail page signs a URL for every row it renders through a `getSignedUrl` that throws rather
// than degrades. #1359 closed that gap (`rider_horse_documents_select`/`_insert` storage
// policies, plus admitting a 'write'-privileged rider to the documents/new page and action the
// Add Document button already pointed at), so Butter now carries one seeded document and the
// serial block below asserts the whole surface: the row renders, its signed link serves the
// stored bytes, and — once the grant is raised — the upload path works end to end.
//
// ## Ordering
//
// One `test.describe.serial` block, holding the read → write transition on Butter's grant and
// nothing else. Every other test is an independent read of a barn this file owns outright.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addHorseDocument, addUnpaidLesson, assetPath, daysFromNow, E2E_STUB_RIDER } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs. No name contains another (every Playwright text matcher is
// substring-based), and none collides with the four seeded member names.
const APPLE = 'Apple' // lesson-read privileged
const BUTTER = 'Butter' // document privileged, read then write; no lesson-read
const PEPPER = 'Pepper' // no privileges row at all

// Apple's two lessons, and the exhaustion arithmetic every Apple assertion is derived from rather
// than hardcoded: the bar's label and its popover heading both read totals off these.
const APPLE_EXERTIONS = [4, 5]
const APPLE_EXERTION_TOTAL = APPLE_EXERTIONS[0] + APPLE_EXERTIONS[1]

// Butter's lesson exists only so lines 956-957 assert a withholding rather than an absence.
const BUTTER_EXERTION = 3

// Butter's seeded document (#1359) and the exact bytes addHorseDocument stores for it — the
// signed-link assertion reads the response body against this, which is the full-strength form
// of "the link opens": matching these bytes excludes every other object.
const BUTTER_DOC = 'butter-coggins.pdf'
const BUTTER_DOC_CONTENT = 'test document'

// The committed asset the write-privileged upload test submits through the real form.
const UPLOAD_PDF = 'test_1_kb.pdf'

// Planted on Apple's first lesson. The horse notes are line 969's claim; the two rider-note fields
// are line 970's, and belong to the *stub* rider — the rider login is not on this lesson at all,
// so anything of theirs on screen is someone else's.
const APPLE_LESSON_HORSE_NOTES = 'Wrap both front legs before this ride.'
const SUTTON_RIDER_NOTES = 'Working on sitting trot without stirrups.'
const SUTTON_PRIVATE_NOTES = 'Invoice runs a month behind; do not raise it in the ring.'

const STUB_RIDER_NAME = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`

let appleId: string
let butterId: string
let pepperId: string
let appleLessonIds: string[]

const barn = withBarn('phase6-horse-privileges', async ({ supabase, barn, members }) => {
  appleId = (await addHorse(supabase, barn.id, APPLE)).id
  butterId = (await addHorse(supabase, barn.id, BUTTER)).id
  pepperId = (await addHorse(supabase, barn.id, PEPPER)).id

  // Two lessons on Apple and one on Butter, all in the future and all inside the ±3-day window
  // get_horse_projected_exhaustion reads — +1 and +2 days clears both bounds without approaching
  // either. Every rider is the managed stub, so the rider login is enrolled in nothing here.
  const lessons = []
  for (const [i, exertion] of APPLE_EXERTIONS.entries()) {
    lessons.push(
      await addUnpaidLesson(supabase, barn, {
        at: daysFromNow(i + 1, barn.timezone),
        time: i === 0 ? '10:00' : '14:00',
        instructorId: members.trainer.membershipId,
        horseIds: [appleId],
        riderIds: [members.rider2.membershipId],
        exertionLevels: [exertion],
        fee: 50,
      })
    )
  }
  appleLessonIds = lessons.map((l) => l.id)

  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(1, barn.timezone),
    time: '11:00',
    instructorId: members.trainer.membershipId,
    horseIds: [butterId],
    riderIds: [members.rider2.membershipId],
    exertionLevels: [BUTTER_EXERTION],
    fee: 50,
  })

  // The notes lines 969 and 970 assert on. Inline service-role writes rather than builder options:
  // create_lesson_with_participants takes neither horse notes nor rider notes, and neither of
  // lesson-participants.ts's two write paths (update_lesson_rider_notes, and the plain
  // lesson_horses update beside it) takes an injectable client — the same reason addLeaseCharge
  // gives for not calling updateChargePaymentType. support/fixtures.ts, where a builder would
  // otherwise go, is off limits to this batch's parallel slices.
  mustSucceed(
    await supabase
      .from('lesson_horses')
      .update({ horse_notes: APPLE_LESSON_HORSE_NOTES })
      .eq('lesson_id', appleLessonIds[0])
      .eq('horse_id', appleId)
      .select('id')
      .single(),
    "plant horse notes on Apple's first lesson"
  )
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ rider_notes: SUTTON_RIDER_NOTES, private_notes: SUTTON_PRIVATE_NOTES })
      .eq('lesson_id', appleLessonIds[0])
      .eq('rider_id', members.rider2.membershipId)
      .select('id')
      .single(),
    "plant the stub rider's notes on Apple's first lesson"
  )

  // The two grants, inserted inline for the same reason as the notes above — there is no
  // member_horse_privileges builder. `member_id` is a *membership* id despite the name, and
  // `barn_id` is required: the table's FKs are composite, (barn_id, member_id) and
  // (barn_id, horse_id).
  //
  // Every state is written as an explicit key, including the two that match the column defaults
  // (Apple's `document_privileges: 'none'`, Butter's `lesson_read_privileges: false`). The row a
  // manager's real grant produces is identical either way — grantHorsePrivilege inserts neither —
  // so nothing is lost in fidelity, and a fixture whose states are readable off the seed rather
  // than off the schema is what the assertions below are worth reading against.
  //
  // Load-bearing rows, unlike the identically shaped insert in checklist-phase56-horses-notes
  // .spec.ts: the auth_get_horse_document_privilege / auth_has_horse_lesson_read_privilege helpers
  // read this table directly, and every assertion below is downstream of what they return.
  mustSucceed(
    await supabase
      .from('member_horse_privileges')
      .insert({
        barn_id: barn.id,
        horse_id: appleId,
        member_id: members.rider.membershipId,
        document_privileges: 'none',
        lesson_read_privileges: true,
      })
      .select('id')
      .single(),
    'grant the rider lesson-read on Apple'
  )
  mustSucceed(
    await supabase
      .from('member_horse_privileges')
      .insert({
        barn_id: barn.id,
        horse_id: butterId,
        member_id: members.rider.membershipId,
        document_privileges: 'read',
        lesson_read_privileges: false,
      })
      .select('id')
      .single(),
    'grant the rider document-read on Butter'
  )
  // Pepper deliberately gets no row.

  // Butter's document (#1359) — a real storage object, not just a row, because the page signs a
  // URL for every row it renders and the signed-link test reads the served bytes.
  await addHorseDocument(supabase, barn, butterId, {
    fileName: BUTTER_DOC,
    recordType: 'coggins',
    content: Buffer.from(BUTTER_DOC_CONTENT),
  })
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function horseHref(horseId: string): string {
  return `/barn/${barn.slug}/horses/${horseId}`
}

function lessonHref(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}`
}

function documentsHeading(page: Page) {
  return page.getByRole('heading', { name: 'Documents', exact: true })
}

/** `<Button href>` renders a Link, so the Add Document control is an anchor, not a button. */
function addDocumentLink(page: Page) {
  return page.getByRole('link', { name: 'Add Document', exact: true })
}

/** A document's file-name link, the signed-URL anchor the open test reads its href off. */
function documentLink(page: Page, fileName: string) {
  return page.getByRole('link', { name: fileName, exact: true })
}

/**
 * The upload destinations, as RegExp rather than Playwright's URL glob — `?` is a wildcard there
 * rather than the query separator the upload URL needs it to be (checklist-phase4-horses-documents
 * .spec.ts's reasoning, #1197/#1201). Anchored, so the `&type=photo` variant cannot match.
 */
const atDocumentUpload = (horseId: string) => new RegExp(`/documents/new\\?entity=horse&id=${horseId}$`)
const atHorseDetail = (horseId: string) => new RegExp(`/horses/${horseId}$`)

/**
 * The upload form's submit button, located structurally: its label is
 * `{pending ? 'Uploading…' : 'Upload'}`, so a name locator stops matching mid-flight (the
 * containment hazard #1202 found, live in this form).
 */
function uploadSubmitButton(page: Page) {
  return page.locator('main form').locator('button[type="submit"]')
}

/** Any exhaustion bar, for the absence assertions — its label carries live figures. */
function anyExhaustionBar(page: Page) {
  return page.getByRole('button', { name: /^Exhaustion: / })
}

function openExhaustionPopover(page: Page) {
  return page.locator('[aria-label^="Exhaustion: "][aria-expanded="true"]')
}

function exhaustionPopoverRows(page: Page) {
  return page.getByTestId('exhaustion-bar-row')
}

function upcomingLessonsHeading(page: Page) {
  return page.getByRole('heading', { name: 'Upcoming Lessons', exact: true })
}

/**
 * The Upcoming Lessons section, resolved **as the last child of `main`** rather than by its own
 * heading — which is how line 954's "at the bottom" is asserted (the same structural shape #1320
 * used for "My Horses at the top"). The page's sections are a flat list of `main`'s children and
 * this one is declared last in the JSX, so the position claim survives every combination of the
 * conditional sections above it appearing or not.
 *
 * Everything the collapsed/expanded assertions read is scoped through this, so a page that moved
 * the section fails those too rather than passing on a section found elsewhere.
 */
function lastSection(page: Page) {
  return page.locator('main > *').last()
}

/**
 * The horse detail page's `<h1>`. A precondition for every absence assertion below, never the
 * claim: `toHaveCount(0)` is satisfied just as happily by a 404, an error page, or a document that
 * never rendered, and each of those would report as the privilege gate working.
 */
function horseHeading(page: Page, name: string) {
  return page.getByRole('heading', { name, exact: true, level: 1 })
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/**
 * Taps the Exhaustion bar and leaves its popover open — line 953's interaction, and a hydration
 * barrier in the same act.
 *
 * The popover is `useState`-gated, so it cannot exist before hydration; a click dispatched before
 * React is listening is simply lost and nothing replays it (e2e/CLAUDE.md fact 10 — fact 9 is the
 * `fill()` half of the same hazard and doesn't reach this page). That is why this retries through
 * `hydrateByDriving` rather than clicking once and waiting — a single drive that lands early can
 * only run out the test's budget. The toggle is safe to re-dispatch because `hydrateByDriving`
 * re-drives only while the popover is still shut.
 *
 * The bare `waitFor` first names the cause before the retry loop can bury it: without it, a missing
 * bar degrades into an anonymous timeout inside `toPass`. Unbounded, so it tightens nothing (#1211).
 */
async function tapExhaustionBar(page: Page): Promise<void> {
  const bar = anyExhaustionBar(page)
  await bar.waitFor()

  await hydrateByDriving(
    () => bar.click(),
    async () => (await openExhaustionPopover(page).count()) === 1
  )
}

/** Opens the collapsed `<details>`, which is native markup and needs no hydration barrier. */
async function expandUpcomingLessons(page: Page): Promise<void> {
  await lastSection(page).locator('summary').click()
}

/**
 * Every href in the expanded Upcoming Lessons list.
 *
 * `evaluateAll` is one-shot exactly as `allInnerTexts` is, so it keeps the inline
 * `waitFor` support/read.ts prescribes for it — an unrendered list would otherwise yield `[]` and
 * an array comparison against `[]` passes on nothing.
 */
async function upcomingLessonHrefs(page: Page): Promise<string[]> {
  const links = lastSection(page).locator('a[href]')
  await links.first().waitFor()
  return links.evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''))
}

// ---------------------------------------------------------------------------
// Document privileges — lines 945-949
//
// Serial, because line 948 is a mid-file change to the same grant the two tests above it read. The
// two `Setup —` checkboxes in this range (945, 948) are tagged with the test whose seeding they
// serve, per this batch's shared-name rule: the seed and the assertion it enables are one
// indivisible step, and `(manual)` would reverse a #1251 verdict rather than record one.
// ---------------------------------------------------------------------------

test.describe.serial('document privileges on Butter', () => {
  test('rider_read_document_privilege_shows_the_documents_section @rider', async ({ page }) => {
    await page.goto(horseHref(butterId))
    await expect(documentsHeading(page)).toBeVisible()
  })

  // Falsifiable by construction: the very next test drives this same locator non-zero on this same
  // horse, so a page that had stopped rendering the button for everyone fails there rather than
  // passing quietly here.
  test('rider_read_document_privilege_hides_the_add_document_button @rider', async ({ page }) => {
    await page.goto(horseHref(butterId))

    await expect(documentsHeading(page)).toBeVisible()
    await expect(addDocumentLink(page)).toHaveCount(0)
  })

  // #1359's read half at full strength: the row renders (the pre-fix page 500'd here — the
  // storage SELECT denial made getSignedUrl throw inside the Server Component) and the signed
  // link serves the stored bytes, asserted against the seeded content rather than "non-zero
  // bytes", which carries its own negative half.
  test('rider_read_document_privilege_opens_a_seeded_document @rider', async ({ page }) => {
    await page.goto(horseHref(butterId))

    const link = documentLink(page, BUTTER_DOC)
    await link.waitFor()
    const href = await link.getAttribute('href')
    if (!href) throw new Error(`no href on the ${BUTTER_DOC} document link`)

    const response = await page.request.get(href)
    expect({ status: response.status(), body: (await response.body()).toString() }).toEqual({
      status: 200,
      body: BUTTER_DOC_CONTENT,
    })
  })

  // Line 948's Setup step, performed where the manual walkthrough performs it — between the read
  // assertions above and the write assertion below. A service-role write, not a read: the
  // "preconditions only" rule governs what a spec may *believe* from a direct query, and this
  // believes nothing, it plants the state whose consequence the assertion then reads off the page.
  test('rider_write_document_privilege_shows_the_add_document_button @rider', async ({ page }) => {
    const { supabase, barn: seededBarn, members } = barn.data
    mustSucceed(
      await supabase
        .from('member_horse_privileges')
        .update({ document_privileges: 'write' })
        .eq('barn_id', seededBarn.id)
        .eq('horse_id', butterId)
        .eq('member_id', members.rider.membershipId)
        .select('id')
        .single(),
      "raise the rider's Butter grant to write"
    )

    await page.goto(horseHref(butterId))
    await expect(addDocumentLink(page)).toBeVisible()
  })

  // #1359's write half, through the real form: the button's destination renders for a
  // 'write'-privileged rider (the pre-fix documents/new page 404'd riders outright, before the
  // storage INSERT policy could even be consulted) and the upload lands — redirect back to the
  // horse page, new row visible. test.slow() because an upload pays for a real storage
  // round-trip (checklist-phase4-horses-documents.spec.ts's chooseFileAndSubmit rationale).
  test('rider_write_document_privilege_upload_succeeds @rider', async ({ page }) => {
    test.slow()
    await page.goto(horseHref(butterId))
    await addDocumentLink(page).click()
    await page.waitForURL(atDocumentUpload(butterId), { waitUntil: 'commit' })

    const submit = uploadSubmitButton(page)
    await submit.waitFor()
    await page.locator('main form select').selectOption('coggins')
    await page.setInputFiles('input[type="file"]', assetPath(UPLOAD_PDF))
    await submit.click()

    await page.waitForURL(atHorseDetail(butterId), { waitUntil: 'commit' })
    await expect(documentLink(page, UPLOAD_PDF)).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// Document privileges — line 950, the absent state
// ---------------------------------------------------------------------------

// Pepper holds no privileges row at all, which is what the line means by "no document privilege" —
// distinct from Apple's explicit 'none' and from Butter's 'read'. The heading assertion is the
// precondition, not the claim: it proves the page rendered before the absence is read off it.
test('rider_without_a_document_privilege_sees_no_documents_section @rider', async ({ page }) => {
  await page.goto(horseHref(pepperId))

  await expect(horseHeading(page, PEPPER)).toBeVisible()
  await expect(documentsHeading(page)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Lesson-read privileges — lines 951-955
//
// Line 951's Setup checkbox is tagged with the test its seeding serves, same rule as 945 and 948.
// ---------------------------------------------------------------------------

// The bar's accessible name is derived from the seeded exertions, not written out: a fixture change
// that altered either lesson would fail this rather than silently keep passing against a stale
// literal.
test('rider_lesson_read_privilege_shows_the_exhaustion_bar @rider', async ({ page }) => {
  await page.goto(horseHref(appleId))

  await expect(
    page.getByRole('button', {
      name: `Exhaustion: ${APPLE_EXERTION_TOTAL} points from ${APPLE_EXERTIONS.length} lessons`,
      exact: true,
    })
  ).toBeVisible()
})

// Two assertions, by the ratified indivisible-line exception: one tap, one popover, and the line
// names both halves of what it opens — the ±3-day framing and the per-lesson breakdown under it.
// Both figures are derived from the seeded exertions.
test('rider_tapping_the_exhaustion_bar_expands_the_three_day_breakdown @rider', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await tapExhaustionBar(page)

  await expect(
    page.getByText(`${APPLE_EXERTION_TOTAL} points from ${APPLE_EXERTIONS.length} lessons (±3-day window)`)
  ).toBeVisible()
  await expect(exhaustionPopoverRows(page)).toHaveCount(APPLE_EXERTIONS.length)
})

// Three assertions, for one checkbox that makes three claims about one page state — the section is
// at the bottom, it is collapsed, and it lists this horse's lessons. The position claim is
// structural (see `lastSection`) and the other two are scoped through it, so all three fail
// together if the section moved.
//
// Neither way of splitting this is available, which is why they are bundled rather than merely
// convenient to bundle. Splitting the *test* three ways would leave line 954 naming one of them and
// the other two claims asserted by tests no checklist line names — the batch's bundling rule is
// about several checkboxes sharing one test, and offers nothing for one checkbox making several
// claims. Splitting the *line* three ways would insert two lines into a file fifteen slices are
// editing concurrently, shifting every line number below it into their ranges — the one edit this
// slice is explicitly forbidden to make.
//
// Set membership rather than row order: #1286 has since ordered `get_horse_projected_exhaustion`
// and getLessonById's embeds, but `getUpcomingLessonsForHorse` is a plain `.order('lesson_at')` and
// order is not what this line claims — the claim is which lessons are listed. A membership
// assertion is correct either side of that, and stays correct if the ordering moves again.
test('rider_lesson_read_privilege_shows_a_collapsed_upcoming_lessons_section @rider', async ({ page }) => {
  await page.goto(horseHref(appleId))

  await expect(lastSection(page).getByRole('heading', { name: 'Upcoming Lessons', exact: true })).toBeVisible()
  await expect(lastSection(page).locator('ul')).toBeHidden()

  await expandUpcomingLessons(page)
  expect((await upcomingLessonHrefs(page)).sort()).toEqual(appleLessonIds.map(lessonHref).sort())
})

// The rider login is on no `lesson_riders` row in this barn, so every lesson in that list is one she
// is not enrolled in — reaching it at all is `auth_lesson_has_privileged_horse` doing its job.
//
// `waitUntil: 'commit'` with no timeout number (a `Card href` is a Next Link, so this is a soft
// nav), and the assertion that follows names markup only the destination has — the horse detail
// page carries no "Lesson Detail" heading, so a soft nav that never landed fails here rather than
// passing on the previous document.
test('rider_tapping_an_unenrolled_upcoming_lesson_loads_its_detail_page @rider', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await expandUpcomingLessons(page)

  await lastSection(page).locator(`a[href="${lessonHref(appleLessonIds[0])}"]`).click()
  await page.waitForURL(new RegExp(`${appleLessonIds[0]}$`), { waitUntil: 'commit' })

  await expect(page.getByRole('heading', { name: 'Lesson Detail', exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Lesson-read privileges — lines 956-957, the absent state
// ---------------------------------------------------------------------------

// Butter's row grants documents and leaves `lesson_read_privileges` false, so these two isolate the
// flag rather than the row's existence — and she carries a real upcoming lesson, so what is missing
// is being withheld rather than absent for want of data. The Apple tests above drive both locators
// non-zero against that same data shape.
test('rider_without_a_lesson_read_privilege_sees_no_exhaustion_bar @rider', async ({ page }) => {
  await page.goto(horseHref(butterId))

  await expect(horseHeading(page, BUTTER)).toBeVisible()
  await expect(anyExhaustionBar(page)).toHaveCount(0)
})

test('rider_without_a_lesson_read_privilege_sees_no_upcoming_lessons_section @rider', async ({ page }) => {
  await page.goto(horseHref(butterId))

  await expect(horseHeading(page, BUTTER)).toBeVisible()
  await expect(upcomingLessonsHeading(page)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The privileged lesson's detail page — lines 968-970
//
// Reached by goto rather than by re-driving the tap above: it is the same URL and the same page
// state, and the test directly above owns the claim that the tap gets there. Keeping these three
// independent beats chaining four tests through one navigation.
// ---------------------------------------------------------------------------

// Scoped to Apple's own list entry, so this asserts the rating is next to *her* name rather than
// merely present somewhere on the page. The value is the seeded exertion.
test('rider_privileged_horse_shows_an_exertion_rating_on_the_lesson_detail_page @rider', async ({ page }) => {
  await page.goto(lessonHref(appleLessonIds[0]))

  const appleEntry = page.locator('li').filter({ hasText: APPLE })
  await expect(appleEntry.getByText(`(exertion ${APPLE_EXERTIONS[0]})`, { exact: true })).toBeVisible()
})

test('rider_privileged_horse_shows_its_horse_notes_on_the_lesson_detail_page @rider', async ({ page }) => {
  await page.goto(lessonHref(appleLessonIds[0]))

  const appleEntry = page.locator('li').filter({ hasText: APPLE })
  await expect(appleEntry.getByText(APPLE_LESSON_HORSE_NOTES, { exact: true })).toBeVisible()
})

// Two assertions, one page state, and the line names both note kinds.
//
// The stub rider's name is asserted visible first as a positive control, not as a second claim: a
// privileged viewer sees the lesson's `lesson_riders` rows (auth_lesson_has_privileged_horse), so
// the row this rider's notes would render in is demonstrably on screen. Without it, both counts
// would read zero on a page that rendered no riders at all — which is the same number the
// withholding produces.
test('rider_other_riders_notes_stay_hidden_on_the_privileged_lesson_detail_page @rider', async ({ page }) => {
  await page.goto(lessonHref(appleLessonIds[0]))
  await expect(page.getByText(STUB_RIDER_NAME, { exact: true })).toBeVisible()

  await expect(page.getByText(SUTTON_RIDER_NOTES)).toHaveCount(0)
  await expect(page.getByText(SUTTON_PRIVATE_NOTES)).toHaveCount(0)
})
