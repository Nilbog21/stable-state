// covers: src/app/barn/[slug]/(protected)/members/**
import { test, expect, withBarn, type Page } from './support/test'
import { addManagedMember } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs — addManagedMember takes these and returns only ids, so
// naming them here is what keeps the assertions below free of loose string literals.
const SECOND_MANAGER = { firstName: 'Morgan', lastName: 'Hale' }
const MANAGED_RIDER = { firstName: 'Harper', lastName: 'Test' }
const BLANK_TRAINER = { firstName: 'Blank', lastName: 'Contact' }

let secondManagerId: string
let managedRiderId: string
let blankTrainerId: string

const barn = withBarn('phase4-members-list', async ({ supabase, barn }) => {
  // A second manager, so the Managers section has a row that is *not* the caller — which is
  // what makes the "your own entry is excluded" assertion below mean something.
  secondManagerId = (await addManagedMember(supabase, barn.id, { ...SECOND_MANAGER, role: 'manager' })).membershipId

  // The unclaimed rider. addManagedMember never writes user_id, so this membership's
  // user_id is null by construction — that is the precondition the name-rendering test needs.
  managedRiderId = (await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })).membershipId

  // A member whose Contact Info is read-only *and* empty, for the "renders as —" case.
  //
  // Both halves need explaining. Read-only: the member detail page shows the editable
  // ContactInfoForm whenever the caller is a manager and the target profile is_managed, and
  // the read-only <dl> (the thing with the '—' fallbacks) otherwise — so reaching the dash at
  // all means clearing is_managed. Empty: the three shared e2e logins are the only other
  // claimed profiles available, and scripts/e2e-auth-users.ts fills phone and both emergency
  // fields on all three. Those profile rows are global — one per Supabase project, not per
  // barn — so blanking one to reach this state would reach outside this spec's barn and into
  // every other slice running concurrently. A stub of our own, demoted in place, is the
  // barn-local way to get there, and it mirrors a real state: a member who claimed their
  // invite and never filled the contact fields in.
  const blankTrainer = await addManagedMember(supabase, barn.id, { ...BLANK_TRAINER, role: 'trainer' })
  blankTrainerId = blankTrainer.membershipId
  mustSucceed(
    await supabase.from('profiles').update({ is_managed: false }).eq('id', blankTrainer.profileId).select('id').single(),
    'demote blank-contact trainer stub to claimed'
  )
})

/** The <section> owning a given h2 — the page's Members list and detail page are both h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/** A card/link in a section, addressed by the membership it points at rather than by name. */
function memberLink(page: Page, sectionName: string, membershipId: string) {
  return section(page, sectionName).locator(`a[href="/barn/${barn.slug}/members/${membershipId}"]`)
}

// ---------------------------------------------------------------------------
// Members list
// ---------------------------------------------------------------------------

// Both halves of the checkbox in one locator: `.first()` is "at the top of the list", and the
// href being the caller's own membership is what makes it the You card rather than any other.
test('members_list_you_card_links_to_your_own_membership @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members`)
  const firstSectionLink = page.locator('main > section').first().getByRole('link')
  await expect(firstSectionLink).toHaveAttribute(
    'href',
    `/barn/${barn.slug}/members/${barn.data.members.manager.membershipId}`
  )
})

test('managers_section_lists_other_manager @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members`)
  await expect(memberLink(page, 'Managers', secondManagerId)).toHaveCount(1)
})

test('managers_section_excludes_your_own_entry @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members`)
  await expect(memberLink(page, 'Managers', barn.data.members.manager.membershipId)).toHaveCount(0)
})

test('trainers_section_lists_trainer @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members`)
  await expect(memberLink(page, 'Trainers', barn.data.members.trainer.membershipId)).toHaveCount(1)
})

test('riders_section_lists_rider @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members`)
  await expect(memberLink(page, 'Riders', barn.data.members.rider.membershipId)).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// A claimed trainer's Contact Info — the read-only <dl>
// ---------------------------------------------------------------------------

// Each of the three row assertions matches the label plus a non-empty value (`\S`) rather than
// the value itself. The values live in scripts/e2e-auth-users.ts, not in a builder return, so
// spelling them out here would be a hardcoded expectation of something this spec doesn't own —
// and reading them back out of the DB to compare would just re-encode the app's own assumption.
// Label-plus-non-empty is the invariant the checkbox is actually claiming.
function contactRow(page: Page, index: number) {
  return section(page, 'Contact Info').locator('dl > div').nth(index)
}

test('trainer_detail_shows_phone_row @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${barn.data.members.trainer.membershipId}`)
  await expect(contactRow(page, 0)).toHaveText(/^Phone:\s+\S/)
})

test('trainer_detail_shows_emergency_contact_name_row @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${barn.data.members.trainer.membershipId}`)
  await expect(contactRow(page, 1)).toHaveText(/^Emergency Contact Name:\s+\S/)
})

test('trainer_detail_shows_emergency_contact_phone_row @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${barn.data.members.trainer.membershipId}`)
  await expect(contactRow(page, 2)).toHaveText(/^Emergency Contact Phone:\s+\S/)
})

// "Any of those three left blank renders as —" — asserted across all three at once via
// toHaveText's array form, which is one assertion over the whole <dd> list.
test('blank_contact_fields_render_as_dash @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${blankTrainerId}`)
  await expect(section(page, 'Contact Info').locator('dd')).toHaveText(['—', '—', '—'])
})

// ---------------------------------------------------------------------------
// A managed/unclaimed rider's detail page
// ---------------------------------------------------------------------------

// The page falls back to rendering the raw membership id when it can't resolve a profile, so
// asserting the name proves the profile join succeeded despite the null user_id.
test('managed_rider_detail_renders_name_without_linked_user @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    `${MANAGED_RIDER.firstName} ${MANAGED_RIDER.lastName}`
  )
})

test('managed_rider_detail_renders_contact_info @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(page.getByRole('heading', { name: 'Contact Info', exact: true })).toBeVisible()
})

// "Not blocked" is the claim: canViewDocuments gates the whole section out of the DOM for a
// caller who may not see it, so its heading being present is exactly that section rendering.
test('managed_rider_documents_section_renders @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(page.getByRole('heading', { name: 'Documents', exact: true })).toBeVisible()
})

test('managed_rider_documents_section_has_add_document_button @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(section(page, 'Documents').getByRole('link', { name: 'Add Document' })).toHaveAttribute(
    'href',
    `/barn/${barn.slug}/documents/new?entity=rider&id=${managedRiderId}`
  )
})

// The editable form and the read-only <dl> are mutually exclusive branches of the same slot,
// so matching the form by role is what distinguishes "editable" from "displayed".
test('managed_rider_contact_info_is_editable_form @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  await expect(page.getByRole('form', { name: 'Contact Info' })).toBeVisible()
})

// Deliberately last in declaration order: it is the only test here that mutates seeded state,
// and Playwright runs a job's tests serially, so nothing above can observe the write.
//
// Three assertions in one test, by ruling on #1200: the checkbox is a single indivisible save
// round-trip (set all three, one Save, one reload), so splitting it would re-run the save three
// times over and leave the checklist line naming three tests. Each expect auto-waits on its own,
// which is also sturdier than one guarded one-shot read of all three values.
test('managed_rider_contact_info_values_persist_after_save_and_reload @manager', async ({ page }) => {
  const phone = '555-0142'
  const emergencyName = 'Rowan Keeper'
  const emergencyPhone = '555-0188'

  await page.goto(`/barn/${barn.slug}/members/${managedRiderId}`)
  const form = page.getByRole('form', { name: 'Contact Info' })
  await form.getByLabel('Phone', { exact: true }).fill(phone)
  await form.getByLabel('Emergency Contact Name', { exact: true }).fill(emergencyName)
  await form.getByLabel('Emergency Contact Phone', { exact: true }).fill(emergencyPhone)
  await form.getByRole('button', { name: 'Save' }).click()

  // The form saves via a server action and router.refresh() rather than a navigation, so there
  // is no URL change to wait on — waiting for the button to leave its loading state is the
  // signal that the action resolved before the reload throws the state away.
  await expect(form.getByRole('button', { name: 'Save' })).toBeEnabled()
  await page.reload()

  await expect(form.getByLabel('Phone', { exact: true })).toHaveValue(phone)
  await expect(form.getByLabel('Emergency Contact Name', { exact: true })).toHaveValue(emergencyName)
  await expect(form.getByLabel('Emergency Contact Phone', { exact: true })).toHaveValue(emergencyPhone)
})
