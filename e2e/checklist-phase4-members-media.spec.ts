// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
import { test, expect, withBarn, type Page } from './support/test'
import { addManagedMember, setMemberPhoto, assetPath, E2E_USERS } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'
import type { SupabaseClient } from '@supabase/supabase-js'

// Seed inputs, not builder outputs — addManagedMember takes these and returns only ids, so
// naming them here is what keeps the assertions below free of loose string literals. Same
// convention as checklist-phase4-members-list.spec.ts, which seeds its own Harper Test.
const MANAGED_RIDER = { firstName: 'Harper', lastName: 'Test' }
const CLAIMED_TRAINER = { firstName: 'Rowan', lastName: 'Claimed' }
const SECOND_RIDER = { firstName: 'Gale', lastName: 'Test' }

const HARPER_PHOTO = 'harper-photo.png'
const EMERY_PHOTO = 'emery-photo.jpg'
const CLOVER_PHOTO = 'clover-photo.png'
const TEST_PDF = 'test_1_kb.pdf'

const fullName = (who: { firstName: string; lastName: string }) => `${who.firstName} ${who.lastName}`
/** `emery-photo.jpg` → `jpg`. replaceProfilePhoto names the stored object `${Date.now()}.${ext}`. */
const extensionOf = (assetName: string) => assetName.slice(assetName.lastIndexOf('.') + 1)

let managedRiderId: string
let claimedTrainerId: string
let secondRiderId: string

const barn = withBarn('phase4-members-media', async ({ supabase, barn }) => {
  // The unclaimed rider whose photo is set, replaced and removed through the UI, and who then
  // carries the document upload/list/open/delete chain. addManagedMember leaves user_id null
  // and is_managed true, which is exactly the manager-editable state those flows need.
  managedRiderId = (await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })).membershipId

  // A *claimed* trainer, for the "a manager can't edit a claimed member's photo" lock.
  //
  // The lock is `is_managed`, not `photo_uploaded_by` — that column exists on `horses` (the
  // #997 owner lock) and has no counterpart on `profiles`. resolvePhotoTarget in
  // members/[membership_id]/actions.ts allows a manager write only while the target profile is
  // still managed, and page.tsx's canEditPhoto mirrors it. Demoting a stub of our own in place
  // is the barn-local way to reach that state: the three shared e2e logins are the only other
  // claimed profiles available, and their profile rows are global — one per Supabase project,
  // not per barn — so reaching through one would touch every concurrently running slice.
  //
  // The photo is pre-seeded deliberately. With one set, an *editable* Photo section renders two
  // controls (Replace Photo, Remove); with none it renders one (Set Photo). Starting from a
  // photo therefore gives the absence assertion below something to be absent against.
  //
  // emery-photo.jpg rather than clover-photo.png: docs/scripts.md's asset table assigns
  // emery-photo.jpg to a profile and clover-photo.png to the horse Clover's upload flow. The one
  // place this spec does use clover-photo.png is the manager's own upload, where checklist line
  // 480 names that file explicitly.
  const claimedTrainer = await addManagedMember(supabase, barn.id, { ...CLAIMED_TRAINER, role: 'trainer' })
  claimedTrainerId = claimedTrainer.membershipId
  await setMemberPhoto(supabase, barn, claimedTrainer.profileId, EMERY_PHOTO)
  mustSucceed(
    await supabase.from('profiles').update({ is_managed: false }).eq('id', claimedTrainer.profileId).select('id').single(),
    'demote trainer stub to claimed'
  )

  // A second rider stub, so the rider-entity Add Document link is asserted against a member the
  // document chain above never mutates.
  secondRiderId = (await addManagedMember(supabase, barn.id, { ...SECOND_RIDER, role: 'rider' })).membershipId
})

const memberUrl = (membershipId: string) => `/barn/${barn.slug}/members/${membershipId}`

/** The <section> owning a given h2 — the member detail page is h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/**
 * The member page redirects back to itself after both upload flows, and the upload page's own
 * URL is query-string addressed. Both are matched by RegExp rather than by Playwright's URL
 * glob, whose `?` is a wildcard rather than the query separator these URLs need it to be.
 */
const atMemberPage = (membershipId: string) => new RegExp(`/members/${membershipId}$`)
const atUploadPage = (entity: string, membershipId: string) =>
  new RegExp(`/documents/new\\?entity=${entity}&id=${membershipId}`)

// ---------------------------------------------------------------------------
// A managed rider's photo — set, replaced, removed
// ---------------------------------------------------------------------------

// Serial: each step starts from the state its predecessor left behind, which is the checklist's
// own framing ("With Harper Test's photo set, tap Replace Photo…"). Safe because this spec file
// owns its barn, and .serial additionally skips the rest of the chain once a step fails rather
// than reporting four confusing downstream failures.
test.describe.serial('a managed rider photo', () => {
  // Two checkboxes, one test, by the issue's "genuinely one indivisible interaction" clause:
  // "the upload starts immediately" and "you land back on the member page" are the same
  // observation. In photoMode DocumentUploadForm calls requestSubmit() from the file input's
  // own onChange, so landing back on the member page having never clicked Upload *is* the
  // proof that the upload started immediately — and it is the only non-racy proof available.
  // The alternative, catching the transient Uploading…/progressbar state, races a fast upload.
  test('choosing_a_photo_file_uploads_it_immediately_and_returns_to_the_member_page @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await section(page, 'Photo').getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atUploadPage('profile', managedRiderId), { waitUntil: 'commit' })

    // Deliberately no Upload click — that omission is what the checkbox is about.
    await page.setInputFiles('input[type="file"]', assetPath(HARPER_PHOTO))
    await page.waitForURL(atMemberPage(managedRiderId), { waitUntil: 'commit' })
  })

  test('the_uploaded_member_photo_displays_on_the_member_page @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await expect(section(page, 'Photo').getByRole('img', { name: fullName(MANAGED_RIDER) })).toBeVisible()
  })

  // Narrowed (standing ruling 1): the checkbox as written — "the displayed word changes from
  // harper to emery" — is a pixel judgment about the image's contents. The invariant behind it
  // is that a different file *in a different format* replaced the original, which is exactly
  // what the line's own parenthetical says the step is for. replaceProfilePhoto stores each
  // upload as `${Date.now()}.${ext}` and the page renders a signed URL over that path, so the
  // rendered src carrying the new extension is that claim, checkable without reading pixels.
  test('replacing_the_member_photo_with_a_jpg_repoints_the_displayed_image @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await section(page, 'Photo').getByRole('link', { name: 'Replace Photo' }).click()
    await page.waitForURL(atUploadPage('profile', managedRiderId), { waitUntil: 'commit' })
    await page.setInputFiles('input[type="file"]', assetPath(EMERY_PHOTO))
    await page.waitForURL(atMemberPage(managedRiderId), { waitUntil: 'commit' })

    await expect(section(page, 'Photo').getByRole('img', { name: fullName(MANAGED_RIDER) })).toHaveAttribute(
      'src',
      new RegExp(`\\.${extensionOf(EMERY_PHOTO)}\\?`)
    )
  })

  // deleteProfilePhotoAction revalidates rather than redirecting, so the section re-renders in
  // place — the placeholder's own auto-waiting is the whole wait.
  test('removing_the_member_photo_restores_the_no_photo_placeholder @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await section(page, 'Photo').getByRole('button', { name: 'Remove' }).click()
    await expect(section(page, 'Photo').getByText('No photo yet')).toBeVisible()
  })

  test('removing_the_member_photo_restores_the_set_photo_button @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await expect(section(page, 'Photo').getByRole('link', { name: 'Set Photo' })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// A claimed member's photo is locked to the member
// ---------------------------------------------------------------------------

test.describe('a claimed trainer', () => {
  // No cleanup hook here, deliberately. This block used to flip the seed's demoted stub back to
  // `is_managed = true` in a describe-scoped afterAll, because teardownBarnData swept stub rows
  // and their photo objects by that flag and so couldn't see a demoted one. Since #1282 it
  // sweeps by `user_id IS NULL`, which a demotion can't change — the restore became a no-op
  // dressed as a safeguard, and a comment asserting the old rule as current.

  // Counted rather than asserted absent. A bare toHaveCount(0) over the controls would pass
  // vacuously if the Photo section itself failed to resolve — the failure mode this batch's
  // mutation check can't distinguish, since flipping the expectation fails either way. Counting
  // `img, a, button` inside the section pins both halves in one assertion: exactly the photo and
  // nothing interactive. An editable section with a photo set renders three (img, Replace link,
  // Remove button); a section that didn't render renders none. Only the locked one renders one.
  test('claimed_member_photo_section_offers_no_edit_controls_to_a_manager @manager', async ({ page }) => {
    await page.goto(memberUrl(claimedTrainerId))
    await expect(section(page, 'Photo').locator('img, a, button')).toHaveCount(1)
  })

  // Documents are gated by canManage, which — unlike the photo lock above — does not consult
  // is_managed, so a claimed trainer still gets the button. Kept inside this block so every
  // read of this member's page happens before the afterAll flips it back.
  test('trainer_detail_has_an_add_document_button @manager', async ({ page }) => {
    await page.goto(memberUrl(claimedTrainerId))
    await expect(section(page, 'Documents').getByRole('link', { name: 'Add Document' })).toBeVisible()
  })

  test('trainer_add_document_button_links_to_the_trainer_upload_page @manager', async ({ page }) => {
    await page.goto(memberUrl(claimedTrainerId))
    await expect(section(page, 'Documents').getByRole('link', { name: 'Add Document' })).toHaveAttribute(
      'href',
      `/barn/${barn.slug}/documents/new?entity=trainer&id=${claimedTrainerId}`
    )
  })
})

// ---------------------------------------------------------------------------
// Your own photo — the one flow that can only run against a shared login's profile row
// ---------------------------------------------------------------------------

/**
 * `isOwnPage` is `targetMembership.user_id === user.id`, so "your own manager member detail
 * page" is reachable only as the shared manager@e2e.test login, whose `profiles` row is global
 * to the Supabase project rather than scoped to this barn. Ruled admissible for exactly this
 * shape of checkbox (2026-08-03) on the condition the write is fully reversed: the prior value
 * is captured before anything is touched and restored unconditionally, and the object this
 * block uploads is deleted rather than left dangling.
 *
 * Deleting matters on its own. teardownBarnData sweeps photo storage only for profiles with
 * `user_id IS NULL` (#1282), and a claimed login's user_id is by definition not null — so an
 * object uploaded against one is invisible to teardown and would accumulate silently, one per
 * run, forever. The shared login's row is also global to the project, so no barn's teardown
 * reaches it by any path.
 */
test.describe.serial('your own member photo', () => {
  let service: SupabaseClient | null = null
  let managerProfileId: string | null = null
  let capturedPhotoPath: string | null = null

  const readPhotoPath = async (client: SupabaseClient, profileId: string): Promise<string | null> => {
    const row = mustSucceed<{ photo_path: string | null }>(
      await client.from('profiles').select('photo_path').eq('id', profileId).single(),
      'read manager profile photo path'
    )
    return row.photo_path
  }

  // Cleared to null as well as captured, so the page reliably offers "Set Photo" rather than
  // "Replace Photo" — the control the checkbox names. Leaving a leftover value in place would
  // make which button exists depend on what a previous run left behind.
  test.beforeAll(async () => {
    const { supabase, members } = barn.data
    service = supabase
    managerProfileId = members.manager.profileId
    capturedPhotoPath = await readPhotoPath(supabase, managerProfileId)
    mustSucceed(
      await supabase.from('profiles').update({ photo_path: null }).eq('id', managerProfileId).select('id').single(),
      'clear manager profile photo path for the own-photo block'
    )
  })

  // Unconditional: no pass/fail gate, no early return on anything but "the capture never
  // happened", so a test throwing mid-chain still restores. Reads the row back afterwards and
  // throws on a mismatch — an unverified restore is one that can stop working silently.
  //
  // The row is restored *before* the storage object is deleted, and the two failure modes are
  // why. An un-restored row is a shared-state failure every later slice inherits; an orphaned
  // object is only a leak. Deleting first meant a storage error threw before the restore ever
  // ran, converting the cheap failure into the expensive one — so the shared row is put back
  // and verified first, and the object deletion, which can still throw loudly, comes last.
  test.afterAll(async () => {
    if (!service || !managerProfileId) return

    const uploaded = await readPhotoPath(service, managerProfileId)
    mustSucceed(
      await service
        .from('profiles')
        .update({ photo_path: capturedPhotoPath })
        .eq('id', managerProfileId)
        .select('id')
        .single(),
      'restore manager profile photo path'
    )

    const restored = await readPhotoPath(service, managerProfileId)
    if (restored !== capturedPhotoPath) {
      throw new Error(`manager profile photo_path not restored: expected ${capturedPhotoPath}, found ${restored}`)
    }

    if (uploaded && uploaded !== capturedPhotoPath) {
      const { error } = await service.storage.from('documents').remove([uploaded])
      if (error) throw new Error(`remove uploaded manager photo object: ${error.message}`)
    }
  })

  test('uploading_your_own_photo_displays_it_on_your_member_page @manager', async ({ page }) => {
    const ownMembershipId = barn.data.members.manager.membershipId
    await page.goto(memberUrl(ownMembershipId))
    await section(page, 'Photo').getByRole('link', { name: 'Set Photo' }).click()
    await page.waitForURL(atUploadPage('profile', ownMembershipId), { waitUntil: 'commit' })
    await page.setInputFiles('input[type="file"]', assetPath(CLOVER_PHOTO))
    await page.waitForURL(atMemberPage(ownMembershipId), { waitUntil: 'commit' })

    await expect(section(page, 'Photo').getByRole('img', { name: fullName(E2E_USERS.manager) })).toBeVisible()
  })

  test('your_own_member_photo_persists_across_a_reload @manager', async ({ page }) => {
    await page.goto(memberUrl(barn.data.members.manager.membershipId))
    await page.reload()
    await expect(section(page, 'Photo').getByRole('img', { name: fullName(E2E_USERS.manager) })).toBeVisible()
  })
})

// ---------------------------------------------------------------------------
// A managed rider's documents — upload, list, open, delete
// ---------------------------------------------------------------------------

test.describe.serial('a managed rider document', () => {
  test('uploading_a_member_document_redirects_back_to_the_member_page @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await section(page, 'Documents').getByRole('link', { name: 'Add Document' }).click()
    await page.waitForURL(atUploadPage('rider', managedRiderId), { waitUntil: 'commit' })

    // Not photoMode, so nothing auto-submits and the record type keeps the form's own default.
    await page.setInputFiles('input[type="file"]', assetPath(TEST_PDF))
    await page.getByRole('button', { name: 'Upload' }).click()
    await page.waitForURL(atMemberPage(managedRiderId), { waitUntil: 'commit' })
  })

  test('the_uploaded_member_document_is_listed_on_the_member_page @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await expect(section(page, 'Documents').getByRole('link', { name: TEST_PDF })).toBeVisible()
  })

  // Narrowed (standing ruling 1), and to the batch's pre-ratified shape: "opens the document"
  // is browser chrome outside the page — a target=_blank into the PDF viewer. The invariant
  // underneath is that the href the page signed actually serves the file, which is one request.
  test('the_member_document_signed_url_serves_the_pdf @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    const href = await section(page, 'Documents').getByRole('link', { name: TEST_PDF }).getAttribute('href')
    if (!href) throw new Error(`no href on the ${TEST_PDF} document link`)

    const response = await page.request.get(href)
    expect({ status: response.status(), contentType: response.headers()['content-type'] }).toEqual({
      status: 200,
      contentType: 'application/pdf',
    })
  })

  // The Delete click is also this assertion's vacuity guard: clicking auto-waits on the button,
  // so a Documents section that failed to resolve fails here rather than passing on an empty
  // locator.
  //
  // Safe to click without a hydration barrier, for the same reason as
  // checklist-phase56-horses-list.spec.ts:235's anchor click: DeleteDocumentButton is
  // `<form action={formAction}>` over a bound Server Function, so the server already ships
  // `<form action="" encType="multipart/form-data" method="POST">` with the action id and the
  // bound arguments in hidden fields (measured on this page, #1385). A click landing before
  // React is listening submits that form natively rather than being lost — unlike the
  // `<form onSubmit={handler}>` this replaced, which is what used to flake this test
  // (e2e/CLAUDE.md fact 10).
  test('deleting_a_member_document_removes_its_row @manager', async ({ page }) => {
    await page.goto(memberUrl(managedRiderId))
    await section(page, 'Documents').getByRole('button', { name: 'Delete' }).click()
    await expect(section(page, 'Documents').getByRole('link', { name: TEST_PDF })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// The rider half of the entity-typed Add Document links (the trainer half is above, inside the
// claimed-trainer block, so it runs before that block's afterAll)
// ---------------------------------------------------------------------------

test('rider_detail_has_an_add_document_button @manager', async ({ page }) => {
  await page.goto(memberUrl(secondRiderId))
  await expect(section(page, 'Documents').getByRole('link', { name: 'Add Document' })).toBeVisible()
})

test('rider_add_document_button_links_to_the_rider_upload_page @manager', async ({ page }) => {
  await page.goto(memberUrl(secondRiderId))
  await expect(section(page, 'Documents').getByRole('link', { name: 'Add Document' })).toHaveAttribute(
    'href',
    `/barn/${barn.slug}/documents/new?entity=rider&id=${secondRiderId}`
  )
})
