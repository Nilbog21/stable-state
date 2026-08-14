// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/nav-active.ts
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
//
// Phase 2's agreements block (checklists/pre-release/phase-2-manager-seeding.md, from "**Leases**
// in the nav opens the lease-kind list" through "Both agreements appear in their respective
// kind-scoped lists"): the `?kind=` scoping of the two nav entries, and the monthly lease and the
// boarding agreement created through `/agreements/new`.
//
// ## What this file is actually about, and why the highlight lines are the point
//
// One route (`/agreements`) serves two nav entries, so the highlight cannot be derived from the
// path — `nav-links.ts` gives Leases `?kind=lease` and Boarding `?kind=board`, and
// `isNavLinkActive` closes with `hrefQuery === undefined || currentQuery === hrefQuery`. That
// query comparison is the whole mechanism, and it is what regresses: #544 fixed `isNavLinkActive`
// dropping its nested-path match for any href carrying a query string, which left Leases and
// Boarding highlighting on *neither* of the nested agreements routes.
// `checklist-phase1-nav-responsive.spec.ts` says outright that the case is uncovered there
// ("a case whose own coverage lives on phase 2's checklist, since both nested-route checks here
// use query-less Lessons"). This file is that coverage.
//
// ## The nested-route line is true, and it is NOT the query-less case
//
// "**Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the
// `/agreements/new` form" was checked against `isNavLinkActive` rather than assumed, because the
// sibling slice #1458 found a *different* nested agreements route where the equivalent claim is
// false. The two cases separate cleanly:
//
//   - #1458's case is the member-detail card's `/barn/${slug}/agreements/${id}` — **no query at
//     all**. `currentQuery` is `''`, both hrefs carry a query, so `currentQuery === hrefQuery`
//     fails for both and NEITHER link highlights.
//   - This file's case is reached by clicking **Add Lease**, whose href is
//     `` `/barn/${slug}/agreements/new?kind=${kind}` `` (`agreements/page.tsx`'s `addHref`). So
//     `pathMatches` holds through the `startsWith('…/agreements/')` branch AND
//     `currentQuery === 'kind=lease'` matches Leases' href exactly, while failing Boarding's.
//
// Same route prefix, opposite outcomes, and the difference is entirely the query the entry point
// puts on the URL. That is why the two highlight tests below assert BOTH links in one object
// rather than only the one they name.
//
// ## Every list page is reached by clicking, never by `goto`
//
// Framework fact 11: switching a tab or filter is a click on its control, not a re-`goto` with a
// different query param. That binds hard here, since `?kind=` IS this file's subject — reaching
// `?kind=board` by navigating to the URL would assert that the *page* reads the param while
// asserting nothing about the nav entry that is supposed to put it there. Every test starts from
// `/horses` (query-less, so the `waitForURL`s below are real sync points rather than fact 3's
// no-op) and clicks its way in.
//
// ## Riders Dana and Emery, horses Apple and Butter
//
// The checklist names them because Phase 2 used to create them by hand earlier in the same chain;
// this barn seeds its own. Dana is the `rider` login (`Test Rider`) and Emery is the `rider2`
// managed stub (`Test Sutton`) — `getActiveMembersWithProfiles(barn.id, 'rider')` returns both, so
// the form's rider select offers exactly the two this file needs and nothing else. Neither name is
// new, so `support/fixtures.ts`'s `E2E_STUB_RIDER` collision constraint has nothing fresh to bind;
// `Test Rider` and `Test Sutton` already satisfy it and are already asserted in
// `support/fixtures.test.ts`. Nothing here turns on Emery being a stub rather than a claimed
// rider: the rider select lists active rider memberships regardless, and the created agreement's
// card is addressed by href.
//
// ## Rule 5 (`mustAffect` on load-bearing setup mutations, #1435)
//
// The seed callback below writes no `.update(`/`.delete(` of its own. Its one mutation is
// `updateBarnSettings`, whose write is `.update(...).select().single()` under `mustSucceed` —
// `.single()` errors on a zero-row result, so that call already fails closed exactly as
// `mustAffect(…, 1)` would. See the seed comment for why the value it writes is load-bearing.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, updateBarnSettings } from './support/fixtures'
import { settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'

// ---------------------------------------------------------------------------
// What the checklist's names resolve to in this barn
// ---------------------------------------------------------------------------

/** The checklist's "Dana" — the `rider` login. */
const DANA = 'Test Rider'
/** The checklist's "Emery" — the `rider2` managed stub. */
const EMERY = 'Test Sutton'

const APPLE = 'Apple'
const BUTTER = 'Butter'

/** The checklist's "fee $150" on the lease. Typed into the form; never used as an expectation. */
const LEASE_FEE = '150'

/**
 * The barn's default board fee, and deliberately NOT 1000.
 *
 * `barns.default_board_fee` is `NOT NULL DEFAULT 1000` (20260716005941_release3_schema.sql), so
 * seeding 1000 would leave the prefill assertion passing against a *broken* prefill whose empty
 * field had merely been backfilled by the column default — the vacuity the issue warns about, one
 * level below the literal it names. The assertion compares against `updateBarnSettings`' return
 * value rather than against this constant, so this number is only the input.
 */
const SEEDED_BOARD_FEE = 725

/** Tailwind `font-semibold` / `font-medium` — the two weights the nav's active/inactive classes set. */
const ACTIVE_FONT_WEIGHT = '600'
const INACTIVE_FONT_WEIGHT = '500'

const LEASES = 'Leases'
const BOARDING = 'Boarding'

/**
 * The one sanctioned numeric timeout (`support/test.ts`'s timeout block, #1469): a web-first
 * `expect` matcher runs on expect's own 5s default, which `test.slow()` does NOT raise — it
 * triples the *test* timeout and touches nothing else. So a number here LOOSENS, where a number on
 * a `waitFor`/`waitForURL` could only tighten.
 *
 * Applied only to the two post-save card reads, where the assertion's own target is the only thing
 * left to wait on: `createAgreementAction` redirects, `waitUntil: 'commit'` resolves before the
 * list has rendered, and the card is what is waiting on both the RPC write and that render. Same
 * value and same reasoning as `checklist-phase2-managed-stubs.spec.ts` and
 * `checklist-phase2-horses-owner.spec.ts`.
 */
const SETTLE_AFTER_WRITE = 15_000

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** `updateBarnSettings`' own answer for what the barn's default board fee is — the prefill's expectation. */
let seededBoardFee: number

const barn = withBarn('phase2-agreements-create', async ({ supabase, barn }) => {
  // Two horses with distinct names so the two agreements are distinguishable at the form, where
  // they are selected by label. (The lists below address cards by href, not by horse name.)
  await addHorse(supabase, barn.id, APPLE)
  await addHorse(supabase, barn.id, BUTTER)

  // Load-bearing: the boarding form's fee prefill is `String(defaultBoardFee ?? '')`, seeded from
  // `getBarnDefaultBoardFee`. If this write did nothing the field would still be non-empty (the
  // column default), so the prefill test would measure the column rather than the prefill — see
  // SEEDED_BOARD_FEE. `updateBarnSettings` fails closed on a zero-row update via `.single()`,
  // which is why no separate `mustAffect` is written here.
  const updated = await updateBarnSettings(supabase, barn.id, { defaultBoardFee: SEEDED_BOARD_FEE })
  seededBoardFee = updated.default_board_fee
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/** A query-less protected page, so every `waitForURL` below is a real sync point (fact 3). */
const startUrl = () => `/barn/${barn.slug}/horses`

/** `DesktopNavLinks`' root — the only `div` child of `<nav>` carrying `hidden` (phase 1's note 4). */
const desktopNavContainer = (page: Page) => page.locator('nav > div.hidden')

const navLink = (page: Page, label: string) =>
  desktopNavContainer(page).getByRole('link', { name: label, exact: true })

/**
 * The agreements list's cards. `Card href=…` renders an anchor, and `<main>` keeps the nav's five
 * `/agreements`-prefixed links out of the set.
 *
 * The `:not(…/new…)` half is load-bearing rather than tidy, and it is the case that differs in the
 * state that makes this locator interesting: the page's own Add Lease (or Add Boarding) button is
 * a `<Button href>` pointing at `/barn/<slug>/agreements/new?kind=…`, which is inside `<main>`
 * and does contain `/agreements/`. Without the exclusion an EMPTY list would read as one card —
 * which is exactly the state the two save tests and the kind-scoping test measure against.
 */
const agreementCards = (page: Page) =>
  page.locator('main a[href*="/agreements/"]:not([href*="/agreements/new"])')

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Both halves of "highlighted" for both agreements nav entries, in one value.
 *
 * `checklist-phase1-nav-responsive.spec.ts`'s `highlightOf`, copied rather than hoisted (a shared
 * helper would live under `e2e/support/**`, which is `scripts/select-specs.sh`'s `ALWAYS_FULL` and
 * would force every diff touching it to a full-suite run). Both entries are read, not just the one
 * a given test names, for the reason that file states: a regression applying the active class to
 * every link while leaving `aria-current` correct is exactly "the wrong one is highlighted too",
 * and an `aria-current`-only read calls that page clean. The computed weight is the half that
 * catches it.
 *
 * Non-retrying by construction — `expect.poll` owns the pacing at every call site.
 */
async function highlightOf(link: Locator): Promise<{ ariaCurrent: string; fontWeight: string }> {
  return {
    ariaCurrent: (await link.getAttribute('aria-current')) ?? 'none',
    fontWeight: await link.evaluate((el) => getComputedStyle(el).fontWeight),
  }
}

/**
 * The two strings on the list page that the resolved `kind` decides, as full match sets.
 *
 * `agreements/page.tsx` serves both kinds from one file, so a page that resolved the wrong kind
 * would carry the same URL and the same layout and differ only in `title` and `label`. Read as
 * arrays rather than first-matches so a second heading or a second Add control fails here instead
 * of being silently dropped.
 *
 * The `Add (Lease|Boarding)` name pattern is deliberately kind-agnostic: a locator naming the
 * expected label would find nothing and read as an empty array on the very regression this is for.
 */
async function kindStrings(page: Page): Promise<{ headings: string[]; addLinks: string[] }> {
  return {
    headings: await settledTextContents(page.locator('main h1')),
    addLinks: await settledTextContents(page.getByRole('link', { name: /^Add (Lease|Boarding)$/ })),
  }
}

async function agreementsHighlight(page: Page): Promise<Record<string, unknown>> {
  return {
    [LEASES]: await highlightOf(navLink(page, LEASES)),
    [BOARDING]: await highlightOf(navLink(page, BOARDING)),
  }
}

const active = { ariaCurrent: 'page', fontWeight: ACTIVE_FONT_WEIGHT }
const inert = { ariaCurrent: 'none', fontWeight: INACTIVE_FONT_WEIGHT }

/**
 * Every card href on the list currently rendered, in DOM order.
 *
 * The inline `waitFor` before `evaluateAll` is `support/read.ts`'s own reasoning applied to an
 * attribute read: a not-yet-rendered container yields `[]`, and `[]` must never reach an
 * expectation as a shortened answer. Every call site wraps this in `expect.poll` against a
 * NON-EMPTY expectation, so an empty list fails rather than satisfying anything.
 */
async function cardHrefs(page: Page): Promise<string[]> {
  const cards = agreementCards(page)
  await cards.first().waitFor()
  return cards.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Clicks a nav entry and lands on its kind-scoped list.
 *
 * `waitUntil: 'commit'` and no explicit timeout: `navigationTimeout` defaults to unbounded, so a
 * hand-written number could only tighten it (#1211). Bounded by the test's own budget.
 */
async function openKindList(page: Page, label: string, kind: string): Promise<void> {
  await page.goto(startUrl())
  await navLink(page, label).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements\\?kind=${kind}$`), { waitUntil: 'commit' })
}

/** …and on through the list's Add button to the new-agreement form for that same kind. */
async function openAddForm(page: Page, label: string, kind: string): Promise<void> {
  await openKindList(page, label, kind)
  await page.getByRole('link', { name: `Add ${label === LEASES ? 'Lease' : 'Boarding'}`, exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements/new\\?kind=${kind}$`), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// The chain's captured state
// ---------------------------------------------------------------------------

type CreatedAgreements = { barnId: string; hrefs: Record<string, string> }

let created: CreatedAgreements | null = null

/**
 * The card href a save test read off the list its redirect landed on.
 *
 * The barn-id comparison is `checklist-phase2-managed-stubs.spec.ts`'s `liveStubId` guard, reduced
 * to what this file needs: Playwright discards the worker process after any test failure and
 * re-runs every `beforeAll` (fact 15), which re-seeds a *different* barn underneath hrefs captured
 * against the old one. Comparing barn ids rather than slugs is what detects it — `barnSlugFor`
 * reproduces the same slug on the re-run, so a slug comparison would see nothing.
 */
function liveHref(kind: string): string {
  if (!created) {
    throw new Error(
      `no captured card href for kind=${kind} — it is read by the save test earlier in this serial chain, which must run first`
    )
  }
  if (created.barnId !== barn.data.barn.id) {
    throw new Error(
      `the captured card hrefs belong to a torn-down barn (${created.barnId} != ${barn.data.barn.id}) — a worker restart re-seeded underneath them; re-run the whole spec file`
    )
  }
  const href = created.hrefs[kind]
  if (!href) throw new Error(`no card href captured for kind=${kind}`)
  return href
}

function capture(kind: string, href: string): void {
  if (!created || created.barnId !== barn.data.barn.id) {
    created = { barnId: barn.data.barn.id, hrefs: {} }
  }
  created.hrefs[kind] = href
}

// ---------------------------------------------------------------------------
// The chain, in the order the checklist walks it
// ---------------------------------------------------------------------------

test.describe.serial('leases and boarding', () => {
  // "**Leases** in the nav opens the lease-kind list"
  //
  // Both kind-derived strings on the page in one expectation, rather than the heading alone: the
  // route serves both kinds off one file, so `title` and `label` are the two places the resolved
  // kind surfaces (`agreements/page.tsx`). A page that resolved `board` would keep the same URL
  // and the same layout and differ only here.
  test('clicking_leases_in_the_nav_opens_the_lease_kind_list @manager', async ({ page }) => {
    await openKindList(page, LEASES, 'lease')

    await expect.poll(() => kindStrings(page)).toEqual({ headings: ['Leases'], addLinks: ['Add Lease'] })
  })

  // "**Leases** stays highlighted in the nav on that list"
  test('the_lease_list_highlights_leases_and_not_boarding @manager', async ({ page }) => {
    await openKindList(page, LEASES, 'lease')

    await expect.poll(() => agreementsHighlight(page)).toEqual({ [LEASES]: active, [BOARDING]: inert })
  })

  // "The URL shows `?kind=lease`"
  //
  // A whole-URL equality, not a containment: `?kind=lease` is a claim about the query the nav
  // entry put there, and `toContain` would also accept `?kind=lease&kind=board` or a stray extra
  // param. The pathname half is what stops it from passing on any other page carrying the param.
  test('the_lease_list_url_carries_kind_lease @manager', async ({ page }) => {
    await openKindList(page, LEASES, 'lease')

    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(`/barn/${barn.slug}/agreements?kind=lease`)
  })

  // "**Add Lease** → the nav still shows **Leases** highlighted (not Boarding) on the
  // `/agreements/new` form → …"
  //
  // The first of this checkbox's two tests; the save is the next one. This is the nested-route
  // case the header block reasons through — and the one #544 regressed — so both entries are
  // asserted together: "Leases highlighted" and "Boarding not highlighted" are separate failures
  // of `isNavLinkActive` and a single-link read cannot tell them apart.
  test('the_add_lease_form_highlights_leases_and_not_boarding @manager', async ({ page }) => {
    await openAddForm(page, LEASES, 'lease')

    await expect.poll(() => agreementsHighlight(page)).toEqual({ [LEASES]: active, [BOARDING]: inert })
  })

  // "… → select rider Dana, horse Apple, fee $150, cadence Monthly, start date today → Save"
  //
  // The second of that checkbox's two tests.
  //
  // Cadence is selected explicitly even though `monthly` is already the select's `defaultValue`:
  // the checklist's action says to choose it, and relying on the default would let a changed
  // default silently satisfy the line. The start date is left at the form's own prefill
  // (`barnToday(barn.timezone)`, passed as `defaultStartDate`), which IS "start date today" — so
  // this test computes no date at all and stays clear of the barn-vs-host zone axis (fact 12).
  test('saving_the_add_lease_form_adds_the_lease_to_the_lease_list @manager', async ({ page }) => {
    test.slow()
    await openAddForm(page, LEASES, 'lease')
    // The fee input is React-*controlled* (`value={fee}` + `onChange`), which is fact 9's case
    // exactly: a fill landing before hydration moves the DOM value and nothing else, and the
    // controlled re-render then discards it. The selects are uncontrolled and would survive, but
    // the barrier has to precede the whole interaction to be worth anything.
    await waitForBarnPageHydrated(page)

    await page.locator('#agreement-rider').selectOption({ label: DANA })
    await page.locator('#agreement-horse').selectOption({ label: APPLE })
    await page.locator('#agreement-cadence').selectOption('monthly')
    await page.locator('#agreement-fee').fill(LEASE_FEE)
    await page.getByRole('button', { name: 'Add Lease', exact: true }).click()

    // `createAgreementAction` re-renders the form with a `role="alert"` and no navigation on every
    // rejection path and only redirects on success, so this is the "saved with no error" half of
    // the line as well as a sync point. It cannot no-op (fact 3) — the pattern excludes the
    // `/agreements/new` this was submitted from.
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements\\?kind=lease$`), { waitUntil: 'commit' })

    await expect(agreementCards(page)).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })
    const [href] = await cardHrefs(page)
    capture('lease', href)
  })

  // "**Boarding** in the nav opens the board-kind list"
  test('clicking_boarding_in_the_nav_opens_the_board_kind_list @manager', async ({ page }) => {
    await openKindList(page, BOARDING, 'board')

    await expect.poll(() => kindStrings(page)).toEqual({ headings: ['Boarding'], addLinks: ['Add Boarding'] })
  })

  // "**Boarding** stays highlighted in the nav on that list"
  test('the_board_list_highlights_boarding_and_not_leases @manager', async ({ page }) => {
    await openKindList(page, BOARDING, 'board')

    await expect.poll(() => agreementsHighlight(page)).toEqual({ [LEASES]: inert, [BOARDING]: active })
  })

  // "The URL shows `?kind=board`"
  test('the_board_list_url_carries_kind_board @manager', async ({ page }) => {
    await openKindList(page, BOARDING, 'board')

    await expect
      .poll(() => new URL(page.url()).pathname + new URL(page.url()).search)
      .toBe(`/barn/${barn.slug}/agreements?kind=board`)
  })

  // "**Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's
  // default board fee → Save"
  //
  // One test for one checkbox, and the prefill and the save are not separable here: the field this
  // reads is the field the submit persists, so asserting the prefill and then submitting it
  // *unchanged* is what makes "Save" mean "saved the barn's default board fee". Split across two
  // tests, the save half would have to type a fee of its own and the two claims would come apart.
  //
  // The expectation is `updateBarnSettings`' returned `default_board_fee`, never the literal that
  // was passed in and never a hardcoded number — see SEEDED_BOARD_FEE for the column-default
  // vacuity that closes. Compared numerically because the field is `type="number"`: its string
  // form is a rendering detail, and `Number('')` is 0, which cannot collide with a non-zero seed.
  //
  // The boarding form has no cadence control at all (`AgreementForm` renders a hidden
  // `cadence=monthly` for `kind === 'board'`), which is why nothing is selected for it here.
  test('the_add_boarding_form_prefills_the_barns_default_board_fee_and_saves @manager', async ({ page }) => {
    test.slow()
    await openAddForm(page, BOARDING, 'board')
    await waitForBarnPageHydrated(page)

    await expect.poll(async () => Number(await page.locator('#agreement-fee').inputValue())).toBe(seededBoardFee)

    await page.locator('#agreement-rider').selectOption({ label: EMERY })
    await page.locator('#agreement-horse').selectOption({ label: BUTTER })
    await page.getByRole('button', { name: 'Add Boarding', exact: true }).click()

    await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements\\?kind=board$`), { waitUntil: 'commit' })

    await expect(agreementCards(page)).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })
    const [href] = await cardHrefs(page)
    capture('board', href)
  })

  // "Both agreements appear in their respective kind-scoped lists"
  //
  // The kind-scoping claim, and the first point in the chain where it can be made: each save test
  // above ran while its own list was the only populated one, so neither could tell "scoped to its
  // kind" from "the only agreement that exists". Here both exist.
  //
  // Set equality against each list's own captured singleton, so one expectation carries both
  // directions — the agreement IS in its list, and the other one is NOT. That satisfies rule 4
  // (#1434) without a separate anchor: the expectation is non-empty, so `expect.poll` retries
  // against it rather than being satisfied on its first poll the way `toHaveCount(0)` would be,
  // and two empty lists fail rather than pass. Deliberately not loosened to a containment check,
  // which would drop the absence half entirely.
  //
  // Addressing by href rather than by the rider/horse names the cards render: an agreement id is
  // unique by construction, where a name is unique only because this seed happens to use two
  // different riders — and the card's rendered content is the next slice's subject, not this one's.
  test('both_agreements_appear_only_in_their_own_kind_scoped_list @manager', async ({ page }) => {
    await openKindList(page, LEASES, 'lease')
    await expect.poll(() => cardHrefs(page)).toEqual([liveHref('lease')])

    await openKindList(page, BOARDING, 'board')
    await expect.poll(() => cardHrefs(page)).toEqual([liveHref('board')])
  })
})
