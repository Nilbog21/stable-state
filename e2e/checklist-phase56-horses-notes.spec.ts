// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/components/ExhaustionBar.tsx
//
// #1006's Feed Notes / Medication Notes on the horse detail page, through a non-manager's eye:
// a horse you do not own renders both fields as read-only text with no textarea and no Save
// button, a field that is unset drops its row entirely rather than rendering blank, and a horse
// you *own* renders both as editable textareas with a Save whose write survives a reload.
// PRE_RELEASE_TEST_CHECKLIST.md lines 870-876 (Phase 5) and 935-938 (Phase 6).
//
// Three of those eleven checkboxes are `Setup —` lines (871, 873, 935): a manager mutation the
// manual walkthrough performs between assertions, which an e2e run seeds instead. Each is tagged
// with the name of the test its seeding serves, per the issue's "several checkboxes may share a
// single test" rule — the seed and the assertion it enables are one indivisible step here, and
// `(manual)` would reverse a #1251 verdict rather than record one.
//
// A paired slice: the same file is greped by @trainer and @rider, so Playwright dispatches it
// twice and each run seeds its own barn (support/test.ts). withBarn's callback cannot see the
// project name — test.ts resolves it in beforeAll, after the callback signature is fixed — so
// "the acting member owns X" cannot be seeded conditionally. Both barns therefore get *both*
// owned horses, one owned by members.trainer and one by members.rider, and each role's tests
// target their own.
//
// ## Why the rider's owned horse is not called Clover
//
// Lines 935-936 name Clover, and this file's rider tests assert against Willow instead — the same
// divergence checklist-phase56-horses-list.spec.ts documents for lines 939-941, forced by the
// same paired seeding. Clover is the *trainer's* owned horse and both live in one barn, so from
// the rider's side Clover is a horse someone else owns and renders read-only; it cannot also be
// the horse whose editable form the rider asserts on. The checklist lines keep their wording:
// their Clover is the manual dev-barn walkthrough's horse, planted by line 935's own Setup step.
// The claim each test makes is the line's claim; only the fixture's name differs.
//
// ## Ordering
//
// Only the last trainer test mutates anything (it is the persistence line, so writing is the
// point), and it writes to Clover, whose other two tests assert that the textareas and the Save
// button *exist* rather than what they hold. So no test here reads state another one left, and
// there is no test.describe.serial: the file is a set of independent reads plus one write, of a
// barn it owns outright.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs — these are what the spec puts in. No name contains another
// (every Playwright text matcher is substring-based), and none collides with the four seeded
// member names.
const CLOVER = 'Clover' // the trainer's owned horse
const WILLOW = 'Willow' // the rider's owned horse
const BUTTER = 'Butter' // unowned, both notes fields set — the read-only subject for both roles
const PEPPER = 'Pepper' // unowned, feed notes only — the dropped-row subject

// Butter's notes are the read-only text both roles assert on. Pepper carries the feed half only,
// which is what line 871's Setup ("clear one of that horse's two notes fields") seeds instead.
const BUTTER_FEED_NOTES = 'Two flakes of hay, morning and night.'
const BUTTER_MEDICATION_NOTES = 'Bute 1g with the evening feed.'
const PEPPER_FEED_NOTES = 'One scoop of ration balancer at noon.'

// Both owned horses start with notes so their textareas are non-empty, and so the persistence
// test below has a "before" value distinct from what it types — a save that never landed leaves
// these on screen after the reload, and the assertion sees it.
const OWNED_FEED_NOTES = 'Soaked hay cubes twice daily.'
const OWNED_MEDICATION_NOTES = 'Joint supplement with breakfast.'
const EDITED_FEED_NOTES = 'Four flakes of hay at dawn.'
const EDITED_MEDICATION_NOTES = 'Omeprazole paste before turnout.'

// The two field labels, shared by the read-only rows (as <dt> text) and the owner form (as the
// <label> getByLabel resolves) — one literal per field, so the two framings cannot drift apart.
const FEED_LABEL = 'Feed Notes'
const MEDICATION_LABEL = 'Medication Notes'
// The first row of the non-manager <dl>, and the only one Pepper keeps besides its feed notes.
const STATUS_LABEL = 'Status'
// SavedIndicator's transient success confirmation — the owner form's only save signal.
const SAVED_TEXT = '✓ Saved'

let cloverId: string
let willowId: string
let butterId: string
let pepperId: string

const barn = withBarn('phase56-horses-notes', async ({ supabase, barn, members }) => {
  cloverId = (
    await addHorse(supabase, barn.id, CLOVER, {
      owningMemberId: members.trainer.membershipId,
      feedNotes: OWNED_FEED_NOTES,
      medicationNotes: OWNED_MEDICATION_NOTES,
    })
  ).id
  willowId = (
    await addHorse(supabase, barn.id, WILLOW, {
      owningMemberId: members.rider.membershipId,
      feedNotes: OWNED_FEED_NOTES,
      medicationNotes: OWNED_MEDICATION_NOTES,
    })
  ).id
  butterId = (
    await addHorse(supabase, barn.id, BUTTER, {
      feedNotes: BUTTER_FEED_NOTES,
      medicationNotes: BUTTER_MEDICATION_NOTES,
    })
  ).id
  // No medicationNotes: addHorse writes each field only when passed, so the column stays NULL and
  // the page has a genuinely unset field to drop the row for. Seeding '' instead would test the
  // wrong thing — the page gates on falsiness, and an empty string is a different write path.
  pepperId = (await addHorse(supabase, barn.id, PEPPER, { feedNotes: PEPPER_FEED_NOTES })).id

  // Line 873's other half — the horse-privileges row a manager grants before making the trainer
  // Clover's owning member. Seeded inline rather than through a builder, per this batch's
  // seed-inline ruling: HorseOptions covers ownership but there is no member_horse_privileges
  // builder, and support/fixtures.ts is off limits to the fifteen slices running in parallel.
  //
  // Unlike the identically shaped insert in checklist-phase4-horses-detail.spec.ts, this row is
  // *not* load-bearing, and the difference is worth knowing before anyone extends this file.
  // There it is a hard precondition: that spec drives the UI's Set as Owner button, and
  // set_horse_owner raises 'privilege_grant_not_found' for a member holding no privileges row
  // (20260725115546). Here ownership is planted directly through addHorse, and the write path
  // under test — update_horse_notes (20260724155324) — authorizes on horses.owning_member_id
  // alone and never reads this table. The row is seeded because checklist line 873 names it, so
  // that the fixture says what the manual step says. Don't read a document-privileges claim into
  // its value: granting ownership through the real UI elevates the new owner to write plus
  // lesson-read (#1069), which this deliberately does not replay, since nothing in this slice's
  // line range is about privileges.
  mustSucceed(
    await supabase
      .from('member_horse_privileges')
      .insert({
        barn_id: barn.id,
        horse_id: cloverId,
        member_id: members.trainer.membershipId,
        document_privileges: 'read',
      })
      .select('id')
      .single(),
    'grant the trainer access to Clover'
  )
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function horseHref(horseId: string): string {
  return `/barn/${barn.slug}/horses/${horseId}`
}

/**
 * The <dt> label of every row in the non-manager detail <dl>, in DOM order.
 *
 * Read as textContent (toHaveText's default) rather than innerText on purpose: the labels carry
 * a Tailwind `uppercase` class, which innerText would apply and textContent does not.
 */
function rowLabels(page: Page) {
  return page.locator('dl dt')
}

/**
 * The <dd> values of the two notes rows, in DOM order — Feed Notes then Medication Notes.
 *
 * The filter selects rows by their own label, so asserting the two values as an ordered array
 * asserts the label-to-value binding too: a page that rendered the medication text under the
 * Feed Notes label fails, rather than passing on a set that happens to contain both strings.
 */
function readOnlyNotesValues(page: Page) {
  return page
    .locator('dl > div')
    .filter({ has: page.locator('dt', { hasText: new RegExp(`^(${FEED_LABEL}|${MEDICATION_LABEL})$`) }) })
    .locator('dd')
}

/** One of the owner form's textareas, resolved through its <label for> binding. */
function notesField(page: Page, label: string) {
  return page.getByLabel(label, { exact: true })
}

function saveButton(page: Page) {
  return page.getByRole('button', { name: 'Save', exact: true })
}

/**
 * Every editable-notes control on the page — the two textareas and the Save button — as one
 * locator, so "no textareas, no Save button" is a single claim rather than two counts.
 *
 * A count of zero is only worth asserting when something can drive it non-zero, and the owned-
 * horse tests below do exactly that with the same two halves: a page that stopped rendering the
 * form for *everyone* fails there rather than passing quietly here.
 */
function editableNotesControls(page: Page) {
  return page.locator('main').locator('textarea, button:has-text("Save")')
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/**
 * Blocks until the horse detail page has hydrated, before anything fills a textarea.
 *
 * The notes textareas are *controlled* React inputs, so a fill landing before hydration moves the
 * DOM value and nothing else — no onChange, no state — and React's first render then restores the
 * seeded string over it. The save that follows writes the old text and the reload assertion reads
 * it back happily (e2e/CLAUDE.md facts 9 and 10; #1199 measured about three seconds on an
 * already-warm route).
 *
 * The ExhaustionBar's popover is the signal, because it is `useState`-gated and therefore *cannot*
 * be open before hydration. Nothing on this page renders differently on hydration unless driven,
 * so an interaction-based signal is the only kind available, and it has to be retried — all of
 * which is hydrateByDriving's, in support/hydration.ts. Driven through the bar rather than through
 * a textarea so the retry writes nothing, and toggled shut so the page is left as it was found.
 *
 * Deliberately a copy of checklist-phase4-horses-documents.spec.ts's waitForHorseDetailHydrated
 * rather than an import or an extraction: this batch's fifteen slices may not touch shared e2e
 * support files, and #1280 already extracted the part that generalises.
 *
 * Only the trainer reaches this: the bar is role-visible to manager/trainer, while a rider sees it
 * only with a lesson-read privilege the rider's horse here is not granted. No rider test fills
 * anything, so none needs a barrier.
 */
async function waitForHorseDetailHydrated(page: Page): Promise<void> {
  const bar = page.getByRole('button', { name: /^Exhaustion: / })
  const openPopover = page.locator('[aria-label^="Exhaustion: "][aria-expanded="true"]')

  // Names the cause before the retry loop can bury it — without this, a missing bar degrades to a
  // bare test timeout inside toPass. Unbounded, so it tightens nothing (#1211).
  await bar.waitFor()

  await hydrateByDriving(
    () => bar.click(),
    async () => (await openPopover.count()) === 1
  )

  await bar.click()
  await openPopover.waitFor({ state: 'detached' })
}

/**
 * Type both fields and save, waiting for the write to land. A wait, never the test's assertion:
 * SavedIndicator renders only when the action returned no error, so it is the one available
 * success signal — the Save button carries no `loading` prop, so there is no disabled state to
 * wait on, and reloading without this races the server action (e2e/CLAUDE.md fact 8).
 */
async function editAndSaveNotes(page: Page): Promise<void> {
  await waitForHorseDetailHydrated(page)
  await notesField(page, FEED_LABEL).fill(EDITED_FEED_NOTES)
  await notesField(page, MEDICATION_LABEL).fill(EDITED_MEDICATION_NOTES)
  await saveButton(page).click()
  await page.getByText(SAVED_TEXT, { exact: true }).waitFor()
}

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's read-only view (lines 870-872)
// ---------------------------------------------------------------------------

// Two assertions, by the ratified indivisible-line exception (checklist-phase4-horses-detail.spec
// .ts's threshold_overrides_update_from_the_same_save cites #1200's precedent): the checkbox is
// one claim about one page state — the notes are text, and the controls that would make them
// editable are absent — and splitting it would leave the line naming two tests.
test('trainer_unowned_horse_notes_render_as_read_only_text @trainer', async ({ page }) => {
  await page.goto(horseHref(butterId))

  await expect(readOnlyNotesValues(page)).toHaveText([BUTTER_FEED_NOTES, BUTTER_MEDICATION_NOTES])
  await expect(editableNotesControls(page)).toHaveCount(0)
})

// The absence is asserted as the page's whole label list rather than as "Medication Notes is not
// visible": a bare toHaveCount(0) on that label would pass on a page that rendered no <dl> at all,
// which is the failure mode worth guarding. This fails in that case, fails if the surviving feed
// row disappeared, and fails the moment an empty Medication Notes row appears.
test('trainer_unset_notes_field_row_is_dropped_entirely @trainer', async ({ page }) => {
  await page.goto(horseHref(pepperId))
  await expect(rowLabels(page)).toHaveText([STATUS_LABEL, FEED_LABEL])
})

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's owned horse (lines 873-876)
// ---------------------------------------------------------------------------

// Two assertions, same ratified exception: the line names both fields, and one form renders them.
// toBeEditable rather than toBeVisible — "editable textarea" is the claim, and a disabled or
// readonly textarea would satisfy mere visibility.
test('trainer_owned_horse_notes_render_as_editable_textareas @trainer', async ({ page }) => {
  await page.goto(horseHref(cloverId))

  await expect(notesField(page, FEED_LABEL)).toBeEditable()
  await expect(notesField(page, MEDICATION_LABEL)).toBeEditable()
})

test('trainer_owned_horse_notes_form_shows_a_save_button @trainer', async ({ page }) => {
  await page.goto(horseHref(cloverId))
  await expect(saveButton(page)).toBeVisible()
})

// The reload is the whole claim, so it is a real page.reload() rather than a re-read of the DOM —
// the textareas hold their typed text either way until the document is thrown away. Both fields
// start on OWNED_* and are typed to EDITED_*, so a save that never landed shows the seeded text
// here and fails. Two assertions, same ratified exception: one Save writes both fields.
test('trainer_owned_horse_note_edits_persist_across_a_reload @trainer', async ({ page }) => {
  await page.goto(horseHref(cloverId))
  await editAndSaveNotes(page)
  await page.reload()

  await expect(notesField(page, FEED_LABEL)).toHaveValue(EDITED_FEED_NOTES)
  await expect(notesField(page, MEDICATION_LABEL)).toHaveValue(EDITED_MEDICATION_NOTES)
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's owned horse (lines 935-937)
// ---------------------------------------------------------------------------

test('rider_owned_horse_notes_render_as_editable_textareas @rider', async ({ page }) => {
  await page.goto(horseHref(willowId))

  await expect(notesField(page, FEED_LABEL)).toBeEditable()
  await expect(notesField(page, MEDICATION_LABEL)).toBeEditable()
})

test('rider_owned_horse_notes_form_shows_a_save_button @rider', async ({ page }) => {
  await page.goto(horseHref(willowId))
  await expect(saveButton(page)).toBeVisible()
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's read-only view (line 938)
// ---------------------------------------------------------------------------

// The rider's half of the read-only claim — see the trainer's comment above for both assertions.
// Butter serves both roles: she is owned by nobody, so neither role can edit her notes.
test('rider_unowned_horse_notes_render_as_read_only_text @rider', async ({ page }) => {
  await page.goto(horseHref(butterId))

  await expect(readOnlyNotesValues(page)).toHaveText([BUTTER_FEED_NOTES, BUTTER_MEDICATION_NOTES])
  await expect(editableNotesControls(page)).toHaveCount(0)
})
