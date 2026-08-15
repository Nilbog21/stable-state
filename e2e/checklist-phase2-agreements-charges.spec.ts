// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/nav-active.ts
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
//
// Phase 2's agreements block, final stretch (checklists/pre-release/phase-2-manager-seeding.md,
// from "On the lease detail page's charge row, select a **Payment Type**" through "Neither
// **Leases** nor **Boarding** is highlighted in the nav on that page"): the two inline charge-row
// edits and their transient confirmations, the boarding detail page's nav highlight, End
// Agreement, and the member-detail agreement card's link.
//
// The four nav `covers:` globs are not decoration. Three of the eight checkboxes here are claims
// about which nav entry is highlighted, and that verdict is computed entirely by
// `nav-active.ts`'s `isNavLinkActive` over `nav-links.ts`'s hrefs, rendered by
// `DesktopNavLinks` — which renders no anchor itself: it renders `NavigationBlocker.tsx`'s
// `BlockingLink`, the anchor that carries the `aria-current` `e2e/support/nav.ts`'s
// `navHighlightMap` reads.
// None of the four sits under the two route globs above — they are files of
// `(protected)/` itself — so without their own lines a change to the highlight rule would not
// select *this* spec. It would still select others: `checklist-phase1-nav-responsive.spec.ts`
// declares the first three, `checklist-phase2-agreements-detail.spec.ts` all four, and
// `smoke.spec.ts`'s `(protected)/**` prefix covers them too. The
// declaration is here because `covers:` states what a spec *drives* — the accuracy rule is
// per-spec and binds regardless of what any other spec happens to declare.
//
// ## Where this slice opens, and how its predecessor's state is reproduced
//
// The checklist walks one chain: the manager adds a monthly lease and a boarding agreement
// through `/agreements/new`, then works down the lease's detail page and across to boarding.
// This slice starts partway down that chain, so per the batch's standing ruling it reproduces
// the predecessor's end state by calling the function the UI calls — `createAgreement`, which is
// exactly what `agreements/actions.ts`'s `createAgreementAction` invokes — rather than
// hand-writing the `agreements`/`agreement_charges`/`transactions` triple that
// `create_agreement_with_first_charge` writes as a unit.
//
// It is called directly rather than through `support/fixtures.ts`'s `addLeaseCharge` because
// that builder cannot express the state this block needs: it hard-codes
// `cadence: isBoard ? 'monthly' : 'one_time'`, so every `kind: 'lease'` agreement it produces is
// one-time, and the checklist's lease is the **monthly** one added two lines earlier in the same
// chain. Adding a cadence option to that builder is out of the question — `e2e/support/**` is in
// `select-specs.sh`'s ALWAYS_FULL, so one edit there forces `mode=full`. The mutex serializes
// every *multi-spec* run, `mode=scoped` included (`docs/scripts.md`), so what touching only this
// spec buys is not "scoped instead of full" but a **single-spec** selection, which is the case
// that runs mutex-free. Importing a DAL function into a spec is precedented: `fixtures.ts`
// imports this very function, and `checklist-phase4-expenses-form.spec.ts` imports
// `updateExpense`.
//
// ## No dates anywhere, deliberately
//
// `create_agreement_with_first_charge` defaults `p_start_date` to
// `(now() AT TIME ZONE barns.timezone)::date` and derives the charge's `period` from that same
// barn-frame day (#1361). So omitting `startDate` is not laziness — it is what keeps every date
// in this file inside the barn's own frame, with no host-zone arithmetic to get wrong. Note that
// `eslint.config.mjs`'s date fence would not have caught a mistake here either way: it is scoped
// to `src/**`, so it never lints an `e2e/` spec — the discipline is the author's, not the
// linter's. Each agreement gets exactly one charge, in the barn's current month, which is the
// row the first four tests drive.
//
// ## Two board agreements, on two different riders
//
// `endingBoardAgreement` is the one End Agreement retires; `linkedBoardAgreement` is the one the
// member-detail link points at. They are separate rows on separate riders so that no ordering of
// the tests below can let the End Agreement write disturb the member-detail reads — ending an
// agreement clears `is_active`, and `getActiveAgreementsForRider` filters on exactly that, so a
// single shared row would make two of these checkboxes silently order-dependent.
//
// It also makes the "Ended" claim discriminating: the Boarding list holds two cards throughout,
// and the assertion pins one to Ended *and* the other to Active. Against a one-card list, an
// assertion that the list contains "Ended" would be satisfied by a page rendering that word for
// any reason at all.
//
// ## Why every write-driving test opens with a hydration barrier
//
// `ChargeRow` (`agreements/[id]/ChargesTable.tsx`) seeds `useState` from server props and renders
// markup byte-identical pre- and post-hydration — fact 13's case — and its only controls write.
// So there is no zero-interaction signal on this page, and a `fill()`/`selectOption()` dispatched
// before React is listening moves the DOM value and nothing else (fact 9): no `onChange`, no
// state, and for the fee field React then re-renders the seeded `String(charge.fee)`, so
// `handleFeeBlur`'s `if (fee === String(charge.fee)) return` guard fires and the write never
// happens. The failure is a 15s timeout on a ✓ Saved that was never going to appear.
//
// `waitForBarnPageHydrated` is the right barrier because it drives the nav bar's avatar menu —
// a control in the *same* React root as the page but one no test here asserts on — so it can
// never stand in for the thing a test is claiming. Both sibling phase-2 specs do the same.
//
// The End Agreement test needs it for fact 10's reason rather than fact 9's:
// `EndAgreementButton` is `<form action={serverAction}>`, which carries a pre-hydration click on
// its own, but its `window.confirm` lives in an `onClick`. So an unhydrated click submits the
// form *without* ever raising the dialog — the agreement ends and the message assertion fails.
//
// ## What the seed does NOT contain
//
// No `.update(` and no `.delete(` — every row is created by the RPC in its final shape. So
// spec-maintenance rule 5 (`mustAffect` on load-bearing setup mutations, #1435) has nothing to
// bind here. Stated rather than left silent, since "no mustAffect in the file" otherwise reads
// identically to having forgotten it.
//
// Rule 4 (#1434) does bind, at one test: `the_member_detail_boarding_link_lands_with_boarding_
// highlighted` claims an absence on its Leases half — that entry stays inert. Its anchor is in
// the same read on the same page state: the map's other row must be HIGHLIGHTED('Boarding'), and
// the highlight read returns a two-row map of both nav entries, so a nav that failed to render
// yields no rows and fails, rather than satisfying the absence vacuously.
// Nothing here locates a `role="alert"`: the ✓ Saved indicator is an `aria-live="polite"` span,
// located by text and scoped to its own `<td>`, so Next's permanent `__next-route-announcer__`
// can never join a match set.
//
// ## One restored line and one corrected quote (both stated in the PR body)
//
// 1. **Restored, after one release as a characterisation.** "**Boarding** is still highlighted
//    in the nav on that page" was false against shipped behaviour until #1502: the member-detail
//    card's href carried no `?kind=`, `isNavLinkActive` requires query equality when the nav
//    entry's href has one (both agreement entries do), so **neither** entry highlighted. #1458's
//    slice was barred from touching `src/`, so its line characterised that defect instead of
//    endorsing it ("Neither **Leases** nor **Boarding** is highlighted … Suspected UI defect,
//    characterised here rather than endorsed"). #1502 put `?kind=${agreement.kind}` on the href
//    and restored the line's original, stronger claim — failing the characterisation test it
//    replaced was that fix's intended outcome, not a regression.
//
// 2. **Corrected, and stronger than what it replaced.** "the **Boarding: $X/month** link" names
//    a label the app does not render; the card renders `Boarding · <horse> · $900.00/month`. The
//    corrected quote pins the horse name as well as the fee, so it discriminates where the
//    original did not.
//
// ## Adjacent prior art, not a duplicate of it
//
// `checklist-phase4-members-agreements.spec.ts` covers the member-detail Active Agreements
// section against `addLeaseCharge`-seeded agreements, including that each card links to its
// detail page. The overlap is real and deliberate: that file owns Phase 4's *read* of that
// section, this one owns Phase 2's chained walk *out* of it into the nav-highlight claim, which
// nothing there asserts. Neither file's assertions depend on the other's fixtures: separate
// barns, separate memberships, separate horses. (Not separate *people* — both seed on
// `members.rider`, which is the one shared `rider@e2e.test` login the whole suite uses; the
// isolation is the barn, not the identity.)
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse } from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'
import { HIGHLIGHTED, INERT, navHighlightMap } from './support/nav'
import { createAgreement } from '@/lib/db/agreements'
import type { Agreement } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Seed shapes, and the values the assertions are bound to
// ---------------------------------------------------------------------------

/**
 * The one sanctioned numeric timeout (`support/test.ts`'s timeout block, #1469). Web-first
 * `expect` matchers run on expect's own 5s default, and `test.slow()` does **not** raise it — it
 * triples the *test* timeout and touches nothing else. So a number here LOOSENS, where a number
 * on a `waitFor`/`waitForURL` could only tighten.
 *
 * This file is write-heavy — five of its eight tests drive a write — so the rule here is: **every
 * matcher that runs after a write in its own test carries this timeout**, and matchers reading a
 * page a `goto` already settled keep the 5s default. Stated as a rule rather than as a list of
 * sites on purpose: a count in a comment drifts the moment a matcher is added, and silently.
 *
 * File-local on purpose (#1469), and the same value `checklist-phase2-managed-stubs.spec.ts` and
 * `checklist-phase2-horses-owner.spec.ts` use.
 */
const SETTLE_AFTER_WRITE = 15_000

const LEASE_HORSE = 'Bramble'
const ENDING_BOARD_HORSE = 'Cinder'
const LINKED_BOARD_HORSE = 'Dovetail'

const LEASE_FEE = 450
const ENDING_BOARD_FEE = 600
const LINKED_BOARD_FEE = 900

/**
 * Two distinct payment types, because the second test needs the select's value to *change*.
 * React fires no change event when `selectOption` picks the value already selected, so
 * re-selecting the first would leave `handlePaymentTypeChange` uncalled and the ✓ Saved
 * assertion would be waiting on a flash that was never going to happen — a test that could only
 * ever fail, or worse, pass against an indicator stuck permanently visible.
 */
const FIRST_PAYMENT_TYPE = 'venmo'
const SECOND_PAYMENT_TYPE = 'zelle'

/**
 * Two distinct fees, for the mirror-image reason: `ChargeRow.handleFeeBlur` returns early when
 * the field's value equals the charge's stored fee, so a blur that re-enters the value the
 * previous test persisted writes nothing and flashes nothing. Both differ from `LEASE_FEE` too,
 * so neither test can be satisfied by the seeded value.
 *
 * Whole numbers: `agreement_charges.fee` is unconstrained `NUMERIC`, so PostgREST returns
 * whatever was written, and `ChargeRow` seeds its input with `String(charge.fee)` — 475 round
 * trips as exactly "475", where a scaled value could arrive as either "512.5" or "512.50".
 */
const PERSISTED_FEE = 475
const FLASHED_FEE = 512

/** `SavedIndicator`'s text. */
const SAVED_TEXT = '✓ Saved'

/** `EndAgreementButton`'s `window.confirm` message — the proof the confirm actually ran. */
const END_CONFIRM_MESSAGE = 'This cannot be undone. End this agreement?'

/** The agreement detail page's h1 for a board agreement (`${label} Detail`). */
const BOARD_DETAIL_HEADING = 'Boarding Detail'

let leaseAgreement: Agreement
let endingBoardAgreement: Agreement
let linkedBoardAgreement: Agreement

const barn = withBarn('phase2-agreements-charges', async ({ supabase, barn, members }) => {
  const leaseHorse = await addHorse(supabase, barn.id, LEASE_HORSE)
  const endingBoardHorse = await addHorse(supabase, barn.id, ENDING_BOARD_HORSE)
  const linkedBoardHorse = await addHorse(supabase, barn.id, LINKED_BOARD_HORSE)

  // Monthly, which is the cadence the checklist's lease carries and the one `addLeaseCharge`
  // cannot produce — see the header. No `startDate`: the RPC defaults it to the barn's own day.
  leaseAgreement = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider.membershipId,
      horseId: leaseHorse.id,
      fee: LEASE_FEE,
      kind: 'lease',
      cadence: 'monthly',
    },
    supabase
  )

  // rider2, not rider: this is the agreement End Agreement retires, and keeping it off the rider
  // whose member detail page the last three tests read is what makes those tests independent of
  // this one's ordering.
  endingBoardAgreement = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider2.membershipId,
      horseId: endingBoardHorse.id,
      fee: ENDING_BOARD_FEE,
      kind: 'board',
      cadence: 'monthly',
    },
    supabase
  )

  linkedBoardAgreement = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider.membershipId,
      horseId: linkedBoardHorse.id,
      fee: LINKED_BOARD_FEE,
      kind: 'board',
      cadence: 'monthly',
    },
    supabase
  )
})

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const leaseDetailUrl = () => `/barn/${barn.slug}/agreements/${leaseAgreement.id}?kind=lease`
const boardingListUrl = () => `/barn/${barn.slug}/agreements?kind=board`
const riderDetailUrl = () => `/barn/${barn.slug}/members/${barn.data.members.rider.membershipId}`

/**
 * The path half of the member detail card's href — since #1502 the card itself carries
 * `?kind=` (see the header); the card locators below append it, while `atAgreementPage`
 * matches on the bare path.
 */
const memberCardHref = (agreementId: string) => `/barn/${barn.slug}/agreements/${agreementId}`

/** Matched by RegExp rather than a URL glob, the idiom the rest of the suite uses. */
const atAgreementPage = (agreementId: string) =>
  new RegExp(`${memberCardHref(agreementId)}(\\?|$)`)

// ---------------------------------------------------------------------------
// The charge row
// ---------------------------------------------------------------------------

/**
 * The lease's single charge row. `ChargesTable` renders one `<tr>` per charge inside `<tbody>`,
 * and `create_agreement_with_first_charge` created exactly one — so this is unambiguous without
 * addressing the row by any value the tests are about to change.
 */
const chargeRow = (page: Page) => page.locator('tbody tr')

/**
 * The two editable cells, by column position — the header is `Period | Fee | Payment Type`.
 *
 * Positional rather than by-content, because the content is what each test mutates: locating the
 * Fee cell by the fee it currently shows would make the locator stale the moment the write it is
 * asserting lands.
 */
const feeCell = (page: Page) => chargeRow(page).locator('td').nth(1)
const paymentTypeCell = (page: Page) => chargeRow(page).locator('td').nth(2)

const feeInput = (page: Page) => feeCell(page).locator('input')
const paymentTypeSelect = (page: Page) => paymentTypeCell(page).locator('select')

/**
 * The ✓ Saved flash belonging to one cell.
 *
 * Scoped to the cell rather than to the page, and that scoping is the assertion's whole content:
 * "next to that dropdown" / "next to the Fee field" is a *positional* claim, and both cells
 * render their own `SavedIndicator`, so a page-wide text match would be satisfied by the other
 * column's flash. It also keeps the locator off `role="alert"` — `SavedIndicator` is an
 * `aria-live="polite"` span, and Next renders a permanent `role="alert"` announcer into every
 * document that a bare role query would collect.
 */
const savedIndicator = (cell: Locator) => cell.getByText(SAVED_TEXT, { exact: true })

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

/** A card in the kind-scoped agreements list, addressed by the agreement it points at. */
const listCard = (page: Page, agreementId: string) =>
  page.locator(`a[href="${memberCardHref(agreementId)}?kind=board"]`)

/** A card in the member detail page's Active Agreements section, addressed the same way. */
const memberCard = (page: Page, agreementId: string) =>
  page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Active Agreements', exact: true }) })
    .locator(`a[href="${memberCardHref(agreementId)}?kind=board"]`)

/**
 * The label the member detail card renders for a monthly agreement, derived from the seeded fee
 * rather than written as a literal — `ActiveAgreements` composes it as
 * `${kind} · ${horse} · ${formatFee(fee)}${cadence === 'monthly' ? '/month' : ''}`.
 *
 * The currency form is written out rather than taken from `formatFee`: deriving the expectation
 * from the code under test makes the assertion agree with any bug in that code. Only the number
 * comes from the seed constant, which is the binding the acceptance criteria ask for.
 */
const memberCardLabel = () => `Boarding · ${LINKED_BOARD_HORSE} · $${LINKED_BOARD_FEE}.00/month`

// ---------------------------------------------------------------------------
// The chain, in the order the checklist walks it — with End Agreement moved last
// ---------------------------------------------------------------------------
//
// `describe.serial` is what contains fact 15 here rather than merely surviving it: these tests
// share one barn and five of them write to it, so on a failure the remainder are skipped instead
// of running against a half-mutated fixture and reporting a second, invented failure.
//
// The End Agreement test is **declared last**, out of checklist order. It is the only
// irreversible write in the file, and while the two-riders seed already makes the member-detail
// tests immune to it, declaring it last means no future edit to this file can reintroduce that
// coupling by accident.
test.describe.serial('agreement charges, End Agreement, and the boarding link', () => {
  // "On the lease detail page's charge row, select a **Payment Type** → the page refreshes and
  // the selection persists"
  //
  // Persistence is asserted across a genuine reload, not against the in-page value: the select
  // is React-controlled and `handlePaymentTypeChange` sets its state optimistically before the
  // Server Action resolves, so reading it in place would pass even if nothing were written.
  test('selecting_a_payment_type_on_a_charge_row_persists_across_a_reload @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(leaseDetailUrl())
    // Fact 9's barrier. `ChargeRow` has no zero-interaction hydration signal (fact 13),
    // so without this the drive below can land before React is listening and write nothing.
    await waitForBarnPageHydrated(page)

    await paymentTypeSelect(page).selectOption(FIRST_PAYMENT_TYPE)

    // A settle point, not the assertion — the next test owns the ✓ Saved claim.
    //
    // `selectOption` resolves when React's onChange has been dispatched, not when the Server
    // Action it fires has reached the database, and `page.reload()` tears the document down
    // mid-flight: measured here as a ~1-in-5 failure where the reloaded select came back "" (the
    // mutation pass's mutant-04 run caught it). The indicator is the narrowest available signal
    // that the write actually landed — `handlePaymentTypeChange` calls `flash()` only *after*
    // awaiting the action and only on the non-error branch, so waiting for it cannot be
    // satisfied by an in-flight or failed save the way waiting for the select to re-enable
    // could. Not tautological with the assertion below either: this is client state saying the
    // action returned, that is the server's own answer read back through a fresh request.
    await expect(savedIndicator(paymentTypeCell(page))).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })

    await page.reload()

    await expect(paymentTypeSelect(page)).toHaveValue(FIRST_PAYMENT_TYPE, {
      timeout: SETTLE_AFTER_WRITE,
    })
  })

  // "A brief \"✓ Saved\" confirmation appears next to that dropdown"
  //
  // Waited for rather than sampled — the flash clears after 2000 ms, so a one-shot read races
  // it. Its disappearance is deliberately NOT asserted: that would need its own anchor proving
  // the row still rendered, and the checklist's claim is that the confirmation appears.
  test('selecting_a_payment_type_flashes_a_saved_confirmation_beside_the_dropdown @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(leaseDetailUrl())
    // Fact 9's barrier. `ChargeRow` has no zero-interaction hydration signal (fact 13),
    // so without this the drive below can land before React is listening and write nothing.
    await waitForBarnPageHydrated(page)

    // A different value from the previous test's, or React fires no change event at all.
    await paymentTypeSelect(page).selectOption(SECOND_PAYMENT_TYPE)

    await expect(savedIndicator(paymentTypeCell(page))).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })
  })

  // "Edit the charge's **Fee** field and blur → the new amount persists after refresh"
  //
  // An explicit `blur()`, because the write fires on blur and nothing else — there is no submit
  // button on this row. `fill()` alone leaves the field focused and writes nothing.
  test('editing_a_charge_fee_and_blurring_persists_across_a_reload @manager', async ({ page }) => {
    test.slow()
    await page.goto(leaseDetailUrl())
    // Fact 9's barrier. `ChargeRow` has no zero-interaction hydration signal (fact 13),
    // so without this the drive below can land before React is listening and write nothing.
    await waitForBarnPageHydrated(page)

    await feeInput(page).fill(String(PERSISTED_FEE))
    await feeInput(page).blur()

    // The same settle point as the payment-type test above, for the same measured reason — see
    // the comment there. `handleFeeBlur` awaits the action before calling `flash()`, so this
    // cannot resolve while the write is still in flight.
    await expect(savedIndicator(feeCell(page))).toBeVisible({ timeout: SETTLE_AFTER_WRITE })

    await page.reload()

    await expect(feeInput(page)).toHaveValue(String(PERSISTED_FEE), { timeout: SETTLE_AFTER_WRITE })
  })

  // "The same \"✓ Saved\" confirmation appears next to the Fee field"
  test('editing_a_charge_fee_flashes_a_saved_confirmation_beside_the_fee_field @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(leaseDetailUrl())
    // Fact 9's barrier. `ChargeRow` has no zero-interaction hydration signal (fact 13),
    // so without this the drive below can land before React is listening and write nothing.
    await waitForBarnPageHydrated(page)

    // A different value from the previous test's, or `handleFeeBlur` returns before writing.
    await feeInput(page).fill(String(FLASHED_FEE))
    await feeInput(page).blur()

    await expect(savedIndicator(feeCell(page))).toBeVisible({ timeout: SETTLE_AFTER_WRITE })
  })

  // "Click the boarding agreement's card → its detail page shows the nav still highlighting
  // **Boarding** (not Leases)"
  //
  // Both halves of the line in one map read: Boarding highlighted *and* Leases inert. The card is
  // reached by clicking it in the Boarding list rather than by navigating to the detail URL —
  // the `?kind=board` the list card carries is precisely what the highlight rule matches on, so
  // a hand-written URL would be asserting a query string this test had supplied itself.
  //
  // `waitForURL` carries no explicit timeout: `navigationTimeout` defaults to unbounded, so a
  // number could only tighten it (#1211). `test.slow()` is the sanctioned way to buy room, and
  // this test needs it — it is the first to reach the kind-scoped *list* route `/agreements`.
  // (Not the detail route: the four charge-row tests above already warmed `/agreements/[id]`.)
  test('the_boarding_list_card_opens_a_detail_page_with_boarding_highlighted_in_the_nav @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(boardingListUrl())

    await listCard(page, endingBoardAgreement.id).click()
    await page.waitForURL(atAgreementPage(endingBoardAgreement.id), { waitUntil: 'commit' })

    await expect
      .poll(() => navHighlightMap(page), { timeout: SETTLE_AFTER_WRITE })
      .toEqual([INERT('Leases'), HIGHLIGHTED('Boarding')])
  })

  // "On a rider's member detail page with an active boarding agreement, click the
  // **Boarding · `<horse>` · $X/month** link → lands on the agreement detail page"
  //
  // Quoted verbatim from the checklist, placeholders included. Substituting this file's own
  // fixture values would make the fragment ungreppable against the file it cites.
  //
  // The label is asserted through the locator itself — the card is selected by its href and
  // filtered to the derived label, so a click that happens at all proves both. The heading is
  // what pins the landing to a *working* page: `waitUntil: 'commit'` resolves before render, and
  // a notFound() or a 500 reaches this same URL and would satisfy the wait on its own.
  test('the_member_detail_boarding_card_links_to_the_agreement_detail_page @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(riderDetailUrl())

    const card = memberCard(page, linkedBoardAgreement.id).filter({ hasText: memberCardLabel() })
    await expect(card).toHaveCount(1)

    await card.click()
    await page.waitForURL(atAgreementPage(linkedBoardAgreement.id), { waitUntil: 'commit' })

    await expect(page.getByRole('heading', { name: BOARD_DETAIL_HEADING, exact: true })).toBeVisible()
  })

  // "**Boarding** is still highlighted in the nav on that page"
  //
  // The restored line; see the header for the release it spent as a characterisation and why.
  //
  // The barrier is on the ORIGIN page, before the click — a barrier added after arrival does
  // not help, because there is nothing left to reconcile. A nav click dispatched before React
  // has hydrated is not lost: the card is a real `<a href>` (`BlockingLink`), so the browser
  // performs a plain document navigation and the page that loads is server-rendered — and
  // `aria-current` is an attribute, which React 19 does not reconcile on a hydration mismatch
  // (fact 7), so whatever value the server rendered persists for the rest of the test.
  //
  // Origin/destination discrimination: `/members/[id]` has neither nav entry highlighted, so
  // "Boarding highlighted" already differs from the origin's state and cannot be satisfied by
  // the origin's markup.
  //
  // The Leases half is an absence claim; its positive anchor (rule 4, #1434) is the
  // HIGHLIGHTED('Boarding') row in the same read. `navHighlightMap` also waits for the first
  // link before reading, so a nav that did not render fails rather than returning `[]` for the
  // expectation to accept.
  test('the_member_detail_boarding_link_lands_with_boarding_highlighted @manager', async ({
    page,
  }) => {
    test.slow()
    await page.goto(riderDetailUrl())
    await waitForBarnPageHydrated(page)

    await memberCard(page, linkedBoardAgreement.id).click()
    await page.waitForURL(atAgreementPage(linkedBoardAgreement.id), { waitUntil: 'commit' })

    await expect
      .poll(() => navHighlightMap(page), { timeout: SETTLE_AFTER_WRITE })
      .toEqual([INERT('Leases'), HIGHLIGHTED('Boarding')])
  })

  // "**End Agreement** (confirm the browser prompt) → it now shows **Ended** in the Boarding
  // list"
  //
  // The line names no page, and `EndAgreementButton` renders only on the *edit* page (gated on
  // `is_active`), so the walk is detail → Edit → End Agreement, which is the app's real route.
  //
  // The dialog handler is installed **before** the click: the `waitForEvent`-after-click form
  // deadlocks, because Chromium blocks on the dialog and the click promise never settles. The
  // handler asserts the message rather than blindly accepting — that the confirm ran at all is
  // the half of the checklist line an accept-everything handler cannot see.
  test('ending_a_boarding_agreement_makes_the_boarding_list_show_ended @manager', async ({
    page,
  }) => {
    test.slow()

    // Pre-state, captured in the mutating test: both cards Active before the write, so the
    // post-state below is a transition rather than a snapshot that might always have read that
    // way. `Ended` is also what `getAgreementStatusLabel` returns for any inactive agreement, so
    // without this the assertion could not tell "End Agreement worked" from "it was never
    // Active".
    await page.goto(boardingListUrl())
    await expect(listCard(page, endingBoardAgreement.id)).toContainText('Active')
    await expect(listCard(page, linkedBoardAgreement.id)).toContainText('Active')

    await listCard(page, endingBoardAgreement.id).click()
    await page.waitForURL(atAgreementPage(endingBoardAgreement.id), { waitUntil: 'commit' })
    await page.getByRole('link', { name: 'Edit', exact: true }).click()
    await page.waitForURL(/\/edit\?kind=board$/, { waitUntil: 'commit' })
    // Fact 10's reason, not fact 9's: the form carries a pre-hydration click on its own,
    // but the `window.confirm` guard is an `onClick` and would simply not run.
    await waitForBarnPageHydrated(page)

    const dialogMessages: string[] = []
    page.on('dialog', async (dialog) => {
      dialogMessages.push(dialog.message())
      await dialog.accept()
    })

    await page.getByRole('button', { name: 'End Agreement', exact: true }).click()
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements\\?kind=board$`), {
      waitUntil: 'commit',
    })

    expect(dialogMessages).toEqual([END_CONFIRM_MESSAGE])
    await expect(listCard(page, endingBoardAgreement.id)).toContainText('Ended', {
      timeout: SETTLE_AFTER_WRITE,
    })
    // The untouched sibling, in the same read: "it now shows Ended" is a claim about *that*
    // agreement, and an assertion that the list contains Ended somewhere would be satisfied by a
    // page that ended both.
    await expect(listCard(page, linkedBoardAgreement.id)).toContainText('Active', {
      timeout: SETTLE_AFTER_WRITE,
    })
  })
})
