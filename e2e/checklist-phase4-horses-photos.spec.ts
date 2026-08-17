// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/components/EmptyState.tsx
//
// The horse photo lifecycle: the placeholder and Set Photo button with no photo set, the
// photo-locked upload screen and its three absent fields, upload-on-choose, aspect-ratio-preserving
// display, replace with a different file *and* format, the post-reload check that the old photo is
// gone, remove restoring the placeholder, a non-image rejection, and #1003's owner lock
// (checklists/pre-release/phase-4-manager-verification.md, the block from "Clover's detail page (no
// photo seeded) shows a placeholder icon" through "no **Replace Photo**/**Remove** control is shown
// to you").
//
// Four horses, because each flow needs a different starting state and two of them must *stay* in
// theirs: Clover with no photo (the set/replace/remove chain), Apple owned by a rider but with no
// photo (a manager may still write — the lock needs an owner *and* an owner-uploaded photo), and
// then Butter and Daisy, the lock's matched pair. Reusing Apple for the lock would destroy the
// unlocked state its own two checkboxes assert.
//
// Butter and Daisy are seeded identically — same owner, same photo, same asset — and differ in
// exactly one column, `photo_uploaded_by`. That is what makes the lock assertion a controlled
// comparison rather than two unrelated readings: the only thing that can explain a difference
// between them is the column the lock keys on.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, setHorsePhoto, assetPath } from './support/fixtures'
import { CLOVER_PHOTO, BUTTER_PHOTO, HARPER_PHOTO, EMERY_PHOTO, displayedPhotoAsset, photoControls, photoImage, photoSection } from './support/horse-pages'
import { uploadForm } from './support/document-upload'
import { mustSucceed } from '@/lib/db/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// Seed inputs, not builder outputs — these names are what the spec puts in, and what the img's
// accessible name (alt={horse.name}) is read back as below.
const CLOVER = 'Clover'
const APPLE = 'Apple'
const BUTTER = 'Butter'
const DAISY = 'Daisy'

// The one assertion here that waits on a server action plus its revalidate with nothing else to
// synchronise on. `toBeVisible` is a web-first matcher, so it runs on expect's 5s default and
// `test.slow()` cannot raise it — the third tier in support/test.ts's Timeouts block, and the one
// place a number *loosens*. Widened here rather than globally, where it would slow every genuine
// failure in the suite down. Kept file-local on purpose (#1469): a shared export is what invites
// writing the number where a sync point is the real fix.
const SETTLE_AFTER_WRITE = 15_000

// The one non-image asset here — the upload the unsupported-file-type line rejects. The four photo
// filenames it used to sit beside, and the rationale for their reuse across entities, moved to
// support/horse-pages.ts with the consts themselves.
const TEST_PDF = 'test_1_kb.pdf'

// All four images are 900x260 — deliberately non-square, which is the whole point of the
// "aspect ratio preserved" line's "not cropped off to make a square". Written as literals
// rather than measured from the file: the
// assertion has to disagree with a wrong render, and a value read from the same bytes the browser
// decoded would agree with any bug in between.
const PHOTO_NATURAL_SIZE = '900x260'
// Tailwind h-32 on the <img> (horses/[id]/page.tsx — h-48 until #1390 moved the photo into the
// identity header). w-auto then makes the width follow the intrinsic ratio:
// 128 * 900 / 260 = 443.077..., which rounds to 443. A square crop would render 128x128, so the
// pair fails on width while still passing on height — which is what makes the triple a real test
// of "aspect ratio preserved" rather than of "an image is present".
const PHOTO_RENDERED_HEIGHT = 128
const PHOTO_RENDERED_WIDTH = 443

let cloverId: string
let appleId: string
let butterId: string
let daisyId: string
/** Captured in the seed so the storage probe in the reload test can't depend on `barn.data`. */
let seedClient: SupabaseClient | null = null
/** Clover's pre-replace storage object path, captured by the replace test and read by the next. */
let cloverOldPhotoPath: string | null = null

const barn = withBarn('phase4-horses-photos', async ({ supabase, barn, members }) => {
  seedClient = supabase

  cloverId = (await addHorse(supabase, barn.id, CLOVER)).id
  appleId = (await addHorse(supabase, barn.id, APPLE, { owningMemberId: members.rider.membershipId })).id

  // The owner lock's positive case. setHorsePhoto goes through replaceHorsePhoto, whose
  // updateHorsePhotoPath writes photo_uploaded_by only on *delete* — a service-role write has no
  // acting membership to attribute, so a *set* leaves whatever attribution was already there
  // untouched, and here there is none. Hence the stamp below. Inline in this barn's own
  // callback rather than as a new fixtures.ts option: twenty slices share that file (ruling 4).
  butterId = (await addHorse(supabase, barn.id, BUTTER, { owningMemberId: members.rider2.membershipId })).id
  await setHorsePhoto(supabase, barn, butterId, BUTTER_PHOTO)
  mustSucceed(
    await supabase
      .from('horses')
      .update({ photo_uploaded_by: members.rider2.membershipId })
      .eq('id', butterId)
      .select('id')
      .single(),
    'stamp Butter photo as set by its owning member'
  )

  // Butter's control: identical in every respect except that nothing stamps photo_uploaded_by, so
  // the photo reads as manager-set and the section stays editable. Deliberately *not* Apple — her
  // photo is produced by another describe block, so borrowing her as the control would make this
  // assertion depend on declaration order and fail under a standalone --grep of it.
  daisyId = (await addHorse(supabase, barn.id, DAISY, { owningMemberId: members.rider2.membershipId })).id
  await setHorsePhoto(supabase, barn, daisyId, BUTTER_PHOTO)
})

// ---------------------------------------------------------------------------
// Locators and helpers
// ---------------------------------------------------------------------------

const horseUrl = (horseId: string) => `/barn/${barn.slug}/horses/${horseId}`
const photoUploadUrl = (horseId: string) =>
  `/barn/${barn.slug}/documents/new?entity=horse&id=${horseId}&type=photo`

/**
 * Both destinations, as RegExp rather than Playwright's URL glob — `?` is a wildcard there rather
 * than the query separator the upload URL needs it to be (same reason #1201 gives).
 */
const atHorseDetail = (horseId: string) => new RegExp(`/horses/${horseId}$`)
const atPhotoUpload = (horseId: string) =>
  new RegExp(`/documents/new\\?entity=horse&id=${horseId}&type=photo`)

/** The upload form's Document Type field — its first child div, located by its own label. */
function documentTypeField(page: Page) {
  return uploadForm(page).locator('> div').filter({ has: page.getByText('Document Type', { exact: true }) })
}

/**
 * Settles the two field-count reads below, which are one-shot and answer 0 against a form that
 * hasn't rendered (#1243).
 *
 * Waits on the submit button rather than the Choose File one: `input[type="file"]` also carries
 * the button role and resolves to "Choose File" by accessible name, so that locator is a strict-
 * mode violation rather than a guard — measured, not assumed.
 */
async function formRendered(page: Page): Promise<void> {
  await uploadForm(page).getByRole('button', { name: 'Upload', exact: true }).waitFor()
}

/**
 * Choose a file on the photo upload screen and wait to land back on the horse.
 *
 * The Upload button is deliberately never clicked — DocumentUploadForm calls requestSubmit() from
 * the file input's own onChange in photoMode, so arriving back on the horse detail page having
 * clicked nothing *is* the proof the upload started immediately. Catching the transient
 * Uploading…/progressbar state instead would race a fast upload.
 *
 * test.slow() lives here rather than on the individual tests so whichever test actually pays for
 * an upload gets the raised budget, including under a standalone --grep of a later test (#1206).
 * No explicit timeout on the wait: navigationTimeout defaults to unbounded, so a number here could
 * only tighten it (#1211).
 */
async function uploadPhoto(page: Page, horseId: string, assetName: string): Promise<void> {
  test.slow()
  await page.setInputFiles('input[type="file"]', assetPath(assetName))
  await page.waitForURL(atHorseDetail(horseId), { waitUntil: 'commit' })
}

/** Whether a storage object still exists, read service-role — storage shape, never an expected UI value. */
async function objectStillStored(path: string): Promise<boolean> {
  if (!seedClient) throw new Error('no seeded service client')
  const { error } = await seedClient.storage.from('documents').download(path)
  return !error
}

/** A horse's current photo_path, read service-role. Throws rather than returning null. */
async function currentPhotoPath(horseId: string): Promise<string> {
  if (!seedClient) throw new Error('no seeded service client')
  const row = mustSucceed<{ photo_path: string | null }>(
    await seedClient.from('horses').select('photo_path').eq('id', horseId).single(),
    'read horse photo path'
  )
  if (!row.photo_path) throw new Error(`horse ${horseId} has no photo_path`)
  return row.photo_path
}

// ---------------------------------------------------------------------------
// Clover: no photo -> set -> replace -> remove
// ---------------------------------------------------------------------------

// Serial: every step starts from the state its predecessor left behind, which is the checklist's
// own framing ("With a photo set, tap Replace Photo…"). Safe because this file owns its barn.
test.describe.serial('the horse photo lifecycle', () => {
  // This chain ends with Clover's photo *removed*, and that is the one state teardown cannot
  // reach: teardownBarnData sweeps horse photo storage by reading `horses.photo_path`, and the
  // Remove has just nulled it. The object's only deletion is removeHorsePhoto's own best-effort
  // `removeFile(...).catch(() => {})`, so if that ever regressed the bucket would accumulate one
  // orphan per run with every test still green — the spec would be relying on the behaviour under
  // test to clean up after itself.
  //
  // Swept by prefix rather than by a captured path, so it holds however the chain ended: a
  // mid-chain failure that leaves a photo set is covered by the same call. A describe-scoped
  // afterAll runs before the file-scoped one withBarn registers, so this happens while the barn
  // still exists.
  test.afterAll(async () => {
    if (!seedClient || !cloverId) return
    const prefix = `${barn.data.barn.id}/horse-photos/${cloverId}`
    const { data, error } = await seedClient.storage.from('documents').list(prefix)
    if (error) throw new Error(`list Clover photo objects: ${error.message}`)
    const paths = (data ?? []).map((o) => `${prefix}/${o.name}`)
    if (paths.length === 0) return
    const { error: removeError } = await seedClient.storage.from('documents').remove(paths)
    if (removeError) throw new Error(`remove orphaned Clover photo objects: ${removeError.message}`)
  })

  // The placeholder is EmptyState's aria-hidden svg. Asserted with toBeVisible rather than a count:
  // an empty locator fails toBeVisible, and strict mode fails a locator matching more than one, so
  // the single assertion pins "exactly one icon, and it is rendered".
  test('clovers_photo_section_shows_a_placeholder_icon_when_no_photo_is_set @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await expect(photoSection(page).locator('svg[aria-hidden="true"]')).toBeVisible()
  })

  test('clovers_photo_section_shows_a_set_photo_button_when_no_photo_is_set @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await expect(photoSection(page).getByRole('link', { name: 'Set Photo' })).toBeVisible()
  })

  // The URL wait pins *which* screen — the same /documents/new route horse documents use, with the
  // photo query — and the heading pins that it rendered. `exact` is load-bearing: getByRole's name
  // match is substring-based, and the origin page's own h1 is "Clover", so a non-exact match would
  // pass against the page we started on and prove nothing about the navigation (#1196).
  test('tapping_set_photo_opens_the_horse_document_upload_screen @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await photoSection(page).getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atPhotoUpload(cloverId), { waitUntil: 'commit' })

    await expect(page.getByRole('heading', { name: `Set Photo — ${CLOVER}`, exact: true })).toBeVisible()
  })

  // Both halves in one assertion, and the pairing is the vacuity guard: `value` comes from a read
  // that *throws* when the <p> isn't there, so a zero dropdown count can never be the answer to a
  // field that failed to render. A <select> carrying a single "Photo" option would satisfy the text
  // alone, which is why the count is asserted rather than inferred.
  test('the_photo_upload_screen_locks_document_type_to_photo_with_no_dropdown @manager', async ({ page }) => {
    await page.goto(photoUploadUrl(cloverId))
    const field = documentTypeField(page)

    expect({
      value: await field.locator('p').innerText(),
      dropdowns: await field.locator('select').count(),
    }).toEqual({ value: 'Photo', dropdowns: 0 })
  })

  // Zero paired with a non-zero positive control, for the reason a bare toHaveCount(0) can't be
  // trusted: a locator that resolves to nothing satisfies an absence claim and a mutation of it
  // equally. In photoMode the form's only real field is the file one, so `fields: 1` is
  // simultaneously the proof the form rendered and the proof no Notes field is hiding among its
  // siblings — and it discriminates the two modes, since the full form renders three.
  //
  // Hidden inputs are excluded because four of them are React's, not the app's: a form bound to a
  // Server Action carries $ACTION_REF_1, $ACTION_1:0, $ACTION_1:1 and $ACTION_KEY for progressive
  // enhancement. Counting them would have pinned a framework detail rather than the field list
  // (measured — a bare `input` count answers 5 here).
  test('the_photo_upload_screen_has_no_notes_field @manager', async ({ page }) => {
    await page.goto(photoUploadUrl(cloverId))
    const form = uploadForm(page)
    await formRendered(page)

    expect({
      notesFields: await form.locator('input[name="notes"]').count(),
      fields: await form.locator('input:not([type="hidden"])').count(),
    }).toEqual({ notesFields: 0, fields: 1 })
  })

  test('the_photo_upload_screen_has_no_expiration_reminder_date_field @manager', async ({ page }) => {
    await page.goto(photoUploadUrl(cloverId))
    const form = uploadForm(page)
    await formRendered(page)

    expect({
      reminderDateFields: await form.locator('input[name="reminder_date"]').count(),
      fields: await form.locator('input:not([type="hidden"])').count(),
    }).toEqual({ reminderDateFields: 0, fields: 1 })
  })

  // Asserted on content that exists only on the destination rather than on the URL: the App Router
  // commits pushState only after the RSC payload lands, so a URL read can pass before the landing
  // (fleet ruling, #1196). The upload screen's h1 is "Set Photo — Clover", so an exact "Clover"
  // heading is false there and true here.
  test('choosing_a_photo_file_uploads_it_immediately_with_no_upload_click @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await photoSection(page).getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atPhotoUpload(cloverId), { waitUntil: 'commit' })
    await uploadPhoto(page, cloverId, CLOVER_PHOTO)

    await expect(page.getByRole('heading', { name: CLOVER, exact: true })).toBeVisible()
  })

  test('the_uploaded_horse_photo_displays_on_the_horse_detail_page @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    expect(await displayedPhotoAsset(page, CLOVER)).toBe(CLOVER_PHOTO)
  })

  // The line's "both | edge bars still visible, not cropped off to make a square" is a pixel
  // judgment; the invariant underneath it is geometric and is asserted in full. `natural` proves the
  // whole 900x260 image is what loaded (nothing cropped on the way in), `height` proves the fixed
  // h-48 scale, and `width` proves the ratio survived it — a square crop renders 192x192 and fails
  // on natural and width both. What this cannot see is the image's pixel content; that limit is
  // stated in the PR body rather than papered over.
  //
  // decode() rather than a bare read: naturalWidth is 0 until the image is decoded, and evaluate()
  // waits only for the element to be attached.
  test('the_horse_photo_is_scaled_to_a_fixed_height_with_its_aspect_ratio_preserved @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))

    const geometry = await photoImage(page, CLOVER).evaluate(async (el: HTMLImageElement) => {
      if (!el.complete) await el.decode()
      const box = el.getBoundingClientRect()
      return {
        natural: `${el.naturalWidth}x${el.naturalHeight}`,
        height: Math.round(box.height),
        width: Math.round(box.width),
      }
    })

    expect(geometry).toEqual({
      natural: PHOTO_NATURAL_SIZE,
      height: PHOTO_RENDERED_HEIGHT,
      width: PHOTO_RENDERED_WIDTH,
    })
  })

  // Same no-click proof as the set flow, from the Replace Photo control this time. The old storage
  // path is captured before the replace so the reload test below can assert it is gone rather than
  // infer it.
  test('replacing_the_horse_photo_uploads_the_new_file_immediately @manager', async ({ page }) => {
    if (!seedClient) throw new Error('no seeded service client')
    const before = mustSucceed<{ photo_path: string | null }>(
      await seedClient.from('horses').select('photo_path').eq('id', cloverId).single(),
      'read Clover photo path before the replace'
    )
    if (!before.photo_path) throw new Error('Clover has no photo to replace')
    cloverOldPhotoPath = before.photo_path

    await page.goto(horseUrl(cloverId))
    await photoSection(page).getByRole('link', { name: 'Replace Photo' }).click()
    await page.waitForURL(atPhotoUpload(cloverId), { waitUntil: 'commit' })
    await uploadPhoto(page, cloverId, BUTTER_PHOTO)

    await expect(page.getByRole('heading', { name: CLOVER, exact: true })).toBeVisible()
  })

  test('the_replaced_horse_photo_displays_the_new_image @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    expect(await displayedPhotoAsset(page, CLOVER)).toBe(BUTTER_PHOTO)
  })

  // Both halves of the line in one assertion — "the old photo is gone" and its parenthetical "it
  // wasn't just a stale client-side preview". The reload forces a fresh server render, and the
  // storage probe is what makes "gone" an observation rather than an inference: replaceHorsePhoto
  // deletes the previous object, so its path must no longer download.
  //
  // `currentObjectStored` is that probe's positive control, and it is not decoration.
  // objectStillStored returns false for *any* download error — a wrong bucket, a changed path
  // convention, a transport blip — all indistinguishable from "deleted". Without a reading that
  // must come back true, the absence half would pass just as happily against a probe that can
  // only ever say false. Both readings go through the same function on the same run.
  test('the_replaced_horse_photo_survives_a_reload_and_the_old_one_is_gone @manager', async ({ page }) => {
    if (!cloverOldPhotoPath) throw new Error('the replace step never captured Clover\'s previous photo path')

    await page.goto(horseUrl(cloverId))
    await page.reload()

    expect({
      displayed: await displayedPhotoAsset(page, CLOVER),
      oldObjectStillStored: await objectStillStored(cloverOldPhotoPath),
      currentObjectStored: await objectStillStored(await currentPhotoPath(cloverId)),
    }).toEqual({ displayed: BUTTER_PHOTO, oldObjectStillStored: false, currentObjectStored: true })
  })

  // deleteHorsePhotoAction revalidates rather than redirecting, so there is no navigation to
  // synchronise on and the assertion waits out the action *and* the re-render. `toBeVisible` is
  // web-first, so that wait is expect's 5s default, not unbounded — hence the number (#1469). A
  // `waitFor` on the placeholder instead would be tautological here: it is the assertion's own
  // target, unlike a delete-then-assert-absence pair, where the two are distinct (see
  // checklist-phase4-horses-documents.spec.ts's document delete).
  test('removing_the_horse_photo_restores_the_placeholder_icon @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await photoSection(page).getByRole('button', { name: 'Remove Photo' }).click()

    await expect(photoSection(page).locator('svg[aria-hidden="true"]')).toBeVisible({ timeout: SETTLE_AFTER_WRITE })
  })

  test('removing_the_horse_photo_restores_the_set_photo_button @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await expect(photoSection(page).getByRole('link', { name: 'Set Photo' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// A non-image on the photo upload screen
// ---------------------------------------------------------------------------

// Its own block, and run against Daisy rather than Clover: Daisy's photo state is fixed by the seed,
// so the control to click is always "Replace Photo" no matter where the lifecycle chain got to, and
// the rejection means nothing is written, so this disturbs nothing the lock block reads later.
//
// Clicked through rather than reached by goto, for the same hydration reason as the upload test
// above: the rejection is raised by the server action that the file input's own onChange submits.
//
// The client-side accept="" filter is a file-picker hint that setInputFiles bypasses, so this
// exercises the server's own validateFile(PHOTO_MIME_TYPES) rejection — the path a determined user
// reaches. The alert only renders *inside the live form*, so its text is simultaneously the "inline
// error" half of the line and the "not a crash" half.
//
// Scoped to the form rather than the page: Next's own __next-route-announcer__ div carries
// role="alert" on every App Router page, so a page-wide alert lookup is a strict-mode violation
// that never reaches the assertion.
test.describe('the photo upload screen', () => {
  test('selecting_a_pdf_on_the_photo_upload_screen_is_rejected_inline @manager', async ({ page }) => {
    await page.goto(horseUrl(daisyId))
    await photoSection(page).getByRole('link', { name: 'Replace Photo' }).click()
    await page.waitForURL(atPhotoUpload(daisyId), { waitUntil: 'commit' })
    await page.setInputFiles('input[type="file"]', assetPath(TEST_PDF))

    await expect(uploadForm(page).getByRole('alert')).toHaveText('Unsupported file type')
  })
})

// ---------------------------------------------------------------------------
// Apple: owned, but no owner has ever set her photo — the lock needs both
// ---------------------------------------------------------------------------

test.describe.serial('an owned horse whose owner never set a photo', () => {
  // The owner is asserted alongside the photo, in one object, rather than left to the seed.
  //
  // This line's whole point is its parenthetical — Apple *has* an owning rider, and the write
  // still succeeds because the lock needs an owner **and** an owner-uploaded photo. An assertion
  // on the photo alone would pass just as happily against a horse owned by anyone else, i.e. it would have
  // full force and be about a weaker claim than the line makes. Nothing else in this file pins
  // Apple's ownership: the lock block below proves she is *unlocked*, which is not the same thing.
  //
  // Read as the owner link's own href — which is *whose* it is, not merely that one rendered:
  // since #1549 every horse has an owner and the line always renders, so a count of the link alone
  // would no longer discriminate. The href pins it to Apple's rider, on rendered markup rather
  // than on the seed value echoed back at itself. The
  // photo read settles the document first, so the count that follows cannot be a premature zero.
  test('a_manager_can_set_a_photo_on_an_owned_horse_whose_owner_never_set_one @manager', async ({ page }) => {
    const ownerHref = `/barn/${barn.slug}/members/${barn.data.members.rider.membershipId}`

    await page.goto(horseUrl(appleId))
    await photoSection(page).getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atPhotoUpload(appleId), { waitUntil: 'commit' })
    await uploadPhoto(page, appleId, HARPER_PHOTO)

    expect({
      displayed: await displayedPhotoAsset(page, APPLE),
      ownerLinks: await page.locator(`main a[href="${ownerHref}"]`).count(),
    }).toEqual({ displayed: HARPER_PHOTO, ownerLinks: 1 })
  })

  // The photo is re-attributed to a *third* membership before the replace, and that is the whole
  // point of the test rather than setup noise.
  //
  // The "manager-set photos never lock out other managers" line's claim. E2E_USERS carries
  // only one manager login, so without this stamp the manager would be replacing a photo it uploaded
  // itself two tests ago — an assertion with full force, about a weaker claim. The lock predicate
  // (`update_horse_photo`) compares photo_uploaded_by to the *owner*, not to the caller, so a
  // regression narrowing it to "a manager may only overwrite their own uploads" would leave that
  // version of the test green while breaking exactly what the line asserts. Attributing the photo to
  // the trainer — neither the owner nor the caller — is the barn-local way to reach the state the
  // line describes, and it keeps the horse unlocked (trainer is not the owning member).
  test('a_manager_can_replace_a_manager_set_photo_on_an_owned_horse @manager', async ({ page }) => {
    if (!seedClient) throw new Error('no seeded service client')
    mustSucceed(
      await seedClient
        .from('horses')
        .update({ photo_uploaded_by: barn.data.members.trainer.membershipId })
        .eq('id', appleId)
        .select('id')
        .single(),
      'attribute Apple photo to a membership that is neither the owner nor the caller'
    )

    await page.goto(horseUrl(appleId))
    await photoSection(page).getByRole('link', { name: 'Replace Photo' }).click()
    await page.waitForURL(atPhotoUpload(appleId), { waitUntil: 'commit' })
    await uploadPhoto(page, appleId, EMERY_PHOTO)

    expect(await displayedPhotoAsset(page, APPLE)).toBe(EMERY_PHOTO)
  })
})

// ---------------------------------------------------------------------------
// Butter: her owner set the photo, so a manager is locked out — the converse
// ---------------------------------------------------------------------------

// Counted rather than asserted absent, and counted on *both* horses through the same locator.
//
// A bare toHaveCount(0) on Butter would be defended by reasoning alone: nothing would ever have
// executed this locator against a header that does render the controls, so a locator gone wrong
// would report "locked" for every horse in the barn and pass. Daisy is that positive control, read
// through the literally shared locator: an editable header renders two (the Replace link and the
// Remove button), a locked one renders neither, and a locator that failed to resolve also renders
// neither — which is why the img is waited for separately above each read rather than counted
// alongside them (#1390: the header carries the owner link too, so a bare `a` count can no longer
// separate a photo control from an unrelated one).
//
// Daisy rather than Apple, though Apple is also unlocked by now: Apple's photo is produced by the
// *previous* describe block, so using her would make this test pass only in declaration order and
// fail under a standalone --grep — against a perfectly healthy app. Daisy is seeded, so this block
// depends on nothing but its own barn. She also differs from Butter in exactly one column, which
// makes the pair a controlled comparison rather than two unrelated readings.
test.describe('a horse whose photo was set by its owning member', () => {
  test('an_owner_set_photo_hides_the_replace_and_remove_controls_from_a_manager @manager', async ({ page }) => {
    await page.goto(horseUrl(butterId))
    await photoImage(page, BUTTER).waitFor()
    const locked = await photoControls(page).count()

    await page.goto(horseUrl(daisyId))
    await photoImage(page, DAISY).waitFor()
    const unlocked = await photoControls(page).count()

    expect({ locked, unlocked }).toEqual({ locked: 0, unlocked: 2 })
  })
})
