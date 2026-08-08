// covers: src/app/barn/[slug]/register/**
// covers: src/app/barn/[slug]/login/**
// covers: src/app/profile/**
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavDrawer.tsx
//
// The three nav modules are declared because the last check's whole claim is carried by one nav
// label: `nav-links.ts` is where `Manage Barn` is manager-only in the first place,
// `DesktopNavLinks.tsx` is the container that renders it at this viewport, and `NavDrawer.tsx` is
// what keeps the locator unambiguous (note 5). None of the three is in `select-specs.sh`'s
// ALWAYS_FULL list — that list carries `(protected)/layout.tsx` but not the modules it renders —
// so without these lines a change to any of them would not select this spec, and the last check
// would go red for the first time in an unrelated PR's full run.
//
// Phase 1's invite-claim story, from an unauthenticated browser through to a completed profile
// (checklists/pre-release/phase-1-setup.md, the block from "Open that path on your app origin (no
// existing session)" through "You hold **manager** in Dev Barn"). One managed stub, one invite
// token, five checks.
//
// The line between them — "Sign in with the **`DEV_EMAIL`** Google account" — stays `(manual)`
// and is not automated here: the app offers no password login form (both `login/page.tsx` files
// render only `GoogleSignInButton`), so a real consent flow is the only way through it. The
// checklist's own profile-completion line prescribes the substitute this file takes instead —
// "A spec reaches `/profile/complete` from a seeded membership whose profile has blank contact
// fields, rather than through the OAuth sign-in above."
//
// ---------------------------------------------------------------------------
// Five things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THERE ARE TWO SESSIONS HERE AND NEITHER IS THE PROJECT'S. `anonPage` is the genuinely
//    session-less one — `browser.newContext({ storageState: { cookies: [], origins: [] } })` and
//    no other form, with the cookie-count guard that keeps that impossible to regress silently
//    (e2e/CLAUDE.md fact 4; the guard and its reasoning are #1422's, copied deliberately). It is
//    what makes the "checked by default" check mean anything: the default is read off an absent
//    `remember_me_pref` cookie, so a context carrying one would measure a preference instead.
//
//    `claimedPage` is the opposite: a context authenticated as a login created for this file
//    alone, minted by the same `authStorageState` global-setup.ts uses for the shared three. That
//    login exists because the shared three cannot be it — `scripts/e2e-auth-users.ts` fills their
//    contact fields and `profiles` is one global row per `user_id`, so blanking one to reach
//    `/profile/complete` would race every other spec across the suite's four workers. The full
//    statement, including why per-barn auth users still do not exist, is on
//    `createThrowawayAuthUser` in support/fixtures.ts.
//
//    NO TEST HERE REQUESTS THE `page` FIXTURE, AND NONE MAY: it authenticates as the manager
//    login, which already holds a membership in this barn and would claim nothing.
//
// 2. THE CLAIM HAPPENS INSIDE THE PROFILE-COMPLETION TEST, NOT IN `beforeAll`, SO THE THREE
//    ANONYMOUS CHECKS ABOVE IT SEE A LIVE TOKEN. `claim_managed_member` nulls `invite_token`, and
//    Playwright runs a job's tests in declaration order (`fullyParallel: false`, see
//    playwright.config.ts). Reordering them would not break anything — `register/page.tsx`
//    redirects on `!user` *before* it looks at the token, which is exactly what the redirect line
//    claims — but it would quietly reduce the first check to asserting that against a dead token,
//    so the order is worth keeping rather than merely tolerating.
//
// 3. `/profile/complete` IS REACHED WITH `?barn=<slug>`, AND THAT IS THE HYDRATION BARRIER, NOT A
//    CONVENIENCE. `ProfileForm` is a `<form onSubmit={handler}>` over five `useState`-seeded
//    inputs, so facts 9 and 10 both bite: an early `fill()` moves the DOM value without firing
//    `onChange`, and the submit handler builds its FormData from *state*, so an early Save posts
//    the stub's blank fields and the redirect never happens. Fact 13 is the reason a barrier is
//    not obvious here — bare `/profile` renders byte-identically before and after hydration and
//    has no signal at all — and `?barn=<slug>` is that fact's own prescribed workaround: it makes
//    `profile/layout.tsx` render the barn nav, whose `UserMenu` popover is `useState`-gated markup
//    and a toggle, which is what `waitForBarnPageHydrated` binds to. It is also the literal URL
//    `auth/callback/route.ts` redirects to, so it is the real shape rather than a test-only one.
//
// 4. THE THROWAWAY LOGIN IS TORN DOWN UNCONDITIONALLY, AND AFTER THE BARN. `throwawayUserId` is
//    assigned the instant the user exists and before anything that can throw — `withBarn`'s own
//    `state.created` discipline — so a failure anywhere below still hands it back. The `afterAll`
//    is registered *after* `withBarn`, and file-scoped hooks run in registration order rather
//    than reversed (measured, stated in support/test.ts), so the barn's memberships are gone
//    before the profile row they reference is deleted.
//
//    THE ONE CASE THAT DOES LEAK IS `--hold-open`, DELIBERATELY. Under `E2E_HOLD_OPEN` the barn
//    and its membership are kept alive for manual checklist steps, so deleting the profile
//    beneath them would FK-fail noisily on a developer who asked for exactly that state. The
//    throwaway login therefore survives, and nothing sweeps it: run-checklist-suite.sh's exit
//    trap reaches barns by run prefix, not auth users. Delete it by hand alongside the held-open
//    barn — its address is `<run prefix>-<project>-invite@e2e.test`.
//
// 5. "YOU HOLD MANAGER" IS ASSERTED THROUGH `Manage Barn`, THE ONE NAV LABEL NO OTHER ROLE GETS.
//    `buildNavLinks` returns it only on its manager branch, so its presence is a role
//    discriminator rather than merely a link that rendered.
//
//    An unscoped locator suffices, and the reason is `NavDrawer`'s own markup rather than CSS:
//    the drawer renders its link list inside `{open && (…)}` with `open` initialised `false`, so
//    while it is shut those anchors are not in the DOM at all and this locator can only match the
//    desktop container's copy. Only the hamburger *trigger* carries `md:hidden` — the panel is
//    not viewport-gated — so a change making the drawer render its links unconditionally would
//    give this locator two matches and trip strict mode rather than failing quietly. That is why
//    `NavDrawer.tsx` is declared in this file's `covers:` set above alongside the two modules the
//    assertion reads more directly. (An earlier draft of this note credited `display:none` plus
//    the accessibility tree, generalising #1423's measurement from a different container. That is
//    the right account of `DesktopNavLinks` below the breakpoint and the wrong one here; the
//    component was read rather than assumed the second time.)
import type { BrowserContext } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test as base, expect, withBarn, serviceClient, type Page } from './support/test'
import {
  addManagedMember,
  authStorageState,
  createThrowawayAuthUser,
  deleteThrowawayAuthUser,
  runPrefix,
  throwawayAuthEmail,
  E2E_PASSWORD,
} from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'

/**
 * The manager stub whose invite this file claims. Held to `E2E_STUB_RIDER`'s two collision
 * constraints against the four names `addMemberships` seeds (Test Manager/Trainer/Rider/Sutton):
 * it neither contains nor is contained by any of them, and `Quinn D.` collides with none of their
 * first-initial forms either.
 */
const INVITEE = { firstName: 'Quinn', lastName: 'Delacroix' }

/** Digits only where it matters: `isValidPhone` wants 7–15 of them. */
const PHONE = '555-0142'
const EMERGENCY_NAME = 'Rowan Delacroix'
const EMERGENCY_PHONE = '555-0143'

const REMEMBER_LABEL = 'Keep me logged in'
const MANAGER_ONLY_NAV_LINK = 'Manage Barn'

/** This file's key, shared by its barn's slug and its throwaway login's address. */
const BARN_KEY = 'invite'

let inviteToken: string | null = null

const barn = withBarn(BARN_KEY, async ({ supabase, barn: seeded }) => {
  inviteToken = (
    await addManagedMember(supabase, seeded.id, { ...INVITEE, role: 'manager' })
  ).inviteToken
})

// Registered after withBarn on purpose — see note 4.
let admin: SupabaseClient | null = null
let throwawayUserId: string | null = null
let claimedContext: BrowserContext | null = null
let claimedPage: Page | null = null

base.beforeAll(async ({ browser }, testInfo) => {
  admin = serviceClient()
  const email = throwawayAuthEmail(runPrefix(), BARN_KEY, testInfo.project.name)
  // Assigned before the two steps below, either of which can throw with the login already
  // created; gating teardown on a fully-built context instead would strand it (note 4).
  throwawayUserId = await createThrowawayAuthUser(admin, email)
  claimedContext = await browser.newContext({ storageState: await authStorageState(email, E2E_PASSWORD) })
  claimedPage = await claimedContext.newPage()
})

base.afterAll(async () => {
  await claimedContext?.close()
  if (process.env.E2E_HOLD_OPEN === 'true') return
  if (admin && throwawayUserId) await deleteThrowawayAuthUser(admin, throwawayUserId)
})

/**
 * A page on a genuinely session-less context — #1422's fixture, copied rather than shared because
 * a spec's fixture is not part of support/'s vocabulary and the guard reads better next to what
 * it protects. The cookie read is a precondition on the two checkbox tests' validity, not one of
 * their assertions: `/barn/<slug>/login` renders for an authenticated visitor too, so a context
 * that started carrying a session would leave every check below green having measured the wrong
 * case. It closes the context before throwing so a tripped guard leaks nothing.
 */
const test = base.extend<{ anonPage: Page }>({
  // `runTest` is Playwright's `use` callback, renamed only so the React hooks lint rule doesn't
  // read this fixture as a misplaced hook call — same rename support/test.ts makes.
  anonPage: async ({ browser }, runTest) => {
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const cookies = (await context.storageState()).cookies
    if (cookies.length > 0) {
      await context.close()
      throw new Error(
        `the unauthenticated context must carry no session; it has ${cookies.length} cookie(s): ` +
          cookies.map((c) => c.name).join(', ')
      )
    }
    const page = await context.newPage()
    try {
      await runTest(page)
    } finally {
      await context.close()
    }
  },
})

function token(): string {
  if (!inviteToken) throw new Error('no invite token — the barn seed did not complete')
  return inviteToken
}

/** Named so a failure says which half of beforeAll fell over, rather than reading as a null deref. */
function claimed(): Page {
  if (!claimedPage) throw new Error('no throwaway-login page — beforeAll did not complete')
  return claimedPage
}

const invitePath = () => `/barn/${barn.slug}/register?token=${token()}`
const barnLoginPath = () => `/barn/${barn.slug}/login?token=${token()}`

function rememberCheckbox(page: Page) {
  return page.getByRole('checkbox', { name: REMEMBER_LABEL, exact: true })
}

/** Path plus query, which is what the redirect line claims — the token has to survive it. */
function pathWithQuery(page: Page): string {
  const url = new URL(page.url())
  return url.pathname + url.search
}

// ---------------------------------------------------------------------------
// The invite path with no session
// ---------------------------------------------------------------------------

test('opening_an_invite_link_with_no_session_redirects_to_the_barn_login_page @manager', async ({ anonPage }) => {
  // Plain read rather than waitForURL: `goto` already resolves redirects, so there is nothing
  // left to wait for (support/test.ts's URL block).
  await anonPage.goto(invitePath())

  expect(pathWithQuery(anonPage)).toBe(barnLoginPath())
})

test('the_barn_login_page_shows_a_keep_me_logged_in_checkbox @manager', async ({ anonPage }) => {
  await anonPage.goto(barnLoginPath())

  await expect(rememberCheckbox(anonPage)).toBeVisible()
})

test('the_keep_me_logged_in_checkbox_is_checked_by_default @manager', async ({ anonPage }) => {
  await anonPage.goto(barnLoginPath())

  // "By default" is the claim, and the anonymous context is what makes it one: `login/page.tsx`
  // derives `rememberChecked` from a `remember_me_pref` cookie this context cannot have.
  await expect(rememberCheckbox(anonPage)).toBeChecked()
})

// ---------------------------------------------------------------------------
// Claiming it, and completing the profile
// ---------------------------------------------------------------------------

test('saving_the_contact_fields_on_profile_complete_lands_in_the_app @manager', async () => {
  const page = claimed()
  await page.goto(invitePath())
  // No hydration barrier: `acceptInvite` is passed to `action=` as a `.bind` of the Server
  // Function itself, so React serves enhanced markup that an early click submits on its own
  // (fact 10). A real sync point rather than fact 3's no-op — the click starts on `/register`.
  await page.getByRole('button', { name: 'Accept Invite', exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/?$`), { waitUntil: 'commit' })

  await page.goto(`/profile/complete?barn=${barn.slug}`)
  await waitForBarnPageHydrated(page)
  await page.getByLabel('Phone', { exact: true }).fill(PHONE)
  await page.getByLabel('Emergency Contact Name', { exact: true }).fill(EMERGENCY_NAME)
  await page.getByLabel('Emergency Contact Phone', { exact: true }).fill(EMERGENCY_PHONE)
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  // ProfileForm pushes `/`, which resolves to the one barn this login is a member of. Also a
  // real sync point: the pattern cannot match `/profile/complete?barn=<slug>`, whose only
  // occurrence of the slug follows `?barn=` rather than `/barn/`.
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/?$`), { waitUntil: 'commit' })

  expect(new URL(page.url()).pathname.replace(/\/$/, '')).toBe(`/barn/${barn.slug}`)
})

test('the_claimed_invite_holds_manager_in_the_barn @manager', async () => {
  const page = claimed()
  await page.goto(`/barn/${barn.slug}`)

  await expect(page.getByRole('link', { name: MANAGER_ONLY_NAV_LINK, exact: true })).toBeVisible()
})
