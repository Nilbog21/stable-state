// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/nav-active.ts
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/app/barn/[slug]/(protected)/horses/**
//
// The last two are not decoration. Every nav click here goes through `NavigationBlocker`'s
// `BlockingLink`, and `AgreementForm` arms `useUnsavedChangesGuard` from the same module. And
// `horses/**` is the launchpad: every test in this file starts at `/barn/<slug>/horses` and clicks
// out of it, so a regression that made that route throw would fail all ten. `docs/scripts/suite.md`'s
// discriminating question is "could an assertion in this file fail if that module changed?", and
// for the launchpad the answer is plainly yes — declaring it costs this PR nothing, since a
// selection is computed from a diff's changed paths rather than from a spec's own declarations.
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
// ## Every list page is reached by clicking, never by `goto`, and AFTER hydration
//
// Framework fact 11: switching a tab or filter is a click on its control, not a re-`goto` with a
// different query param. That binds hard here, since `?kind=` IS this file's subject — reaching
// `?kind=board` by navigating to the URL would assert that the *page* reads the param while
// asserting nothing about the nav entry that is supposed to put it there. Every test starts from
// `/horses` (query-less, so the `waitForURL`s below are real sync points rather than fact 3's
// no-op) and clicks its way in.
//
// `clickNavEntry` puts a hydration barrier before that click, and it is load-bearing rather than
// defensive. A nav click dispatched before React is listening is not lost — `BlockingLink` renders
// a real `<a href>`, so the browser performs a plain document navigation — but the page it lands on
// is then SERVER-rendered, and `aria-current` is an attribute React 19 will not reconcile
// afterwards (fact 7). Every highlight read in this file would silently be measuring SSR's
// `isNavLinkActive` result. That is not nothing — `isNavLinkActive` is shared, so the #544
// regression itself would still be caught — but the symptom that regression *presents* as lives on
// the client path (`DesktopNavLinks` recomputing `currentPath` from `usePathname`/`useSearchParams`
// after a soft navigation), and a file whose whole subject is that derivation should be exercising
// it. The barrier makes every nav click a soft navigation, which is also what a real manager
// clicking Leases in a live session does.
//
// ## Riders Dana and Emery, horses Apple and Butter
//
// Those four are the dev barn's **reset-seed baseline**, not anything Phase 2 creates:
// `scripts/seed-barn.ts` inserts riders Dana/Emery/Finley and horses Apple/Butter/Clover, and
// `checklists/pre-release/phase-1-setup.md` lists them under "Seeded baseline after reset".
// (#1455's note says the checklist names them "because Phase 2 used to create them by hand"; that
// is not so. Phase 2's only by-hand rider creation is the Gale/Harper/Indigo managed-stub block,
// which sits *after* this agreements block, not before it. The substitution below is unaffected —
// a spec barn has no baseline either way — but the stated reason for it was wrong, and it is
// corrected here rather than copied forward.)
//
// So this file substitutes its own seeded members. Dana is the `rider` login (`Test Rider`) and
// Emery is the `rider2` managed stub (`Test Sutton`) — `getActiveMembersWithProfiles(barn.id,
// 'rider')` returns both, so the form's rider select offers exactly the two this file needs and
// nothing else. Neither name is new, so `support/fixtures.ts`'s `E2E_STUB_RIDER` collision
// constraint has nothing fresh to bind; `Test Rider` and `Test Sutton` already satisfy it and are
// already asserted in `support/fixtures.test.ts`. Nothing here turns on Emery being a stub rather
// than a claimed rider: the rider select lists active rider memberships regardless.
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
import { ACTIVE_FONT_WEIGHT, INACTIVE_FONT_WEIGHT, desktopNav } from './support/nav'

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
 * `barns.default_board_fee` is `NOT NULL DEFAULT 1000` (20260716005941_release3_schema.sql) — the
 * value every freshly-created barn row already carries. Seed 1000 and the prefill assertion can no
 * longer tell "the form read the barn's default board fee" from "the seed never wrote, and the
 * form read the column default that was already there". 725 makes those two answers distinguish.
 * (The column default is a property of the barns *row*, not of the form field; the field renders
 * `String(defaultBoardFee ?? '')` from whatever `getBarnDefaultBoardFee` returned.)
 *
 * The assertion compares against `updateBarnSettings`' returned value rather than against this
 * constant, and the seed checks the two agree — see the seed callback for why that check is what
 * makes the indirection worth anything.
 */
const SEEDED_BOARD_FEE = 725

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
  // they are selected by label.
  await addHorse(supabase, barn.id, APPLE)
  await addHorse(supabase, barn.id, BUTTER)

  // Load-bearing: the boarding form's fee prefill is `String(defaultBoardFee ?? '')`, seeded from
  // `getBarnDefaultBoardFee`. If this write did nothing the field would still be non-empty (the
  // column default), so the prefill test would measure the column rather than the prefill — see
  // SEEDED_BOARD_FEE. `updateBarnSettings` fails closed on a zero-row update via `.single()`,
  // which is why no separate `mustAffect` is written here.
  const updated = await updateBarnSettings(supabase, barn.id, { defaultBoardFee: SEEDED_BOARD_FEE })
  seededBoardFee = updated.default_board_fee

  // The half `.single()` does NOT cover, and without which the whole indirection is decorative:
  // `.single()` proves a barn row was matched, not that THIS COLUMN changed. `updateBarnSettings`
  // builds its update object behind `if (opts.defaultBoardFee !== undefined)`, so a regression
  // dropping that key issues `.update({})`, matches the row, returns it happily — and hands back
  // the column default 1000. `seededBoardFee` would then silently become the very value
  // SEEDED_BOARD_FEE was chosen to be distinguishable from, and the prefill test would agree with
  // a broken prefill. Comparing the two is what closes it.
  if (seededBoardFee !== SEEDED_BOARD_FEE) {
    throw new Error(
      `seeding the barn's default board fee did not take: asked for ${SEEDED_BOARD_FEE}, the row came back with ${seededBoardFee} — the prefill assertion downstream would be measuring the column default rather than the prefill`
    )
  }
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/** A query-less protected page, so every `waitForURL` below is a real sync point (fact 3). */
const startUrl = () => `/barn/${barn.slug}/horses`

const navLink = (page: Page, label: string) =>
  desktopNav(page).getByRole('link', { name: label, exact: true })

/**
 * The agreements list's cards. `Card href=…` renders an anchor.
 *
 * Only ONE of the two qualifiers is load-bearing, and it is not the obvious one. The `<main>` scope
 * is belt-and-braces: the nav's two agreements entries (`buildNavLinks` emits exactly two, Leases
 * and Boarding) are `…/agreements?kind=…` with no trailing slash, so `href*="/agreements/"` would
 * exclude them on the substring alone.
 *
 * The `:not(…/new…)` half is the one doing the work, and it is the case that differs in the state
 * that makes this locator interesting: the page's own Add Lease (or Add Boarding) button is a
 * `<Button href>` pointing at `/barn/<slug>/agreements/new?kind=…`, which IS inside `<main>` and
 * DOES contain `/agreements/`. Without the exclusion an EMPTY list reads as one card — which is
 * exactly the state the two save tests and the kind-scoping test measure against. It cannot be
 * over-broad in the other direction either: agreement ids are hex UUIDs and cannot contain "new".
 */
const agreementCards = (page: Page) =>
  page.locator('main a[href*="/agreements/"]:not([href*="/agreements/new"])')

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * Both halves of "highlighted" for both agreements nav entries, in one value.
 *
 * `checklist-phase1-nav-responsive.spec.ts`'s `highlightOf`, copied rather than hoisted (still a
 * local copy now that `e2e/support/nav.ts` exists: the two copies differ in their
 * missing-attribute default — `'none'` here, `null` there — so neither is canonical for the
 * other). Both entries are read, not just the one a given test names, for the reason that file's
 * `highlightMap` gives: a regression applying the active class to every link while leaving
 * `aria-current` correct is exactly its "other links are highlighted" case, and an
 * `aria-current`-only read calls that page clean. The computed weight is the half that catches it.
 *
 * Not literally non-retrying — `getAttribute` and `evaluate` both auto-wait for the element to
 * attach, and under `actionTimeout: 0` that wait is unbounded. It carries no *matcher* retry, which
 * is what matters: the comparison happens once per `expect.poll` invocation and the poll owns the
 * pacing. The practical consequence is only diagnostic — if a nav link never attaches, the enclosing
 * poll is abandoned at its deadline and reports `undefined` rather than the state it found.
 */
async function highlightOf(link: Locator): Promise<{ ariaCurrent: string; fontWeight: string }> {
  return {
    ariaCurrent: (await link.getAttribute('aria-current')) ?? 'none',
    fontWeight: await link.evaluate((el) => getComputedStyle(el).fontWeight),
  }
}

/**
 * The two *visible* strings the resolved `kind` decides, as full match sets.
 *
 * `agreements/page.tsx` serves both kinds from one file and its `kind` reaches five places —
 * `title`, `label`, `addHref`, every card's href, and the `getAgreementsByBarn(barn.id, kind)`
 * query that decides which agreements the page lists at all. These two are simply the ones a
 * reader sees; the query is what the kind-scoping test at the end of this file is for, and the
 * hrefs are what `openAddForm` and `cardHrefs` ride on. So this is "the kind the page rendered",
 * not "the only trace of the kind".
 *
 * Read as arrays rather than first-matches so a second heading or a second Add control fails here
 * instead of being silently dropped. The `Add (Lease|Boarding)` name pattern is deliberately
 * kind-agnostic: a locator naming the expected label would find nothing and read as an empty array
 * on the very regression this is for.
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

/** The URL as the checklist writes it — path plus query, no origin. */
const pathAndQuery = (page: Page) => new URL(page.url()).pathname + new URL(page.url()).search

/**
 * Every card href on the list currently rendered, in DOM order.
 *
 * The inline `waitFor` before `evaluateAll` is `support/read.ts`'s own reasoning applied to an
 * attribute read: a not-yet-rendered container yields `[]`, and `[]` must never reach an
 * expectation as a shortened answer. That wait is what makes non-emptiness structural, and it holds
 * at all four call sites regardless of their shape — two wrap this in `expect.poll` against a
 * non-empty expectation, and the other two (the save tests' captures) are bare awaits standing
 * behind a `toHaveCount(1)` that has already settled the same locator.
 */
async function cardHrefs(page: Page): Promise<string[]> {
  const cards = agreementCards(page)
  await cards.first().waitFor()
  return cards.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
}

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/** Any agreements URL, kind or no kind — the weakest sync point that still proves we navigated. */
const anyAgreementsUrl = () => new RegExp(`/barn/${barn.slug}/agreements`)

/**
 * Lands on `/horses`, waits out hydration, and clicks a nav entry — without waiting on where it
 * goes, which is deliberately left to the caller.
 *
 * The hydration barrier is explained at length in the header block: without it the click is a plain
 * document navigation and every highlight read downstream measures server-rendered markup that
 * React 19 will never reconcile (fact 7). With it, the click is a soft navigation and the nav state
 * read afterwards is the one `DesktopNavLinks` computed on the client — the derivation this file
 * exists to pin.
 */
async function clickNavEntry(page: Page, label: string): Promise<void> {
  await page.goto(startUrl())
  await waitForBarnPageHydrated(page)
  await navLink(page, label).click()
}

/**
 * Clicks a nav entry and lands on its kind-scoped list.
 *
 * `waitUntil: 'commit'` and no explicit timeout: `navigationTimeout` defaults to unbounded, so a
 * hand-written number could only tighten it (#1211). Bounded by the test's own budget.
 *
 * NOT used by the two URL tests, and that is the point of the split. This pattern pins the query,
 * so any test reaching its body already knows the URL ends `?kind=<kind>` — an assertion after it
 * could only fail on a path prefix, and the real failure would surface as a timeout in here rather
 * than as the assertion the checklist line names. Those two tests take `clickNavEntry` and a
 * kind-agnostic wait instead, leaving the query claim to their own expectation.
 */
async function openKindList(page: Page, label: string, kind: string): Promise<void> {
  await clickNavEntry(page, label)
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

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

type Captured = { href: string; id: string }
type CreatedAgreements = { barnId: string; byKind: Record<string, Captured> }

let created: CreatedAgreements | null = null

/**
 * The agreement id inside a card href, and the guard that a capture is a card href at all.
 *
 * `evaluateAll` can legitimately hand back a shortened array if the list re-renders between the
 * `waitFor` and the read, so `const [href] = await cardHrefs(page)` is typed `string` but can be
 * `undefined` at runtime (`noUncheckedIndexedAccess` is off). Parsing here rather than trusting the
 * destructure is what makes that fail in the save test that produced it, instead of surfacing three
 * tests later as a missing capture and blaming the wrong test.
 */
function agreementIdFrom(kind: string, href: string | undefined): string {
  const match = new RegExp(`/agreements/(${UUID})\\?kind=${kind}$`).exec(href ?? '')
  if (!match) {
    throw new Error(
      `the card on the ${kind} list after saving is not an agreement link: ${JSON.stringify(href)}`
    )
  }
  return match[1]
}

/**
 * The card href a save test read off the list its redirect landed on.
 *
 * The barn-id comparison is `checklist-phase2-managed-stubs.spec.ts`'s `liveStubId` guard. Defence
 * in depth rather than a live safety property, and stated that way rather than overclaimed: fact
 * 15's worker restart re-runs every `beforeAll` and would re-seed a different barn underneath these
 * captures, but `playwright.config.ts` sets `retries: 0` and this is a `describe.serial` block, so a
 * failure *skips* the rest of the chain instead of re-running it. The branch should therefore be
 * unreachable. It is kept because "should be unreachable" is an argument about two config values
 * that live in another file, and the failure it would otherwise produce — set equality against a
 * dead barn's ids — reads as a kind-scoping regression rather than as a restart.
 */
function liveCapture(kind: string): Captured {
  if (!created) {
    throw new Error(
      `no captured card for kind=${kind} — it is read by the save test earlier in this serial chain, which must run first`
    )
  }
  if (created.barnId !== barn.data.barn.id) {
    throw new Error(
      `the captured cards belong to a torn-down barn (${created.barnId} != ${barn.data.barn.id}) — a worker restart re-seeded underneath them; re-run the whole spec file`
    )
  }
  const capture = created.byKind[kind]
  if (!capture) throw new Error(`no card captured for kind=${kind}`)
  return capture
}

const liveHref = (kind: string) => liveCapture(kind).href
const liveId = (kind: string) => liveCapture(kind).id

function capture(kind: string, href: string | undefined): void {
  const id = agreementIdFrom(kind, href)
  if (!created || created.barnId !== barn.data.barn.id) {
    created = { barnId: barn.data.barn.id, byKind: {} }
  }
  created.byKind[kind] = { href: href as string, id }
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
  // `clickNavEntry` plus a KIND-AGNOSTIC wait, deliberately not `openKindList`. `openKindList`'s
  // `waitForURL` pattern ends `\?kind=lease$`, so a test that used it would already know the answer
  // before its own expectation ran — the claim would be carried by the helper, and a regression
  // would surface as a timeout inside it rather than as this line's assertion. Waiting only on
  // "some agreements URL" leaves the whole query claim here, where the checklist puts it.
  //
  // A whole-URL equality, not a containment: `toContain` would also accept `?kind=lease&kind=board`
  // or a stray extra param. The pathname half is what stops it passing on any other page carrying
  // the param — including `/agreements/new?kind=lease`, which the kind-agnostic wait now admits.
  test('the_lease_list_url_carries_kind_lease @manager', async ({ page }) => {
    await clickNavEntry(page, LEASES)
    await page.waitForURL(anyAgreementsUrl(), { waitUntil: 'commit' })

    await expect.poll(() => pathAndQuery(page)).toBe(`/barn/${barn.slug}/agreements?kind=lease`)
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
  // WHAT THIS ASSERTS, STATED NARROWLY, because the checklist line is a list of *actions* ending in
  // one verb: the form accepted rider Dana, horse Apple, fee $150 and cadence Monthly, and Save
  // succeeded — evidenced by the redirect (every rejection path re-renders with a `role="alert"`
  // and does not navigate) and by the lease list then holding exactly one card.
  //
  // It does NOT assert what was persisted. Nothing here reads the stored cadence, fee or start
  // date back, so a `createAgreementAction` that wrote the wrong cadence or a mangled fee would
  // pass. That is deliberate and not a gap in this slice: the four "Each of those cards shows its
  // rider / horse / fee / **Active** status" lines immediately below this block in the checklist
  // are the next slice's, and `getAgreementStatusLabel` renders cadence as exactly that Active vs
  // Complete distinction. Selecting cadence explicitly (rather than riding `defaultValue="monthly"`)
  // therefore constrains what the form SENT, not what the row holds — the checklist's action,
  // performed as written, so a changed default cannot quietly change what this test submits.
  //
  // The start date is left at the form's own prefill (`barnToday(barn.timezone)`, passed as
  // `defaultStartDate`), which is what "start date today" means as an instruction. It is not
  // asserted either — and that is the point: this test computes no date at all and so stays clear
  // of the barn-vs-host zone axis (fact 12), which cannot be closed from inside a spec.
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
  //
  // Same kind-agnostic shape as its lease twin, and the same reason. Strictly the sharper of the
  // two: `agreements/page.tsx` resolves anything that is not `board` to `lease`, so a query lost
  // entirely still renders a plausible page here, and only the URL says so.
  test('the_board_list_url_carries_kind_board @manager', async ({ page }) => {
    await clickNavEntry(page, BOARDING)
    await page.waitForURL(anyAgreementsUrl(), { waitUntil: 'commit' })

    await expect.poll(() => pathAndQuery(page)).toBe(`/barn/${barn.slug}/agreements?kind=board`)
  })

  // "**Add Boarding** → select rider Emery, horse Butter — fee is pre-filled from the barn's
  // default board fee → Save"
  //
  // One test for one checkbox. The prefill and the save are not separable as *actions*: the field
  // this reads is the field the submit sends, so reading it and then submitting it unchanged is the
  // line performed as written. Split across two tests, the save half would have to type a fee of
  // its own, and the line's "fee is pre-filled … → Save" would become two unrelated things.
  //
  // Stated precisely, because it is easy to overclaim here: submitting the field unchanged does not
  // make this test a check on what was STORED — nothing reads the persisted fee back, so a save
  // that mangled it would pass. The assertion is the prefill; the save's contribution is that it
  // succeeded. "Each of those cards shows its fee" is the next slice's line.
  //
  // The prefill expectation is `updateBarnSettings`' returned `default_board_fee`, never the
  // literal that was passed in and never a hardcoded number — and the seed callback checks the two
  // agree, which is what stops that indirection from quietly degrading to the column default (see
  // SEEDED_BOARD_FEE). Compared numerically because the field is `type="number"`: its string form
  // is a rendering detail, and `Number('')` is 0, which cannot collide with a non-zero seed.
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
  // THE DISTINCT-IDS ASSERTION IS WHAT STOPS THE OTHER TWO BEING CIRCULAR — do not delete it as a
  // redundant sanity check. Each list is compared against an href captured off THAT SAME LIST, so
  // by themselves the two set equalities never establish that the two saves produced two different
  // agreements — which is the whole of what "their respective kind-scoped lists" claims. Concretely:
  // a `getAgreementsByBarn(barn.id, 'lease')` that ignored `kind` would serve the lease to both
  // lists, and because a card's `?kind=` comes from the PAGE's kind rather than the agreement's
  // (`agreements/page.tsx`: `href={…/agreements/${a.id}?kind=${kind}}`), the boarding save would
  // have captured `…/<leaseId>?kind=board` — a plausible-looking href that both equalities below
  // then match perfectly. Ten green tests, the boarding agreement displayed nowhere. Comparing the
  // *ids* is what detects it; comparing the hrefs would not, since their query halves differ.
  //
  // Ids rather than the rider/horse names the cards render: an agreement id is unique by
  // construction, and the card's rendered content is the next slice's subject rather than this
  // one's. The uniqueness argument is only worth something once the two ids are known to be two,
  // which is exactly what the first line below establishes.
  test('both_agreements_appear_only_in_their_own_kind_scoped_list @manager', async ({ page }) => {
    expect(liveId('lease')).not.toBe(liveId('board'))

    await openKindList(page, LEASES, 'lease')
    await expect.poll(() => cardHrefs(page)).toEqual([liveHref('lease')])

    await openKindList(page, BOARDING, 'board')
    await expect.poll(() => cardHrefs(page)).toEqual([liveHref('board')])
  })
})
