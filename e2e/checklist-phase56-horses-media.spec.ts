// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/components/ui/Button.tsx
//
// Two adjacent regions of the horse detail page through a non-manager's eye: the **photo** —
// visible to everyone, writable only by the horse's owning member (#1003) — and the
// **Registered Name** row, which the page renders for a non-manager only when the column is set.
// Plus #1003's first non-manager file upload in this suite: a rider replacing the photo on the
// horse they own, driven through the real file input.
// checklists/pre-release/phase-5-trainer.md's photo and Registered Name blocks, and
// phase-6-rider.md's counterparts plus its #1003 own-horse photo block.
//
// A paired slice: the same file is greped by @trainer and @rider, so Playwright dispatches it
// twice and each run seeds its own barn (support/test.ts). withBarn's callback cannot see the
// project name — test.ts resolves it in beforeAll, after the callback signature is fixed — so
// "the acting member owns X" cannot be seeded conditionally. Both barns therefore get *both*
// subject horses, one owned by members.trainer and one by members.rider, and each role's tests
// target their own. The waste is two rows.
//
// ## Three places the fixtures deliberately diverge from the checklist's wording
//
// 1. **The rider's owned horse is Willow, not Clover.** Both subjects live in one barn, so the
//    trainer's Clover is an ordinary someone-else's horse from the rider's side. A second horse called
//    Clover would make every id-addressed locator here ambiguous by name. Same substitution, and
//    the same reason, as checklist-phase56-horses-list.spec.ts's.
//
// 2. **The horse with no registered name is Domino, not Apple.** The two "clear Apple's
//    **Registered Name**" lines are the `Setup`
//    steps that *state* the substitution — "An e2e run seeds a second horse with no registered
//    name instead" — and the two assertions read "Apple's detail page **then** shows no
//    Registered Name row" only because the manual walkthrough gets there by clearing the column.
//    Seeding two
//    horses is what makes the pair two independent reads rather than one mutation asserted twice
//    (the issue's own requirement), so the second read's subject is Domino.
//
// 3. **The registered name is not the lines' `e.g. "Four-Leaf Clover"`.** That example *contains*
//    `Clover`, a horse seeded in this very barn, and every Playwright text matcher is
//    substring-based — the same collision class fixtures.ts's E2E_STUB_RIDER comment is written
//    against. The lines say "e.g.", so the value is an example rather than the claim; the claim
//    is that whatever was seeded is the string rendered, which is asserted against the builder's
//    own return value below.
//
// In all three cases the checklist keeps its wording and only its tag changes, which is how the
// whole #1187-#1208 batch handled a fixture whose name differs from the dev-barn walkthrough's.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, setHorsePhoto, assetPath, E2E_USERS } from './support/fixtures'
import { BUTTER_PHOTO, HARPER_PHOTO, EMERY_PHOTO, CLOVER_PHOTO, displayedPhotoAsset, headerLines, photoControls, photoImage, photoSection } from './support/horse-pages'
import { settledTextContents } from './support/read'

// Seed inputs, not builder outputs — these are what the spec puts in. No name contains another
// (every Playwright text matcher is substring-based), and none collides with the four seeded
// member names.
const BUTTER = 'Butter' // manager-owned, photographed — the "a horse you do not own" subject
const APPLE = 'Apple' // manager-owned, carries a registered name
const DOMINO = 'Domino' // manager-owned, carries none
const CLOVER = 'Clover' // the trainer's subject
const WILLOW = 'Willow' // the rider's subject

// Deliberately not the checklist's "Four-Leaf Clover" — see divergence 3 in the header.
const REGISTERED_NAME = 'Emerald Fortune'

// The one header line that always renders, whatever else does. #1549 made every horse owned, so
// this is the owner's name rather than the "No owner set" placeholder it replaced — and the two
// horses this file reads the header of are owned by the barn's manager, which is what `addHorse`
// assigns when a spec doesn't say otherwise (and what the Add Horse form assigns in the app).
// It is what a registered-name assertion is read *against*: an expectation of exactly
// [registered name, this] fails if the row moved, if it vanished, or if the header stopped
// rendering at all — which is what the labelled `<dl>` used to buy before #1390 moved these lines
// into the identity header and dropped their labels.
const OWNER_LINE = `${E2E_USERS.manager.firstName} ${E2E_USERS.manager.lastName}`

let butterId: string
let appleId: string
let dominoId: string
let cloverId: string
let willowId: string
/** Read back off the builder's returned row, so no test compares REGISTERED_NAME to itself. */
let seededRegisteredName: string

/**
 * Both roles end up with a symmetric page: Butter is manager-owned and photographed, Apple and Domino
 * are the registered-name pair, and each role owns exactly one photographed horse.
 *
 * The two owned horses are seeded *with* photos on purpose. Their Photo sections are what the
 * absence tests below use as a positive control, and a control has to hold whatever else the file
 * does — an owned horse with a photo renders Replace Photo + Remove no matter where the rider's
 * upload chain got to, whereas an owned horse *without* one renders Set Photo before the chain
 * and Replace Photo + Remove after it. That order-dependence is the trap
 * checklist-phase4-horses-photos.spec.ts documents (a control that passes only in declaration
 * order and fails under a standalone --grep, against a perfectly healthy app).
 *
 * Neither owned horse ends up photo-locked, so its owner keeps write access — the state the two
 * "owning a horse grants photo write" items are about. That is createHorse's doing rather than setHorsePhoto's, and the difference
 * matters if this seed is ever copied: a service-role *set* goes through updateHorsePhotoPath,
 * which writes photo_uploaded_by only when the path is being cleared and otherwise leaves
 * whatever attribution was already there untouched (src/lib/db/horses.ts). The column starts
 * NULL from the insert and nothing here stamps it, so isPhotoLockedToOwner stays false. Reaching
 * the *locked* state needs a separate write — see checklist-phase4-horses-photos.spec.ts's
 * Butter, which stamps it explicitly for exactly that reason.
 */
const barn = withBarn('phase56-horses-media', async ({ supabase, barn, members }) => {
  // One asset per photographed horse, all four distinct, so a digest comparison below can only be
  // satisfied by the file the seed actually put there. clover-photo.png is the *upload* source
  // the "Using it to set `scripts/data/clover-photo.png`" line names by path; the other three are
  // pre-seeded starting states.
  butterId = (await addHorse(supabase, barn.id, BUTTER)).id
  await setHorsePhoto(supabase, barn, butterId, BUTTER_PHOTO)

  const apple = await addHorse(supabase, barn.id, APPLE, { registeredName: REGISTERED_NAME })
  if (!apple.registered_name) throw new Error(`${APPLE} was seeded without a registered name`)
  appleId = apple.id
  seededRegisteredName = apple.registered_name

  dominoId = (await addHorse(supabase, barn.id, DOMINO)).id

  cloverId = (await addHorse(supabase, barn.id, CLOVER, { owningMemberId: members.trainer.membershipId })).id
  await setHorsePhoto(supabase, barn, cloverId, HARPER_PHOTO)

  willowId = (await addHorse(supabase, barn.id, WILLOW, { owningMemberId: members.rider.membershipId })).id
  await setHorsePhoto(supabase, barn, willowId, EMERY_PHOTO)
})

// ---------------------------------------------------------------------------
// Locators and helpers
// ---------------------------------------------------------------------------

const horseUrl = (horseId: string) => `/barn/${barn.slug}/horses/${horseId}`

/**
 * Both destinations, as RegExp rather than Playwright's URL glob — `?` is a wildcard there rather
 * than the query separator the upload URL needs it to be.
 */
const atHorseDetail = (horseId: string) => new RegExp(`/horses/${horseId}$`)
const atPhotoUpload = (horseId: string) =>
  new RegExp(`/documents/new\\?entity=horse&id=${horseId}&type=photo`)

/**
 * How many controls the Photo section renders for a horse, read after the section has settled.
 *
 * The photo read is the settle barrier and it is not decoration: `count()` is one-shot, and a
 * page that hasn't rendered answers 0 — which is precisely the value the absence claim below is
 * looking for. Both horses this is called on are seeded *with* a photo, so the wait is a real
 * precondition either way round and a section that fails to render fails the test rather than
 * satisfying it.
 */
async function countPhotoControls(page: Page, horseId: string, horseName: string): Promise<number> {
  await page.goto(horseUrl(horseId))
  await photoImage(page, horseName).waitFor()
  return photoControls(page).count()
}

/**
 * Replace a horse's photo the way a user does: from the horse page, through the upload screen's
 * real file input.
 *
 * Reached by *clicking through* rather than by goto, the reason checklist-phase4-horses-documents
 * gives: the upload is triggered from the file input's own React onChange, and arriving by a
 * client-side navigation means the destination is rendered by an already-running React root. The
 * Upload button's wait is the second half of that guard — it names a form that never rendered
 * rather than letting the failure surface as a URL wait that times out for no stated reason.
 *
 * The Upload button is then deliberately never *clicked*: DocumentUploadForm calls requestSubmit()
 * from the file input's onChange in photoMode, so arriving back on the horse detail page having
 * clicked nothing is itself the proof the upload started immediately.
 *
 * test.slow() lives here so whichever test actually pays for an upload gets the raised budget,
 * including under a standalone --grep of a later test (#1206). No explicit timeout on either wait:
 * navigationTimeout defaults to unbounded, so a number could only tighten it (#1211).
 */
async function replacePhotoThroughTheUploadScreen(
  page: Page,
  horseId: string,
  assetName: string
): Promise<void> {
  test.slow()
  await page.goto(horseUrl(horseId))
  await photoSection(page).getByRole('link', { name: 'Replace Photo', exact: true }).click()
  await page.waitForURL(atPhotoUpload(horseId), { waitUntil: 'commit' })
  await page.getByRole('button', { name: 'Upload', exact: true }).waitFor()

  await page.setInputFiles('input[type="file"]', assetPath(assetName))
  await page.waitForURL(atHorseDetail(horseId), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's view of the photo: "displays her seeded photo" through "does show a
// **Set Photo**/**Replace Photo** control"
// ---------------------------------------------------------------------------

test('trainer_sees_the_seeded_photo_on_a_horse_they_do_not_own @trainer', async ({ page }) => {
  await page.goto(horseUrl(butterId))
  expect(await displayedPhotoAsset(page, BUTTER)).toBe(BUTTER_PHOTO)
})

// Counted rather than asserted absent, and counted on *two* horses through the same locator.
//
// A bare toHaveCount(0) on Butter would be defended by reasoning alone: nothing would ever have
// executed this locator against a section that does render controls, so a locator gone wrong would
// report "no controls" for every horse in the barn and pass. Clover is that positive control, read
// through the literally shared locator — she is owned by this trainer and photographed, so her
// section renders exactly the two controls this line says Butter's must not (Replace Photo and
// Remove), while a section that failed to resolve renders none.
test('trainer_sees_no_photo_controls_on_a_horse_they_do_not_own @trainer', async ({ page }) => {
  expect({
    unowned: await countPhotoControls(page, butterId, BUTTER),
    owned: await countPhotoControls(page, cloverId, CLOVER),
  }).toEqual({ unowned: 0, owned: 2 })
})

// The line's disjunction is "a Set Photo/Replace Photo control", and Clover is seeded with a
// photo, so Replace Photo is the variant that renders. `exact` is load-bearing in the other
// direction than usual here: getByRole's name match is substring-based, so a non-exact
// 'Replace Photo' would also match nothing else on this page — but pinning it keeps this
// assertion from silently widening if a future control's label contains this one's.
test('trainer_sees_a_photo_control_on_the_horse_they_own @trainer', async ({ page }) => {
  await page.goto(horseUrl(cloverId))
  await expect(photoSection(page).getByRole('link', { name: 'Replace Photo', exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's view of Registered Name: the "set Apple's **Registered Name**" Setup
// through "Apple's detail page then shows no **Registered Name** row"
// ---------------------------------------------------------------------------

// "Under the horse's name" is a positional claim, so it is asserted positionally: the header's
// text lines are read in DOM order and compared in full, which fails if the line is missing, if
// it moved below the owner, or if the header stopped rendering. The expected value is the
// *builder's* returned column rather than this file's REGISTERED_NAME constant, so the assertion
// cannot pass by comparing a literal to itself.
//
// settledTextContents rather than a bare allTextContents: the read is one-shot and an unrendered
// header answers [] (e2e/CLAUDE.md's read.ts rule).
test('trainer_horse_detail_shows_the_registered_name_row_below_status @trainer', async ({ page }) => {
  await page.goto(horseUrl(appleId))
  expect(await settledTextContents(headerLines(page))).toEqual([seededRegisteredName, OWNER_LINE])
})

// Asserted as the list's *whole* contents rather than as "the registered name is not visible",
// for the reason a bare count of zero can't be trusted: a header that failed to render satisfies
// an absence claim and a mutation of it equally. Requiring exactly the owner line fails in that
// case, and the settled read fails before it even gets there. Falsifiable against the test above,
// which drives the same locator to a two-line answer in the same file.
test('trainer_horse_detail_omits_the_registered_name_row_when_it_is_unset @trainer', async ({ page }) => {
  await page.goto(horseUrl(dominoId))
  expect(await settledTextContents(headerLines(page))).toEqual([OWNER_LINE])
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's view of the photo: "Butter's detail page (Dana does **not** own her)
// displays her seeded photo" and its no-controls companion
// ---------------------------------------------------------------------------

test('rider_sees_the_seeded_photo_on_a_horse_they_do_not_own @rider', async ({ page }) => {
  await page.goto(horseUrl(butterId))
  expect(await displayedPhotoAsset(page, BUTTER)).toBe(BUTTER_PHOTO)
})

// The rider's half of the same paired count — see the trainer's comment above. Willow is the
// positive control here, and she stays a valid one after the upload chain below has run: she is
// photographed before it and after it, so her section renders Replace Photo + Remove either way.
// That is why both owned horses are seeded with a photo rather than without one.
test('rider_sees_no_photo_controls_on_a_horse_they_do_not_own @rider', async ({ page }) => {
  expect({
    unowned: await countPhotoControls(page, butterId, BUTTER),
    owned: await countPhotoControls(page, willowId, WILLOW),
  }).toEqual({ unowned: 0, owned: 2 })
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's view of Registered Name: the "set Apple's **Registered Name**" Setup
// through "Apple's detail page then shows no **Registered Name** row"
// ---------------------------------------------------------------------------

test('rider_horse_detail_shows_the_registered_name_row_below_status @rider', async ({ page }) => {
  await page.goto(horseUrl(appleId))
  expect(await settledTextContents(headerLines(page))).toEqual([seededRegisteredName, OWNER_LINE])
})

test('rider_horse_detail_omits_the_registered_name_row_when_it_is_unset @rider', async ({ page }) => {
  await page.goto(horseUrl(dominoId))
  expect(await settledTextContents(headerLines(page))).toEqual([OWNER_LINE])
})

// ---------------------------------------------------------------------------
// Phase 6 — a rider writing their own horse's photo (#1003): "Clover's detail page shows a
// **Set Photo**/**Replace Photo** control" through "That photo then displays on Clover's detail page"
// ---------------------------------------------------------------------------

// Serial: the last two steps start from the state the one before left behind, which is the
// checklist's own framing ("Using it to set …", "That photo then displays …"). Safe because this
// file owns its barn, and nothing outside this block reads Willow's photo *content* — only her
// control count, which the seed fixes for the whole file.
//
// No orphan-sweeping afterAll is needed, unlike checklist-phase4-horses-photos.spec.ts's: that
// chain ends with the photo removed, which nulls the photo_path teardownBarnData sweeps by. This
// one ends with a photo *set*, and the superseded object is deleted by replaceHorsePhoto — the
// app's own behaviour — so teardown reaches the survivor and nothing is left behind either way.
test.describe.serial('a rider writing the photo on the horse they own', () => {
  // The control's mere presence is this line's whole claim — a rider, who is neither a manager
  // nor privileged in any other way, gets photo write purely from owning the horse.
  test('rider_sees_a_photo_control_on_the_horse_they_own @rider', async ({ page }) => {
    await page.goto(horseUrl(willowId))
    await expect(photoSection(page).getByRole('link', { name: 'Replace Photo', exact: true })).toBeVisible()
  })

  // "Succeeds" is asserted as landing back on the horse's own detail page, on content that exists
  // only *there* rather than on the URL: the App Router commits pushState only after the RSC
  // payload lands, and the layout chrome is shared between the two screens, so a URL read or a
  // nav-bar read can be satisfied by the page we just left. The upload screen's h1 is
  // "Replace Photo — Willow", so an exact "Willow" heading is false there and true here — which
  // makes this both the arrival check and the not-still-on-the-form check.
  //
  // A rejected upload would keep us on the form with a role="alert", so it cannot reach this.
  test('rider_setting_the_photo_on_their_own_horse_through_the_upload_screen_succeeds @rider', async ({ page }) => {
    await replacePhotoThroughTheUploadScreen(page, willowId, CLOVER_PHOTO)
    await expect(page.getByRole('heading', { name: WILLOW, exact: true })).toBeVisible()
  })

  // Re-read from a fresh navigation rather than off the page the upload left behind, so this is a
  // claim about what the server renders. Digest rather than filename or extension: Willow was
  // seeded with emery-photo.jpg, so matching clover-photo.png proves the bytes on screen changed
  // to the file the rider chose — and, by construction, that they are no longer the seeded ones.
  test('rider_the_photo_they_uploaded_displays_on_their_horses_detail_page @rider', async ({ page }) => {
    await page.goto(horseUrl(willowId))
    expect(await displayedPhotoAsset(page, WILLOW)).toBe(CLOVER_PHOTO)
  })
})
