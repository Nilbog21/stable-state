// covers: src/app/barn/[slug]/(protected)/members/**
//
// What a **non-manager** sees on somebody else's member detail page. #863 broadened Contact Info
// to any active barn member and #779 narrowed rider documents to manager-and-self, and neither
// broadening had e2e coverage anywhere in this suite until now (#1251 filed exactly that gap).
// PRE_RELEASE_TEST_CHECKLIST.md lines 894-900 (Phase 5) and 997-1001 (Phase 6).
//
// A paired slice: the same file is greped by @trainer and @rider, so Playwright dispatches it
// twice and each run seeds its own barn (support/test.ts).
//
// ## The one shape all twelve checkboxes are facets of
//
// members/[membership_id]/page.tsx gates Documents on `manager || (trainer && own) || (rider &&
// own)`, the Contact Info *form* on `manager && target.is_managed`, the photo controls on `own ||
// that same form gate`, and Active Agreements on `target is a rider && (manager || own)`. Every
// one of those is false for a non-manager looking at somebody else, so the page collapses to
// exactly two sections — Photo and Contact Info — and each line here reads one facet of that.
//
// The page is reachable at all because getMembershipByIdForBarn falls back from the direct
// barn_memberships select (which RLS denies a non-manager for anyone else's row) to the
// get_active_barn_member_summaries RPC, synthesising invite_token: null. That fallback is what
// lines 896/997's "loads (no 404)" is actually asserting.
//
// ## Five fixture decisions worth stating
//
// 1. **The blank-contact-fields subject is a stub with NULL columns, not empty strings.**
//    ContactInfo renders `profile?.phone ?? '—'` — `??`, not `||` — so an empty string would
//    render as empty rather than as the em-dash line 894 names. addManagedMember never writes the
//    contact columns at all, which is precisely the state needed.
//
// 2. **Blake's contact fields are populated, and that is what makes Harper's em-dashes mean
//    something.** A locator that answered '—' unconditionally would satisfy line 894 while
//    asserting nothing; line 899 drives the literally same locator to real seeded values in the
//    same file, so the two are each other's control.
//
// 3. **The "another member" subject is the shared Test Manager login, not a fourth stub.** Lines
//    896 and 997 both admit a manager ("Another trainer's **or a manager's**", "(a trainer, a
//    manager)"). A *claimed* member is also the historically-buggy case: ARCHITECTURE.md records
//    auth_can_read_barn_member_profile being added because a non-manager reading a manager's
//    profile silently got zero rows and fell back to "Unknown Member". A managed stub would
//    exercise the weaker `user_id IS NULL` path instead. Nothing here *writes* a shared login's
//    profiles row — the only write against it is a barn-scoped staff_documents row, which
//    teardownBarnData sweeps by barn_id along with its storage object.
//
// 4. **Two documents are seeded purely as falsifiability controls.** "Shows no Documents section"
//    would be true for the uninteresting reason that there is nothing to show; with a staff
//    document on the manager and a rider document on Blake, a *manager* viewing either page would
//    render the section, so the absence is a claim about the gate rather than about the data.
//
// 5. **The photographed subject is Quinn Ashford, deliberately *not* "Emery".** Line 1000 names
//    Emery, but the checklist's Emery is a *claimed* rider seeded in Phase 1 and reached via
//    change-user.sh (see its "Seeded baseline after reset" line), so reusing that name for an
//    unclaimed stub would invert what the checklist means by it. That is not a fresh judgement:
//    checklist-phase4-members-agreements.spec.ts already carries the same substitution and the
//    same reason, applied there as a review finding on PR #1258. The photo *asset* stays
//    emery-photo.jpg — scripts/CLAUDE.md's asset table assigns that file to a profile, and an
//    asset name is not a person's name. Whose page is photographed is immaterial to what line
//    1000 asserts anyway: no gate on this page branches on is_managed for a rider viewer, so the
//    substitution costs the line nothing. The checklist keeps its wording and only its tag
//    changes, which is how this whole batch handles a fixture whose name differs from the
//    dev-barn walkthrough's.
//
// ## Line 997's parenthetical is read as exemplification (#1324, PR #1345)
//
// "Another member's detail page (a trainer, a manager)" names which *kinds* of member count, not
// two navigations to assert. The mechanism under test — auth_can_read_barn_member_profile — has no
// role-conditional branch between rider→trainer and rider→manager, and neither does this page:
// its only target-role-sensitive gate is canViewAgreements, which requires `targetRole === 'rider'`
// and so collapses a trainer target and a manager target to the same rendered shape. One subject
// therefore exercises everything two would, and #1251's own one-assertion-per-checkbox split
// argues against spending a second navigation on it. The manager is the subject covered.
//
// The consequence worth stating plainly, since the line's text is broader than the test: "a
// trainer viewing another *trainer's* page" is not separately exercised anywhere in this suite.
//
// ## Divergence from the paired-slice ruling, and why
//
// The ruling ("seed two subject entities, one per role") is written for *ownership* state, which
// this page has none of — nothing here is owned by the acting member. So all four subjects are
// seeded unconditionally in both barns and each role targets the ones its own checklist lines
// name, with Test Manager legitimately shared by both. Same pattern and same reason as
// checklist-phase56-horses-media.spec.ts's; only the subject count differs.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import { test, expect, withBarn, type Page } from './support/test'
import {
  addManagedMember,
  addRiderDocument,
  addStaffDocument,
  assetPath,
  setMemberPhoto,
  E2E_USERS,
  type SeededMember,
} from './support/fixtures'
import { settledTextContents } from './support/read'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs — addManagedMember takes these and returns only ids. No name
// contains another and no two share a first-initial-derived form (`Harper T.`, `Blake N.`,
// `Quinn A.` against the four seeded `Test M./T./R./S.`), the two-part collision rule
// fixtures.ts's E2E_STUB_RIDER comment states.
const HARPER = { firstName: 'Harper', lastName: 'Test' } // contact columns left NULL
const BLAKE = { firstName: 'Blake', lastName: 'Norwood' } // contact columns populated below
const QUINN = { firstName: 'Quinn', lastName: 'Ashford' } // photographed — see header note 5

/** scripts/CLAUDE.md's asset table assigns this one to a profile. */
const EMERY_PHOTO = 'emery-photo.jpg'

/** The em-dash ContactInfo substitutes for an unset field — U+2014, matching page.tsx's literal. */
const BLANK = '—'

/** The two sections a non-manager's view of someone else's page renders, in DOM order. */
const PHOTO_HEADING = 'Photo'
const CONTACT_HEADING = 'Contact Info'
const NON_MANAGER_SECTIONS = [PHOTO_HEADING, CONTACT_HEADING]

/** ContactInfo renders exactly three <dd>s: phone, emergency contact name, emergency contact phone. */
const CONTACT_FIELD_COUNT = 3

const BLAKE_CONTACT = {
  phone: '555-0142',
  emergency_contact_name: 'Sidney Keeley',
  emergency_contact_phone: '555-0198',
}

const fullName = (who: { firstName: string; lastName: string }) => `${who.firstName} ${who.lastName}`
const MANAGER_NAME = fullName(E2E_USERS.manager)

let harperId: string
let blakeId: string
let quinnId: string
let managerMembershipId: string
/** Read back off the UPDATE's returned row, so no test compares BLAKE_CONTACT to itself. */
let seededBlakeContact: string[]

const barn = withBarn('phase56-members-others', async ({ supabase, barn, members }) => {
  managerMembershipId = members.manager.membershipId

  // The falsifiability control for lines 898/999 — see header note 4. staff_documents.trainer_id
  // is a barn_memberships.id and docs/architecture/schema.md states it deliberately admits a
  // *manager* membership, so this is the idiomatic row rather than a contrivance.
  await addStaffDocument(supabase, barn, members.manager, {
    recordType: 'instructor_contract',
    fileName: 'manager-contract.pdf',
  })

  harperId = (await addManagedMember(supabase, barn.id, { ...HARPER, role: 'rider' })).membershipId

  const blake = await addManagedMember(supabase, barn.id, { ...BLAKE, role: 'rider' })
  blakeId = blake.membershipId
  const blakeProfile = mustSucceed<typeof BLAKE_CONTACT>(
    await supabase
      .from('profiles')
      .update(BLAKE_CONTACT)
      .eq('id', blake.profileId)
      .select('phone, emergency_contact_name, emergency_contact_phone')
      .single(),
    'populate the rider stub contact fields'
  )
  seededBlakeContact = [
    blakeProfile.phone,
    blakeProfile.emergency_contact_name,
    blakeProfile.emergency_contact_phone,
  ]

  // The rider-document half of the same control, for line 900. Keyed on the stub's membership id
  // in both the row and the storage path, addManagedMember never having written a user_id.
  const blakeMember: SeededMember = { membershipId: blake.membershipId, profileId: blake.profileId, userId: null }
  await addRiderDocument(supabase, barn, blakeMember, {
    recordType: 'liability_waiver',
    fileName: 'blake-waiver.pdf',
  })

  const quinn = await addManagedMember(supabase, barn.id, { ...QUINN, role: 'rider' })
  quinnId = quinn.membershipId
  await setMemberPhoto(supabase, barn, quinn.profileId, EMERY_PHOTO)
})

// ---------------------------------------------------------------------------
// Locators and helpers
// ---------------------------------------------------------------------------

const membersUrl = () => `/barn/${barn.slug}/members`
const memberUrl = (membershipId: string) => `/barn/${barn.slug}/members/${membershipId}`

/** RegExp rather than Playwright's URL glob, whose `?` is a wildcard rather than a separator. */
const atMemberPage = (membershipId: string) => new RegExp(`/members/${membershipId}$`)

/** The <section> owning a given h2 — the member detail page is h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('main section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/**
 * Every section heading the page rendered, in DOM order.
 *
 * Read through `settledTextContents`, never `settledInnerTexts`: the h2 carries Tailwind's
 * `uppercase`, so `innerText` reads the laid-out string ("CONTACT INFO") rather than the source
 * one. That is read.ts's documented settledTextContents case, and it cost the neighbouring slice
 * #1321 a round.
 *
 * Asserting the *whole* list is what keeps the three "no Documents section" lines from passing
 * vacuously: a page that failed to render fails the settled read outright, and one that rendered
 * without Contact Info fails the comparison — where a bare "no Documents heading" count of zero
 * would be satisfied by both.
 */
function sectionHeadings(page: Page) {
  return page.locator('main section h2')
}

/** The Contact Info section's three values, in DOM order. */
function contactValues(page: Page) {
  return section(page, CONTACT_HEADING).locator('dd')
}

/**
 * Everything in the Contact Info section that is either a rendered value or an interactive
 * control.
 *
 * Counted rather than asserted absent, the members-media idiom: a bare toHaveCount(0) over the
 * controls alone would be satisfied by a Contact Info section that never resolved, which is the
 * failure mode a flipped expectation cannot distinguish. Requiring exactly the three <dd>s pins
 * both halves in one auto-retrying assertion — the read-only rendering is present *and* nothing
 * in it is interactive. The manager's editable variant renders three <input>s and a Save button
 * and so has no <dd>s at all; a section that didn't render has nothing.
 */
function contactNodes(page: Page) {
  return section(page, CONTACT_HEADING).locator('dd, button, a')
}

/**
 * The Photo section's image plus anything interactive.
 *
 * Same counting rationale as contactNodes. An *editable* section with a photo set renders three
 * (the img, a Replace Photo link, a Remove button); one that failed to render renders none. Only
 * the read-only variant renders exactly one, so the count distinguishes all three states where a
 * bare absence assertion would conflate two of them.
 */
function photoNodes(page: Page) {
  return section(page, PHOTO_HEADING).locator('img, a, button')
}

const digestOf = (bytes: Buffer | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

/**
 * The SHA-256 of the bytes the rendered <img src> actually serves.
 *
 * "Displays that photo" is an identity claim, so it is asserted by content rather than by the
 * presence of an <img> — the pattern checklist-phase4-horses-photos.spec.ts established. Throws
 * rather than returning a falsy default at every step that could otherwise make the caller's
 * assertion vacuous, so a mutation of the expected digest can only fail by comparing two real
 * values.
 */
async function displayedPhotoDigest(page: Page, name: string): Promise<string> {
  const src = await section(page, PHOTO_HEADING).getByRole('img', { name, exact: true }).getAttribute('src')
  if (!src) throw new Error(`no src on the ${name} photo img`)

  const response = await page.request.get(src)
  if (!response.ok()) throw new Error(`the ${name} photo src returned ${response.status()}`)
  return digestOf(await response.body())
}

/**
 * Open a member's page the way the checklist says to — by clicking their roster card.
 *
 * "Opened from the roster, loads (no 404)" is a navigation claim, so it is driven rather than
 * constructed. The Card renders as a Next Link, so a click landing before React is listening
 * navigates the document instead of being lost (e2e/CLAUDE.md fact 11's anchor argument) — no
 * hydration barrier is needed. No explicit timeout on the URL wait: navigationTimeout defaults to
 * unbounded, so a number could only tighten it (#1211).
 */
async function openFromTheRoster(page: Page, name: string, membershipId: string): Promise<void> {
  await page.goto(membersUrl())
  await page.getByRole('link', { name, exact: true }).click()
  await page.waitForURL(atMemberPage(membershipId), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// Phase 5 — a trainer on an unclaimed rider's page (lines 894-895)
// ---------------------------------------------------------------------------

// Harper's contact columns are NULL rather than empty (header note 1), and line 899 below drives
// this same locator to real values, so neither half of this can pass by coincidence.
test('trainer_sees_em_dashes_for_a_stub_members_blank_contact_fields @trainer', async ({ page }) => {
  await page.goto(memberUrl(harperId))
  expect(await settledTextContents(contactValues(page))).toEqual([BLANK, BLANK, BLANK])
})

// The Save button lives in ContactInfoForm, which only a manager viewing a still-managed profile
// gets. Counting rather than asserting absent — see contactNodes.
test('trainer_sees_no_save_button_in_contact_info @trainer', async ({ page }) => {
  await page.goto(memberUrl(harperId))
  await expect(contactNodes(page)).toHaveCount(CONTACT_FIELD_COUNT)
})

// ---------------------------------------------------------------------------
// Phase 5 — a trainer on a manager's page (lines 896-898)
// ---------------------------------------------------------------------------

// The heading is destination-only markup: the roster carries this name as a *link*, never as a
// heading, so an assertion satisfied by the page we just left is impossible. A 404 renders no
// such heading either, which is the line's other half.
test('trainer_opens_a_managers_detail_page_from_the_roster @trainer', async ({ page }) => {
  await openFromTheRoster(page, MANAGER_NAME, managerMembershipId)
  await expect(page.getByRole('heading', { name: MANAGER_NAME, exact: true })).toBeVisible()
})

// Asserted by node count, not by value. The shared logins' contact fields are filled by
// scripts/e2e-auth-users.ts and are global to the Supabase project rather than owned by this
// barn, so their values are not this spec's to depend on — and reading them back through the
// service-role client would make a service-role read the *expected answer*, which this batch's
// conventions reserve for preconditions only. Three rendered values is the section.
test('trainer_sees_contact_info_on_a_managers_detail_page @trainer', async ({ page }) => {
  await page.goto(memberUrl(managerMembershipId))
  await expect(contactValues(page)).toHaveCount(CONTACT_FIELD_COUNT)
})

// A staff document is seeded on this membership (header note 4), so a manager viewing this page
// would render the Documents section — the absence is about the gate, not about empty data.
test('trainer_sees_no_documents_section_on_a_managers_detail_page @trainer', async ({ page }) => {
  await page.goto(memberUrl(managerMembershipId))
  expect(await settledTextContents(sectionHeadings(page))).toEqual(NON_MANAGER_SECTIONS)
})

// ---------------------------------------------------------------------------
// Phase 5 — a trainer on a rider's page (lines 899-900)
// ---------------------------------------------------------------------------

// Compared against the values the seeding UPDATE returned rather than against BLAKE_CONTACT, so
// this cannot pass by comparing a literal to itself. Doubles as the positive control for the
// em-dash test above.
test('trainer_sees_contact_info_on_a_riders_detail_page @trainer', async ({ page }) => {
  await page.goto(memberUrl(blakeId))
  expect(await settledTextContents(contactValues(page))).toEqual(seededBlakeContact)
})

// #779 narrowed rider documents to manager-and-self. Blake carries one, so a manager would see the
// section here too.
test('trainer_sees_no_documents_section_on_a_riders_detail_page @trainer', async ({ page }) => {
  await page.goto(memberUrl(blakeId))
  expect(await settledTextContents(sectionHeadings(page))).toEqual(NON_MANAGER_SECTIONS)
})

// ---------------------------------------------------------------------------
// Phase 6 — a rider on a manager's page (lines 997-999)
// ---------------------------------------------------------------------------

// The rider half of the same three claims. This is the pairing that matters most: #863 opened
// Contact Info to *any* active member, and a rider reading a manager's profile is the exact read
// auth_can_read_barn_member_profile was added for.
test('rider_opens_a_managers_detail_page_from_the_roster @rider', async ({ page }) => {
  await openFromTheRoster(page, MANAGER_NAME, managerMembershipId)
  await expect(page.getByRole('heading', { name: MANAGER_NAME, exact: true })).toBeVisible()
})

test('rider_sees_contact_info_on_a_managers_detail_page @rider', async ({ page }) => {
  await page.goto(memberUrl(managerMembershipId))
  await expect(contactValues(page)).toHaveCount(CONTACT_FIELD_COUNT)
})

test('rider_sees_no_documents_section_on_a_managers_detail_page @rider', async ({ page }) => {
  await page.goto(memberUrl(managerMembershipId))
  expect(await settledTextContents(sectionHeadings(page))).toEqual(NON_MANAGER_SECTIONS)
})

// ---------------------------------------------------------------------------
// Phase 6 — a rider on a photographed member's page (lines 1000-1001)
// ---------------------------------------------------------------------------

// #1004: any active barn member can view any other's photo. Asserted by digest so the claim is
// that *this seeded file* is on screen, not merely that some img rendered.
test('rider_sees_the_seeded_photo_on_another_members_page @rider', async ({ page }) => {
  await page.goto(memberUrl(quinnId))
  expect(await displayedPhotoDigest(page, fullName(QUINN))).toBe(digestOf(readFileSync(assetPath(EMERY_PHOTO))))
})

// The subject is seeded *with* a photo deliberately: that is what gives this absence something to be
// absent against. An editable section in this state renders Replace Photo and Remove alongside the
// img, so the read-only one is the only variant answering exactly one.
test('rider_sees_no_photo_controls_on_another_members_page @rider', async ({ page }) => {
  await page.goto(memberUrl(quinnId))
  await expect(photoNodes(page)).toHaveCount(1)
})
