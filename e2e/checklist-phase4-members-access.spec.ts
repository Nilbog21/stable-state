// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/lessons/**
import { test, expect, withBarn, type Page } from './support/test'
import { E2E_USERS, addHorse, addManagedMember, addTier } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'

// The two button labels InstructorAccess renders, written out rather than imported from the
// component: an expectation derived from the code under test agrees with any bug in it, which is
// the same reason the issue forbids reading expected values back out of the DB.
const REVOKE = 'Revoke Instructor Access'
const GRANT = 'Grant Instructor Access'

// The one assertion here that waits on a server action plus its revalidate rather than on a page
// already loaded. `toHaveText` is a web-first matcher, so it runs on expect's 5s default and
// `test.slow()` cannot raise it — the third tier in support/test.ts's Timeouts block, and the one
// place a number *loosens*. Observed timing out at 5s under full-suite load, passing in 1s alone.
const SETTLE_AFTER_WRITE = 15_000

// The confirm text, likewise written out. Split into the two halves the checklist asks about
// separately — one line claims the prompt is "naming the trainer", the next that it "warns
// they'll no longer be assignable to future lessons" — plus the whole string, which the manager's
// own "does raise a confirm prompt" line asserts intact.
const FUTURE_LESSONS_WARNING = 'They will no longer be assignable to future lessons.'
const revokePrompt = (name: string) => `Revoke instructor access for ${name}? ${FUTURE_LESSONS_WARNING}`

const fullName = (who: { firstName: string; lastName: string }) => `${who.firstName} ${who.lastName}`

// The two shared logins that hold a membership in this barn and matter here. Read off E2E_USERS
// rather than hardcoded, per the issue's "expected values come from builder return values" rule.
const MANAGER_NAME = fullName(E2E_USERS.manager)
const TRAINER_LOGIN_NAME = fullName(E2E_USERS.trainer)

// Four managed stubs, one per state the checklist names. Gale, Indigo and Morgan are the names
// the "Rider Gale Test", "Indigo Test" and "Second manager Morgan Manager" lines use and are kept
// verbatim; the trainer the Instructor Access lines act on
// is unnamed by the checklist, so it gets a name of its own that collides with nothing.
//
// A stub rather than the shared trainer login for that role, because the chain flips can_instruct
// several times and a stub keeps the whole exercise inside this barn's own rows. (The stub is not
// strictly required for that — barn_memberships is per-barn either way — but it also leaves
// TRAINER_LOGIN_NAME as a second, untouched instructor, which is what gives the "no longer
// appears in the instructor select" assertion a
// non-empty expected list to compare against instead of an empty one.)
const TRAINER_STUB = { firstName: 'Sage', lastName: 'Test' }
const RIDER_STUB = { firstName: 'Gale', lastName: 'Test' }
const REMOVABLE = { firstName: 'Indigo', lastName: 'Test' }
const SECOND_MANAGER = { firstName: 'Morgan', lastName: 'Manager' }

const TRAINER_STUB_NAME = fullName(TRAINER_STUB)
const REMOVABLE_NAME = fullName(REMOVABLE)
const SECOND_MANAGER_NAME = fullName(SECOND_MANAGER)

/**
 * Every h2 a manager sees on a managed rider's detail page, in document order — the assertion
 * the "shows no **Instructor Access** section" line is made with.
 *
 * A `toHaveCount(0)` over an Instructor Access locator would be satisfied by a page that rendered
 * nothing at all, which is the vacuity shape the batch keeps hitting: the locator resolves to
 * nothing, and both the real expectation and any mutation of it pass. Pinning the whole list
 * instead makes an unrendered page fail (it yields []) and still fails the moment an Instructor
 * Access heading appears anywhere among them.
 */
const RIDER_SECTION_HEADINGS = ['Manage Member', 'Photo', 'Active Agreements', 'Contact Info', 'Documents']

let trainerStubId = ''
let riderStubId = ''
let removableId = ''
let removableProfileId = ''
let secondManagerId = ''

const barn = withBarn('phase4-members-access', async ({ supabase, barn, members }) => {
  // addMemberships gives every non-rider can_instruct = true, but the "reading **Grant Instructor
  // Access**" line requires your own
  // manager page to read "Grant Instructor Access" — i.e. a manager who has *not* been granted
  // instructor access, which is the app's own default for a manager created through the UI.
  //
  // This writes a barn_memberships row, not a profile. That distinction is what keeps it outside
  // the fleet rule against touching the three shared logins' state: memberships are per-barn and
  // die with the barn in teardownBarnData, where profiles are global to the Supabase project.
  mustSucceed(
    await supabase
      .from('barn_memberships')
      .update({ can_instruct: false })
      .eq('id', members.manager.membershipId)
      .select('id'),
    'seed the manager without instructor access'
  )

  // can_instruct defaults to true for a trainer stub, matching create_managed_member — which is
  // exactly the trainers-default-to-can_instruct=true state asserted by the line reading "an
  // **Instructor Access** section reading **Revoke Instructor Access**".
  const trainerStub = await addManagedMember(supabase, barn.id, { ...TRAINER_STUB, role: 'trainer' })
  trainerStubId = trainerStub.membershipId

  const riderStub = await addManagedMember(supabase, barn.id, { ...RIDER_STUB, role: 'rider' })
  riderStubId = riderStub.membershipId

  const removable = await addManagedMember(supabase, barn.id, { ...REMOVABLE, role: 'rider' })
  removableId = removable.membershipId
  removableProfileId = removable.profileId

  // A second manager, for the #969 rule in "Second manager Morgan Manager's member detail page
  // shows no **Remove** button either". Unclaimed, so its user_id is null and the
  // `target.user_id !== user.id` half of canRemoveMember *passes* — leaving the role check as the
  // only thing that can suppress the button, which is the rule the line is actually about.
  const secondManager = await addManagedMember(supabase, barn.id, { ...SECOND_MANAGER, role: 'manager' })
  secondManagerId = secondManager.membershipId

  // The new-lesson form renders without either, but both are what it is for; seeding them keeps
  // the instructor select being read in a form that is otherwise in a realistic state.
  await addTier(supabase, barn.id, { name: 'Standard', price: 60, isDefault: true })
  await addHorse(supabase, barn.id, 'Kestrel')
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

const memberPage = (membershipId: string) => `/barn/${barn.slug}/members/${membershipId}`
const membersList = () => `/barn/${barn.slug}/members`

/** The <section> owning the Instructor Access h2 — the member detail page is h2-partitioned. */
function instructorAccess(page: Page) {
  return page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Instructor Access', exact: true }) })
}

/** That section's single button, whose label *is* the current access state. */
function instructorAccessButton(page: Page) {
  return instructorAccess(page).getByRole('button')
}

/**
 * The member detail page's header row — the h1's parent, which is the
 * `flex items-center justify-between` div holding the name and (when permitted) Remove.
 *
 * Shared deliberately between "Indigo Test's member detail page shows a **Remove** button"
 * (present) and the two "shows no **Remove** button" lines (absent). Those
 * two are therefore the positive control for this one: the same locator constant resolves to a
 * real header on all three pages, so a header that stopped rendering could not make the absence
 * assertions pass.
 */
function memberHeader(page: Page) {
  return page.getByRole('heading', { level: 1 }).locator('xpath=..')
}

/** Every member the Members list links to, addressed by membership rather than by any text. */
function memberLinks(page: Page) {
  return page.locator(`a[href^="${membersList()}/"]`)
}

function instructorOptions(page: Page) {
  return page.locator('#instructor_id option')
}

/**
 * Collects every browser dialog raised for the rest of this test, answering each the same way.
 *
 * Registered for the whole test rather than only around the click: a handler removed as soon as
 * the click resolves would let a dialog raised a moment later fall through to Playwright's
 * auto-dismiss, and the two "raises no confirm prompt" lines would then pass on a page that does
 * prompt. Nothing needs to unregister it — the page is disposed at the end of each test.
 */
function collectDialogs(page: Page, respond: 'accept' | 'dismiss'): string[] {
  const messages: string[] = []
  page.on('dialog', (dialog) => {
    messages.push(dialog.message())
    void (respond === 'accept' ? dialog.accept() : dialog.dismiss())
  })
  return messages
}

/**
 * Opens the new-lesson form and waits for it to render.
 *
 * test.slow() lives here rather than on the individual tests so whichever test actually pays the
 * cold-compile cost for this route gets the raised budget, including under a standalone --grep
 * (#1206). It is the sanctioned way to buy time: an explicit timeout on any waitFor* would
 * *tighten* the budget, since actionTimeout/navigationTimeout both default to unbounded (#1211).
 */
async function gotoNewLessonForm(page: Page) {
  test.slow()
  await page.goto(`/barn/${barn.slug}/lessons/new`)
  // waitFor, not an expect: this is a settle, and the repo's one-assertion-per-test rule reads
  // better when the only expect() in a test body is the claim the test is named for.
  await page.getByRole('heading', { level: 1, name: 'New Lesson' }).waitFor()
}

/**
 * Settles until the Instructor Access button carries `label`, without spending an assertion.
 *
 * Used as the "the click took effect" guard in the two prompt-free tests, whose single claim is
 * about the *absence* of a dialog: an empty `dialogs` array is also true of a click that did
 * nothing, so something has to prove the submit went through — but that something is a wait, not
 * the assertion those tests are named for.
 */
async function settleInstructorAccessButton(page: Page, label: string) {
  await instructorAccess(page).getByRole('button', { name: label, exact: true }).waitFor()
}

// ---------------------------------------------------------------------------
// Instructor Access on a trainer's page
// ---------------------------------------------------------------------------

test.describe.serial('a trainer\'s instructor access', () => {
  test('trainer_detail_instructor_access_button_reads_revoke @manager', async ({ page }) => {
    await page.goto(memberPage(trainerStubId))
    await expect(instructorAccessButton(page)).toHaveText(REVOKE)
  })

  // The two prompt-content lines dismiss rather than accept, so they leave access untouched for
  // the cancel line below them.
  //
  // Each asserts the array, not a joined string: the array shape is what says *one* prompt was
  // raised, and an empty one — a click that prompted nothing — fails. The substring each is
  // matched on is the half of the message its own checklist line is about, so neither line is
  // silently carrying the other's claim.
  test('revoking_instructor_access_prompts_with_the_trainers_name @manager', async ({ page }) => {
    const dialogs = collectDialogs(page, 'dismiss')
    await page.goto(memberPage(trainerStubId))
    await instructorAccessButton(page).click()
    expect(dialogs).toEqual([expect.stringContaining(TRAINER_STUB_NAME)])
  })

  test('the_revoke_prompt_warns_the_trainer_becomes_unassignable_to_future_lessons @manager', async ({ page }) => {
    const dialogs = collectDialogs(page, 'dismiss')
    await page.goto(memberPage(trainerStubId))
    await instructorAccessButton(page).click()
    expect(dialogs).toEqual([expect.stringContaining(FUTURE_LESSONS_WARNING)])
  })

  // Self-verifying: dismissing the confirm is what makes the click's preventDefault fire, so if
  // the prompt were removed the form would submit and the reloaded button would read Grant.
  test('cancelling_the_revoke_prompt_leaves_instructor_access_unchanged @manager', async ({ page }) => {
    collectDialogs(page, 'dismiss')
    await page.goto(memberPage(trainerStubId))
    await instructorAccessButton(page).click()
    await page.reload()
    await expect(instructorAccessButton(page)).toHaveText(REVOKE)
  })

  test('confirming_the_revoke_prompt_flips_the_button_to_grant @manager', async ({ page }) => {
    collectDialogs(page, 'accept')
    await page.goto(memberPage(trainerStubId))
    await instructorAccessButton(page).click()
    await expect(instructorAccessButton(page)).toHaveText(GRANT, { timeout: SETTLE_AFTER_WRITE })
  })

  // The whole option list, not a zero-count over the revoked trainer: a select that failed to
  // render resolves that count to 0 and satisfies it for the wrong reason. The manager is seeded
  // without instructor access and every rider is ineligible, so the shared trainer login is the
  // only instructor left — one entry, which also sidesteps the tie in `created_at` that a
  // batch-inserted membership set leaves in the ordering of a longer list.
  test('a_revoked_trainer_is_absent_from_the_new_lesson_instructor_select @manager', async ({ page }) => {
    await gotoNewLessonForm(page)
    await expect(instructorOptions(page)).toHaveText([TRAINER_LOGIN_NAME])
  })

  // Grant is prompt-free by construction — InstructorAccess only calls window.confirm when
  // canInstruct is true — so the claim is that no dialog was raised at all. The settle above the
  // assertion is what proves the click took effect; without it an empty `dialogs` would also be
  // true of a click that did nothing.
  test('granting_instructor_access_raises_no_confirm_prompt @manager', async ({ page }) => {
    const dialogs = collectDialogs(page, 'dismiss')
    await page.goto(memberPage(trainerStubId))
    await instructorAccessButton(page).click()
    await settleInstructorAccessButton(page, REVOKE)
    expect(dialogs).toEqual([])
  })

  test('a_regranted_trainer_returns_to_the_new_lesson_instructor_select @manager', async ({ page }) => {
    await gotoNewLessonForm(page)
    await expect(instructorOptions(page).filter({ hasText: TRAINER_STUB_NAME })).toHaveCount(1)
  })
})

// ---------------------------------------------------------------------------
// Instructor Access on your own manager row
// ---------------------------------------------------------------------------

test.describe.serial('your own instructor access', () => {
  const ownPage = () => memberPage(barn.data.members.manager.membershipId)

  test('your_own_instructor_access_button_reads_grant @manager', async ({ page }) => {
    await page.goto(ownPage())
    await expect(instructorAccessButton(page)).toHaveText(GRANT)
  })

  test('granting_your_own_instructor_access_raises_no_confirm_prompt @manager', async ({ page }) => {
    const dialogs = collectDialogs(page, 'dismiss')
    await page.goto(ownPage())
    await instructorAccessButton(page).click()
    await settleInstructorAccessButton(page, REVOKE)
    expect(dialogs).toEqual([])
  })

  // Presence, not the whole list: three instructors are eligible at this point and two of the
  // memberships were inserted in one statement, so their created_at values tie and the order
  // getInstructorsByBarn returns them in is undefined. A presence assertion cannot be vacuous —
  // a select that never rendered yields 0, not 1.
  test('you_appear_in_the_new_lesson_instructor_select_after_granting @manager', async ({ page }) => {
    await gotoNewLessonForm(page)
    await expect(instructorOptions(page).filter({ hasText: MANAGER_NAME })).toHaveCount(1)
  })

  // Accepted rather than dismissed, so this leaves the manager back at the seeded state — "to
  // undo" is what the checklist line describes.
  test('revoking_your_own_instructor_access_raises_a_confirm_prompt @manager', async ({ page }) => {
    const dialogs = collectDialogs(page, 'accept')
    await page.goto(ownPage())
    await instructorAccessButton(page).click()
    expect(dialogs).toEqual([revokePrompt(MANAGER_NAME)])
  })
})

// ---------------------------------------------------------------------------
// Instructor Access is absent for a rider
// ---------------------------------------------------------------------------

test('a_riders_detail_page_has_no_instructor_access_section @manager', async ({ page }) => {
  await page.goto(memberPage(riderStubId))
  await expect(page.getByRole('heading', { level: 2 })).toHaveText(RIDER_SECTION_HEADINGS)
})

// ---------------------------------------------------------------------------
// Removing a member
// ---------------------------------------------------------------------------

test.describe.serial('removing a member', () => {
  /**
   * teardownBarnData reaches profile rows *through* the barn's memberships, so the membership the
   * middle test deletes takes the only path to this stub's profile with it: the row is correctly
   * is_managed = true and nothing wrote to a shared login, but it is no longer reachable, and it
   * would survive teardown as a leaked row per run per Playwright project.
   *
   * Hand it back rather than reimplement the sweep — and only when nothing references it, so a
   * chain that failed before the removal leaves the row for teardownBarnData instead of tripping
   * the foreign key. A describe-scoped afterAll completes before the file-scoped one withBarn
   * registers, which is what makes this run while the barn is still around.
   */
  test.afterAll(async () => {
    if (!removableProfileId) return
    const { supabase } = barn.data
    const remaining = mustSucceed<{ id: string }[]>(
      await supabase.from('barn_memberships').select('id').eq('profile_id', removableProfileId),
      `look up memberships still referencing ${REMOVABLE_NAME}`
    )
    if (remaining.length > 0) return
    mustSucceed(
      await supabase.from('profiles').delete().eq('id', removableProfileId).select('id'),
      `delete the orphaned ${REMOVABLE_NAME} profile`
    )
  })

  /**
   * Whole-header equality, which pins three things at once: the button exists, it is inside the
   * header row rather than elsewhere on the page, and it follows the name. In a flex row with no
   * `order` override, DOM order is left-to-right, so "after the name in the header's text" is also
   * "to the right of the name on screen".
   *
   * What this does *not* prove is pixel position — a stacked column would satisfy it identically.
   * The geometric half of "top-right" is a visual judgment, deferred to @visual throughout this
   * batch; a boundingBox read would buy it at the cost of a one-shot read whose value resolves
   * from the parent even when the element meant is absent.
   */
  test('a_removable_members_header_carries_a_remove_button_beside_their_name @manager', async ({ page }) => {
    await page.goto(memberPage(removableId))
    await expect(memberHeader(page)).toHaveText(`${REMOVABLE_NAME}Remove`)
  })

  // waitForURL pins which page, the h1 pins that it rendered: 'commit' resolves before the new
  // document has rendered, so a notFound() or a server error at this same URL would satisfy the
  // wait on its own (#1202).
  //
  // Two properties this depends on, both checked rather than assumed (#1196):
  //   - `waitForURL`, not `expect(page).toHaveURL`. The latter passes on its first poll, and an
  //     App Router <Link> commits pushState only after the RSC payload lands — so it can pass
  //     against the *old* URL. waitForURL fails the test outright if the URL never lands.
  //   - The h1 has to distinguish the two pages, or it proves nothing about where we ended up.
  //     It does: the member detail page's h1 is the member's own name (page.tsx renders
  //     `{displayName}` there), and the Members list's is the literal "Members". Verified by
  //     probe, not just by reading: asserting this exact locator on the member detail page fails.
  //     `exact: true` because getByRole's name match is substring-based otherwise.
  //
  // The regex is anchored on `members$`, so the detail URL it navigates *from*
  // (`…/members/{id}`) cannot satisfy it either.
  test('confirming_the_remove_prompt_redirects_to_the_members_list @manager', async ({ page }) => {
    collectDialogs(page, 'accept')
    await page.goto(memberPage(removableId))
    await memberHeader(page).getByRole('button', { name: 'Remove', exact: true }).click()
    await page.waitForURL(new RegExp(`${membersList()}$`), { waitUntil: 'commit' })
    await expect(page.getByRole('heading', { level: 1, name: 'Members', exact: true })).toBeVisible()
  })

  // The whole remaining roster, not a zero-count on the removed member: a bare absence check also
  // passes when the page errors, redirects, or changes its link shape, none of which mean the
  // member was removed. This is the form #1092 rewrote its own near-identical removal test into
  // (checklist-phase4-finances-mutations.spec.ts) for exactly that reason, and it is strictly
  // stronger than the paired-count version it replaces here — a roster that loses or gains any
  // *other* member fails too. Membership ids rather than names, so a member sharing a first or
  // last name cannot stand in for the removed one.
  test('a_removed_member_no_longer_appears_on_the_members_list @manager', async ({ page }) => {
    await page.goto(membersList())
    const { manager, trainer, rider, rider2 } = barn.data.members
    // evaluateAll does not auto-wait: a not-yet-rendered roster yields [], which would read as
    // "nobody is listed" rather than "this read was too early" (e2e/support/read.ts, #1238).
    await memberLinks(page).first().waitFor()
    const hrefs = await memberLinks(page).evaluateAll((links) => links.map((link) => link.getAttribute('href')))
    // Deduplicated defensively: the page renders a "You" card as well as the role sections, and
    // only #1200's own-entry filter keeps that from being a second link to the same membership.
    expect([...new Set(hrefs)].sort()).toEqual(
      [manager.membershipId, trainer.membershipId, rider.membershipId, rider2.membershipId,
        trainerStubId, riderStubId, secondManagerId].map(memberPage).sort()
    )
  })
})

// ---------------------------------------------------------------------------
// Members who cannot be removed
// ---------------------------------------------------------------------------

test('your_own_member_detail_header_carries_no_remove_button @manager', async ({ page }) => {
  await page.goto(memberPage(barn.data.members.manager.membershipId))
  await expect(memberHeader(page)).toHaveText(MANAGER_NAME)
})

// #969: a manager can no longer remove another manager. This stub is unclaimed, so the
// self-removal half of canRemoveMember is satisfied and the role check is the only thing left
// that can suppress the button.
test('a_second_managers_header_carries_no_remove_button @manager', async ({ page }) => {
  await page.goto(memberPage(secondManagerId))
  await expect(memberHeader(page)).toHaveText(SECOND_MANAGER_NAME)
})
