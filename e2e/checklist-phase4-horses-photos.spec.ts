// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
//
// The horse photo lifecycle: the placeholder and Set Photo button with no photo set, the
// photo-locked upload screen and its three absent fields, upload-on-choose, aspect-ratio-preserving
// display, replace with a different file *and* format, the post-reload check that the old photo is
// gone, remove restoring the placeholder, a non-image rejection, and #1003's owner lock
// (PRE_RELEASE_TEST_CHECKLIST.md 401-418).
//
// Three horses, because the three flows need three different starting states and one must *stay*
// in its starting state: Clover with no photo (the set/replace/remove chain), Apple owned by a
// rider but with no photo (a manager may still write — the lock needs an owner *and* an
// owner-uploaded photo), and Butter owned by a rider *with* a photo attributed to that owner
// (locked). Reusing Apple for the lock would destroy the unlocked state its own two checkboxes
// assert.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, setHorsePhoto, assetPath } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// Seed inputs, not builder outputs — these names are what the spec puts in, and what the img's
// accessible name (alt={horse.name}) is read back as below.
const CLOVER = 'Clover'
const APPLE = 'Apple'
const BUTTER = 'Butter'

// Every asset the checklist lines name, verbatim. scripts/CLAUDE.md's asset table assigns
// harper-photo.png and emery-photo.jpg to *member* photo flows, but lines 416/417 name both files
// explicitly for Apple the horse; the line text wins, on the precedent #1201 set when its line 480
// named clover-photo.png for a member. These files are read-only sources — reuse across entities
// costs nothing.
const CLOVER_PHOTO = 'clover-photo.png'
const BUTTER_PHOTO = 'butter-photo.jpg'
const HARPER_PHOTO = 'harper-photo.png'
const EMERY_PHOTO = 'emery-photo.jpg'
const TEST_PDF = 'test_1_kb.pdf'

// All four images are 900x260 — deliberately non-square, which is the whole point of line 409's
// "not cropped off to make a square". Written as literals rather than measured from the file: the
// assertion has to disagree with a wrong render, and a value read from the same bytes the browser
// decoded would agree with any bug in between.
const PHOTO_NATURAL_SIZE = '900x260'
// Tailwind h-48 on the <img> (horses/[id]/page.tsx). w-auto then makes the width follow the
// intrinsic ratio: 192 * 900 / 260 = 664.615..., which rounds to 665. A square crop would render
// 192x192, so the pair fails on width while still passing on height — which is what makes the
// triple a real test of "aspect ratio preserved" rather than of "an image is present".
const PHOTO_RENDERED_HEIGHT = 192
const PHOTO_RENDERED_WIDTH = 665

const digestOf = (bytes: Buffer | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * Every asset this spec can legitimately be displaying, keyed by the SHA-256 of its real bytes.
 *
 * This is what lets line 411 ("the displayed word changes from clover to butter") be asserted
 * without reading pixels: the rendered <img src> is a signed URL over the stored object, so
 * fetching it and hashing the response identifies *which file* is on screen, exactly. That is
 * strictly stronger than the extension check #1201 narrowed the identical line shape to, and it
 * carries its own negative half — matching butter's digest excludes clover's by construction.
 */
const ASSET_BY_DIGEST = new Map(
  [CLOVER_PHOTO, BUTTER_PHOTO, HARPER_PHOTO, EMERY_PHOTO].map(
    (name) => [digestOf(readFileSync(assetPath(name))), name] as const
  )
)

let cloverId: string
let appleId: string
let butterId: string
/** Captured in the seed so the storage probe in the reload test can't depend on `barn.data`. */
let seedClient: SupabaseClient | null = null
/** Clover's pre-replace storage object path, captured by the replace test and read by the next. */
let cloverOldPhotoPath: string | null = null

const barn = withBarn('phase4-horses-photos', async ({ supabase, barn, members }) => {
  seedClient = supabase

  cloverId = (await addHorse(supabase, barn.id, CLOVER)).id
  appleId = (await addHorse(supabase, barn.id, APPLE, { owningMemberId: members.rider.membershipId })).id

  // The owner lock's positive case. setHorsePhoto goes through replaceHorsePhoto, which only ever
  // *clears* photo_uploaded_by (src/lib/db/horses.ts:176-180) — a service-role write has no acting
  // membership to attribute — so the attribution is stamped here instead. Inline in this barn's own
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

/** The <section> owning the Photo h2 — the horse detail page is h2-partitioned. */
function photoSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Photo', exact: true }) })
}

/** The horse's photo, addressed by its accessible name — the <img>'s alt is the horse's name. */
function photoImage(page: Page, horseName: string) {
  return photoSection(page).getByRole('img', { name: horseName, exact: true })
}

/**
 * The upload form, scoped to <main>.
 *
 * Scoped to <main> so the counts below can only ever be about the app's own markup, whatever a dev
 * overlay or a future layout adds elsewhere on the page.
 */
function uploadForm(page: Page) {
  return page.locator('main form')
}

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
 * Which committed asset the page is currently displaying, by content rather than by name.
 *
 * Throws — rather than returning a falsy default — at every step that could otherwise make a
 * caller's assertion vacuous: no <img>, no src, a signed URL that doesn't serve, or bytes matching
 * none of the seeded assets. A mutation of the expected asset name can therefore only fail by
 * comparing two real values.
 */
async function displayedPhotoAsset(page: Page, horseName: string): Promise<string> {
  const src = await photoImage(page, horseName).getAttribute('src')
  if (!src) throw new Error(`no src on the ${horseName} photo img`)

  const response = await page.request.get(src)
  if (!response.ok()) throw new Error(`the ${horseName} photo src returned ${response.status()}`)

  const name = ASSET_BY_DIGEST.get(digestOf(await response.body()))
  if (!name) throw new Error(`the displayed ${horseName} photo matches none of the committed assets`)
  return name
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

// ---------------------------------------------------------------------------
// Clover: no photo -> set -> replace -> remove
// ---------------------------------------------------------------------------

// Serial: every step starts from the state its predecessor left behind, which is the checklist's
// own framing ("With a photo set, tap Replace Photo…"). Safe because this file owns its barn.
test.describe.serial('the horse photo lifecycle', () => {
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
    await page.goto(photoUploadUrl(cloverId))
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
  test('the_replaced_horse_photo_survives_a_reload_and_the_old_one_is_gone @manager', async ({ page }) => {
    if (!cloverOldPhotoPath) throw new Error('the replace step never captured Clover\'s previous photo path')

    await page.goto(horseUrl(cloverId))
    await page.reload()

    expect({
      displayed: await displayedPhotoAsset(page, CLOVER),
      oldObjectStillStored: await objectStillStored(cloverOldPhotoPath),
    }).toEqual({ displayed: BUTTER_PHOTO, oldObjectStillStored: false })
  })

  // deleteHorsePhotoAction revalidates rather than redirecting, so the section re-renders in place
  // and the placeholder's own auto-waiting is the whole wait.
  test('removing_the_horse_photo_restores_the_placeholder_icon @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await photoSection(page).getByRole('button', { name: 'Remove' }).click()

    await expect(photoSection(page).locator('svg[aria-hidden="true"]')).toBeVisible()
  })

  test('removing_the_horse_photo_restores_the_set_photo_button @manager', async ({ page }) => {
    await page.goto(horseUrl(cloverId))
    await expect(photoSection(page).getByRole('link', { name: 'Set Photo' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// A non-image on the photo upload screen
// ---------------------------------------------------------------------------

// Its own block, and reached by goto rather than through the chain above: nothing it does mutates
// Clover, and the upload screen renders identically whether or not a photo is set, so it neither
// depends on nor disturbs the lifecycle chain's state.
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
    await page.goto(photoUploadUrl(cloverId))
    await page.setInputFiles('input[type="file"]', assetPath(TEST_PDF))

    await expect(uploadForm(page).getByRole('alert')).toHaveText('Unsupported file type')
  })
})

// ---------------------------------------------------------------------------
// Apple: owned, but no owner has ever set her photo — the lock needs both
// ---------------------------------------------------------------------------

test.describe.serial('an owned horse whose owner never set a photo', () => {
  test('a_manager_can_set_a_photo_on_an_owned_horse_whose_owner_never_set_one @manager', async ({ page }) => {
    await page.goto(horseUrl(appleId))
    await photoSection(page).getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atPhotoUpload(appleId), { waitUntil: 'commit' })
    await uploadPhoto(page, appleId, HARPER_PHOTO)

    expect(await displayedPhotoAsset(page, APPLE)).toBe(HARPER_PHOTO)
  })

  test('a_manager_can_replace_a_photo_another_manager_set @manager', async ({ page }) => {
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
// A bare toHaveCount(1) on Butter would be defended by reasoning alone: nothing would ever have
// executed this locator against a section that does render the controls, so a locator gone wrong
// would report "locked" for every horse in the barn and pass. Apple — unlocked, and carrying a
// photo by the time this block runs — is that positive control, read through the literally shared
// locator: an editable section with a photo renders three (the img, the Replace link, the Remove
// button), a locked one renders only the img, and a section that failed to resolve renders none.
test.describe('a horse whose photo was set by its owning member', () => {
  test('an_owner_set_photo_hides_the_replace_and_remove_controls_from_a_manager @manager', async ({ page }) => {
    await page.goto(horseUrl(butterId))
    await photoImage(page, BUTTER).waitFor()
    const locked = await photoSection(page).locator('img, a, button').count()

    await page.goto(horseUrl(appleId))
    await photoImage(page, APPLE).waitFor()
    const unlocked = await photoSection(page).locator('img, a, button').count()

    expect({ locked, unlocked }).toEqual({ locked: 1, unlocked: 3 })
  })
})
