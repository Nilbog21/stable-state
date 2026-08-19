// covers: src/app/barn/[slug]/register/**
// covers: src/app/barns/**
// covers: src/app/page.tsx
// covers: src/app/login/**
// covers: src/app/barn/[slug]/(protected)/layout.tsx
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/NavDrawer.tsx
// covers: src/app/barn/[slug]/(protected)/BarnSwitcher.tsx
// covers: src/app/barn/[slug]/(protected)/UserMenu.tsx
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/auth.ts
// covers: src/components/ui/GoogleSignInButton.tsx
// covers: src/proxy.ts
//
// Phase 7's second-barn story, from claiming an invite into a barn you are not yet a member of
// through the multi-barn chrome that claim unlocks and out the other side at sign-out
// (checklists/pre-release/phase-7-multi-barn.md, the run from "Open that invite path as
// `DEV_EMAIL`" through "That checkbox is checked", skipping the one `(manual)` item inside it).
// Twenty-two checkboxes, twenty-two tests, one continuous session — the phase reads as a
// narrative and this file runs it as one.
//
// The isolation half of the same phase — its "Cross-barn isolation" block — is
// checklist-phase7-cross-barn-isolation.spec.ts's, and the two files share nothing but the
// two-barn fixture.
//
// ---------------------------------------------------------------------------
// Six things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. NO TEST HERE RUNS AS THE SHARED MANAGER LOGIN, AND NONE MAY. Every one runs on
//    `memberPage` — a context authenticated as a throwaway login minted for this file, by the
//    same mechanism checklist-phase1-invite-profile-complete.spec.ts introduced (#1425). NO TEST
//    REQUESTS THE `page` FIXTURE. Three independent reasons, each measured rather than assumed,
//    and any one of them alone would force it:
//
//      a. THE SIGN-OUT WOULD REVOKE THE SUITE'S OWN CREDENTIALS. `signOut()` in
//         src/app/actions/auth.ts takes auth-js's default, which is `scope: 'global'` — every
//         session for that user, not this one. Every worker and the `@mobile` project read
//         the same `e2e/.auth/manager.json`, so the "Sign out, then visit `/login`" block run as
//         `manager@e2e.test` would pull the token out from under whatever else is running. This
//         file is the suite's first sign-out; nothing had established that hazard before it.
//
//      b. THE CLAIM WOULD BE UNREACHABLE. `withBarn`/`withSecondBarn` both call `addMemberships`
//         unconditionally, so the shared manager is already `active` in barn B before any test
//         runs — and `register/page.tsx` redirects to `/barn/<slug>/` on that *before* it renders
//         the Join confirmation. The whole claim block would have nothing to assert against.
//
//      c. `/barns` COULD ONLY BE ASSERTED AS A SUBSET. `getBarnMembershipsForUser` is
//         project-wide, and at any parallel worker count the shared manager holds a membership in
//         every barn being seeded concurrently (the more workers, the more of them — #1606 took the
//         setting to 4, which only sharpens this). A login this file owns holds exactly the two memberships
//         this file created, which is what lets the card count below be an exhaustive claim
//         rather than a floor.
//
//    The identity stays faithful to the phase all the same: Phase 7 declares `manager`, and both
//    stubs this file claims are seeded `role: 'manager'`, so the walker holds manager in both
//    barns — which is exactly what "You hold **manager** in that barn" asserts.
//
// 2. THE ABSENCE OF A `barn_session_<barn B>` COOKIE BEFORE THE CLAIM IS WHAT MAKES THE
//    NESTED-ROUTE CHECK MEAN ANYTHING, AND IT IS GUARDED RATHER THAN ASSUMED. `#1076` is that
//    `acceptInvite` never set that cookie, so the first nested route after a claim bounced to
//    that barn's login despite a valid session. But
//    support/test.ts's `page` fixture installs one per seeded barn on every context it builds —
//    so had this file used the fixture page, the cookie would already have been there and that
//    check would have passed against the very bug it exists to catch. `memberPage` comes from a
//    hand-made `browser.newContext()` the fixture never touches, and `noBarnSessionCookie` throws
//    if one turns up anyway.
//
//    `#887` is the other regression under this block, and barn A's claim in `beforeAll` is what
//    arms it: by the time barn B's invite is claimed the login is an *already-claimed* user with
//    a `profiles.user_id`, which is `claim_managed_member`'s `v_existing_profile_id IS NOT NULL`
//    merge branch — the path that threw a unique violation before the fix. That branch deletes
//    barn B's stub profile itself, so unlike checklist-phase4-members-access.spec.ts there is no
//    orphaned-profile `afterAll` to write here.
//
// 3. THE MOBILE BLOCK SETS ITS OWN WIDTH ON THE PAGE, NOT VIA THE `@mobile` PROJECT AND NOT VIA
//    `test.use({ viewport })`. checklist-phase1-nav-responsive.spec.ts (#1423) rejected `@mobile`
//    for a file spanning two widths and took a per-describe `test.use` instead; the first half of
//    that reasoning applies here with more force and the second half does not apply at all.
//
//    `@mobile` would dispatch this whole file a second time, and for this file that is two more
//    seeded barns *and* a second `auth.admin.createUser` — the operation support/fixtures.ts
//    singles out as the likeliest to trip Supabase's auth rate limits. `test.use({ viewport })`
//    is not the alternative either, and for a structural reason rather than a preference: the
//    pages under test live on a context built in a *file-scoped* `beforeAll`, which is outside
//    any describe's `test.use` scope, so the option would never reach them. `setViewportSize` on
//    the page actually held is the honest instrument.
//
//    `hasTouch` is deliberately not set. None of the four mobile lines makes a touch-handler
//    claim — the tap-target one is a *size* claim, the other three are content and navigation —
//    and e2e/CLAUDE.md fact 5 records that `tap()` would not isolate one anyway, Chromium's tap
//    emulation emitting the compatibility mouse events regardless.
//
//    EVERY MOBILE TEST READS `page.viewportSize()!.width` IN ITS OWN EXPECTATION. That is fact 6
//    (#1207), where four mobile tests all passed unchanged at 1280x800 including two whose whole
//    claim was about a narrow viewport.
//
// 4. THE ORDER OF THE TESTS IS THE PHASE'S ORDER AND IS NOT REARRANGEABLE. `fullyParallel` is
//    false and `retries` is 0 (playwright.config.ts), so declaration order is run order, and
//    three points here depend on it. The three Join-confirmation checks run *before* the claim,
//    so they see a live token — `claim_managed_member` nulls `invite_token`, and the claim is
//    one-shot. Everything from
//    the switcher checks onward runs *after* it, because the caret exists only at
//    `activeBarnMemberships.length > 1`. And the sign-out block is last, because it is terminal
//    for the session every test above it needs.
//
//    THE PRICE IS FACT 15, WHICH THIS FILE IS THE MEASURED EXAMPLE OF. A failure discards the
//    worker, and the new one re-runs both barns' seeds and the `beforeAll` above — so the claim
//    is undone and every test after the first failure runs against a session holding barn A
//    alone, reporting 30s timeouts that say nothing about their own claim. The first `✘` in a
//    run of this file is the finding; treat the rest as noise until it is fixed. The corollary
//    for anyone mutation-testing this file is in that fact's full statement.
//
// 5. "SIGNING OUT WORKED" IS GUARDED, BECAUSE `/login` CANNOT SHOW IT. That page renders
//    identically for a signed-in and a signed-out visitor (its one conditional branch needs
//    `?no_barns=true`), so all three sign-out checks would pass just as well against a session
//    that was never destroyed. `hasAuthCookie()` is read on both sides of the click — true
//    before, polled to false after — as the precondition on those checks' validity rather than
//    as one of their assertions; the same shape, and the same reasoning, as the
//    anonymous-context cookie guard in checklist-phase1-invite-profile-complete.spec.ts. All
//    three sign-out tests carry it, because Playwright does not skip a test whose sibling failed.
//
//    WHAT THOSE THREE STILL CANNOT DISCRIMINATE, STATED SO NOBODY OVER-READS A GREEN RUN. The dot
//    is green off `connected = !!process.env.NEXT_PUBLIC_SUPABASE_URL`, which cannot be false in
//    a run that got this far — `serviceClient()` and `src/proxy.ts` both require that variable.
//    And the checkbox is checked off `rememberPref !== '0'` with nothing in this file ever
//    writing `remember_me_pref`: the throwaway login is minted by a direct token grant, not
//    through `signInWithGoogle`'s `setRememberCookies`. Both lines are inherited from the
//    checklist's wording rather than chosen here, and both are worth exactly what a human
//    walking the phase would get from them — no more.
//
// 6. THE THROWAWAY LOGIN IS TORN DOWN UNCONDITIONALLY AND AFTER BOTH BARNS. `throwawayUserId` is
//    assigned the instant the login exists and before anything below it that can throw, so a
//    failure anywhere still hands it back — `withBarn`'s own `state.created` discipline. The
//    hooks are registered *after* both barn registrations, and file-scoped hooks run in
//    registration order rather than reversed (measured, stated in support/test.ts), so both
//    barns' memberships are gone before the profile row they reference is deleted. Under
//    `E2E_HOLD_OPEN` the login deliberately survives alongside the held-open barns, for the
//    reason that spec's note 4 states: its address is `<run prefix>-<key>-<project>-invite@e2e.test`.
import type { BrowserContext } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect, withBarn, withSecondBarn, serviceClient, type Page } from './support/test'
import {
  addManagedMember,
  authStorageState,
  createThrowawayAuthUser,
  deleteThrowawayAuthUser,
  runPrefix,
  throwawayAuthEmail,
  E2E_PASSWORD,
} from './support/fixtures'
import { settledInnerTexts } from './support/read'
import { hydrateByDriving } from './support/hydration'

/** This file's key — shared by both barns' slugs and by its throwaway login's address. */
const BARN_KEY = 'phase7-multi-barn'

/**
 * The two managed-manager stubs whose invites this file claims, one per barn. Held to
 * `E2E_STUB_RIDER`'s two collision constraints against the four names `addMemberships` seeds
 * (Test Manager/Trainer/Rider/Sutton) and against each other: no name contains another, and no
 * two share a first-initial-derived form (`Marlow A.`, `Rennick F.`, none of the `Test _.` set).
 *
 * Barn A's is the one that survives: `claim_managed_member`'s merge branch keeps the profile the
 * user already has and deletes the stub it claimed, so after both claims the login's profile is
 * this pair's first element and barn B's row is gone.
 */
const BARN_A_STUB = { firstName: 'Marlow', lastName: 'Ashby' } as const
const BARN_B_STUB = { firstName: 'Rennick', lastName: 'Fairbourne' } as const

const DESKTOP_VIEWPORT = { width: 1280, height: 720 }
const MOBILE_VIEWPORT = { width: 390, height: 844 }

/**
 * The floor the checklist claims ("still tappable (>=44px target)"), and `BarnSwitcher`'s caret carries
 * `min-h-[44px] min-w-[44px]` to meet it. Asserted as a measured bounding box: `toBeVisible()`
 * says nothing about size, and a caret shrunk to 14px — its bare `<svg>` — is visible too.
 */
const MIN_TAP_TARGET = 44

/** The glyph `BarnSwitcher` marks the current barn's entry with. */
const CHECKMARK = '✓'

/** `buildNavLinks` returns this only on its manager branch — a role discriminator, not just a link. */
const MANAGER_ONLY_NAV_LINK = 'Manage Barn'

/** The nested route the post-claim check enters. Any section link would do; the phase names this one. */
const NESTED_NAV_LINK = 'Lessons'

const REMEMBER_LABEL = 'Keep me logged in'

/** Whatever project ref the run points at — `authStorageState` builds the name from the same URL. */
const AUTH_COOKIE = /^sb-.+-auth-token$/

let barnAInviteToken: string | null = null
let barnBInviteToken: string | null = null

const barnA = withBarn(BARN_KEY, async ({ supabase, barn }) => {
  barnAInviteToken = (
    await addManagedMember(supabase, barn.id, { ...BARN_A_STUB, role: 'manager' })
  ).inviteToken
})

const barnB = withSecondBarn(BARN_KEY, async ({ supabase, barn }) => {
  barnBInviteToken = (
    await addManagedMember(supabase, barn.id, { ...BARN_B_STUB, role: 'manager' })
  ).inviteToken
})

// Registered after both barns on purpose — see note 6.
let admin: SupabaseClient | null = null
let throwawayUserId: string | null = null
let memberContext: BrowserContext | null = null
let memberPage: Page | null = null

/**
 * Where barn B's claim landed, captured by the claim test and read by the `?error=1` test. The
 * claim is one-shot (`claim_managed_member` nulls the token), so the second line cannot re-drive
 * it and reads the first line's outcome instead.
 */
let claimLandingUrl: string | null = null

test.beforeAll(async ({ browser }, testInfo) => {
  admin = serviceClient()
  const email = throwawayAuthEmail(runPrefix(), BARN_KEY, testInfo.project.name)
  // Assigned before the steps below, any of which can throw with the login already created;
  // gating teardown on a fully-built context instead would strand it (note 6).
  throwawayUserId = await createThrowawayAuthUser(admin, email)
  memberContext = await browser.newContext({
    storageState: await authStorageState(email, E2E_PASSWORD),
    // Named explicitly rather than inherited. A hand-made context does inherit unnamed options
    // from the project (e2e/CLAUDE.md fact 4, #1422), but a width the mobile block resizes away
    // from and back to is one this file should own outright.
    viewport: DESKTOP_VIEWPORT,
  })
  memberPage = await memberContext.newPage()

  // Barn A's claim is not a checklist line — it is the phase's stated precondition, "`DEV_EMAIL`
  // already has a claimed profile from Phase 1". Driven through the UI rather than through the
  // RPC because `acceptInvite` is also what sets the `barn_session_<barn A>` cookie, without
  // which src/proxy.ts bounces the two "clicking the other barn navigates to its dashboard"
  // lines to barn A's login.
  const landing = await claimInvite(member(), barnA.slug, tokenFor(barnAInviteToken, 'barn A'))
  // Checked here because `claimInvite`'s wait now resolves on the failure redirect too (see its
  // comment). Barn A's claim is a precondition rather than a checklist line, so a failure has to
  // be named here or every test below it would fail obscurely against a one-barn session.
  if (pathOf(landing) !== `/barn/${barnA.slug}`) {
    throw new Error(`barn A's claim did not land in the barn — got ${landing}`)
  }
})

test.afterAll(async () => {
  await memberContext?.close()
  if (process.env.E2E_HOLD_OPEN === 'true') return
  if (admin && throwawayUserId) await deleteThrowawayAuthUser(admin, throwawayUserId)
})

// ---------------------------------------------------------------------------
// Reads and drives
// ---------------------------------------------------------------------------

/** Named so a failure says which half of `beforeAll` fell over, rather than reading as a null deref. */
function member(): Page {
  if (!memberPage) throw new Error('no member page — beforeAll did not complete')
  return memberPage
}

function context(): BrowserContext {
  if (!memberContext) throw new Error('no member context — beforeAll did not complete')
  return memberContext
}

function tokenFor(token: string | null, which: string): string {
  if (!token) throw new Error(`no invite token for ${which} — its seed did not complete`)
  return token
}

const invitePathB = () => `/barn/${barnB.slug}/register?token=${tokenFor(barnBInviteToken, 'barn B')}`

/** A barn dashboard path, with the trailing slash `acceptInvite`'s redirect adds normalised off. */
function pathOf(url: string): string {
  return new URL(url).pathname.replace(/(.)\/$/, '$1')
}

function acceptInviteButton(page: Page) {
  return page.getByRole('button', { name: 'Accept Invite', exact: true })
}

/**
 * Opens an invite, accepts it, and returns the URL the claim landed on.
 *
 * No hydration barrier, and that is fact 10 rather than an omission: `acceptInvite` is passed to
 * `action=` as a `.bind` of the Server Function itself, so React serves enhanced markup that an
 * early click submits on its own. The `waitForURL` is a real sync point rather than fact 3's
 * no-op — the click starts on `/register`, which neither branch of the predicate matches.
 *
 * THE PREDICATE ADMITS BOTH OUTCOMES, AND THAT IS WHAT MAKES THE TWO CHECKS BELOW FALSIFIABLE —
 * e2e/CLAUDE.md fact 17, which this helper is the reference implementation for. The obvious
 * spelling, waiting on `/barn/<slug>/?$`, could never be satisfied by `acceptInvite`'s failure
 * redirect (`/barn/<slug>/register?token=…&error=1`), so
 * `the_second_barn_claim_produced_no_error_redirect` would be asserting a property of this helper
 * rather than one of the app. Locally: the error redirect keeps `/register`'s pathname, so "left
 * the page" alone will not do it either — the query is the discriminator, and both are read below.
 */
async function claimInvite(page: Page, slug: string, token: string): Promise<string> {
  const registerPath = `/barn/${slug}/register`
  await page.goto(`${registerPath}?token=${token}`)
  await acceptInviteButton(page).click()
  await page.waitForURL((url) => url.pathname !== registerPath || url.searchParams.has('error'), {
    waitUntil: 'commit',
  })
  return page.url()
}

/**
 * Throws if the context already carries barn `slug`'s session cookie. A precondition on the
 * nested-route check's validity rather than an assertion of its own — see note 2 for why it is the whole reason that
 * line is falsifiable at all.
 */
async function noBarnSessionCookie(slug: string): Promise<void> {
  const name = `barn_session_${slug}`
  const cookies = await context().cookies()
  if (cookies.some((cookie) => cookie.name === name)) {
    throw new Error(
      `${name} is already set before the claim — acceptInvite would no longer be what sets it, ` +
        'and the nested-route check below would pass against #1076 rather than catching it'
    )
  }
}

/** `BarnSwitcher`'s root: the one direct `div` child of `<nav>` holding the caret. */
function switcherRoot(page: Page) {
  return page.locator('nav > div').filter({ has: switcherCaret(page) })
}

function switcherCaret(page: Page) {
  return page.getByRole('button', { name: 'Switch barn', exact: true })
}

/**
 * The open dropdown — the switcher root's only direct `div` child. Located structurally rather
 * than by its `absolute` class: the root's other children are the barn-name anchor and the caret
 * `<button>`, so this is unambiguous while the panel is open and empty while it is shut, which is
 * also what makes it a usable hydration signal below.
 */
function switcherPanel(page: Page) {
  return switcherRoot(page).locator('> div')
}

/** One entry per barn: an anchor for the others, a `<span>` for the current one. */
function switcherEntries(page: Page) {
  return switcherPanel(page).locator('> *')
}

/**
 * Opens the switcher, with the hydration barrier the caret needs.
 *
 * `hydrateByDriving` rather than `waitForBarnPageHydrated`: the caret is a `useState` toggle and
 * the panel is `useState`-gated markup, so the control under test is itself the trustworthy
 * signal — no need to route the barrier through the avatar menu. A pre-hydration click on the
 * caret is simply lost (fact 10), which is why this retries rather than driving once.
 */
async function openSwitcher(page: Page): Promise<void> {
  const caret = switcherCaret(page)
  // Names the cause before the retry loop can bury it: a nav bar that never rendered would
  // otherwise degrade to a bare timeout inside `toPass`. Unbounded, so it tightens nothing.
  await caret.waitFor()
  await hydrateByDriving(
    () => caret.click(),
    async () => (await switcherPanel(page).count()) > 0
  )
}

/** Entry labels with the current-barn checkmark and its spacing stripped. */
function barnNamesIn(entries: string[]): string[] {
  return entries.map((entry) => entry.replace(CHECKMARK, '').trim()).sort()
}

function bothBarnNames(): string[] {
  return [barnA.data.barn.name, barnB.data.barn.name].sort()
}

/** `/barns`' cards — `Card href` renders a `Link`, so one anchor per membership. */
function barnCards(page: Page) {
  return page.locator('main ul li a')
}

async function hasAuthCookie(): Promise<boolean> {
  return (await context().cookies()).some((cookie) => AUTH_COOKIE.test(cookie.name))
}

/** Throws rather than asserts: there is no session to destroy, so the sign-out proves nothing. */
async function requireSignedIn(): Promise<void> {
  if (!(await hasAuthCookie())) {
    throw new Error('no session cookie before the sign-out — the checks below would measure nothing')
  }
}

/**
 * Throws if the session survived. The precondition every check after the sign-out rests on, and
 * the reason it is a guard rather than one of their assertions is note 5: `/login` renders
 * identically for a signed-in and a signed-out visitor, so all three would pass against a live
 * session. `toPass` because the cookie clear arrives on the redirect response, which
 * `waitUntil: 'commit'` does not promise has reached the jar yet.
 */
async function requireSignedOut(): Promise<void> {
  await expect(async () => {
    if (await hasAuthCookie()) {
      throw new Error('the session cookie survived the sign-out — /login looks the same either way')
    }
  }).toPass()
}

// ---------------------------------------------------------------------------
// The Join confirmation — "shows a \"Join test-barn-checklist\" confirmation" and the two
// checks under it — read before the claim consumes the token
// ---------------------------------------------------------------------------

test('opening_the_second_barns_invite_while_signed_in_shows_a_join_confirmation @manager', async () => {
  const page = member()
  await page.goto(invitePathB())

  await expect(
    page.getByRole('heading', { name: `Join ${barnB.data.barn.name}`, exact: true })
  ).toBeVisible()
})

test('the_second_barns_join_confirmation_carries_an_accept_invite_button @manager', async () => {
  const page = member()
  await page.goto(invitePathB())

  await expect(acceptInviteButton(page)).toBeVisible()
})

/**
 * The absence is asserted only *after* a positive matcher has settled the page, and that ordering
 * is the whole point. A web-first matcher whose expectation is "nothing" is satisfied on its first
 * poll, and the poll right after a `goto` can land while the new document is still committing —
 * #1425 measured a `toHaveCount(0)` planted as a mutant on a link that demonstrably renders and
 * watched it pass. `toBeVisible()` on the Accept Invite button proves the confirmation rendered;
 * only then does the Google button's absence mean this page has no Google button, rather than
 * that no page had loaded yet.
 */
test('the_second_barns_join_confirmation_shows_no_google_sign_in_button @manager', async () => {
  const page = member()
  await page.goto(invitePathB())

  await expect(acceptInviteButton(page)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign in with Google', exact: true })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Claiming it — "Click **Accept Invite**" through "no redirect to `/barn/…/login`"
// ---------------------------------------------------------------------------

test('accepting_the_second_barns_invite_lands_in_that_barn @manager', async () => {
  await noBarnSessionCookie(barnB.slug)

  claimLandingUrl = await claimInvite(member(), barnB.slug, tokenFor(barnBInviteToken, 'barn B'))

  expect(pathOf(claimLandingUrl)).toBe(`/barn/${barnB.slug}`)
})

test('the_claimed_second_barn_membership_is_manager @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)

  await expect(page.getByRole('link', { name: MANAGER_ONLY_NAV_LINK, exact: true })).toBeVisible()
})

/**
 * `acceptInvite`'s failure path is `redirect('/barn/<slug>/register?token=…&error=1')`, so "no
 * `?error=1` redirect" is a claim about the landing URL's *query*, which the line above says
 * nothing about — it reads the path. Both halves come off the one URL the claim produced, because
 * the claim cannot be repeated; `claimInvite`'s wait is written to let that URL be either
 * outcome, so the path check and this one each reject a real failure the other would pass.
 */
test('the_second_barn_claim_produced_no_error_redirect @manager', async () => {
  if (!claimLandingUrl) throw new Error('no claim landing URL — the claim test did not complete')

  expect(new URL(claimLandingUrl).search).toBe('')
})

/**
 * `#1076`: `acceptInvite` used not to set `barn_session_<slug>` at all, so the first nested route
 * after a claim bounced to that barn's login despite a perfectly valid session. The guard in the
 * claim test above is what leaves that cookie's existence attributable to `acceptInvite` alone.
 *
 * The wait is on *any* departure from the dashboard rather than on the lessons URL specifically:
 * a bounce would otherwise run out the test's budget and report a timeout, where this reports the
 * login path it actually landed on — which is the finding.
 */
test('a_nested_route_after_the_second_barn_claim_does_not_bounce_to_its_login @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)
  const dashboard = `/barn/${barnB.slug}`

  // A nav link is an anchor, so a click landing before React is listening navigates the document
  // rather than being lost — fact 11's reasoning, and why no barrier is needed here.
  await page.getByRole('link', { name: NESTED_NAV_LINK, exact: true }).click()
  await page.waitForURL((url) => url.pathname.replace(/(.)\/$/, '$1') !== dashboard, {
    waitUntil: 'commit',
  })

  expect(pathOf(page.url())).toBe(`/barn/${barnB.slug}/lessons`)
})

// ---------------------------------------------------------------------------
// The BarnSwitcher, which the second membership is what unlocks — "the nav barn name now has a
// caret" through "Clicking the other barn navigates to its dashboard"
// ---------------------------------------------------------------------------

test('the_nav_barn_name_gains_a_switcher_caret_once_a_second_barn_is_held @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)

  await expect(switcherCaret(page)).toBeVisible()
})

test('the_barn_switcher_lists_both_barns @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)
  await openSwitcher(page)

  expect(barnNamesIn(await settledInnerTexts(switcherEntries(page)))).toEqual(bothBarnNames())
})

/**
 * As "exactly one entry is checkmarked, and it is the current barn" rather than "barn B's entry
 * carries a checkmark": a switcher that marked every row would satisfy the weaker form.
 */
test('the_current_barn_is_checkmarked_in_the_barn_switcher @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)
  await openSwitcher(page)

  const entries = await settledInnerTexts(switcherEntries(page))
  expect(barnNamesIn(entries.filter((entry) => entry.includes(CHECKMARK)))).toEqual([
    barnB.data.barn.name,
  ])
})

test('clicking_the_other_barn_in_the_switcher_navigates_to_its_dashboard @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)
  await openSwitcher(page)

  await switcherPanel(page).locator(`a[href="/barn/${barnA.slug}"]`).click()
  await page.waitForURL(new RegExp(`/barn/${barnA.slug}/?$`), { waitUntil: 'commit' })

  expect(pathOf(page.url())).toBe(`/barn/${barnA.slug}`)
})

// ---------------------------------------------------------------------------
// The same four "At that viewport" checks at ~390px (see note 3 for why the width is set here)
// ---------------------------------------------------------------------------

test.describe('at a mobile viewport', () => {
  test.beforeAll(async () => {
    await member().setViewportSize(MOBILE_VIEWPORT)
  })

  // Restored rather than left narrow: the `/barns` and sign-out lines below make no width claim,
  // and running them at 390 would silently move what they measure.
  test.afterAll(async () => {
    await member().setViewportSize(DESKTOP_VIEWPORT)
  })

  /**
   * The measured box, not `toBeVisible()` — "tappable (>=44px target)" is a size claim and a
   * bare 14px `<svg>` is visible too. `shortestSide` is carried into the expectation against
   * `expect.any(Number)` so a failure prints the number that fell short rather than a bare
   * `false`; the assertion it is not making is the point of the loose matcher.
   */
  test('at_mobile_width_the_switcher_caret_is_at_least_a_44px_tap_target @manager', async () => {
    const page = member()
    await page.goto(`/barn/${barnB.slug}`)
    const caret = switcherCaret(page)
    await caret.waitFor()

    const box = await caret.boundingBox()
    const shortestSide = Math.min(box?.width ?? 0, box?.height ?? 0)
    expect({
      viewportWidth: page.viewportSize()!.width,
      shortestSide,
      meetsTapTarget: shortestSide >= MIN_TAP_TARGET,
    }).toEqual({
      viewportWidth: MOBILE_VIEWPORT.width,
      shortestSide: expect.any(Number),
      meetsTapTarget: true,
    })
  })

  test('at_mobile_width_the_barn_switcher_lists_both_barns @manager', async () => {
    const page = member()
    await page.goto(`/barn/${barnB.slug}`)
    await openSwitcher(page)

    expect({
      viewportWidth: page.viewportSize()!.width,
      barns: barnNamesIn(await settledInnerTexts(switcherEntries(page))),
    }).toEqual({ viewportWidth: MOBILE_VIEWPORT.width, barns: bothBarnNames() })
  })

  test('at_mobile_width_the_current_barn_is_checkmarked_in_the_barn_switcher @manager', async () => {
    const page = member()
    await page.goto(`/barn/${barnB.slug}`)
    await openSwitcher(page)

    const entries = await settledInnerTexts(switcherEntries(page))
    expect({
      viewportWidth: page.viewportSize()!.width,
      checkmarked: barnNamesIn(entries.filter((entry) => entry.includes(CHECKMARK))),
    }).toEqual({ viewportWidth: MOBILE_VIEWPORT.width, checkmarked: [barnB.data.barn.name] })
  })

  test('at_mobile_width_clicking_the_other_barn_navigates_to_its_dashboard @manager', async () => {
    const page = member()
    await page.goto(`/barn/${barnB.slug}`)
    await openSwitcher(page)
    const viewportWidth = page.viewportSize()!.width

    await switcherPanel(page).locator(`a[href="/barn/${barnA.slug}"]`).click()
    await page.waitForURL(new RegExp(`/barn/${barnA.slug}/?$`), { waitUntil: 'commit' })

    expect({ viewportWidth, path: pathOf(page.url()) }).toEqual({
      viewportWidth: MOBILE_VIEWPORT.width,
      path: `/barn/${barnA.slug}`,
    })
  })
})

// ---------------------------------------------------------------------------
// "Visit `/barns`" through "as a multi-barn member you are redirected to `/barns`"
// ---------------------------------------------------------------------------

/**
 * An exhaustive count rather than a floor, and note 1c is what buys that: this login holds the two
 * memberships this file claimed and no others, where the shared manager would be accumulating one
 * per concurrently-seeded barn across the suite's workers.
 */
test('the_barns_page_shows_one_card_per_membership @manager', async () => {
  const page = member()
  await page.goto('/barns')

  await expect(barnCards(page)).toHaveCount(2)
})

test('both_barns_page_cards_show_manager @manager', async () => {
  const page = member()
  await page.goto('/barns')

  const roles = await settledInnerTexts(barnCards(page).locator('span:nth-child(2)'))
  expect(roles.map((role) => role.trim())).toEqual(['Manager', 'Manager'])
})

/**
 * Name and href *paired*, not two independent lists: two correct sets zipped the wrong way round
 * is exactly the failure "each card links to its barn" is about. `evaluateAll` does not auto-retry
 * — the hazard e2e/CLAUDE.md's third spec-maintenance rule names — so it keeps the inline
 * `waitFor`; an unrendered page yields [] here and fails rather than passing on nothing.
 */
test('each_barns_page_card_links_to_its_own_barn @manager', async () => {
  const page = member()
  await page.goto('/barns')
  await barnCards(page).first().waitFor()

  const cards = await barnCards(page).evaluateAll((nodes) =>
    nodes.map((node) => ({
      href: node.getAttribute('href') ?? '',
      name: (node.querySelector('span')?.textContent ?? '').trim(),
    }))
  )
  const byHref = (a: { href: string }, b: { href: string }) => a.href.localeCompare(b.href)
  expect(cards.sort(byHref)).toEqual(
    [
      { href: `/barn/${barnA.slug}`, name: barnA.data.barn.name },
      { href: `/barn/${barnB.slug}`, name: barnB.data.barn.name },
    ].sort(byHref)
  )
})

test('the_root_route_redirects_a_multi_barn_member_to_the_barns_page @manager', async () => {
  const page = member()
  // Plain read rather than waitForURL: `goto` already resolves redirects (support/test.ts's URL
  // block), so there is nothing left to wait for.
  await page.goto('/')

  expect(pathOf(page.url())).toBe('/barns')
})

// ---------------------------------------------------------------------------
// "Sign out, then visit `/login`" and the two checkbox checks under it, in the session that was
// signed in (see note 5)
// ---------------------------------------------------------------------------

test('signing_out_lands_on_the_login_page_with_a_green_connection_dot @manager', async () => {
  const page = member()
  await page.goto(`/barn/${barnB.slug}`)
  const avatar = page.getByRole('button', { name: 'User menu', exact: true })
  const signOut = page.getByRole('button', { name: 'Sign out', exact: true })

  // The avatar menu is a `useState` toggle over `useState`-gated markup — the same barrier shape
  // `waitForBarnPageHydrated` uses, driven inline because the control being opened is the one
  // this test then clicks through.
  await avatar.waitFor()
  await hydrateByDriving(
    () => avatar.click(),
    async () => (await signOut.count()) > 0
  )
  await requireSignedIn()

  await signOut.click()
  await page.waitForURL(/\/login$/, { waitUntil: 'commit' })
  await requireSignedOut()

  // The class, deliberately: `login/page.tsx` renders `connected ? 'bg-green-500' :
  // 'bg-yellow-400'`, so that class *is* the branch the line claims rather than incidental
  // styling — the same reasoning checklist-phase1-nav-responsive.spec.ts's note 4 records for
  // its `hidden` locator. What it cannot discriminate is stated in note 5's last paragraph.
  const statusPill = page.locator('main > div').filter({ hasText: 'Supabase connected' })
  await expect(statusPill.locator('> span').first()).toHaveClass(/bg-green-500/)
})

// Both carry the guard themselves rather than leaning on the test above. Playwright does not skip
// a test because a sibling failed, so a sign-out that silently stopped destroying the session
// would leave these two green — and two checklist lines marked verified — against exactly the
// live session note 5 says they cannot tell apart.
test('the_login_page_after_signing_out_shows_a_keep_me_logged_in_checkbox @manager', async () => {
  const page = member()
  await requireSignedOut()
  await page.goto('/login')

  await expect(page.getByRole('checkbox', { name: REMEMBER_LABEL, exact: true })).toBeVisible()
})

test('the_keep_me_logged_in_checkbox_after_signing_out_is_checked @manager', async () => {
  const page = member()
  await requireSignedOut()
  await page.goto('/login')

  await expect(page.getByRole('checkbox', { name: REMEMBER_LABEL, exact: true })).toBeChecked()
})
