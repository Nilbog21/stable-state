// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
//
// The members roster and your *own* member detail page, through a non-manager's eye:
// all four roster sections with no Add Trainer/Add Rider forms, a managed/unclaimed row rendering
// as a plain name-only card link with no Unlinked badge and no Manage Member controls, a trainer's
// own document upload and the read-only Reminder Date column that follows it, #864's read-only
// rider self-service, and the Active Agreements cards a rider sees on their own page.
// PRE_RELEASE_TEST_CHECKLIST.md lines 887-893 (Phase 5) and 992-996 + 1005-1007 (Phase 6).
//
// Line 1005 is a `Setup —` line rather than an assertion: the manual walkthrough switches persona
// to reach a rider holding agreements, and an e2e run seeds them on the rider persona's own
// membership instead. It is tagged with the name of the test its seeding serves, the precedent
// checklist-phase56-horses-notes.spec.ts set for its own three Setup lines — which records a #1251
// verdict rather than reversing one. Line 1008, immediately below this file's last line, stays
// `(manual)`: it is a hover-affordance judgement, untouched here.
//
// ## A paired slice
//
// The same file is greped by @trainer and @rider, so Playwright dispatches it twice and each run
// seeds its own barn (support/test.ts). withBarn's callback cannot see the project name — test.ts
// resolves it in beforeAll, after the callback signature is fixed — so "the acting member owns X"
// cannot be seeded conditionally. Both barns therefore get *both* subjects: a staff document on
// members.trainer and two agreements on members.rider. They cannot interfere, and neither leaks
// into the other role's assertions:
//
//   - The trainer's own page renders no Active Agreements section at all — the member detail page
//     gates it on `targetRole === 'rider'`, and the trainer's target role is trainer.
//   - The rider's own Documents section reads `rider_documents`, which stays empty; the seeded
//     document is a `staff_documents` row keyed to the trainer's membership.
//
// The waste is those two rows per barn, which is the ruling this batch made for paired slices.
//
// ## Ordering
//
// One test here mutates anything — the trainer's upload, which is declared last so nothing above
// can observe the row it adds. Everything else is an independent read of a barn this file owns
// outright, so there is no test.describe.serial. The read-only Reminder Date test addresses its
// own *seeded* document by file name rather than the uploaded one, so it holds whether or not the
// upload ran, and the two file names are distinct in both directions (neither contains the other,
// the containment hazard #1284 records for person names and which every substring matcher shares).
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addLeaseCharge, addManagedMember, addStaffDocument, assetPath } from './support/fixtures'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

// The managed/unclaimed rider stub. `Harper Test` is the name lines 891-893 themselves use, and it
// clears both halves of the collision constraint E2E_STUB_RIDER documents against the four names
// addMemberships seeds into this same barn: no containment either way against `Test Manager` /
// `Test Trainer` / `Test Rider` / `Test Sutton`, and its first-initial-derived form `Harper T.`
// collides with none of `Test M.` / `Test T.` / `Test R.` / `Test S.`.
//
// checklist-phase4-members-list.spec.ts seeds the same name inline. That is fine rather than a
// clash: each spec file × project pairing gets a barn nobody else touches (support/test.ts), no
// spec reads another's rows, and reusing the checklist's own wording is what keeps these lines
// matching the prose they automate.
const MANAGED_RIDER = { firstName: 'Harper', lastName: 'Test' }
const MANAGED_RIDER_NAME = `${MANAGED_RIDER.firstName} ${MANAGED_RIDER.lastName}`

// The trainer's pre-seeded own document, and the one the upload test adds. Distinct names in both
// directions, because the row locator below matches on the file-name link and every Playwright
// text matcher is substring-based.
const SEEDED_DOCUMENT = 'seeded_contract.pdf'
const UPLOADED_DOCUMENT = 'test_1_kb.pdf'

// Both reminder dates are far-future on purpose. ReminderDueBadge renders `null` unless the date
// is on or before the barn's today, so a future date leaves the Reminder Date cell holding nothing
// but the date itself — which is what lets the read-only assertion below be an exact-text match
// rather than a containment one. Distinct values so neither test can pass on the other's date.
const SEEDED_REMINDER_DATE = '2099-04-15'
const UPLOADED_REMINDER_DATE = '2099-07-20'

// The rider's two agreements — one of each kind, because line 1006 says "cards" and the two kinds
// take visibly different render branches (the '/month' suffix below).
const LEASE_HORSE = 'Juniper'
const BOARD_HORSE = 'Marigold'

// Seed inputs paired with the expected rendering of each. The rendered form is written out rather
// than derived from src/lib/format-currency.ts's formatFee, the reason
// checklist-phase4-members-agreements.spec.ts gives for the same cards one role over: deriving the
// expectation from the code under test makes the assertion agree with any bug in that code.
//
// Regexes rather than plain strings, because a locator filter matches by *containment*: the plain
// string '$450.00' also matches a card rendering '$450.00/month'. The cadence suffix is exactly
// the branch that can regress — the card appends '/month' only for a monthly agreement — so the
// lease matcher has to be able to say "not followed by the suffix", which containment cannot
// express. `\s+` around the separators rather than a literal ' · ', since the card's JSX splits
// the fee onto its own source line.
const LEASE = { fee: 450, cardText: new RegExp(`Lease\\s+·\\s+${LEASE_HORSE}\\s+·\\s+\\$450\\.00(?!/)`) }
const BOARD = { fee: 800, cardText: new RegExp(`Boarding\\s+·\\s+${BOARD_HORSE}\\s+·\\s+\\$800\\.00/month`) }

let managedRiderId: string

const barn = withBarn('phase56-members-self', async ({ supabase, barn, members }) => {
  // The unclaimed rider. addManagedMember never writes user_id, so this membership's user_id is
  // null by construction — the precondition the Unlinked-badge and Manage Member lines need, since
  // both controls key off the target profile being an unclaimed stub.
  managedRiderId = (await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })).membershipId

  // Subject one: a document on the *trainer's* own membership, carrying a reminder date. Seeded
  // rather than uploaded so the read-only assertion holds independently of the upload test.
  await addStaffDocument(supabase, barn, members.trainer, {
    recordType: 'other',
    fileName: SEEDED_DOCUMENT,
    reminderDate: SEEDED_REMINDER_DATE,
  })

  // Subject two: two agreements on the *rider's* own membership. Two horses with distinct names,
  // so "each card names its horse" discriminates between the cards rather than passing on a single
  // shared name. addLeaseCharge creates the agreement for either kind — there is no separate
  // agreement builder, per #1137.
  //
  // `at`, not `monthsAgo`: fixtures.ts documents monthsAgo as the month-scoped Finances path, and
  // nothing here reads a date at all — getActiveAgreementsForRider filters on is_active and the
  // card renders no date — so this only needs to be a valid start date.
  const seededAt = new Date()
  const leaseHorse = await addHorse(supabase, barn.id, LEASE_HORSE)
  const boardHorse = await addHorse(supabase, barn.id, BOARD_HORSE)

  await addLeaseCharge(supabase, barn, {
    at: seededAt,
    riderId: members.rider.membershipId,
    horseId: leaseHorse.id,
    fee: LEASE.fee,
    kind: 'lease',
  })
  await addLeaseCharge(supabase, barn, {
    at: seededAt,
    riderId: members.rider.membershipId,
    horseId: boardHorse.id,
    fee: BOARD.fee,
    kind: 'board',
  })
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

const membersUrl = () => `/barn/${barn.slug}/members`
const memberUrl = (membershipId: string) => `/barn/${barn.slug}/members/${membershipId}`

/** The <section> owning a given h2 — the roster and the member detail page are both h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/** A roster card, addressed by the membership it points at rather than by any text it renders. */
function memberLink(page: Page, sectionName: string, membershipId: string) {
  return section(page, sectionName).locator(`a[href="${memberUrl(membershipId)}"]`)
}

const documentsSection = (page: Page) => section(page, 'Documents')

/** A document's row, addressed by the file-name link it contains. */
const documentRow = (page: Page, fileName: string) =>
  documentsSection(page).locator('tr').filter({ has: page.getByRole('link', { name: fileName, exact: true }) })

/**
 * That row's Reminder Date cell — the fourth <td>, matching the header order Type / Notes / Link /
 * Reminder Date / Actions.
 *
 * Addressed by position rather than by the date input the manager's version holds, which is the
 * whole point: for a non-manager there *is* no input to hang a locator off, so a locator built
 * from one would find nothing and the read-only claim would pass vacuously.
 */
const reminderDateCell = (page: Page, fileName: string) => documentRow(page, fileName).locator('td').nth(3)

const activeAgreements = (page: Page) => section(page, 'Active Agreements')

/** One <p> per card — the empty-state branch renders a <p> too, but only when there are no cards. */
const agreementCardText = (page: Page) => activeAgreements(page).locator('p')

/**
 * One locator matching both of the rider's cards, each bound to its own expected value.
 *
 * This shape is what keeps an "each card …" checkbox at a single assertion without weakening it. A
 * section-wide toContainText would pass when one card carries both values and the other carries
 * none; the two matchers name different horses, so they cannot both match the same element, and a
 * count of 2 therefore requires both bindings to hold — either one being wrong yields 1 or 0.
 *
 * Bound by rendered text rather than by href, unlike the manager-side spec's version of this
 * helper: for a rider these cards have no href at all, which is what line 1007 below asserts.
 */
function cardsMatching(page: Page, lease: RegExp, board: RegExp) {
  return agreementCardText(page).filter({ hasText: lease }).or(agreementCardText(page).filter({ hasText: board }))
}

const uploadForm = (page: Page) => page.locator('main form')

/**
 * The submit button, located structurally rather than by its accessible name.
 *
 * Not decoration: the label is `{pending ? 'Uploading…' : 'Upload'}`, so a non-exact name match
 * would match "Upload" as a prefix of "Uploading…" — the containment hazard #1202 found, live in
 * this form.
 */
const submitButton = (page: Page) => uploadForm(page).locator('button[type="submit"]')

/**
 * Both destinations, as RegExp rather than Playwright's URL glob — `?` is a wildcard there rather
 * than the query separator the upload URL needs it to be (same reason #1197/#1201 give).
 */
const atMemberDetail = (membershipId: string) => new RegExp(`/members/${membershipId}$`)
const atDocumentUpload = (membershipId: string) =>
  new RegExp(`/documents/new\\?entity=trainer&id=${membershipId}$`)

// ---------------------------------------------------------------------------
// The roster, through both non-manager roles (lines 887-888, 992-993)
// ---------------------------------------------------------------------------

// Order is asserted here, and it is not the #1286 hazard: these are four <section> elements in the
// page's own markup, so their sequence is structural and fixed at author time rather than a DB row
// order that an ORDER BY could still change. toHaveText's array form pins the count as well as
// each string, so a fifth section or a missing one fails too.
test('members_page_lists_all_four_roster_sections @trainer @rider', async ({ page }) => {
  await page.goto(membersUrl())
  await expect(page.locator('main > section').getByRole('heading', { level: 2 })).toHaveText([
    'You',
    'Managers',
    'Trainers',
    'Riders',
  ])
})

// The two Add forms are the page's only <form> elements, and both render behind the same
// `membership.role === 'manager'` gate, so their absence is the whole claim.
//
// The wait is a falsifiability guard rather than a second assertion: toHaveCount(0) is satisfied by
// an empty document just as readily as by a correctly rendered one, so the absence below has to be
// pointed at a page that has demonstrably rendered its roster first.
test('members_page_shows_no_add_member_forms_to_a_non_manager @trainer @rider', async ({ page }) => {
  await page.goto(membersUrl())
  await section(page, 'Trainers').getByRole('heading', { level: 2 }).waitFor()
  await expect(page.locator('main form')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The managed/unclaimed rider row (lines 891-893, 994)
// ---------------------------------------------------------------------------

// "Renders as a normal card link": the locator is an <a> carrying that member's detail href, so
// resolving it at all is the claim — an unclaimed member's row is an ordinary link to an ordinary
// page, not a special-cased dead entry.
test('managed_rider_row_renders_as_a_card_link_to_their_member_page @trainer', async ({ page }) => {
  await page.goto(membersUrl())
  await expect(memberLink(page, 'Riders', managedRiderId)).toHaveCount(1)
})

// The Unlinked badge is manager-only (`m.isManaged && membership.role === 'manager'`), so both
// non-manager roles assert its absence — a different claim from the row simply rendering, which is
// the test above.
//
// Exact text rather than a count of zero badges, and that choice is doing two jobs: it is
// self-guarding, since toHaveText fails outright when the locator resolves to nothing, and it is
// strictly stronger, since it also carries the "showing the name only" half — any badge, sibling
// label or trailing affordance appended inside the card breaks the match.
test('managed_rider_row_shows_no_unlinked_badge @trainer @rider', async ({ page }) => {
  await page.goto(membersUrl())
  await expect(memberLink(page, 'Riders', managedRiderId)).toHaveText(MANAGED_RIDER_NAME)
})

// Copy Invite and Revoke live only inside ManageMemberSection, which the detail page renders behind
// `callerRole === 'manager'` — so a trainer opening an unclaimed member's page sees neither, and
// the section's own h2 is the thing whose absence proves it.
//
// The h1 match is the falsifiability guard: it establishes that this page rendered, and rendered
// the member it was asked for, so the count of zero below cannot be satisfied by a 404 or an empty
// document.
test('managed_member_page_shows_no_manage_member_controls_to_a_trainer @trainer', async ({ page }) => {
  await page.goto(memberUrl(managedRiderId))
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(MANAGED_RIDER_NAME)
  await expect(page.getByRole('heading', { name: 'Manage Member', exact: true })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// A trainer's own documents (lines 889-890)
// ---------------------------------------------------------------------------

// The member detail page renders the Reminder Date cell as an editable ReminderDateCell for a
// manager and as bare text for everyone else. Exact-text is what discriminates between the two
// without reaching for a locator that only exists in one of them: an <input> contributes no text
// at all, so a cell that had regressed to the editable branch reads as '' and fails this match —
// while a cell that never rendered fails it too, since toHaveText requires the locator to resolve.
//
// That is the whole claim of the line, asserted positively rather than as "a save failed".
test('own_document_reminder_date_renders_as_read_only_text_to_a_trainer @trainer', async ({ page }) => {
  await page.goto(memberUrl(barn.data.members.trainer.membershipId))
  await expect(reminderDateCell(page, SEEDED_DOCUMENT)).toHaveText(SEEDED_REMINDER_DATE)
})

// Declared last among the trainer tests: it is the only test in this file that mutates seeded
// state, and Playwright runs a job's tests serially, so nothing above can observe the row it adds.
//
// Reached by *clicking through* from the member page rather than by goto. DocumentUploadForm's file
// handling runs in the input's React onChange and its pending state comes from useActionState, so
// an unhydrated form submits as a native POST with no client state at all; arriving by a
// client-side navigation means the destination is rendered by an already-running React root, so its
// handlers are attached before the fill below (#1197). The wait is on the submit button rather than
// the Choose File one, because `input[type="file"]` also carries the button role and resolves to
// "Choose File" by accessible name — that locator is a strict-mode violation rather than a guard.
//
// One assertion covers the whole line: the row existing proves the upload landed, and its cell
// holding the date proves the optional Reminder Date rode along with it.
test('trainer_can_upload_a_document_with_a_reminder_date_on_their_own_member_page @trainer', async ({ page }) => {
  test.slow()
  const membershipId = barn.data.members.trainer.membershipId

  await page.goto(memberUrl(membershipId))
  await documentsSection(page).getByRole('link', { name: 'Add Document', exact: true }).click()
  await page.waitForURL(atDocumentUpload(membershipId), { waitUntil: 'commit' })
  await submitButton(page).waitFor()

  await uploadForm(page).locator('input[name="reminder_date"]').fill(UPLOADED_REMINDER_DATE)
  await page.setInputFiles('input[type="file"]', assetPath(UPLOADED_DOCUMENT))
  await submitButton(page).click()
  await page.waitForURL(atMemberDetail(membershipId), { waitUntil: 'commit' })

  await expect(reminderDateCell(page, UPLOADED_DOCUMENT)).toHaveText(UPLOADED_REMINDER_DATE)
})

// ---------------------------------------------------------------------------
// A rider's own documents — read-only self-service (lines 995-996)
// ---------------------------------------------------------------------------

test('rider_own_documents_section_shows_the_empty_state @rider', async ({ page }) => {
  await page.goto(memberUrl(barn.data.members.rider.membershipId))
  await expect(documentsSection(page)).toContainText('No documents yet')
})

// #864 split viewing from managing for a self-viewing rider: canViewDocuments is true (the section
// renders) while canManage is false (the button does not). The empty-state wait is the
// falsifiability guard — it establishes that the section itself rendered, so the count of zero is
// about the button rather than about a section that was gated out wholesale.
test('rider_own_documents_section_has_no_add_document_button @rider', async ({ page }) => {
  await page.goto(memberUrl(barn.data.members.rider.membershipId))
  await documentsSection(page).getByText('No documents yet').waitFor()
  await expect(documentsSection(page).getByRole('link', { name: 'Add Document', exact: true })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// A rider's own Active Agreements (lines 1005-1007)
// ---------------------------------------------------------------------------

// Set membership, not row order: getActiveAgreementsForRider orders by created_at DESC, and both
// agreements are seeded in the same callback within the same millisecond, so which card renders
// first is not a property this file can assert. The union locator above is order-blind by
// construction — it counts bindings, not positions.
test('rider_own_member_page_renders_their_active_agreement_cards @rider', async ({ page }) => {
  await page.goto(memberUrl(barn.data.members.rider.membershipId))
  await expect(cardsMatching(page, LEASE.cardText, BOARD.cardText)).toHaveCount(2)
})

// Asserted by element type rather than by clicking and observing no change: the page renders each
// card through <Card href={linkable ? … : undefined}>, and `linkable` is `callerRole === 'manager'`,
// so for a rider the Card falls to its plain <div> branch and there is no anchor in the section at
// all. A click-and-observe would prove far less — a link whose navigation merely failed would pass.
//
// The wait is the falsifiability guard, and it is pointed at exactly the positive case: cards are
// present, so "no links here" is a claim about those cards rather than about an empty section.
test('rider_active_agreement_cards_are_not_links @rider', async ({ page }) => {
  await page.goto(memberUrl(barn.data.members.rider.membershipId))
  await agreementCardText(page).first().waitFor()
  await expect(activeAgreements(page).getByRole('link')).toHaveCount(0)
})
