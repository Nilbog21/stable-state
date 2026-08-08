// Per-file barn harness for the checklist e2e suite.
//
// A spec file calls withBarn() once at module scope and gets a barn nobody else touches:
//
//   const barn = withBarn('dashboard', async ({ supabase, barn, members }) => { … })
//
//   test('… @manager', async ({ page }) => {
//     await page.goto(`/barn/${barn.slug}`)
//   })
//
// Isolation comes from Playwright's dispatch axis, which is (spec file × *project*), not spec
// file — a spec greped by more than one project is dispatched once per project, and each
// pairing is its own job with its own beforeAll/afterAll. The slug therefore carries the project
// name too (see barnSlugFor), or those jobs would race one another's barn insert and tear each other's
// barn down mid-run. Tests within one job run serially (fullyParallel stays false — see
// playwright.config.ts), so a mutating spec can neither race nor pollute a reading spec.
// Seeding is the reset; there is no undo path to maintain.
//
// ## Timeouts, suite-wide (#1211, generalised by #1279)
//
// Three tiers, and they do not behave alike. Which tier a call belongs to decides whether
// writing a number helps or hurts, so the rule below is stated per tier rather than per API —
// #1211 wrote it around waitForURL alone and the next four authors had to rediscover that it
// generalises:
//
//   - EVERY `waitFor*` IS UNBOUNDED. locator.waitFor, page.waitForURL / waitForEvent /
//     waitForSelector / waitForFunction / waitForLoadState / waitForResponse alike:
//     @playwright/test defaults actionTimeout and navigationTimeout to 0 and playwright.config.ts
//     overrides neither, so each is bounded only by the test's own 30s budget. Any number
//     written on one could only *tighten* that — the opposite of the point. Pass none. When a
//     wait genuinely needs longer, `test.slow()` is the lever (see
//     checklist-phase4-members-access.spec.ts's gotoNewLessonForm).
//
//   - `expect(…).toPass()` IS UNBOUNDED TOO, for its own reason rather than that one: its
//     `timeout` option defaults to 0 and it deliberately ignores the configured expect timeout.
//     Same rule — pass no number.
//
//   - `expect.poll` AND EVERY WEB-FIRST `expect` MATCHER ARE THE OPPOSITE CASE. They run on
//     expect's own 5s default (playwright.config.ts sets no `expect.timeout`), which
//     `test.slow()` does NOT raise — that triples the *test* timeout and touches nothing else.
//     A number on one of these therefore *loosens*, which makes it the one sanctioned place to
//     write one: per call site, named, with the reason on it (see
//     checklist-phase4-finances-outstanding.spec.ts's SETTLE_AFTER_WRITE).
//
// ## Asserting on the URL, suite-wide (#1009, #1140, #1152)
//
// After a *click*, use page.waitForURL(pattern, { waitUntil: 'commit' }) — expect(page).toHaveURL
// carries the 5s expect budget above, which the dev server can exceed cold-compiling the target
// route under full-suite load, and 'commit' is enough because the claim is that the URL changed,
// not that the new document finished loading. waitForURL still fails the test outright if the URL
// never lands, so the claim survives the swap. After a page.goto, plain toHaveURL is correct and
// stays: goto already resolves after redirects, so there is nothing left to wait for (see
// auth.spec.ts and behaviors.spec.ts's rider-redirect test).
//
// BUT waitForURL IS A NO-OP WHEN THE PATTERN ALREADY MATCHES (#1204). It resolves against the
// current URL before it waits, so a submit that redirects to the page it was already on returns
// immediately and whatever follows races the redirect — a sync point that looks present and
// isn't. checklist-phase4-settings-tiers-events.spec.ts's `save()` is safe only because it is
// called from /settings/tiers/<id> and waits for /settings; copy it onto a form already sitting
// on its own destination URL and the sync point silently disappears. Synchronise on something
// the response *changes* instead — see e2e/CLAUDE.md's fact 8.
//
// withBarn is a plain registration helper rather than a Playwright fixture because Playwright
// has no file scope — only test and worker — and a worker-scoped fixture would leak one barn
// across every file that worker happens to run.
//
// ## Two barns in one spec (#1415)
//
// A spec asserting cross-barn isolation needs a second barn, and the thing it must not do is
// seed one by hand: a barn nothing registered for teardown is a barn left standing in the shared
// dev project on every run. withSecondBarn is withBarn's twin for that — same beforeAll/afterAll
// shape, keyed through secondBarnKey so neither barn's slug (nor the name createBarn derives
// from it) contains the other's, which is the substring-matcher hazard support/fixtures.ts's
// E2E_STUB_RIDER states for people.
//
// Both barns' slugs then have to reach the page fixture, because src/proxy.ts gates every
// /barn/<slug>/* route on a barn_session_<slug> cookie: with barn A's cookie alone, every barn B
// URL redirects to barn B's login page and a spec's isolation assertions would pass against a
// login form. Hence `active` is a list rather than a single barn.

import { test as base, expect } from '@playwright/test'
import { type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/db/service-role'
import { assertDevProject } from '../../scripts/script-utils'
import {
  createBarn,
  addMemberships,
  teardownBarn,
  barnSlugFor,
  secondBarnKey,
  runPrefix,
  type SeededBarn,
  type SeededMembers,
  type E2eRole,
} from './fixtures'

export type SeedContext = {
  supabase: SupabaseClient
  barn: SeededBarn
  members: SeededMembers
}

/** Both members are filled in by beforeAll and throw if read at module scope. */
export type BarnHandle = {
  readonly slug: string
  readonly data: SeedContext
}

// `created` is set the moment the barn row exists and tracks what afterAll must clean up;
// `ctx` is set only once seeding finished and is what tests read. They are separate so a
// failure between the two still tears the barn down.
type BarnState = { slug: string | null; created: SupabaseClient | null; ctx: SeedContext | null }

// The barns of the file a worker is currently running (a worker runs a single file at a time),
// so the page fixture below can read them from here. withBarn's barn is always first and resets
// the list; withSecondBarn appends.
let active: BarnState[] = []

// The mobile project runs on the manager storage state, so it authenticates as the manager.
const ROLE_BY_PROJECT: Record<string, E2eRole> = {
  manager: 'manager',
  trainer: 'trainer',
  rider: 'rider',
  mobile: 'manager',
}

/**
 * Exported for the spec that has to reach a service-role client from *outside* `withBarn`'s seed
 * callback (#1425): a seed that throws after creating an auth user leaves `barn.data` unreadable,
 * so a teardown reading its client from there would strand the user in the shared dev project —
 * the one thing that teardown exists to prevent. Export rather than copy, because this function
 * is where the `assertDevProject` gate below lives: a forked copy can drift, and the failure mode
 * of a drifted copy is a spec running service-role deletes against a project that isn't dev.
 */
export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!url) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required — run the suite via scripts/run-checklist-suite.sh')
  // The suite now seeds and deletes barns from inside the Playwright process, so the
  // dev-project gate has to be enforced here and not only in the shell wrapper.
  if (process.env.E2E_ALLOW_PROD !== 'true') assertDevProject(url)
  return createServiceClient(url, key)
}

export function withBarn(key: string, seed?: (ctx: SeedContext) => Promise<void>): BarnHandle {
  return registerBarn(key, seed, { first: true })
}

/**
 * A second barn for the same spec file, seeded and torn down on the same hooks as withBarn's
 * (see the two-barns block at the top of this file). Call it *after* withBarn in the module
 * body: Playwright runs beforeAll hooks in registration order, so barn A exists before this
 * one's seed callback runs.
 *
 * afterAll hooks run in registration order too, not reversed — measured against
 * `_collectHooksAndModifiers`/`_runAllHooksForSuite` in playwright's workerProcessEntry.js, which
 * filter `suite._hooks` by type without reversing, and confirmed by running a two-pair file. So
 * barn A is torn down first, not last. Nothing here depends on that: each barn's afterAll reaches
 * only its own `state.created`/`state.slug`, and the two barns share no rows. A third barn, or a
 * teardown that spanned them, would have to be written against that order rather than against the
 * LIFO one it would be natural to assume.
 */
export function withSecondBarn(key: string, seed?: (ctx: SeedContext) => Promise<void>): BarnHandle {
  return registerBarn(secondBarnKey(key), seed, { first: false })
}

function registerBarn(
  key: string,
  seed: ((ctx: SeedContext) => Promise<void>) | undefined,
  { first }: { first: boolean }
): BarnHandle {
  const state: BarnState = { slug: null, created: null, ctx: null }
  active = first ? [state] : [...active, state]

  // Registered from the spec file's own module evaluation, so both hooks attach to that
  // file's suite rather than to whichever file first imported this module.
  base.beforeAll(async ({}, testInfo) => {
    // The project name is only knowable here, not at module load — which is why the handle's
    // slug getter below refuses a module-scope read.
    const slug = barnSlugFor(runPrefix(), key, testInfo.project.name)
    state.slug = slug
    const supabase = serviceClient()
    const barn = await createBarn(supabase, slug)
    // Marked owed-for-teardown as soon as the row exists, before the steps that can throw:
    // addMemberships fails whenever the per-project logins are missing, and gating teardown
    // on the fully-seeded context instead would strand this barn. A bare
    // `npx playwright test` has no exit trap sweeping up behind it.
    state.created = supabase
    const members = await addMemberships(supabase, barn.id)
    state.ctx = { supabase, barn, members }
    // Re-asserted here, not only at registration: a worker that loaded several spec files ran
    // every one of their module bodies, so the last file loaded won the registration-time
    // assignment. Barn A's hook resets the list; a second barn's appends to it.
    active = first ? [state] : [...active, state]
    if (seed) await seed(state.ctx)
  })

  base.afterAll(async () => {
    if (!state.created || !state.slug) return
    // --hold-open keeps the barns up for manual checklist steps; run-checklist-suite.sh's
    // exit trap sweeps them by run prefix once the operator is done.
    if (process.env.E2E_HOLD_OPEN === 'true') return
    await teardownBarn(state.created, state.slug)
    state.created = null
    state.ctx = null
  })

  const notSeeded = (what: string) =>
    new Error(`barn "${key}" ${what} is not resolved yet — read it inside a test, not at module scope`)

  return {
    get slug() {
      if (!state.slug) throw notSeeded('slug')
      return state.slug
    },
    get data() {
      if (!state.ctx) throw notSeeded('seed data')
      return state.ctx
    },
  }
}

/**
 * src/proxy.ts gates every /barn/<slug>/* route on a barn_session_<slug> cookie matching the
 * current user id. The slug isn't known until beforeAll runs, so it can't be baked into the
 * static storage states global-setup.ts writes — it's set per context here instead, one cookie
 * per barn the file seeded (see the two-barns block at the top of this file).
 */
export const test = base.extend({
  // `runTest` is Playwright's `use` callback, renamed only so the React hooks lint rule
  // doesn't read this fixture as a misplaced hook call.
  page: async ({ page, context }, runTest, testInfo) => {
    if (!active.length || active.some((barn) => !barn.ctx || !barn.slug)) {
      throw new Error('no seeded barn — the spec file must call withBarn() at module scope')
    }
    const role = ROLE_BY_PROJECT[testInfo.project.name]
    if (!role) throw new Error(`no e2e role mapped for Playwright project "${testInfo.project.name}"`)

    await context.addCookies(
      active.map((barn) => {
        // Each barn's own membership row, not the first barn's: the three logins are per
        // Supabase project so the id is the same today, and reading it per barn is what keeps
        // that a fact about the fixture rather than an assumption this file depends on.
        const userId = barn.ctx!.members[role].userId
        if (!userId) throw new Error(`no auth user for role "${role}"`)
        return {
          name: `barn_session_${barn.slug}`,
          value: userId,
          url: testInfo.project.use.baseURL ?? 'http://localhost:3000',
        }
      })
    )
    await runTest(page)
  },
})

export { expect }
export type { Page } from '@playwright/test'
