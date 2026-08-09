// covers: src/app/demo/**
// covers: src/app/api/cron/reset-demo/**
// covers: src/app/profile/**
// covers: src/app/barn/[slug]/(protected)/layout.tsx
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/BarnSwitcher.tsx
// covers: src/app/barn/[slug]/(protected)/UserMenu.tsx
//
// Phase 1's fifteen `/demo` and cron-reaper checks: the public demo flow as a visitor with no
// session, the demo-specific chrome the resulting barn renders, and the hourly reaper route that
// tears it back down (checklists/pre-release/phase-1-setup.md, the block from "In a
// fresh/incognito browser (no existing session), visit `/demo`" through "Visiting `/profile`
// directly while signed in as the demo user redirects to `/`").
//
// The two `DEMO_USER_PASSWORD`-unset checks in the middle of that block are deliberately NOT
// here and stay `(manual)`: they need the app restarted under different server environment
// variables, which a spec cannot do to the server it is driving.
//
// `(protected)/layout.tsx` is declared above even though select-specs.sh's ALWAYS_FULL already
// carries it — the accuracy rule binds regardless of what selects the file, and this spec
// genuinely drives that layout's demo branches (`isDemo`, `isDemoUser`). Same for
// `src/app/profile/**`, reached by the redirect check at the end of the chrome block.
//
// ---------------------------------------------------------------------------
// Six things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THE ASSERTION ORDER IS NOT THE ORDER THE CHECKLIST READS, AND THAT IS DELIBERATE. The phase
//    file lists the reaper checks before the banner/nav/profile chrome. Performed in that order,
//    every chrome assertion would run against a barn the reap had just deleted. The order here is
//    the only one that works: create the barn, assert the live-barn chrome, then the two
//    unauthorized `401`s, then backdate `barns.created_at` and reap, then assert the barn is gone.
//
// 2. THE REAP DOUBLES AS TEARDOWN, SO TEARDOWN CANNOT BE LEFT TO IT. On the happy path the reap
//    removes the barn this file created. On every failure path that never reaches the reap, the
//    barn survives — and unlike a `withBarn` fixture it is created by the *app*, so it carries no
//    run prefix and `run-checklist-suite.sh`'s `--prefix` exit trap can never sweep it, nor will
//    the reaper itself (which only takes barns past its six-hour cutoff). `afterAll` below is
//    therefore unconditional, and in particular does NOT honour `E2E_HOLD_OPEN` the way
//    `withBarn`'s teardown does: for this barn, "hold it open" and "leak it into the shared dev
//    project permanently" are the same thing.
//
//    That `afterAll` still runs when a failure discards the worker (fact 15) is MEASURED, not
//    assumed — it is the whole basis of the "tears down even on failure" claim, so inferring it
//    would have been inferring the thing that matters. A run whose reaper check failed *after*
//    the barn existed left 0 `is_demo` barns behind, counted directly against the dev project.
//
// 3. THE CONTEXT IS `browser.newContext({ storageState: { cookies: [], origins: [] } })` AND NO
//    OTHER FORM, AND IT IS FILE-SCOPED RATHER THAN PER-TEST. The form first: every Playwright
//    project binds a storageState, and a bare `browser.newContext()` inherits it — the runner
//    back-fills every context option the caller did not name, so "a fresh context" is not a fresh
//    session (e2e/CLAUDE.md's fact 4, measured on the browser side by #1422). `/demo` behaves
//    completely differently for a visitor who already has one, so the wrong form would assert the
//    resume path while claiming to assert the create path. The cookie-count guard below is what
//    keeps that impossible to regress silently.
//
//    File-scoped, because one of the checks is that visiting `/demo` again *in the same browser*
//    resumes the same barn — the `demo_barn_slug` cookie the action sets has to survive between
//    tests. That same back-fill is why `baseURL` reaches this hand-made context and every
//    relative `goto` below resolves.
//
// 4. NO TEST HERE MAY REQUEST THE `page` FIXTURE. support/test.ts overrides `page` to throw
//    unless the spec file called `withBarn()` at module scope, and this file deliberately seeds
//    no barn: `/demo` creates its own, which is the whole subject. Take `demoPage` instead — the
//    session-less page the fixture-free context above owns.
//
// 5. THE SPINNER IS `aria-hidden`, SO NO ROLE-BASED LOCATOR CAN SEE IT. `getByRole` resolves
//    against the accessibility tree rather than the DOM, and the loader's spinner is explicitly
//    hidden from it (it is decoration; the heading beside it carries the meaning). It is located
//    by its `animate-spin` class for that reason, not out of preference for CSS locators.
//
// 6. "RENDERS AMBER" IS ASSERTED OVER THE ELEMENT'S AMBER CLASS TOKENS, NOT A COMPUTED COLOUR.
//    Tailwind 4 emits `oklch()`, whose computed serialization is neither stable to read nor
//    meaningful to compare, and there is no non-amber reference element on either page to compare
//    against. Both `dark:` and base variants ride the one class attribute, so the token set is
//    also the only reading that covers both colour schemes at once — a computed colour only ever
//    sees the scheme the run happens to be in. `checklist-phase4-horses-detail.spec.ts` asserts
//    palette the same way. Full-set equality rather than containment: a dropped `dark:` variant
//    is as much a regression as a dropped base one.
import type { APIRequestContext, BrowserContext, Page, PlaywrightWorkerArgs } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { test, expect, serviceClient } from './support/test'
import { formatBarnTime } from '@/lib/format-date'
import { mustSucceed, teardownBarnData } from '@/lib/db/service-role'
import { deleteBarn } from '@/lib/db/barns'

/** `createDemoBarn` slugs every demo barn `demo-<8 hex>`; nothing else in the app does. */
const DEMO_BARN_URL = /\/barn\/demo-[0-9a-f]{8}\/?$/
const DEMO_BARN_PATH = /^\/barn\/demo-[0-9a-f]{8}\/?$/

/** `src/app/barn/[slug]/(protected)/page.tsx` puts the reset at `created_at` + 7h. */
const DEMO_RESET_OFFSET_MS = 7 * 60 * 60 * 1000

/**
 * How far back `barns.created_at` is moved before the reap. The route's cutoff is six hours, so
 * seven puts this barn past it — and, just as importantly, makes it the *oldest* demo barn in the
 * project, which is what guarantees the route's oldest-first loop reaches it at all. Anything
 * older than this is by construction also past the cutoff, so it is reaped on the way rather than
 * stopping the loop short.
 */
const BACKDATE_MS = 7 * 60 * 60 * 1000

/** `page.tsx`'s banner classes, and `BarnSwitcher`'s `barnNameLinkClass(true)`. */
const BANNER_AMBER = [
  'bg-amber-50',
  'border-amber-300',
  'dark:bg-amber-950',
  'dark:border-amber-800',
  'dark:text-amber-200',
  'text-amber-900',
]
const NAV_NAME_AMBER = [
  'dark:hover:text-amber-300',
  'dark:text-amber-400',
  'hover:text-amber-500',
  'text-amber-600',
]

type DemoBarn = { id: string; slug: string; name: string; created_at: string; timezone: string; is_demo: boolean }

let supabase: SupabaseClient
let context: BrowserContext | null = null
let demoPage: Page
/** Set the moment the created barn's row is read, and cleared only once it is gone. */
let demoBarn: DemoBarn | null = null

test.beforeAll(async ({ browser }) => {
  supabase = serviceClient()
  const fresh = await browser.newContext({ storageState: { cookies: [], origins: [] } })
  // A precondition on every check's validity rather than one of this file's assertions: a
  // context that carried a session would send `/demo` down its resume branch on the very first
  // visit, and the create-path checks would pass having measured the wrong thing. Throws for
  // that reason, and closes the context first so a tripped guard leaks nothing.
  const cookies = (await fresh.storageState()).cookies
  if (cookies.length > 0) {
    await fresh.close()
    throw new Error(
      `the demo visitor's context must carry no session; it has ${cookies.length} cookie(s): ` +
        cookies.map((c) => c.name).join(', ')
    )
  }
  context = fresh
  demoPage = await fresh.newPage()
})

// Unconditional, and see note 2 for why it neither defers to the reap nor honours E2E_HOLD_OPEN.
// The existence re-read is what makes it a no-op on the happy path rather than a second delete.
test.afterAll(async () => {
  if (context) {
    await context.close()
    context = null
  }
  if (!demoBarn || !supabase) return
  const { data } = await supabase.from('barns').select('id').eq('id', demoBarn.id).maybeSingle()
  if (data) {
    await teardownBarnData(demoBarn.id, supabase)
    await deleteBarn(demoBarn.id, supabase)
  }
  demoBarn = null
})

/**
 * The barn `/demo` created, or a loud failure.
 *
 * Playwright discards the worker after any test failure and starts a fresh one, which re-imports
 * this file — resetting every module-scope variable and re-running `beforeAll` against a brand
 * new session-less context (e2e/CLAUDE.md's fact 15). So a later block reading `demoBarn` after
 * such a restart finds it null, and left ungated would silently assert against nothing. Throwing
 * here is what turns that into one legible failure instead.
 */
function liveDemoBarn(): DemoBarn {
  if (!demoBarn) {
    throw new Error(
      'no demo barn was created — the chain above must run first; if a worker restart re-ran ' +
        'beforeAll underneath this block, re-run the whole spec file'
    )
  }
  return demoBarn
}

async function startDemoVisit(): Promise<void> {
  // 'commit' rather than the default 'load': the loader's markup arrives with the first bytes,
  // and the client-side redirect that replaces it cannot fire until the page has hydrated. So
  // resolving early is what puts the assertion safely inside the window the checklist item is
  // about, rather than racing the redirect out of it.
  await demoPage.goto('/demo', { waitUntil: 'commit' })
}

/**
 * Where `/demo` bails to when it cannot sign the visitor in as the shared demo user — a missing
 * or password-rotated `demo@stable-state.app`, a missing profile row, or the server's own env.
 */
const DEMO_UNAVAILABLE = '/login?error=demo_unavailable'

async function landedDemoBarnPath(): Promise<string> {
  // Waiting on EITHER destination rather than on the barn alone, purely for the diagnostic.
  // `reset-db.sh` wipes every auth user, the demo one included, so a dev project reset since the
  // last `setup-demo-user.sh` run sends every visit down the bail branch — and waiting only for
  // the barn URL turns that into a thirty-second navigation timeout that names nothing. Measured
  // the hard way: it cost this slice a full run to identify.
  await demoPage.waitForURL(new RegExp(`${DEMO_BARN_URL.source}|${DEMO_UNAVAILABLE.replace('?', '\\?')}`))
  const landed = new URL(demoPage.url())
  // A precondition on every check in this file, not one of its assertions — so it throws. It can
  // never be a `test.skip()`: thirteen checklist lines read `(e2e: …)` on the strength of this
  // file, and a skip would leave every one of them reporting green having asserted nothing.
  if (`${landed.pathname}${landed.search}` === DEMO_UNAVAILABLE) {
    throw new Error(
      '/demo bailed to `?error=demo_unavailable`, so the shared demo user cannot be signed in. ' +
        'Run `bash scripts/setup-demo-user.sh` and paste the DEMO_USER_PASSWORD it prints into ' +
        '.env.local, then restart the dev server. `reset-db.sh` deletes every auth user, so any ' +
        'dev-DB reset since the last bootstrap puts the project in exactly this state.'
    )
  }
  return landed.pathname
}

function slugFromPath(pathname: string): string {
  return pathname.split('/')[2]
}

async function readBarn(slug: string): Promise<DemoBarn> {
  return mustSucceed(
    await supabase.from('barns').select('id,slug,name,created_at,timezone,is_demo').eq('slug', slug).single(),
    `read demo barn ${slug}`
  ) as DemoBarn
}

function barnUrl(): string {
  return `/barn/${liveDemoBarn().slug}`
}

/** Every `amber`-bearing class token on the element, sorted — see note 6. */
async function amberClassTokens(locator: ReturnType<Page['locator']>): Promise<string[]> {
  // `getAttribute('class')`, not `el.className` — the latter is an `SVGAnimatedString` on an
  // SVGElement, so the union it resolves to has no `split` and the whole read degrades to `any`.
  const classes = await locator.evaluate((el) => el.getAttribute('class') ?? '')
  return classes
    .split(/\s+/)
    .filter((token) => token.includes('amber'))
    .sort()
}

/**
 * A request context with genuinely no session, for the two `curl` items. The route reads only the
 * `Authorization` header, so a carried cookie could not change its answer today — this is the
 * explicit empty form anyway, because a future auth check added to the route would otherwise make
 * both `401` items start passing for the wrong reason with nothing to say so.
 */
async function unauthenticatedRequest(playwright: PlaywrightWorkerArgs['playwright']): Promise<APIRequestContext> {
  const ctx = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } })
  const cookies = (await ctx.storageState()).cookies
  if (cookies.length > 0) {
    await ctx.dispose()
    throw new Error(
      `the cron request context must carry no session; it has ${cookies.length} cookie(s): ` +
        cookies.map((c) => c.name).join(', ')
    )
  }
  return ctx
}

async function postResetDemo(
  playwright: PlaywrightWorkerArgs['playwright'],
  headers: Record<string, string>
): Promise<{ status: number; body: unknown }> {
  const ctx = await unauthenticatedRequest(playwright)
  try {
    const response = await ctx.post('/api/cron/reset-demo', { headers })
    return { status: response.status(), body: await response.json() }
  } finally {
    await ctx.dispose()
  }
}

// ---------------------------------------------------------------------------
// The demo flow itself, and the chrome the barn it creates renders. Genuinely sequential — the
// barn has to not exist, then exist, then be resumed, and each step is the next one's
// precondition — so a failure skipping the rest is the honest outcome rather than a cascade of
// tests asserting against a barn that was never built.
// ---------------------------------------------------------------------------

test.describe.serial('the demo barn', () => {
  test('visiting_demo_in_a_fresh_browser_renders_a_spinner @manager', async () => {
    await startDemoVisit()

    await expect(demoPage.locator('main .animate-spin')).toBeVisible()

    // Finished here rather than left in flight: navigating away mid-visit would abort the Server
    // Action that is seeding the barn, and a half-seeded barn is a far worse thing to hand the
    // rest of this file than a slow test. Recording the row is also what arms `afterAll`.
    demoBarn = await readBarn(slugFromPath(await landedDemoBarnPath()))
  })

  test('the_demo_page_renders_an_explore_stable_state_heading @manager', async () => {
    await startDemoVisit()

    await expect(demoPage.getByRole('heading', { name: 'Explore Stable State', exact: true })).toBeVisible()

    await landedDemoBarnPath()
  })

  test('the_demo_flow_lands_in_a_new_demo_barn @manager', async () => {
    await startDemoVisit()
    const landed = await landedDemoBarnPath()

    // Both halves in one assertion. The URL shape alone is satisfied by any barn whose slug
    // happens to look like a demo slug; the row's own flag is what says the app actually made a
    // demo barn rather than an ordinary one it routed to.
    expect({
      landedOnADemoBarnPath: DEMO_BARN_PATH.test(landed),
      rowIsFlaggedDemo: (await readBarn(slugFromPath(landed))).is_demo,
    }).toEqual({ landedOnADemoBarnPath: true, rowIsFlaggedDemo: true })
  })

  test('the_demo_visitor_holds_manager_in_the_demo_barn @manager', async () => {
    const barn = liveDemoBarn()
    // The action writes `barn_session_<slug>` with the visitor's own user id, so the cookie is
    // the identity under test — read from the context rather than looked up by the demo email,
    // which would only re-derive what the app already told us and would miss the case where the
    // membership it created belongs to somebody else entirely.
    const cookies = await context!.cookies()
    const userId = cookies.find((c) => c.name === `barn_session_${barn.slug}`)?.value

    const membership = mustSucceed(
      await supabase
        .from('barn_memberships')
        .select('role,status')
        .eq('barn_id', barn.id)
        .eq('user_id', userId ?? '')
        .single(),
      'read the demo visitor membership'
    )

    expect(membership).toEqual({ role: 'manager', status: 'active' })
  })

  test('visiting_demo_again_in_the_same_browser_resumes_the_same_barn @manager', async () => {
    const barn = liveDemoBarn()

    await startDemoVisit()
    const landed = await landedDemoBarnPath()

    // "the same URL … instead of creating a new one": equality against the FIRST barn's slug is
    // both halves at once — a second barn would necessarily carry a different one.
    expect(slugFromPath(landed)).toBe(barn.slug)
  })

  test('the_demo_barn_dashboard_shows_a_data_reset_banner @manager', async () => {
    const barn = liveDemoBarn()
    await demoPage.goto(barnUrl())

    // The expected time is derived from this barn's own `created_at` + 7h through the app's own
    // barn-time formatter, so the assertion covers the offset arithmetic and the barn-zone
    // wiring rather than merely matching a time-shaped placeholder.
    const resetAt = new Date(new Date(barn.created_at).getTime() + DEMO_RESET_OFFSET_MS).toISOString()
    const expected = `This is a demo barn. Data resets at approximately ${formatBarnTime({ at: resetAt, tz: barn.timezone })}.`

    // `exact: true` matches on the element's whole normalized text, so only the banner itself can
    // match — an ancestor carrying the banner plus the rest of the dashboard cannot.
    await expect(demoPage.getByText(expected, { exact: true })).toBeVisible()
  })

  test('the_demo_barn_dashboard_banner_renders_amber @manager', async () => {
    await demoPage.goto(barnUrl())
    const banner = demoPage.locator('main div').filter({ hasText: /^This is a demo barn\./ })

    expect(await amberClassTokens(banner)).toEqual(BANNER_AMBER)
  })

  test('the_nav_renders_the_demo_barn_name_with_a_demo_suffix @manager', async () => {
    const barn = liveDemoBarn()
    await demoPage.goto(barnUrl())

    // `buildNavLinks` emits no bare `/barn/<slug>` entry for any role, so this href belongs to
    // the BarnSwitcher's barn-name link alone — no ordinal or nth() needed to disambiguate it.
    await expect(demoPage.locator(`nav a[href="/barn/${barn.slug}"]`)).toHaveText(`${barn.name} (DEMO)`)
  })

  test('the_nav_demo_barn_name_renders_amber @manager', async () => {
    const barn = liveDemoBarn()
    await demoPage.goto(barnUrl())

    expect(await amberClassTokens(demoPage.locator(`nav a[href="/barn/${barn.slug}"]`))).toEqual(NAV_NAME_AMBER)
  })

  test('the_user_menu_hides_the_profile_link_for_the_demo_user @manager', async () => {
    await demoPage.goto(barnUrl())
    await demoPage.getByRole('button', { name: 'User menu' }).click()

    // Settle on a POSITIVE assertion before reading either count. `count()` does not retry, so
    // both reads taken against a popover that has not rendered yet return 0 — and an expectation
    // whose interesting half is "nothing is here" is satisfied on its first poll (#1425). Sign
    // out is unconditional markup inside that same popover, so its appearing is the barrier.
    await expect(demoPage.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible()

    // The zero is still paired with that control in the assertion itself, not just in the
    // barrier: the barrier proves the menu opened at read time, and the pair proves the Profile
    // row is absent from a menu that demonstrably renders its other rows.
    expect({
      profile: await demoPage.getByRole('link', { name: 'Profile', exact: true }).count(),
      signOut: await demoPage.getByRole('button', { name: 'Sign out', exact: true }).count(),
    }).toEqual({ profile: 0, signOut: 1 })
  })

  test('visiting_profile_as_the_demo_user_redirects_away @manager', async () => {
    const response = await demoPage.goto('/profile')

    // The checklist item says "redirects to `/`", and `/profile` does redirect there — but `/` is
    // not where the visitor ends up. `getBarnMembershipsForUser` excludes demo barns (#504), so
    // the demo user has zero active memberships and `src/app/page.tsx` redirects onward to the
    // login page. Asserting the final URL alone would therefore assert something the item does
    // not say; asserting the hop alone would pass if the chain then landed somewhere new and
    // wrong. Both, so either changing fails loudly.
    const chain: string[] = []
    for (let request = response!.request(); request; request = request.redirectedFrom()!) {
      const url = new URL(request.url())
      chain.unshift(`${url.pathname}${url.search}`)
    }

    expect({ from: chain[0], hop: chain[1], final: chain[chain.length - 1] }).toEqual({
      from: '/profile',
      hop: '/',
      final: '/login?no_barns=true',
    })
  })
})

// ---------------------------------------------------------------------------
// The two unauthorized cron calls. Outside the serial blocks on either side, and that is the
// point: they depend on no barn, so a chrome failure above must not take their coverage with it.
// They are declared here rather than at the top of the file because the reap below must run last.
// ---------------------------------------------------------------------------

test('the_reset_demo_cron_route_rejects_a_request_with_no_authorization_header @manager', async ({ playwright }) => {
  expect(await postResetDemo(playwright, {})).toEqual({ status: 401, body: { error: 'Unauthorized' } })
})

test('the_reset_demo_cron_route_rejects_a_wrong_authorization_header @manager', async ({ playwright }) => {
  // A syntactically valid Bearer token that is not the secret — the discriminating case. An
  // unparseable header would be rejected by the same string comparison and prove less.
  expect(await postResetDemo(playwright, { Authorization: 'Bearer not-the-cron-secret' })).toEqual({
    status: 401,
    body: { error: 'Unauthorized' },
  })
})

// ---------------------------------------------------------------------------
// The reap, and its aftermath. Last in the file, because it deletes the barn every check above
// needs. Serial for the same reason as the first block: the "no longer resolves" item is only a
// claim at all once the reap has run.
// ---------------------------------------------------------------------------

test.describe.serial('the demo reaper', () => {
  test('the_reset_demo_cron_route_reaps_a_backdated_demo_barn @manager', async ({ playwright }) => {
    const barn = liveDemoBarn()
    const secret = process.env.CRON_SECRET
    // A precondition on the check's validity, not one of its assertions: without the secret this
    // request is indistinguishable from the wrong-header case above and would report a `401` as
    // though the reaper were broken. run-checklist-suite.sh requires the var for this reason, so
    // this can only fire on a hand-rolled `npx playwright test`.
    if (!secret) {
      throw new Error(
        'CRON_SECRET is not set — run the suite via scripts/run-checklist-suite.sh, which requires ' +
          'it in .env.local and exports it into this process'
      )
    }

    mustSucceed(
      await supabase
        .from('barns')
        .update({ created_at: new Date(Date.now() - BACKDATE_MS).toISOString() })
        .eq('id', barn.id)
        .select('id'),
      'backdate the demo barn'
    )

    const { status, body } = await postResetDemo(playwright, { Authorization: `Bearer ${secret}` })

    // `>= 1`, never `=== 1`: the checklist item itself says "or more", and a concurrent demo barn
    // aging past the six-hour cutoff mid-run would make an equality check fail for a reason that
    // has nothing to do with this route. What that tolerance gives up — that the barn reaped was
    // OURS — is exactly what the next check pays back, and the two are serial so it always runs.
    expect({ status, reapedAtLeastOne: (body as { reaped: number }).reaped >= 1 }).toEqual({
      status: 200,
      reapedAtLeastOne: true,
    })
  })

  test('a_reaped_demo_barn_no_longer_resolves_at_its_url @manager', async () => {
    const url = barnUrl()

    const response = await demoPage.goto(url)

    // 404, not a redirect to the barn login page: the `barn_session_<slug>` cookie is still in
    // this context and still matches the signed-in demo user, so src/proxy.ts waves the request
    // through and the protected layout's own `getBarnBySlug` miss is what answers. Asserting the
    // URL alongside the status is what says the 404 came from this path rather than from
    // somewhere the request was bounced to first.
    expect({ status: response!.status(), pathname: new URL(demoPage.url()).pathname }).toEqual({
      status: 404,
      pathname: url,
    })
  })
})
