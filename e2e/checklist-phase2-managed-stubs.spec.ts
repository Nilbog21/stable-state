// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/app/barn/[slug]/register/**
// covers: src/proxy.ts
//
// Phase 2's managed-rider-stub block (checklists/pre-release/phase-2-manager-seeding.md, from
// "Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test**" through "it never
// copies the just-revoked stale token (#939 regression check)"), plus the two Phase 7 lines that
// open `/barn/<slug>/register` with no `?token=` — see the Phase 7 note at the bottom of this
// comment for why those two live here rather than in a two-barn spec.
//
// ## Why this file is a chain, and what makes the chain non-vacuous
//
// The head of the block is a *mutation through the UI*: "Create managed riders … through the
// inline Add Rider form". Everything after it asserts on what that form produced, so tests 2-11
// read the three stubs' membership ids out of a module-scope map that the create test fills from
// the rendered card hrefs — DOM-relational, never a service-role read.
//
// The obvious alternative — seeding three stubs in a `withBarn` callback via
// `support/fixtures.ts`'s `addManagedMember` — is ruled out by this batch's own standing ruling
// that a slice reproduces a predecessor's end state by calling the RPC or DAL function the UI
// calls, never by hand-writing the rows those functions write. `addManagedMember` is exactly a
// hand-write: raw `.from('profiles').insert({ is_managed: true })` plus
// `.from('barn_memberships').insert(...)`, not `create_managed_member`. And the RPC itself is
// unreachable from a service-role client, because its first statement is
// `IF NOT auth_is_barn_manager(p_barn_id) THEN RAISE EXCEPTION 'not_authorized'` and a
// service-role client has no `auth.uid()`. So hand-seeding would leave the create checkbox
// asserting against members no form ever created. The coupling is the lesser cost; `liveStubId`
// below is its mitigation.
//
// ## Why there is no seed callback, and what that means for rules 4 and 5
//
// `withBarn` is called with no callback at all: the phase-2 tests create everything they assert
// on through the UI, and the phase-7 tests need only that a barn exists. So spec-maintenance rule
// 5 (`mustAffect` on load-bearing setup mutations, #1435) has nothing to bind — this file's seed
// contains no `.update(` or `.delete(`, because it contains nothing.
//
// Rule 4 (#1434) does bind: two tests here make absence claims, and each carries its positive
// anchor in the same test, on the same page state — the three stub cards resolving before "no
// Copy Invite/Revoke on this list", and the "Invite invalid" heading before "no self-registration
// form". Neither absence is asserted on a bare `role="alert"`: the register page's invalid branch
// renders no alert role at all, and every locator here is scoped to `<main>` regardless, so
// Next's permanent `__next-route-announcer__` cannot join a match set.
//
// ## The three names
//
// `Gale Test` / `Harper Test` / `Indigo Test` are the checklist's own. They satisfy both halves of
// the collision constraint stated on `support/fixtures.ts`'s `E2E_STUB_RIDER`, which binds any
// name this suite introduces: none contains another, nor contains (or is contained by) the four
// seeded names `Test Manager` / `Test Trainer` / `Test Rider` / `Test Sutton`; and their
// first-initial-derived forms `Gale T.` / `Harper T.` / `Indigo T.` collide with each other and
// with the seeded `Test M./T./R./S.` in neither direction.
//
// Note that the barn's own seeded `Test Sutton` is a managed stub too, so it also renders an
// Unlinked badge. Every assertion below is therefore scoped to the three stubs this file created
// rather than to "the managed rows", which is what keeps the set-membership claims honest.
//
// ## The Phase 7 lines need one barn, not `withSecondBarn`
//
// `phase-7-multi-barn.md`'s header blockquote names `withSecondBarn` as "the two-barn fixture
// every line below needs" — and then carves these two lines out of its own rule in the same
// breath: "**The two `(e2e-candidate)` lines immediately below are the exception and need only one
// barn** — `register/page.tsx` returns **Invite invalid** on a missing `?token=` before it reads
// the session or looks up a membership". Re-verified against the code rather than carried
// forward: `src/proxy.ts` lists `/barn/${barnSlug}/register` in `exemptPaths` and returns before
// the `barn_session_*` cookie check, `register/page.tsx` returns `<InvalidInvite>` on `!token`
// before its `getAuthenticatedUser()` call and before `getUserMembership`, and there is no
// `src/app/barn/[slug]/layout.tsx` — the only barn layout is `(protected)/layout.tsx`, which this
// route is not inside. Nothing on the path to that heading can observe a second barn.
import { test, expect, withBarn, type Page } from './support/test'
import { settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'
import { assetPath } from './support/fixtures'
import { submitButton } from './support/document-upload'

const barn = withBarn('managed-stubs')

// ---------------------------------------------------------------------------
// The stubs this file creates, and the shapes it expects back
// ---------------------------------------------------------------------------

const STUBS = [
  { first: 'Gale', last: 'Test' },
  { first: 'Harper', last: 'Test' },
  { first: 'Indigo', last: 'Test' },
] as const

const fullName = (stub: (typeof STUBS)[number]) => `${stub.first} ${stub.last}`

const GALE = fullName(STUBS[0])
const HARPER = fullName(STUBS[1])
const INDIGO = fullName(STUBS[2])

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/**
 * The one sanctioned numeric timeout (`support/test.ts`'s timeout block, #1469): web-first `expect`
 * matchers run on expect's own 5s default, which `test.slow()` does NOT raise — it triples the
 * *test* timeout and touches nothing else. So a number here LOOSENS, where a number on a
 * `waitFor`/`waitForURL` could only tighten.
 *
 * Applied only at the four sites the rule names as the sanctioned case — where the assertion's own
 * target is the only thing left to wait on, so a `waitFor` on some other signal would be
 * tautological: the three post-submit card appearances in the create loop, the uploaded document's
 * row, and the two Copy Invite re-enables that wait out a revalidated-props round trip. Every other
 * matcher in this file reads a page that a `goto` already settled and keeps the 5s default.
 *
 * File-local on purpose (#1469), and the same value `checklist-phase2-horses-owner.spec.ts` uses
 * for the structurally identical Add-Horse-through-the-form settle.
 */
const SETTLE_AFTER_WRITE = 15_000

const UPLOADED_DOCUMENT = 'test_1_kb.pdf'

/** The notice `ManageMemberSection` renders above its two controls. */
const UNLINKED_NOTICE =
  'This is an unlinked member. Use the following controls to invite this person to the barn.'

// The `amber`-bearing class tokens each element is expected to carry, sorted. Written out rather
// than derived from the components, so a change to either one fails here instead of agreeing with
// itself — "amber" is the checklist's claim, and these are the only two places it is checkable.
// `Badge tone="amber"`:
const BADGE_AMBER = ['bg-amber-100', 'dark:bg-amber-950', 'dark:text-amber-300', 'text-amber-800']
// `ManageMemberSection`'s notice paragraph:
const NOTICE_AMBER = ['dark:text-amber-300', 'text-amber-800']

// ---------------------------------------------------------------------------
// The chain's captured state
// ---------------------------------------------------------------------------

type CreatedStubs = { barnId: string; ids: Record<string, string> }

let created: CreatedStubs | null = null

/**
 * A stub's membership id, as read off the card the Add Rider form produced.
 *
 * The barn-id comparison is `checklist-phase4-calendar-feed.spec.ts`'s `liveCopy` guard, reduced
 * to what this file needs: Playwright discards the worker process after any test failure and
 * re-runs every `beforeAll` (fact 15), which re-seeds a *different* barn underneath a map filled
 * against the old one. Comparing ids rather than slugs is what detects it — `barnSlugFor`
 * reproduces the same slug on the new run, so a slug comparison would see nothing.
 */
function liveStubId(name: string): string {
  if (!created) {
    throw new Error(
      `no membership id for "${name}" — it is captured by the create test at the head of this serial chain, which must run first`
    )
  }
  if (created.barnId !== barn.data.barn.id) {
    throw new Error(
      `the captured stub ids belong to a torn-down barn (${created.barnId} != ${barn.data.barn.id}) — a worker restart re-seeded underneath them; re-run the whole spec file`
    )
  }
  const id = created.ids[name]
  if (!id) throw new Error(`no membership id captured for "${name}"`)
  return id
}

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

const membersUrl = () => `/barn/${barn.slug}/members`
const memberUrl = (membershipId: string) => `/barn/${barn.slug}/members/${membershipId}`
const registerUrl = () => `/barn/${barn.slug}/register`

/** The <section> owning a given h2 — the roster and the member detail page are both h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

const ridersSection = (page: Page) => section(page, 'Riders')

/** One rider's roster card. Safe as a substring match — see the three-names note in the header. */
const riderCard = (page: Page, name: string) => ridersSection(page).locator('a').filter({ hasText: name })

const manageMemberSection = (page: Page) => section(page, 'Manage Member')

/**
 * Copy Invite and Revoke, located structurally rather than by accessible name, because Copy
 * Invite's own label is state: `{currentCopy?.error === null ? 'Copied!' : 'Copy Invite'}`. A
 * name-based locator resolves to nothing for the two seconds after a successful copy, which is
 * exactly the window tests 10 and 11 drive through. The section renders the pair as
 * `div > button` and `div > form > button`, so the child combinator discriminates them.
 */
const copyInviteButton = (page: Page) => manageMemberSection(page).locator('div > button')
const revokeButton = (page: Page) => manageMemberSection(page).locator('form button')

const documentsSection = (page: Page) => section(page, 'Documents')

/** A document's row, addressed by the file-name link it contains. */
const documentRow = (page: Page, fileName: string) =>
  documentsSection(page).locator('tr').filter({ has: page.getByRole('link', { name: fileName, exact: true }) })

// ---------------------------------------------------------------------------
// Reading the clipboard, and the shapes read off it
// ---------------------------------------------------------------------------

/** Every `amber`-bearing class token on the element, sorted — `checklist-phase1-demo.spec.ts`'s. */
async function amberClassTokens(locator: ReturnType<Page['locator']>): Promise<string[]> {
  // `getAttribute('class')`, not `el.className` — the latter is an `SVGAnimatedString` on an
  // SVGElement, so the union it resolves to has no `split` and the whole read degrades to `any`.
  const classes = await locator.evaluate((el) => el.getAttribute('class') ?? '')
  return classes
    .split(/\s+/)
    .filter((token) => token.includes('amber'))
    .sort()
}

const escapeForRegExp = (literal: string) => literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** `/barn/<slug>/members/<uuid>` — what a roster card's href must be. */
const memberHrefPattern = () => new RegExp(`^/barn/${escapeForRegExp(barn.slug)}/members/${UUID}$`)

/** `<origin>/barn/<slug>/register?token=<uuid>` — what Copy Invite must put on the clipboard. */
function inviteUrlPattern(page: Page): RegExp {
  const origin = new URL(page.url()).origin
  return new RegExp(`^${escapeForRegExp(origin)}/barn/${escapeForRegExp(barn.slug)}/register\\?token=${UUID}$`)
}

/**
 * Clicks Copy Invite and returns what landed on the clipboard.
 *
 * Chromium needs `clipboard-read` granted on the context before `navigator.clipboard.readText`
 * resolves; `clipboard-write` is granted alongside so the component's own `writeText` can never be
 * the thing that fails. "Copied!" is the guard rather than a nicety, and it is the same guard
 * `checklist-phase4-calendar-feed.spec.ts` uses for the same reason: `handleCopy` sets the outcome
 * only after `writeText` RESOLVES, so the label flipping is the app's own signal that the
 * clipboard is populated. Reading without it races the write and yields the *previous* copy's
 * value — which for test 10 would be the stale pre-revoke token, i.e. the exact regression #939 is
 * about, reported as a pass.
 */
async function copyInvite(page: Page): Promise<string> {
  await copyInviteButton(page).click()
  await expect(copyInviteButton(page)).toHaveText('Copied!')
  return page.evaluate(() => navigator.clipboard.readText())
}

// ---------------------------------------------------------------------------
// Managed rider stubs — the chain, in the order the checklist walks it
// ---------------------------------------------------------------------------

test.describe.serial('managed rider stubs', () => {
  // "Create managed riders **Gale Test**, **Harper Test**, and **Indigo Test** — each row is a
  // normal card link to its member detail page"
  //
  // The href is the claim: a managed stub's row is an ordinary link to an ordinary member page,
  // not a special-cased dead entry. `expect.stringMatching` rather than a boolean per row so a
  // failure prints the href it actually found.
  test('creating_three_managed_riders_through_the_add_rider_form_adds_a_card_link_for_each @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(membersUrl())
    // Deliberately NOT fact 9's case, which is about a React-*controlled* input losing its fill:
    // these inputs are uncontrolled, so a pre-hydration fill keeps its value, and the submit is
    // `<form action={serverAction}>`, which carries a pre-hydration click on its own (fact 10). The
    // barrier is here for the loop rather than for the fill — `GuardedForm`'s `onChange`/`onSubmit`
    // dirty toggle only runs once hydrated, and React 19's post-action form reset is what the next
    // iteration types into. The two revoke tests below need a barrier for a much harder reason,
    // stated at each of them; this one is a settle point.
    await waitForBarnPageHydrated(page)

    const form = ridersSection(page).locator('form')
    for (const stub of STUBS) {
      await form.locator('input[name="first_name"]').fill(stub.first)
      await form.locator('input[name="last_name"]').fill(stub.last)
      await form.getByRole('button', { name: 'Add Rider', exact: true }).click()
      // A settle point, not the assertion: `createManagedMemberAction` revalidates rather than
      // redirecting, so the next iteration would otherwise type into a form the previous
      // submission is still resetting. The card this submission creates is the only thing there
      // is to wait on, which is the tautological case where the number is the right tool.
      await expect(riderCard(page, fullName(stub))).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })
    }

    const hrefs: Record<string, string> = {}
    for (const stub of STUBS) {
      hrefs[fullName(stub)] = (await riderCard(page, fullName(stub)).getAttribute('href')) ?? ''
    }

    expect(hrefs).toEqual(
      Object.fromEntries(STUBS.map((stub) => [fullName(stub), expect.stringMatching(memberHrefPattern())]))
    )

    // Captured only once the shape assertion above has passed, so a half-created roster cannot
    // hand the rest of the chain an id it invented.
    created = {
      barnId: barn.data.barn.id,
      ids: Object.fromEntries(
        Object.entries(hrefs).map(([name, href]) => [name, href.slice(href.lastIndexOf('/') + 1)])
      ),
    }
  })

  // "Each of those rows carries an inline amber **Unlinked** badge next to the name"
  //
  // One assertion carrying both halves of the line. The card's own textContent is
  // `<name><badge>` concatenated with no separator, which is what "inline … next to the name"
  // means structurally — a badge moved out of the card, or onto its own row, breaks the match.
  // The amber tokens carry the colour half, which is checkable here precisely because it is a
  // class list rather than the dark-mode readability judgement #1413 sent to `(manual)`.
  test('each_managed_rider_row_carries_an_inline_amber_unlinked_badge @manager', async ({ page }) => {
    await page.goto(membersUrl())

    const rows = []
    for (const stub of STUBS) {
      const card = riderCard(page, fullName(stub))
      const [cardText] = await settledTextContents(card)
      rows.push({ cardText, badgeAmber: await amberClassTokens(card.locator('span')) })
    }

    expect(rows).toEqual(
      STUBS.map((stub) => ({ cardText: `${fullName(stub)}Unlinked`, badgeAmber: BADGE_AMBER }))
    )
  })

  // "No Copy Invite/Revoke buttons appear on this list"
  //
  // The count of 3 is the positive anchor rule 4 requires, in this test and on this page state:
  // `toHaveCount(0)` is satisfied on its first poll (fact 18), so without it the absence claim
  // would pass against a page that had not rendered the roster at all — including a 404.
  test('the_members_list_shows_no_copy_invite_or_revoke_buttons @manager', async ({ page }) => {
    await page.goto(membersUrl())

    const stubCards = ridersSection(page).locator(
      STUBS.map((stub) => `a[href="${memberUrl(liveStubId(fullName(stub)))}"]`).join(', ')
    )
    await expect(stubCards).toHaveCount(STUBS.length)

    await expect(page.locator('main').getByRole('button', { name: /^(Copy Invite|Revoke)$/ })).toHaveCount(0)
  })

  // "Open Gale Test's member detail page as manager — a **Manage Member** section appears right
  // after the name"
  //
  // "Right after the name" is asserted structurally, via the adjacent-sibling combinator, rather
  // than by the section merely being present somewhere on the page: the heading is `<main>`'s
  // first child (with the Remove Member button), and the claim is about what follows it.
  test('a_managed_riders_detail_page_shows_a_manage_member_section_right_after_the_name @manager', async ({
    page,
  }) => {
    await page.goto(memberUrl(liveStubId(GALE)))

    const afterTheName = page.locator('main > div:has(h1) + *')
    await expect(afterTheName.getByRole('heading', { name: 'Manage Member', exact: true })).toBeVisible()
  })

  // "That **Manage Member** section carries an amber notice"
  //
  // Self-guarding without a separate anchor: `amberClassTokens` bottoms out in `locator.evaluate`,
  // which waits for the element and throws if it never attaches — so a section that failed to
  // render fails this test rather than satisfying it with an empty token list.
  test('the_manage_member_sections_notice_renders_amber @manager', async ({ page }) => {
    await page.goto(memberUrl(liveStubId(GALE)))

    const notice = manageMemberSection(page).getByText(UNLINKED_NOTICE, { exact: true })

    expect(await amberClassTokens(notice)).toEqual(NOTICE_AMBER)
  })

  // "That **Manage Member** section carries **Copy Invite** and **Revoke** buttons"
  //
  // Sorted, and exactly these two: strictly stronger than a presence check on each, since a third
  // control appearing in the section — or either of these two being replaced by a link — breaks it.
  test('the_manage_member_section_carries_copy_invite_and_revoke_buttons @manager', async ({ page }) => {
    await page.goto(memberUrl(liveStubId(GALE)))

    const labels = await settledTextContents(manageMemberSection(page).locator('button'))

    expect(labels.sort()).toEqual(['Copy Invite', 'Revoke'])
  })

  // "While Gale Test is still unclaimed, upload `scripts/data/test_1_kb.pdf` on their detail page"
  //
  // Narrowed to the instruction: the line's trailing clause ("confirms manager can upload/delete
  // documents for a managed/unclaimed rider") is its rationale, and the checkbox's action is the
  // upload. The row resolving is the whole claim — it exists only if the insert and the storage
  // write both landed against a member with no `user_id`.
  test('a_manager_can_upload_a_document_for_an_unclaimed_managed_rider @manager', async ({ page }) => {
    test.slow()
    const galeId = liveStubId(GALE)

    await page.goto(memberUrl(galeId))
    await documentsSection(page).getByRole('link', { name: 'Add Document', exact: true }).click()
    await page.waitForURL(new RegExp(`/documents/new\\?entity=rider&id=${galeId}$`), { waitUntil: 'commit' })
    await submitButton(page).waitFor()

    await page.setInputFiles('input[type="file"]', assetPath(UPLOADED_DOCUMENT))
    await submitButton(page).click()
    await page.waitForURL(new RegExp(`/members/${galeId}$`), { waitUntil: 'commit' })

    // `waitUntil: 'commit'` resolves before the member page has rendered, so this row is the first
    // thing waiting on that render as well as on the write — hence the loosened budget.
    await expect(documentRow(page, UPLOADED_DOCUMENT)).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })
  })

  // "Click **Copy Invite** on Gale Test's detail page → the button briefly reads **Copied!**"
  test('copy_invite_flashes_copied_after_writing_the_invite_link @manager', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(memberUrl(liveStubId(GALE)))
    // `handleCopy` is an `onClick`, so a click landing before hydration is simply lost and nothing
    // replays it (fact 10) — the label would stay "Copy Invite" and this test would report a
    // regression that did not happen.
    await waitForBarnPageHydrated(page)

    await copyInviteButton(page).click()

    await expect(copyInviteButton(page)).toHaveText('Copied!')
  })

  // "The copied URL matches `/barn/dev-barn/register?token=<uuid>` (a well-formed UUID token)"
  //
  // The slug and origin come from the running barn and the live page, not from the checklist's
  // `dev-barn` — the claim is the URL's shape, and hardcoding either half would assert against
  // this file's own seeding instead of against what the component built.
  test('the_copied_invite_url_carries_a_well_formed_uuid_token @manager', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(memberUrl(liveStubId(GALE)))
    await waitForBarnPageHydrated(page)

    const copied = await copyInvite(page)

    expect(copied).toMatch(inviteUrlPattern(page))
  })

  // "On Harper Test's detail page, click **Revoke** → click **Copy Invite** again → the copied URL
  // contains a **different** token than before"
  //
  // Inequality alone is the vacuity shape `checklist-phase4-calendar-feed.spec.ts` names: an empty
  // clipboard, a truncated URL and a dropped token all satisfy "different", and two failed reads
  // are unequal to nothing at all. Both shapes are asserted alongside the difference, in one
  // object, so a regression cannot hide in whichever half is not being looked at.
  test('revoking_an_invite_makes_copy_invite_yield_a_different_token @manager', async ({ page, context }) => {
    test.slow()
    const harperId = liveStubId(HARPER)

    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(memberUrl(harperId))
    await waitForBarnPageHydrated(page)

    const before = await copyInvite(page)

    // Matched on method and pathname (fact 14: a URL-only predicate names every Server Action this
    // page's client components fire). Nothing else on the page is driven here, so the only POST
    // after the click is the revoke — and awaiting it is what makes the re-enable below a sync
    // point rather than a race: `awaitingFreshToken` is set synchronously in the form's `onSubmit`
    // and clears only when the revalidated `inviteToken` prop differs, so past the POST,
    // "enabled" means precisely "the new token has committed".
    const revoked = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' && new URL(response.url()).pathname === memberUrl(harperId)
    )
    await revokeButton(page).click()
    await revoked
    await expect(copyInviteButton(page)).toBeEnabled({ timeout: SETTLE_AFTER_WRITE })

    const after = await copyInvite(page)

    expect({
      beforeIsInviteUrl: inviteUrlPattern(page).test(before),
      afterIsInviteUrl: inviteUrlPattern(page).test(after),
      sameToken: before === after,
    }).toEqual({ beforeIsInviteUrl: true, afterIsInviteUrl: true, sameToken: false })
  })

  // "On Indigo Test's detail page, click **Revoke** then immediately click **Copy Invite** … Copy
  // Invite is disabled/unclickable until the new token has loaded (#939 regression check)"
  //
  // Narrowed to the invariant, which is strictly stronger than the line as written: "as fast as
  // possible, before the button re-enables" describes a race no runner can be relied on to win,
  // and a test that loses it reports nothing. The disabled state is the property that makes the
  // stale-token copy impossible, and it is directly observable.
  //
  // The window is wide by construction, not by luck: `busy` is `pending || awaitingFreshToken`, so
  // it stays true across the action POST *and* the revalidated-props round trip that follows it.
  // The re-enable assertion is the other half of the claim — "until the new token has loaded"
  // means the disable is transient, and without it a permanently dead button would pass.
  test('copy_invite_stays_disabled_until_the_revoked_token_has_loaded @manager', async ({ page }) => {
    test.slow()
    await page.goto(memberUrl(liveStubId(INDIGO)))
    // Load-bearing, and the least obvious line in this file — do not "simplify" it away. Revoke is
    // `<form action={formAction}>`, so a click landing before hydration still submits natively
    // (fact 10) and the token really does rotate — but React never runs the `onSubmit` that sets
    // `tokenBeforeRevoke`, and `pending` never goes true, so `busy` stays false and Copy Invite is
    // never disabled. The test would then fail claiming a #939 regression that did not occur.
    await waitForBarnPageHydrated(page)

    await revokeButton(page).click()

    await expect(copyInviteButton(page)).toBeDisabled()
    // The re-enable waits out the action POST plus the revalidated-props round trip and has no
    // other signal to sync on; the disable above keeps the 5s default deliberately, since it
    // asserts a transient state and a looser budget there would only delay a real failure.
    await expect(copyInviteButton(page)).toBeEnabled({ timeout: SETTLE_AFTER_WRITE })
  })
})

// ---------------------------------------------------------------------------
// Phase 7 — the register page with no token (see the header note on why one barn suffices)
// ---------------------------------------------------------------------------

test.describe('the register page with no token', () => {
  // "As `DEV_EMAIL`, open `/barn/test-barn-checklist/register` with no `?token=` → shows an
  // \"Invite invalid\" message"
  test('the_register_page_with_no_token_shows_invite_invalid @manager', async ({ page }) => {
    await page.goto(registerUrl())

    await expect(page.locator('main').getByRole('heading', { name: 'Invite invalid', exact: true })).toBeVisible()
  })

  // "That page shows no self-registration form"
  //
  // The heading is the positive anchor rule 4 requires, in this test rather than borrowed from the
  // one above: `toHaveCount(0)` gets no retry budget (fact 18), so on its own it would pass
  // against a blank document, a redirect to /login, or a 404 — every way this page can fail to be
  // the page whose form is being denied. A DOM locator rather than `getByRole`, because a `<form>`
  // with no accessible name exposes no role to resolve against (fact 16 in the other direction).
  test('the_register_page_with_no_token_shows_no_self_registration_form @manager', async ({ page }) => {
    await page.goto(registerUrl())
    await expect(page.locator('main').getByRole('heading', { name: 'Invite invalid', exact: true })).toBeVisible()

    await expect(page.locator('main form')).toHaveCount(0)
  })
})
