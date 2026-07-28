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
// Isolation comes from the file axis: Playwright parallelises across spec *files* and runs
// the tests within one file serially (fullyParallel stays false — see playwright.config.ts),
// so a mutating spec can neither race nor pollute a reading spec in another file. Seeding is
// the reset; there is no undo path to maintain.
//
// withBarn is a plain registration helper rather than a Playwright fixture because Playwright
// has no file scope — only test and worker — and a worker-scoped fixture would leak one barn
// across every file that worker happens to run.

import { test as base, expect } from '@playwright/test'
import { type SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/db/service-role'
import { assertDevProject } from '../../scripts/script-utils'
import {
  createBarn,
  addMemberships,
  teardownBarn,
  barnSlugFor,
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

/** Slug is known at module load; the rest is filled in by beforeAll. */
export type BarnHandle = {
  readonly slug: string
  readonly data: SeedContext
}

// `created` is set the moment the barn row exists and tracks what afterAll must clean up;
// `ctx` is set only once seeding finished and is what tests read. They are separate so a
// failure between the two still tears the barn down.
type BarnState = { slug: string; created: SupabaseClient | null; ctx: SeedContext | null }

// One barn is active per worker process at a time (a worker runs a single file at a time),
// so the page fixture below can read the current file's barn from here.
let active: BarnState | null = null

// The mobile project runs on the manager storage state, so it authenticates as the manager.
const ROLE_BY_PROJECT: Record<string, E2eRole> = {
  manager: 'manager',
  trainer: 'trainer',
  rider: 'rider',
  mobile: 'manager',
}

function serviceClient(): SupabaseClient {
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
  const slug = barnSlugFor(runPrefix(), key)
  const state: BarnState = { slug, created: null, ctx: null }
  active = state

  // Registered from the spec file's own module evaluation, so both hooks attach to that
  // file's suite rather than to whichever file first imported this module.
  base.beforeAll(async () => {
    const supabase = serviceClient()
    const barn = await createBarn(supabase, slug)
    // Marked owed-for-teardown as soon as the row exists, before the steps that can throw:
    // addMemberships fails whenever the per-project logins are missing, and gating teardown
    // on the fully-seeded context instead would strand this barn. A bare
    // `npx playwright test` has no exit trap sweeping up behind it.
    state.created = supabase
    const members = await addMemberships(supabase, barn.id)
    state.ctx = { supabase, barn, members }
    active = state
    if (seed) await seed(state.ctx)
  })

  base.afterAll(async () => {
    if (!state.created) return
    // --hold-open keeps the barns up for manual checklist steps; run-checklist-suite.sh's
    // exit trap sweeps them by run prefix once the operator is done.
    if (process.env.E2E_HOLD_OPEN === 'true') return
    await teardownBarn(state.created, slug)
    state.created = null
    state.ctx = null
  })

  return {
    get slug() {
      return slug
    },
    get data() {
      if (!state.ctx) throw new Error(`barn "${slug}" is not seeded yet — read it inside a test, not at module scope`)
      return state.ctx
    },
  }
}

/**
 * src/proxy.ts gates every /barn/<slug>/* route on a barn_session_<slug> cookie matching the
 * current user id. The slug isn't known until beforeAll runs, so it can't be baked into the
 * static storage states global-setup.ts writes — it's set per context here instead.
 */
export const test = base.extend({
  // `runTest` is Playwright's `use` callback, renamed only so the React hooks lint rule
  // doesn't read this fixture as a misplaced hook call.
  page: async ({ page, context }, runTest, testInfo) => {
    if (!active?.ctx) throw new Error('no seeded barn — the spec file must call withBarn() at module scope')
    const role = ROLE_BY_PROJECT[testInfo.project.name]
    if (!role) throw new Error(`no e2e role mapped for Playwright project "${testInfo.project.name}"`)
    const userId = active.ctx.members[role].userId
    if (!userId) throw new Error(`no auth user for role "${role}"`)

    await context.addCookies([
      {
        name: `barn_session_${active.slug}`,
        value: userId,
        url: testInfo.project.use.baseURL ?? 'http://localhost:3000',
      },
    ])
    await runTest(page)
  },
})

export { expect }
export type { Page } from '@playwright/test'
