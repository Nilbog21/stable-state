// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/nav-active.ts
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
//
// Phase 2's agreements block, the lease detail and edit stretch
// (checklists/pre-release/phase-2-manager-seeding.md, from "Click the monthly lease's card → its
// detail page shows the rider" through "Change the fee → Save → the new fee is reflected in the
// list"): the five fields the detail page renders, its charges table, the nav highlight on both
// the detail and the edit page, the four fields the edit page renders read-only, and a fee change
// round-tripping to the list.
//
// ## What is NOT declared above, and why the omission is the considered answer
//
// This file asserts on several rendered strings it does not own, and every one of them is produced
// under `src/lib/`: `formatFee`'s "$450.00" (`format-currency.ts`), `formatChargePeriod`'s
// "Aug 2026" (`format-date.ts`), `getAgreementStatusLabel`'s "Active"/"Complete" (`db/agreements.ts`)
// and `resolveMemberNames`' "Test Rider" (`db/member-names.ts`). By `docs/scripts.md`'s
// discriminating question — "could an assertion in this file fail if that module changed?" — all
// four are plainly yes, and declaring them looks correct.
//
// They are deliberately left out. `scripts/select-specs.sh`'s `ALWAYS_FULL` array already contains
// `src/lib/**` (alongside `src/components/**`, `src/app/actions/**` and `e2e/support/**`), so a
// diff touching any of them forces `mode=full`, which runs every spec in the suite including this
// one. The declarations would therefore buy nothing for *selection*, which is the only thing
// `covers:` drives. Worse, a redundant glob invites the next reader to believe selection depends on
// it and to preserve it through a refactor that could otherwise drop it safely.
//
// The four `(protected)/` globs above are the opposite case and every one is load-bearing:
// `nav-active.ts`, `nav-links.ts`, `DesktopNavLinks.tsx` and `NavigationBlocker.tsx` sit under no
// `ALWAYS_FULL` entry (only `(protected)/layout.tsx` is listed, as an exact path) and under the
// route glob of no spec that would otherwise select. `NavigationBlocker.tsx` is the one that is
// easy to miss and is declared here because the review round caught its absence: `DesktopNavLinks`
// does not render an anchor at all — it renders `BlockingLink`, which is what forwards the
// `aria-current` and `className` the two highlight tests read — and `AgreementForm` arms
// `useUnsavedChangesGuard` from the same module, which sits in the path of the fee round-trip.
//
// ## Every one of these thirteen checklist lines is TRUE against shipped behaviour
//
// Stated because a clean audit is a real outcome and reads identically to not having audited.
// Each line was checked against the code before a test was written for it; none needed narrowing,
// rewriting or a `(manual)` downgrade. Two deserve their reasoning recorded, because both turn on
// the `?kind=` query and the sibling slice #1458 found a *neighbouring* line where the same claim
// is false:
//
//   - "The nav still shows **Leases** highlighted (not Boarding) on the detail page" is true, and
//     it is true *because of how the checklist arrives*. `isNavLinkActive` closes with
//     `hrefQuery === undefined || currentQuery === hrefQuery`, and both agreements nav entries
//     carry a query (`nav-links.ts`). The list card's href is
//     `` `/barn/${slug}/agreements/${a.id}?kind=${kind}` `` (`agreements/page.tsx`), so clicking it
//     puts `kind=lease` on the URL, `pathMatches` holds through the `startsWith('…/agreements/')`
//     branch, and Leases matches exactly while Boarding fails. #1458's case is the member-detail
//     card, whose href carries **no** query at all — there `currentQuery` is `''`, both entries
//     fail, and NEITHER highlights. Same route prefix, opposite outcomes, and the difference is
//     entirely the entry point. That is why the two HIGHLIGHT tests reach their page by clicking —
//     for them a hand-written `?kind=lease` would be asserting a query string the test had itself
//     supplied. The other eleven tests `goto` a URL this file composes, `?kind=lease` and all, and
//     that is fine precisely because the query is irrelevant to what they assert: none of them
//     reads the nav.
//   - "**Edit** button top-right → the nav still shows **Leases** highlighted on the edit page too"
//     is true for the same mechanism one level deeper: the Edit href is
//     `` `…/agreements/${id}/edit?kind=${agreement.kind}` `` (`[id]/page.tsx`), so the query
//     survives the second hop. Note the kind there comes from the *agreement*, not from the current
//     URL, so this hop is the app's own answer either way.
//
// ## The decoy lease is not surplus fixture — it is what stops five of these tests being circular
//
// The seed creates TWO leases: the subject, and a decoy differing in **all five rendered fields**
// (different rider, horse, fee, cadence, and therefore status). Nothing in the acceptance criteria
// asked for it.
//
// Without it, "its detail page shows the rider" cannot distinguish *shows its own agreement* from
// *shows an agreement* — the barn would hold exactly one, so any rider name the page rendered would
// be the right one, and a page that ignored its `id` param entirely would pass. A mutation pass
// cannot detect that: every assertion still fails when broken, which is the only question a mutant
// answers. It is the same shape that shipped once already in this batch. With the decoy, each of
// the five expectations is one of two live possibilities and the test genuinely binds to its
// subject. It does the same work for the last test, where the list holds two cards and the
// assertion pins both — so "the new fee is reflected in the list" cannot be satisfied by a list
// that re-rendered every card with the same number.
//
// The decoy is `cadence: 'one_time'` specifically so that the two weakest fields discriminate too:
// cadence and status are each two-valued (`Monthly`/`One time`, `Active`/`Complete` via
// `getAgreementStatusLabel`), so a same-cadence decoy would have left both assertions unable to
// tell the subject from its neighbour.
//
// ## Why `createAgreement` is called directly
//
// `support/fixtures.ts`'s `addLeaseCharge` cannot express this state: it hard-codes
// `cadence: isBoard ? 'monthly' : 'one_time'`, so every `kind: 'lease'` agreement it produces is
// one-time, and the checklist's subject is the **monthly** lease. Adding a cadence option to that
// builder is out of the question — `e2e/support/**` is in `select-specs.sh`'s `ALWAYS_FULL`, so one
// edit there forces `mode=full` and takes `/fableFleet`'s fleet-wide mutex, stalling every other
// worker. Calling the DAL function the UI itself calls (`agreements/actions.ts`'s
// `createAgreementAction` invokes exactly this) is the batch's standing ruling for reproducing a
// predecessor's end state. Importing a DAL function into a spec is precedented — `fixtures.ts`
// imports this very function, `checklist-phase2-agreements-charges.spec.ts` imports it directly,
// and `checklist-phase4-expenses-form.spec.ts` imports `updateExpense`. (Not "both merged sibling
// slices": `checklist-phase2-agreements-create.spec.ts` imports nothing from `@/lib/db`. The review
// round caught that overstatement.)
//
// No `startDate` is passed. `create_agreement_with_first_charge` derives the barn's own day from
// `barns.timezone` and COALESCEs `p_start_date` to it
// (20260806131220_agreement_charge_period_in_barn_timezone.sql, #1361 — the original definition in
// 20260716005943_release3_functions.sql used `current_date` and is NOT what runs), and it derives a
// monthly charge's `period` from that same barn-frame day. So omitting it keeps every date in this
// file inside the barn's frame with no host-zone arithmetic to get wrong (fact 12).
//
// ## Hydration barriers go before the CLICK, and nine of the thirteen tests deliberately have none
//
// A card or Edit-button click dispatched before React has hydrated is **not lost**: `Card` and
// `Button` both render a plain `next/link` `<a href>`, so the browser performs an ordinary document
// navigation and the page that loads is SERVER-rendered. `aria-current` is an attribute, and React
// 19 does not reconcile a mismatched attribute during hydration (fact 7), so the server's value
// then persists for the rest of the test. Every highlight read downstream would be measuring SSR's
// `isNavLinkActive` result rather than the client derivation `DesktopNavLinks` computes from
// `usePathname`/`useSearchParams` — and it would PASS, because the server's answer is usually the
// right one. The barrier must therefore precede the click, on the ORIGIN page; adding one after
// arrival cannot help, since by then there is nothing left to reconcile.
//
// So `openLeaseDetailByCard` (tests 1 and 7) and the edit-page hop (test 8) hydrate first and click
// second, making both hops soft navigations — which is also what a manager clicking through a live
// session does. `waitForBarnPageHydrated` is the right barrier: it drives the nav bar's avatar menu,
// a control in the same React root as the page but one no test here asserts on, so it can never
// stand in for the thing a test is claiming.
//
// Barriers therefore sit in exactly four tests: 1 and 7 (through `openLeaseDetailByCard`), 8, and 13.
//
// The other NINE have none, on purpose, and for one reason: they `goto` a page and read markup the
// server already rendered, with no click and no client-computed value anywhere in the claim. That
// covers the five detail-page reads (2-6) as well as the four read-only tests (9-12) — the read-only
// ones being the case worth stating, since "a control is absent" is absent pre-hydration too, as
// `AgreementForm` renders the same `<p>` on the server. A barrier could not change any of those
// answers; adding one would be cargo cult.
//
// Test 13 needs its barrier for fact 9's reason rather than fact 7's: its fee field is
// React-*controlled* (`value={fee}` + `onChange`), so a `fill()` landing before hydration moves the
// DOM value and the controlled re-render then discards it.
//
// ## Rules 4 and 5
//
// Rule 5 (`mustAffect` on load-bearing setup mutations, #1435) has nothing to bind: the seed
// contains no `.update(` and no `.delete(` — every row is created by the RPC in its final shape.
// Stated rather than left silent, since "no mustAffect in the file" otherwise reads identically to
// having forgotten it. The one service-role read the seed does make is a *precondition*, guarded by
// `mustSucceed(...single())`, which throws on both zero rows and more than one.
//
// Rule 4 (#1434) binds at SIX sites, not the four it is tempting to name. The four read-only tests
// carry a `controls: 0` half; the two highlight tests carry `INERT('Boarding')`, whose
// `aria-current: 'none'` is equally an absence; and the charges table's single-element `toEqual` is
// an absence claim about a second row. The mechanism is the same at all of them and it satisfies
// the rule more tightly than the rule asks: the anchor is not merely in the same test but in the
// same *assertion*. Each reads a compound value — `{ value, controls }`, a two-row nav map, a
// one-row charge list — so the expectation is non-empty and `expect.poll` retries against it rather
// than being satisfied on its first poll the way a bare `toHaveCount(0)` would be. A region that
// never rendered fails on its container's `waitFor`; a read pointed at the wrong element yields the
// wrong value rather than a passing zero.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse } from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'
import { HIGHLIGHTED, INERT, navHighlightMap } from './support/nav'
import { mustSucceed } from '@/lib/db/service-role'
import { createAgreement } from '@/lib/db/agreements'
import type { Agreement } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// What the checklist's names resolve to in this barn
// ---------------------------------------------------------------------------

/**
 * The `rider` login, as `resolveMemberNames` renders it (`${first_name} ${last_name}`).
 *
 * The decoy lease is seeded on the `rider2` managed stub instead, which renders "Test Sutton" —
 * not named as a constant here because no assertion reads it. What makes the decoy's *rider* a
 * live alternative is the seed's distinctness guard, which compares the two agreements' own
 * `rider_id`s rather than their rendered names.
 */
const SUBJECT_RIDER = 'Test Rider'

const SUBJECT_HORSE = 'Bramble'
const DECOY_HORSE = 'Clover'

/**
 * Whole numbers, all three distinct. `agreements.fee` and `agreement_charges.fee` are both
 * unconstrained `NUMERIC`. Whole numbers are chosen so no rendered string depends on how a scale is
 * carried — not because a scaled value would round trip ambiguously, which the review round
 * established it cannot: supabase-js JSON-parses a PostgREST numeric into a JS number, so 512.50
 * arrives as 512.5 and `String()` can never produce "512.50". Distinctness is the load-bearing
 * property; the earlier version of this comment claimed a hazard that does not exist.
 */
const SUBJECT_FEE = 450
const DECOY_FEE = 375

/** Typed into the edit form by the last test. Differs from both seeded fees, so no card can match it by accident. */
const UPDATED_FEE = 615

/**
 * The one sanctioned numeric timeout (`support/test.ts`'s timeout block, #1469): a web-first
 * `expect` matcher runs on expect's own 5s default, which `test.slow()` does NOT raise — it triples
 * the *test* timeout and touches nothing else. So a number here LOOSENS, where a number on a
 * `waitFor`/`waitForURL` could only tighten (#1211).
 *
 * Applied at the one post-write read in this file. Same value and reasoning as both merged phase-2
 * agreement siblings.
 */
const SETTLE_AFTER_WRITE = 15_000

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

/** The monthly lease every test below is about. */
let subjectLease: Agreement
/** Its neighbour, differing in all five rendered fields — see the header for why it exists. */
let decoyLease: Agreement
/** The charge `create_agreement_with_first_charge` wrote for the subject, read back service-role. */
let subjectCharge: { period: string; fee: number }

const barn = withBarn('phase2-agreements-detail', async ({ supabase, barn, members }) => {
  const subjectHorse = await addHorse(supabase, barn.id, SUBJECT_HORSE)
  const decoyHorse = await addHorse(supabase, barn.id, DECOY_HORSE)

  // Monthly — the cadence the checklist's lease carries, and the one `addLeaseCharge` cannot
  // produce (it pins every lease to `one_time` so the charge can be backdated). See the header.
  subjectLease = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider.membershipId,
      horseId: subjectHorse.id,
      fee: SUBJECT_FEE,
      kind: 'lease',
      cadence: 'monthly',
    },
    supabase
  )

  // The decoy. `one_time` so that the cadence and status fields — the only two-valued ones on the
  // detail page — discriminate as well as the three free-form fields do.
  decoyLease = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider2.membershipId,
      horseId: decoyHorse.id,
      fee: DECOY_FEE,
      kind: 'lease',
      cadence: 'one_time',
    },
    supabase
  )

  // THE DECOY IS ONLY WORTH ANYTHING IF IT IS ACTUALLY DIFFERENT — do not delete this as a
  // redundant sanity check. Five tests below rely on the decoy making their expectation one of two
  // live possibilities rather than the only value the page could produce, and every one of them
  // still passes if the two agreements are identical. A mutation pass cannot see it either: each
  // assertion remains perfectly falsifiable while having quietly stopped binding to its subject,
  // which is the exact failure this fixture exists to prevent. So the claim "the decoy differs" is
  // made observable here, in the same place it is established, rather than merely intended.
  //
  // Compared field by field against the rows the RPC returned, not against this file's constants:
  // that is what makes it a check on what the database actually holds. `cadence` is included
  // because the status field is derived from it (`getAgreementStatusLabel`), so one comparison
  // covers the two two-valued fields at once.
  const collisions = (
    [
      ['rider', subjectLease.rider_id === decoyLease.rider_id],
      ['horse', subjectLease.horse_id === decoyLease.horse_id],
      ['fee', subjectLease.fee === decoyLease.fee],
      ['cadence', subjectLease.cadence === decoyLease.cadence],
    ] as const
  )
    .filter(([, collided]) => collided)
    .map(([field]) => field)

  if (collisions.length) {
    throw new Error(
      `the decoy lease does not differ from the subject in ${collisions.join(', ')} — the detail-page ` +
        `tests would no longer distinguish "shows its own agreement" from "shows an agreement", and ` +
        `would still pass`
    )
  }

  // The precondition the charges-table test asserts against, read back from the database rather
  // than computed. The checklist's claim is about what the RPC actually produced, so a period
  // string derived in this file would be asserting the spec's own arithmetic against itself —
  // and the two disagreeing is precisely the bug that line exists to catch.
  //
  // `.single()` is the guard: it throws on zero rows AND on more than one, so it carries both the
  // "a charge was auto-generated at all" precondition and the "exactly one" half of "the FIRST
  // auto-generated charge" that the assertion's array equality then re-states against the page.
  subjectCharge = mustSucceed<{ period: string; fee: number }>(
    await supabase
      .from('agreement_charges')
      .select('period, fee')
      .eq('barn_id', barn.id)
      .eq('agreement_id', subjectLease.id)
      .single(),
    'read back the auto-generated first charge for the subject lease'
  )

  // The fee half of that read-back would otherwise be self-agreeing, which the review round caught:
  // `ChargesTable` seeds its input from `agreement_charges.fee` and this read comes from the same
  // column, so asserting one against the other passes however wrong the stored value is. The page
  // assertion is therefore made against `SUBJECT_FEE` — the number handed TO the RPC — and this
  // guard is what connects the two, by pinning that the RPC actually stored what it was given.
  // Deliberately not folded into the page assertion: "the RPC stored the right fee" is a claim
  // about the write, and it belongs where the write happened rather than three tests later.
  if (subjectCharge.fee !== SUBJECT_FEE) {
    throw new Error(
      `create_agreement_with_first_charge stored ${subjectCharge.fee} on the first charge, not the ` +
        `${SUBJECT_FEE} it was given — the charges-table assertion downstream would be comparing the ` +
        `column against itself`
    )
  }
})

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const leaseListUrl = () => `/barn/${barn.slug}/agreements?kind=lease`

/** As the list card renders it — the `?kind=lease` is the app's, not this file's. */
const cardHref = (agreement: Agreement) => `/barn/${barn.slug}/agreements/${agreement.id}?kind=lease`

const detailUrl = () => cardHref(subjectLease)
const editUrl = () => `/barn/${barn.slug}/agreements/${subjectLease.id}/edit?kind=lease`

/** Kind-agnostic: the query is the app's answer at every hop, never a pattern this file imposes. */
const atDetailPage = () => new RegExp(`/barn/${barn.slug}/agreements/${subjectLease.id}(\\?|$)`)
const atEditPage = () => new RegExp(`/barn/${barn.slug}/agreements/${subjectLease.id}/edit(\\?|$)`)
const atLeaseList = () => new RegExp(`/barn/${barn.slug}/agreements\\?kind=lease$`)

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/**
 * The detail page's whole `<dl>` as a label → value map.
 *
 * Read as a map rather than field by field so that every test shares one non-retrying read whose
 * emptiness is structural: a `<dl>` that never rendered yields `{}` and fails the enclosing poll,
 * rather than a per-field locator timing out with nothing said about the page. `expect.poll` owns
 * the pacing at every call site; the inline `waitFor` is what stops `{}` reaching an expectation
 * as a shortened answer (`support/read.ts`'s reasoning, applied to a structured read).
 *
 * `textContent` rather than `innerText`: the `<dt>`s are uppercased in CSS, so the laid-out text
 * would read "RIDER" where the source says "Rider".
 */
async function detailFields(page: Page): Promise<Record<string, string>> {
  const items = page.locator('main dl > div')
  await items.first().waitFor()
  const entries = await items.evaluateAll((els) =>
    els.map((el) => [el.querySelector('dt')?.textContent ?? '', el.querySelector('dd')?.textContent ?? ''])
  )
  return Object.fromEntries(entries)
}

/**
 * Every charges-table row as the page renders it: the period cell's text and the fee cell's
 * *input value*.
 *
 * The fee is an `<input>` and the payment type a `<select>`, so a row's `textContent` contains
 * neither — reading the input's `value` is the only way to see the fee the page actually shows.
 */
async function chargeRows(page: Page): Promise<{ period: string; fee: string }[]> {
  const rows = page.locator('main tbody tr')
  await rows.first().waitFor()
  return rows.evaluateAll((trs) =>
    trs.map((tr) => ({
      period: tr.querySelector('td')?.textContent ?? '',
      fee: tr.querySelector('input')?.value ?? '',
    }))
  )
}

/**
 * One edit-page field, as the pair that makes "read-only" a falsifiable claim: the text it
 * displays, and how many editable controls sit in it.
 *
 * Both halves in one value on purpose. Asserting only `controls: 0` is satisfied by a field that
 * never rendered at all, and asserting only the displayed value is equally true of an editable
 * field — the checklist's line is the conjunction, and so is this. The `waitFor` on the container
 * is the floor beneath both: a field whose div is absent fails here rather than reporting a
 * plausible-looking zero.
 *
 * The field is located by its own label element (`exact: true`, so `<span>Rider</span>` matches and
 * `<p>Test Rider</p>` does not) rather than by position, because position is exactly what a
 * regression reordering the form would change without anyone noticing.
 */
async function editField(page: Page, label: string): Promise<{ value: string; controls: number }> {
  const field = page
    .locator('main form > div')
    .filter({ has: page.getByText(label, { exact: true }) })
  await field.waitFor()
  return field.evaluate((el) => ({
    value: el.querySelector('p')?.textContent ?? '',
    controls: el.querySelectorAll('input, select, textarea').length,
  }))
}

/**
 * Every lease card on the list, as href → the fee-and-status line it renders.
 *
 * Keyed by href so the two cards are told apart by identity rather than by DOM order, and so the
 * expectation names which agreement is supposed to show which fee. `p span` reaches the
 * `<span>{formatFee(a.fee)} · {status}</span>` and deliberately not the `<p>` itself: an amber
 * `Unpaid` `Badge` is a sibling inside that same `<p>`, so reading the paragraph would fold a
 * badge's text into the value. (No badge can appear here — `getUnpaidAgreementIds` filters
 * strictly before the barn's current month and both charges are in it — but the locator should not
 * depend on that staying true.)
 *
 * The `:not(…/new…)` half of the card selector is the load-bearing one, and it is the case that
 * differs in the state that makes the locator interesting: the page's own `Add Lease` button is a
 * `<Button href>` pointing at `/agreements/new?kind=lease`, which is inside `<main>` and does
 * contain `/agreements/`. Without the exclusion an EMPTY list would read as one card. It cannot be
 * over-broad in the other direction: agreement ids are hex UUIDs and cannot contain "new".
 */
async function listCardLines(page: Page): Promise<Record<string, string>> {
  const cards = page.locator('main a[href*="/agreements/"]:not([href*="/agreements/new"])')
  await cards.first().waitFor()
  const entries = await cards.evaluateAll((els) =>
    els.map((el) => [el.getAttribute('href') ?? '', el.querySelector('p span')?.textContent ?? ''])
  )
  return Object.fromEntries(entries)
}

/** Leases highlighted, Boarding not — the claim both nav checkboxes make, in DOM order. */
const LEASES_ONLY = [HIGHLIGHTED('Leases'), INERT('Boarding')]

/**
 * The page's own `<h1>` read together with the nav highlight, as one value — and this pairing is
 * the whole reason the two highlight tests are not vacuous.
 *
 * THE HAZARD, because it is invisible and a green run is no evidence against it: both highlight
 * tests start on a page where the expected answer is ALREADY TRUE. Test 7's origin is the lease
 * list (`/agreements?kind=lease`, so Leases is highlighted there) and test 8's is the lease detail
 * page (same query, same verdict). `waitForURL(…, { waitUntil: 'commit' })` resolves when the
 * navigation commits, which says nothing about the destination having rendered, and `expect.poll`
 * returns on its FIRST successful read. So a nav read taken straight after the hop can be satisfied
 * by the origin's markup, and the test would pass without the destination's nav ever being
 * consulted — including in exactly the regression the checklist line names, where
 * `isNavLinkActive` stops matching the nested `…/agreements/<id>` path and the correct answer
 * becomes "neither highlighted".
 *
 * The heading is the discriminator, and it works because it is destination-ONLY: the list renders
 * `<h1>Leases</h1>`, the detail page `<h1>Lease Detail</h1>`, the edit page `<h1>Edit Lease</h1>`
 * (`agreements/page.tsx`, `[id]/page.tsx`, `[id]/edit/page.tsx`). Folding it into the same polled
 * value means the poll cannot succeed until the destination has actually rendered, so the nav map
 * in that same read is the destination's. A separate `expect` before the poll would NOT do this —
 * it would settle the heading and then leave the nav free to be read a moment later, which is the
 * "a settle that is not a barrier" shape.
 *
 * `checklist-phase2-agreements-create.spec.ts` closes the same hazard differently and deliberately:
 * every test there starts from `/horses`, chosen so neither agreements entry is highlighted on the
 * origin, which makes each highlight expectation a genuine change of state. That option is not open
 * here — this file's checklist lines start from the lease list card by name — so the discriminator
 * is carried in the assertion instead.
 */
async function headingAndHighlight(page: Page): Promise<{ heading: string; nav: string[][] }> {
  const heading = page.locator('main h1')
  await heading.waitFor()
  return { heading: (await heading.textContent()) ?? '', nav: await navHighlightMap(page) }
}

// ---------------------------------------------------------------------------
// Expected renderings, derived independently of the code that produces them
// ---------------------------------------------------------------------------

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * "2026-08-01" → "Aug 2026", the form `ChargesTable` renders through `formatChargePeriod`.
 *
 * Written out here rather than by importing `formatChargePeriod`, which would make the expectation
 * agree with any bug in the function under test — the same trap as deriving a currency string from
 * `formatFee`. A lookup table rather than `Intl.DateTimeFormat` for a second reason: this touches
 * no `Date` at all, so there is no host-zone surface for a `DATE` column's zoneless string to be
 * dragged through (fact 12). Only the period itself comes from the database.
 */
function periodLabel(period: string): string {
  const [year, month] = period.split('-')
  const abbreviation = MONTH_ABBREVIATIONS[Number(month) - 1]
  if (!abbreviation || !year) {
    throw new Error(`not a YYYY-MM-DD charge period: ${JSON.stringify(period)}`)
  }
  return `${abbreviation} ${year}`
}

/**
 * The fee-and-status line a lease card renders, as `agreements/page.tsx` composes it:
 * `{formatFee(a.fee)} · {getAgreementStatusLabel(a)}`.
 *
 * The currency form is written out rather than taken from `formatFee` — deriving the expectation
 * from the code under test makes the assertion agree with that code's bugs. Only the number comes
 * from this file's constants.
 */
const cardLine = (fee: number, status: string) => `$${fee}.00 · ${status}`

// ---------------------------------------------------------------------------
// Navigation
// ---------------------------------------------------------------------------

/**
 * Opens the subject lease's detail page **by clicking its card on the lease list**, hydrating
 * first.
 *
 * Both halves matter and the header block reasons through them at length. Clicking rather than
 * `goto`-ing means the `?kind=lease` on the detail URL is the app's own answer rather than one this
 * file wrote, which is the entire mechanism the highlight checkbox turns on. Hydrating *before* the
 * click means that click is a soft navigation, so the nav state read afterwards is the one
 * `DesktopNavLinks` computed on the client — without it, `Card`'s plain `<a href>` performs a
 * document navigation and every `aria-current` read downstream measures server-rendered markup
 * React 19 will never reconcile (fact 7), passing for the wrong reason.
 *
 * `waitForURL` carries no explicit timeout: `navigationTimeout` defaults to unbounded, so a number
 * could only tighten it (#1211). Bounded by the test's own budget.
 */
async function openLeaseDetailByCard(page: Page): Promise<void> {
  await page.goto(leaseListUrl())
  await waitForBarnPageHydrated(page)
  await page.locator(`a[href="${cardHref(subjectLease)}"]`).click()
  await page.waitForURL(atDetailPage(), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// The chain, in the order the checklist walks it
// ---------------------------------------------------------------------------
//
// `describe.serial` for fact 15's reason: these tests share one barn and the last one writes to
// it, so on a failure the remainder are skipped instead of running against a half-mutated fixture
// and reporting a second, invented failure. The one write is the last test declared, so no test
// above it can observe the fee it changes.
test.describe.serial('the monthly lease detail and edit pages', () => {
  // "Click the monthly lease's card → its detail page shows the rider"
  //
  // The card click is this line's own claim, which is why it is performed here rather than
  // assumed — every later test reaches the page more cheaply. `SUBJECT_RIDER` is one of two rider
  // names live in this barn (the decoy lease carries the other), so the expectation distinguishes
  // "this agreement's rider" from "a rider".
  test('the_lease_card_opens_a_detail_page_showing_its_rider @manager', async ({ page }) => {
    test.slow()
    await openLeaseDetailByCard(page)

    await expect.poll(() => detailFields(page)).toMatchObject({ Rider: SUBJECT_RIDER })
  })

  // "That detail page shows the horse"
  test('the_lease_detail_page_shows_its_horse @manager', async ({ page }) => {
    await page.goto(detailUrl())

    await expect.poll(() => detailFields(page)).toMatchObject({ Horse: SUBJECT_HORSE })
  })

  // "That detail page shows the fee"
  //
  // The rendered currency string, not the raw number — `formatFee` is what the page runs the
  // column through, and "shows the fee" is a claim about what a manager reads.
  test('the_lease_detail_page_shows_its_fee @manager', async ({ page }) => {
    await page.goto(detailUrl())

    await expect.poll(() => detailFields(page)).toMatchObject({ Fee: `$${SUBJECT_FEE}.00` })
  })

  // "That detail page shows the cadence"
  //
  // "Monthly" written as a literal rather than derived from `[id]/page.tsx`'s own `cadenceLabel`
  // ternary, which would agree with itself. The seed asked for `cadence: 'monthly'`; this is the
  // string a manager is supposed to see for it, and the decoy lease renders "One time" — so this
  // is a live two-way distinction rather than the only value the page could produce.
  test('the_lease_detail_page_shows_its_cadence @manager', async ({ page }) => {
    await page.goto(detailUrl())

    await expect.poll(() => detailFields(page)).toMatchObject({ Cadence: 'Monthly' })
  })

  // "That detail page shows the status"
  //
  // `getAgreementStatusLabel` returns 'Ended' when inactive, else 'Complete' for a one-time
  // agreement and 'Active' for a monthly one. The subject is active and monthly, so 'Active'; the
  // decoy is active and one-time, so it would read 'Complete'. Distinguishing those two is the
  // whole content of this line, and it is why the decoy's cadence was chosen as it was.
  test('the_lease_detail_page_shows_its_status @manager', async ({ page }) => {
    await page.goto(detailUrl())

    await expect.poll(() => detailFields(page)).toMatchObject({ Status: 'Active' })
  })

  // "That detail page's charges table lists the first auto-generated charge"
  //
  // Asserted against the row `create_agreement_with_first_charge` actually wrote, read back
  // service-role in the seed — never against a period this file computed. The array equality
  // carries the "first" half as well as the "lists" half: exactly one row, so a second charge
  // appearing from anywhere fails here rather than being silently tolerated by a containment
  // check. The fee is read from the cell's input value because the cell renders no text.
  test('the_lease_detail_charges_table_lists_the_rpc_created_first_charge @manager', async ({ page }) => {
    await page.goto(detailUrl())

    await expect
      .poll(() => chargeRows(page))
      .toEqual([{ period: periodLabel(subjectCharge.period), fee: String(SUBJECT_FEE) }])
  })

  // "The nav still shows **Leases** highlighted (not Boarding) on the detail page"
  //
  // Reached by clicking the card, because the `?kind=lease` the card puts on the URL is exactly
  // what `isNavLinkActive` matches on — see the header. Both entries are asserted together:
  // "Leases highlighted" and "Boarding not highlighted" are separate failures of that function and
  // a single-link read cannot tell them apart.
  test('the_lease_detail_page_highlights_leases_and_not_boarding @manager', async ({ page }) => {
    test.slow()
    await openLeaseDetailByCard(page)

    await expect
      .poll(() => headingAndHighlight(page))
      .toEqual({ heading: 'Lease Detail', nav: LEASES_ONLY })
  })

  // "**Edit** button top-right → the nav still shows **Leases** highlighted on the edit page too"
  //
  // The Edit control is clicked rather than its URL navigated to, for the same reason the card is:
  // the `?kind=` on the edit URL is the app's answer (`[id]/page.tsx` derives it from the
  // agreement's own kind), and a hand-written one would be asserting this file's own string. The
  // barrier precedes the click so the hop is a soft navigation and the highlight read below is the
  // client derivation rather than SSR's (fact 7).
  test('the_edit_button_opens_an_edit_page_that_highlights_leases_and_not_boarding @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(detailUrl())
    await waitForBarnPageHydrated(page)

    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.waitForURL(atEditPage(), { waitUntil: 'commit' })

    await expect
      .poll(() => headingAndHighlight(page))
      .toEqual({ heading: 'Edit Lease', nav: LEASES_ONLY })
  })

  // "On the edit page, the rider is read-only"
  //
  // The four read-only tests are four checkboxes and four separate failure modes, so they stay four
  // tests. Each asserts the conjunction the line actually makes — the field shows its value AND
  // carries no editable control — as one object equality; see `editField` for why both halves are
  // needed and why neither alone is falsifiable. No hydration barrier: the markup read is
  // server-rendered and the absent control is absent pre-hydration too.
  test('the_lease_edit_page_renders_the_rider_as_read_only_text @manager', async ({ page }) => {
    test.slow()
    await page.goto(editUrl())

    await expect.poll(() => editField(page, 'Rider')).toEqual({ value: SUBJECT_RIDER, controls: 0 })
  })

  // "On the edit page, the horse is read-only"
  test('the_lease_edit_page_renders_the_horse_as_read_only_text @manager', async ({ page }) => {
    await page.goto(editUrl())

    await expect.poll(() => editField(page, 'Horse')).toEqual({ value: SUBJECT_HORSE, controls: 0 })
  })

  // "On the edit page, the start date is read-only"
  //
  // The expectation is the `start_date` the RPC stored and handed back, rendered raw by
  // `AgreementForm` as the plain "YYYY-MM-DD" the DATE column holds. No date is computed here: the
  // seed passed no `startDate`, so the value is the barn's own day as the database resolved it, and
  // comparing against the returned row keeps this file clear of the barn-vs-host zone axis
  // entirely (fact 12).
  test('the_lease_edit_page_renders_the_start_date_as_read_only_text @manager', async ({ page }) => {
    await page.goto(editUrl())

    await expect
      .poll(() => editField(page, 'Start date'))
      .toEqual({ value: subjectLease.start_date, controls: 0 })
  })

  // "On the edit page, the cadence is read-only"
  //
  // The sharpest of the four: in NEW mode this field is a `<select id="agreement-cadence">`, so
  // "read-only" here is a genuine mode-dependent difference rather than a field that was never
  // editable anywhere. `controls: 0` is what distinguishes them.
  test('the_lease_edit_page_renders_the_cadence_as_read_only_text @manager', async ({ page }) => {
    await page.goto(editUrl())

    await expect.poll(() => editField(page, 'Cadence')).toEqual({ value: 'Monthly', controls: 0 })
  })

  // "Change the fee → Save → the new fee is reflected in the list"
  //
  // Declared last: it is the file's only write, and every assertion above reads a fee it changes.
  //
  // The barrier is fact 9's rather than fact 7's — the fee input is React-controlled (`value={fee}`
  // + `onChange`), so a fill landing before hydration moves the DOM value and the controlled
  // re-render discards it, and the form would submit the seeded fee while the screen showed the new
  // one.
  //
  // The redirect is both the sync point and the "saved with no error" half of the line:
  // `updateAgreementAction` re-renders the form with a `role="alert"` and does not navigate on
  // every rejection path, and only redirects on success. It cannot no-op (fact 3) — the pattern
  // excludes the `/edit` URL this was submitted from.
  //
  // Both cards are pinned, not just the subject's. Asserting only the subject's new fee would be
  // satisfied by a list that re-rendered every card with the same number; naming the decoy's
  // untouched line is what makes this "the new fee is reflected" rather than "the number 615
  // appears somewhere". The map is keyed by href, so it also fails if the two cards swapped.
  test('saving_a_changed_fee_on_the_edit_page_updates_the_lease_list_card @manager', async ({ page }) => {
    test.slow()
    await page.goto(editUrl())
    await waitForBarnPageHydrated(page)

    await page.locator('#agreement-fee').fill(String(UPDATED_FEE))
    await page.getByRole('button', { name: 'Save', exact: true }).click()

    await page.waitForURL(atLeaseList(), { waitUntil: 'commit' })

    await expect
      .poll(() => listCardLines(page), { timeout: SETTLE_AFTER_WRITE })
      .toEqual({
        [cardHref(subjectLease)]: cardLine(UPDATED_FEE, 'Active'),
        [cardHref(decoyLease)]: cardLine(DECOY_FEE, 'Complete'),
      })
  })
})
