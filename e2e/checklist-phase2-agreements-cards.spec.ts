// covers: src/app/barn/[slug]/(protected)/agreements/**
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/lib/db/agreements.ts
// covers: src/lib/db/transactions.ts
// covers: src/lib/db/member-names.ts
// covers: src/lib/db/horses.ts
// covers: src/lib/format-currency.ts
// covers: src/lib/format-date.ts
// covers: src/lib/barn-timezone.ts
// covers: src/lib/local-day.ts
// covers: src/components/ui/Card.tsx
// covers: src/components/ui/Badge.tsx
// covers: src/components/ui/SavedIndicator.tsx
//
// Twelve of those are not the route directory. `docs/scripts/suite.md`'s discriminating question is
// "could an assertion in this file fail if that module changed?" — and the answer is yes for each,
// so each is declared. The rule is entirely on the author here: `ALWAYS_FULL` swallows
// `src/lib/**` and `src/components/**`, so `--lint` sees an identical selection whether these
// lines are present or not and an omission is invisible to CI (#1281, #1357).
//
//   - `db/agreements.ts` — `getAgreementStatusLabel` is the whole of the Active/Complete
//     distinction (three checkboxes), and `getUnpaidAgreementIds` the whole of the Unpaid pill
//     (two more).
//   - `db/transactions.ts` — `getUnpaidAgreementIds` bottoms out in `getTransactionRows`, and it
//     is that function's `.lt('occurred_at', endDate)` + `collected` filter that decides whether
//     a past charge badges at all.
//   - `db/member-names.ts` / `db/horses.ts` — `resolveMemberNames` and `resolveHorseNames`
//     compose the card's rider and horse lines, which are one checkbox each.
//   - `format-currency.ts` — `formatFee` renders the string "shows its fee" asserts.
//   - `format-date.ts` — `formatChargePeriod` renders the period label `periodLabel` below is
//     written to match; if it changed, `pastChargeRow` would match nothing.
//   - `barn-timezone.ts` / `local-day.ts` — imported directly below. The seed's second guard is
//     `firstOfMonth(barnToday(…))`, so a change there throws in `beforeAll` and every test fails.
//   - `ui/Card.tsx` — "the whole card is the link" and "no separate View/Edit buttons appear on
//     that card" are claims about `Card`'s shape, not about this route's.
//   - `ui/Badge.tsx` — the pill's amber tone comes from `toneClasses.amber`.
//   - `ui/SavedIndicator.tsx` — owns the `✓ Saved` literal the charge-row settle waits on.
//   - `NavigationBlocker.tsx` — `AgreementForm` arms `useUnsavedChangesGuard(dirty)`, and the
//     one-time-lease test below fills that form and submits it. Kept deliberately, against a
//     review finding that a guard regression would hang the navigation rather than fail a
//     matcher: that is true, but "a timeout is not a kill" is a rule about MUTATION SCORING.
//     `covers:` asks only whether this spec can break if the module changes, and it can.
//
// Phase 2's agreements block, the card stretch (checklists/pre-release/phase-2-manager-seeding.md,
// from "Each of those cards shows its rider" through "That one-time lease's detail page also shows
// **Complete**"): what a kind-scoped list's card renders, that the card is itself the link and
// carries no controls of its own, the amber Unpaid pill's appearance and disappearance, and the
// one-time lease's Complete status in both list and detail.
//
// ## Where this slice opens, and how its predecessor's state is reproduced
//
// "Each of *those* cards" means the monthly lease and the boarding agreement that slice 4
// (#1455) creates through `/agreements/new` two lines earlier in the same chain. Per the batch's
// standing ruling this file reproduces that end state by calling the function the app calls —
// `createAgreement`, which is exactly what `agreements/actions.ts`'s `createAgreementAction`
// invokes — rather than hand-writing the `agreements`/`agreement_charges`/`transactions` triple
// that `create_agreement_with_first_charge` writes as a unit.
//
// It is called directly rather than through `support/fixtures.ts`'s `addLeaseCharge` because that
// builder hard-codes `cadence: isBoard ? 'monthly' : 'one_time'`, so every `kind: 'lease'`
// agreement it produces is one-time — and the checklist's lease is the **monthly** one. The
// import is precedented: `fixtures.ts` imports this very function,
// `checklist-phase2-agreements-charges.spec.ts` imports it for the same reason, and
// `checklist-phase4-expenses-form.spec.ts` imports `updateExpense`. Adding a cadence option to
// the builder is out of the question — `e2e/support/**` is in `select-specs.sh`'s ALWAYS_FULL,
// and a spec touching only its own file and its own markdown selects itself alone.
//
// ## The one-time lease is created through the FORM, and that is deliberate
//
// Its checkbox's own verb is "**Add** a one-time lease (rider Dana, horse Apple, cadence One
// time)", so unlike the two agreements above it is not predecessor state — it is this slice's own
// action. Driving the form also closes a gap slice 4 named explicitly: that file selects
// `monthly` and then says its save test "does NOT assert what was persisted … `getAgreementStatusLabel`
// renders cadence as exactly that Active vs Complete distinction", handing the cadence-round-trip
// claim here. Seeding the row with `createAgreement` would prove `getAgreementStatusLabel`
// renders Complete for a `one_time` row while leaving "the form's **One time** option produces a
// `one_time` row" tested by nobody.
//
// ## The Unpaid pill's precondition, and why the seed has to manufacture it
//
// `getUnpaidAgreementIds` asks `getTransactionRows` for charge transactions that are
// `collected: false` **and** `occurred_at < firstOfCurrentMonth` (a `.lt`, so the boundary is
// exclusive). A charge transaction's `occurred_at` is its `period` cast to timestamptz — UTC
// midnight on the 1st — so only a charge in a *past* month can badge, however unpaid a current
// one is. `support/fixtures.ts`'s `addLeaseCharge` states the EQUIVALENT boundary for a different
// reader, and the gap is worth spelling out because the issue text inherited it too: that comment
// is about `getOutstandingCharges`, which filters `period < firstOfCurrentMonth` on
// `agreement_charges` directly. The pill goes nowhere near that function. `getUnpaidAgreementIds`
// filters `transactions.occurred_at` AND `collected = false`, and the two select the same rows
// only because `occurred_at` is that same `period` cast to timestamptz.
//
// And a freshly created monthly agreement cannot have one: `create_agreement_with_first_charge`
// derives its first charge's period as
// `date_trunc('month', CASE WHEN cadence = 'monthly' THEN v_today ELSE start_date END)` — so for
// a monthly lease the period is the *barn's current month* regardless of what `p_start_date`
// says, and backdating the agreement does not backdate the charge. That is why this seed adds a
// second charge through `generateChargeForMonth`, which relays to `generate_agreement_charge` —
// the function that writes an `agreement_charges` row and its paired `collected = false`
// transaction in one statement pair. Reproducing that by hand would risk seeding a combination
// the app never creates and then asserting a transition out of it.
//
// The checklist line reads "On the monthly lease's detail page, leave a past month's charge
// unpaid" and takes that charge's existence for granted; walked strictly by hand, the chain
// never produces one. The line's *invariant* — past unpaid charge ⇒ amber Unpaid pill next to
// the status — is true and is what is automated here; only its setup needed seeding.
//
// ## What makes the pill tests bind to their subject rather than to "some pill"
//
// The lease keeps TWO charges throughout: the current month's, created with the agreement, and
// the past month's the seed adds. Only the second can badge. So when
// `marking_the_past_charge_paid_removes_the_unpaid_pill` marks the past one paid, an unpaid
// current-month charge is still sitting on the same agreement — and the pill still has to go.
// That is what separates "the pill tracks a past outstanding charge" from "the pill tracks any
// unpaid charge at all", which a single-charge fixture could not tell apart.
//
// The same test also carries the precondition anchor the batch asks for, in the test rather than
// only in the seed: it asserts the charges table holds exactly two rows and that exactly one of
// them is the past-month row, *before* driving the select. Without that, "the pill disappeared"
// is equally consistent with having marked the wrong row, or with the page having rendered no
// row at all.
//
// ## Rule 4 (#1434) and rule 5 (#1435)
//
// Rule 4 binds at two tests, and neither absence is asserted bare:
//
//   - `no_view_or_edit_buttons_appear_on_an_agreement_card` reads the control count *together
//     with* the card's rider and fee, in one object. A card that never rendered reports empty
//     strings and fails, where a bare `toHaveCount(0)` on a button locator would sail through
//     (fact 18).
//   - `marking_the_past_charge_paid_removes_the_unpaid_pill` reads the card count and the
//     fee·status line alongside the now-empty pill slot, on the same page state.
//
// Rule 5 has nothing to bind: the seed callback contains no `.update(` and no `.delete(` at all —
// every row is written by an RPC in its final shape. Stated rather than left silent, since "no
// `mustAffect` in the file" otherwise reads identically to having forgotten it. The seed does
// carry two guards of its own, for a different reason — see the seed callback's closing block.
//
// ## No host-zone date arithmetic
//
// Every date value computed here is barn-framed or explicitly UTC-pinned, and none reads the
// host's clock: `monthAnchor(1, barn.timezone)`, whose whole purpose is to be barn-framed
// (fact 12), fed to `generateChargeForMonth`, which re-derives the period through
// `barnDay`/`firstOfMonth` in that same frame; the second seed guard's
// `firstOfMonth(barnToday(barn.timezone))`; and `periodLabel`, which forces `timeZone: 'UTC'`
// exactly as `formatChargePeriod` does because a `period` is a zoneless calendar date. No `startDate` is passed to any
// `createAgreement` call: the RPC defaults it to `(now() AT TIME ZONE barns.timezone)::date`.
// `eslint.config.mjs`'s date fence is scoped to `src/**` and never lints a spec, so the
// discipline here is the author's rather than the linter's.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, monthAnchor, E2E_USERS, E2E_STUB_RIDER } from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'
import { createAgreement, generateChargeForMonth } from '@/lib/db/agreements'
import { barnToday } from '@/lib/barn-timezone'
import { firstOfMonth } from '@/lib/local-day'
import type { Agreement, AgreementChargeRow } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// What the checklist's names resolve to in this barn
// ---------------------------------------------------------------------------

/**
 * The checklist's "Dana" and "Emery", derived from the fixtures' own constants rather than
 * written as literals — `resolveMemberNames` composes a card's rider line as
 * `${first_name} ${last_name}`, so these are the seed's answer for what those cards must show.
 *
 * Dana is the `rider` login and Emery the `rider2` managed stub, the same substitution
 * `checklist-phase2-agreements-create.spec.ts` makes and for the same reason: a spec barn has no
 * dev-barn baseline, and neither name is new, so `E2E_STUB_RIDER`'s collision constraint has
 * nothing fresh to bind.
 */
const DANA = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const EMERY = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`

const APPLE = 'Apple'
const BUTTER = 'Butter'

/**
 * Three fees, all distinct, and the distinctness is load-bearing twice over.
 *
 * `LEASE_FEE` is the checklist's own "$150". `BOARD_FEE` differs from it so the two
 * "each of those cards shows its fee" reads cannot agree by coincidence, and differs from
 * `barns.default_board_fee`'s column default of 1000 so nothing here can be satisfied by an
 * unseeded barn.
 *
 * `ONE_TIME_FEE` is what identifies the one-time lease's card: it is the second lease on the
 * same rider and the same horse, so the fee is the only rendered field that tells them apart
 * without keying on the status under test — the statuses differ too, which is the point of the
 * contrast, and is exactly why the status cannot also be the selector.
 * The checklist names no fee for it, and the form requires one.
 *
 * Whole numbers, so `formatFee` (`toLocaleString` with `style: 'currency'`) round-trips to an
 * unambiguous "$150.00" rather than to something that could arrive as either "$512.5" or
 * "$512.50".
 */
const LEASE_FEE = 150
const BOARD_FEE = 725
const ONE_TIME_FEE = 275

/**
 * `formatFee`'s output, written out rather than imported: deriving an expectation from the code
 * under test makes it agree with any bug in that code. Only the number comes from the seed
 * constants above.
 *
 * Valid for the three fees this file uses and no further — `formatFee` is `toLocaleString` with
 * `style: 'currency'`, which groups thousands, so a fee of 1000+ would render `$1,000.00` and this
 * would say `$1000.00`. Kept simple rather than reimplementing the grouping, since a fee bump into
 * that range should fail loudly here rather than be quietly absorbed.
 */
const feeText = (fee: number) => `$${fee}.00`

/**
 * The payment type the pill-removal test picks. Any non-empty value works —
 * `mark_agreement_charge_paid` sets `collected = (p_payment_type IS NOT NULL)`, so it is the
 * non-emptiness rather than the value that clears the badge.
 */
const PAID_WITH = 'venmo'

/** `SavedIndicator`'s text — the settle point after the charge-row write. */
const SAVED_TEXT = '✓ Saved'

/** The agreement detail page's h1 for a lease (`${label} Detail`). */
const LEASE_DETAIL_HEADING = 'Lease Detail'

/**
 * `Card`'s own container classes, reduced to the three tokens that say the anchor *is* the card
 * box: `cardBaseClass` contributes `rounded-lg` and `border`, and the `href` branch adds `block`.
 *
 * Written out rather than imported from `Card.tsx`. Importing `cardBaseClass` would make the
 * assertion agree with any change to it, which is the opposite of what "the whole card is the
 * link" is meant to detect — a refactor that moved the box onto a wrapper `<div>` and left the
 * anchor as an inner element would keep `cardBaseClass` intact and still break the claim.
 */
const CARD_BOX_CLASSES = ['block', 'border', 'rounded-lg']

/**
 * The single class token that makes the pill amber (`Badge`'s `toneClasses.amber`).
 *
 * A class read rather than a computed colour, deliberately: Tailwind 4 ships its palette in
 * `oklch()`, so a digit-regex read of `getComputedStyle` yields nonsense, and normalising through
 * a canvas would be a lot of machinery to assert something the class already states exactly.
 * Only the light-mode background token is checked — `Badge.test.tsx` owns the per-tone contrast
 * claim in both schemes; what this file needs is that the tone is amber and not red or gray.
 */
const AMBER_TOKEN = 'bg-amber-100'

/**
 * Every shape a "View"/"Edit" affordance could take. Shape, not labelling: an icon-only control
 * defeats a text query, but a `<div role="button">` defeats an `a, button` query just as
 * thoroughly, and both are real affordances on a card.
 */
const CONTROL_SELECTOR = 'a, button, input, select, summary, [role="button"], [role="link"]'

/**
 * The one sanctioned numeric timeout (`support/test.ts`'s timeout block, #1469): a web-first
 * `expect` matcher runs on expect's own 5s default, which `test.slow()` does NOT raise — it
 * triples the *test* timeout and touches nothing else. So a number here LOOSENS, where a number
 * on a `waitFor`/`waitForURL` could only tighten.
 *
 * Applied to the matchers that run after a write in their own test: the two post-`selectOption`
 * reads and the post-save list read. Matchers reading a page a `goto` already settled keep the
 * 5s default. Same value and reasoning as both sibling phase-2 agreements specs.
 */
const SETTLE_AFTER_WRITE = 15_000

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------

let monthlyLease: Agreement
let boardingAgreement: Agreement
let pastCharge: AgreementChargeRow

/**
 * The `period` the seeded past charge must land on, in the barn's own frame.
 *
 * `monthAnchor(1, tz)` is day 15 of the barn's previous month as a UTC-digit instant, and
 * `generateChargeForMonth` re-derives the period as `firstOfMonth(barnDay(at, tz))`. Day 15 is
 * far enough from either edge that no zone in `BARN_TIMEZONES` can shift it out of its month, so
 * the answer is that month's 1st — which is what this reconstructs from the anchor's own digits
 * rather than by re-running the app's derivation.
 */
const expectedPastPeriod = (anchor: Date) => `${anchor.toISOString().slice(0, 7)}-01`

const barn = withBarn('phase2-agreements-cards', async ({ supabase, barn, members }) => {
  // Two horses with distinct names, so the two "each of those cards shows its horse" reads
  // cannot agree by coincidence. Apple carries both leases, which is what the checklist's
  // one-time line asks for and what makes the fee the discriminator between their cards.
  const apple = await addHorse(supabase, barn.id, APPLE)
  const butter = await addHorse(supabase, barn.id, BUTTER)

  // Slice 4's two agreements, reproduced through the function its action calls. No `startDate`
  // on either: the RPC defaults it to the barn's own day, which is what keeps this file clear of
  // the barn-vs-host zone axis entirely.
  monthlyLease = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider.membershipId,
      horseId: apple.id,
      fee: LEASE_FEE,
      kind: 'lease',
      cadence: 'monthly',
    },
    supabase
  )

  boardingAgreement = await createAgreement(
    {
      barnId: barn.id,
      riderId: members.rider2.membershipId,
      horseId: butter.id,
      fee: BOARD_FEE,
      kind: 'board',
      cadence: 'monthly',
    },
    supabase
  )

  // The Unpaid pill's precondition. See the header for why a monthly agreement's own first
  // charge can never satisfy it, and why this goes through the RPC rather than through a
  // hand-written `agreement_charges` + `transactions` pair.
  const anchor = monthAnchor(1, barn.timezone)
  pastCharge = await generateChargeForMonth(monthlyLease.id, barn.id, barn.timezone, anchor, supabase)

  // A POSITIVE ANCHOR ON THE PRECONDITION, not a sanity check — do not delete either half.
  //
  // Everything downstream of the pill claims rests on this charge being (a) real, (b) where the
  // anchor says, and (c) in a month strictly before the barn's current one. None of that is
  // observable from the assertions themselves: a pill that failed to appear looks identical
  // whether the rendering regressed or the seed quietly produced a current-month charge that
  // `.lt(firstOfCurrentMonth)` was always going to exclude. Worse, the second case would make
  // `marking_the_past_charge_paid_removes_the_unpaid_pill` PASS — its expectation is that the
  // pill is gone, and a pill that never existed satisfies it. A mutation pass cannot see any of
  // that on its own, because setup that did nothing breaks no assertion.
  //
  // `generate_agreement_charge` is also `ON CONFLICT (agreement_id, period) DO NOTHING` and
  // returns the pre-existing row on a collision — and the agreement already has a current-month
  // charge — so a period that had silently resolved to the current month comes back looking
  // exactly like a success.
  //
  // THE TWO CHECKS ARE SEPARATE BECAUSE THE FIRST STRUCTURALLY CANNOT MAKE THE SECOND'S CLAIM,
  // which this file's mutation pass demonstrated rather than the author noticing: `expected` is
  // derived from `anchor`, so moving the anchor moves BOTH sides of that comparison and it
  // agrees with itself. Written as one check, `monthAnchor(0, …)` — a charge in the current
  // month, the exact state the pill can never badge — passed the guard untouched. The second
  // check is the one that binds to the precondition rather than to the anchor, and it makes the
  // same comparison `getUnpaidAgreementIds` does.
  const expected = expectedPastPeriod(anchor)
  if (pastCharge.period !== expected) {
    throw new Error(
      `the seeded charge landed on ${pastCharge.period}, not on ${expected} as its anchor names — generateChargeForMonth did not honour the month it was given`
    )
  }

  const currentMonth = firstOfMonth(barnToday(barn.timezone))
  if (!(pastCharge.period < currentMonth)) {
    throw new Error(
      `the seeded charge's period ${pastCharge.period} is not before the barn's current month ${currentMonth} — the Unpaid pill's precondition is not in place, and the tests that assert the pill's absence would pass against a pill that never appeared`
    )
  }
})

// ---------------------------------------------------------------------------
// Addresses
// ---------------------------------------------------------------------------

const listUrl = (kind: string) => `/barn/${barn.slug}/agreements?kind=${kind}`
const leaseDetailUrl = (id: string) => `/barn/${barn.slug}/agreements/${id}?kind=lease`

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** Any lease detail page — the sync point for a click whose target id is not known in advance. */
const atSomeLeaseDetail = () =>
  new RegExp(`/barn/${barn.slug}/agreements/${UUID}\\?kind=lease$`)

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

/**
 * Every card on the list currently rendered.
 *
 * `checklist-phase2-agreements-create.spec.ts`'s locator, copied rather than hoisted — a shared
 * helper would live under `e2e/support/**`, which is `scripts/select-specs.sh`'s `ALWAYS_FULL`
 * and would force every diff touching it to a full-suite run. Its reasoning holds unchanged
 * here: the `<main>` scope excludes the nav's two `…/agreements?kind=…` entries, and the
 * `:not(…/new…)` half excludes the page's own Add button, without which an EMPTY list reads as
 * one card.
 */
const agreementCards = (page: Page) =>
  page.locator('main a[href*="/agreements/"]:not([href*="/agreements/new"])')

/**
 * One card, addressed by the agreement the seed created.
 *
 * The id comes from `createAgreement`'s return value, never from an href read off the list this
 * locator is about to measure. That direction matters: #1455 shipped a spec whose lists were
 * each compared against an href captured from that same list, which cannot tell "shows its own
 * agreement" from "shows something".
 */
const listCard = (page: Page, agreementId: string, kind: string) =>
  page.locator(`main a[href="/barn/${barn.slug}/agreements/${agreementId}?kind=${kind}"]`)

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

type CardRead = {
  /** How many cards the locator matched — the positive anchor for every absence below. */
  cards: number
  rider: string
  horse: string
  /**
   * Every `<span>` in the card's third `<p>`, as `[text, amberToken]`. That `<p>` is the whole of
   * the card's status line: `<span>{fee} · {status}</span>` followed by the optional
   * `<Badge tone="amber">Unpaid</Badge>`. Reading it as a sequence rather than as two separate
   * locators is what makes "next to its status" a structural claim — a pill rendered anywhere
   * else on the card does not join this array.
   */
  statusSpans: string[][]
  /**
   * Interactive DESCENDANTS of the card. The card is itself an anchor, so a card with no controls
   * of its own reports 0.
   *
   * Deliberately NOT just `a, button`: a control's shape is not its labelling, and
   * `[role="button"]`, `<input>`, `<select>` and `<summary>` are all real affordances a narrower
   * selector would score as zero.
   *
   * This number alone is NOT the whole "no separate View/Edit buttons" claim, and the reason is a
   * parser rule rather than a selector one — see `mainControls`.
   */
  controls: number
  /** The anchor's own box classes; see `CARD_BOX_CLASSES`. */
  box: string[]
}

/**
 * One card, read in a single browser-side pass.
 *
 * One `evaluateAll` rather than a locator per field, so every value in a `CardRead` comes from
 * the same DOM snapshot — a field-by-field read could straddle a re-render and report a
 * combination that never existed on screen.
 *
 * The inline `waitFor` is `support/read.ts`'s reasoning applied to a structural read:
 * `evaluateAll` on a not-yet-rendered locator yields `[]`, and `[]` must never reach an
 * expectation as a shortened answer. It is also what makes `cards: 0` a failure rather than a
 * silently accepted result — this read has no retry of its own, and every call site either
 * follows a settled `goto` or is wrapped in `expect.poll`.
 *
 * `textContent`, not `innerText`: several of these strings sit under Tailwind text transforms
 * elsewhere in the app, and `read.ts` records the resulting casing trap. Nothing on a card is
 * transformed today, and reading the raw node text keeps it that way if something becomes so.
 *
 * CONTRACT: the field values are read from `els[0]` while `cards` reports `els.length`, so this is
 * only sound if the caller ASSERTS `cards`. Every call site does — `fieldOnBothCards` carries it
 * through rather than projecting it away, which it originally did, and that omission left the four
 * "each of those cards shows its X" tests unable to notice a list rendering the same agreement
 * twice.
 */
async function readCard(card: Locator): Promise<CardRead> {
  await card.first().waitFor()
  return card.evaluateAll(
    (els, [amberToken, controlSelector]) => {
      const el = els[0]
      const paragraphs = Array.from(el.querySelectorAll('p'))
      const statusLine = paragraphs[2]
      return {
        cards: els.length,
        rider: paragraphs[0]?.textContent ?? '',
        horse: paragraphs[1]?.textContent ?? '',
        statusSpans: Array.from(statusLine?.querySelectorAll('span') ?? []).map((span) => [
          span.textContent ?? '',
          (span.getAttribute('class') ?? '').split(/\s+/).find((c) => c === amberToken) ?? '',
        ]),
        controls: el.querySelectorAll(controlSelector).length,
        box: (el.getAttribute('class') ?? '')
          .split(/\s+/)
          .filter((c) => c === 'block' || c === 'border' || c === 'rounded-lg')
          .sort(),
      }
    },
    [AMBER_TOKEN, CONTROL_SELECTOR]
  )
}

/** The `{fee} · {status}` span's two halves. An absent status line yields '', which fails. */
const feeOf = (c: CardRead) => (c.statusSpans[0]?.[0] ?? '').split(' · ')[0] ?? ''
const statusOf = (c: CardRead) => (c.statusSpans[0]?.[0] ?? '').split(' · ')[1] ?? ''

/**
 * One field of the monthly lease's card and of the boarding card, in one value.
 *
 * "Each of those cards shows its X" is a claim about both cards, and asserting them together is
 * what stops a card that rendered the list page's own `?? '—'` fallback — which is where that dash
 * comes from, not from `resolveMemberNames`/`resolveHorseNames`, neither of which ever returns one
 * — from passing because the other card happened to be right. The two live on different
 * kind-scoped lists, so this visits both.
 *
 * TWO COUNTS TRAVEL WITH EVERY FIELD, and neither is decoration:
 *
 *   - `card` is `readCard`'s `cards`, which the contract above requires the caller to assert. It
 *     pins the href-addressed locator to exactly one element, so a list rendering the same
 *     agreement twice fails here rather than being read from `els[0]` and passing.
 *   - `list` is how many cards the kind-scoped list holds at all. These four tests are the only
 *     ones that run before any write, so this is the file's earliest tripwire on the list showing
 *     something it should not — kind-scoping itself is slice 4's claim (#1455), but a read of
 *     "each of THOSE cards" that never notices a third card is not making its own claim either.
 *
 * Not wrapped in `expect.poll` at its call sites: both reads follow a `goto` and `readCard`'s own
 * `waitFor`, the content is server-rendered, and re-running the whole thing would re-issue two
 * navigations per poll.
 */
type FieldRead<T> = { card: number; list: number; value: T }

async function fieldOnBothCards<T>(
  page: Page,
  pick: (c: CardRead) => T
): Promise<{ lease: FieldRead<T>; board: FieldRead<T> }> {
  await page.goto(listUrl('lease'))
  const leaseCard = await readCard(listCard(page, monthlyLease.id, 'lease'))
  const lease = { card: leaseCard.cards, list: await agreementCards(page).count(), value: pick(leaseCard) }

  await page.goto(listUrl('board'))
  const boardCard = await readCard(listCard(page, boardingAgreement.id, 'board'))
  const board = { card: boardCard.cards, list: await agreementCards(page).count(), value: pick(boardCard) }

  return { lease, board }
}

/** `{ card: 1, list: 1, value }` — the shape every "each of those cards" expectation takes. */
const only = <T,>(value: T): FieldRead<T> => ({ card: 1, list: 1, value })

/**
 * Every card's `{fee} · {status}` line on the list currently rendered, order-independent.
 *
 * THE LENGTH OF THE EXPECTATION IS LOAD-BEARING — do not narrow a call site to just the card it
 * names. This reads the whole list rather than one card, which makes it the only assertion in the
 * file that would notice an agreement of the wrong kind appearing on the Leases list. Reduced to a
 * containment check, or to the one-time lease's line alone, that goes away silently.
 */
async function statusLines(page: Page): Promise<string[]> {
  const cards = agreementCards(page)
  await cards.first().waitFor()
  const lines = await cards.evaluateAll((els) =>
    els.map((el) => el.querySelectorAll('p')[2]?.querySelector('span')?.textContent ?? '')
  )
  return lines.sort()
}

// ---------------------------------------------------------------------------
// The charges table
// ---------------------------------------------------------------------------

/**
 * `formatChargePeriod`'s output for a charge period, written independently of the app's copy.
 *
 * Used only to LOCATE the past-month row among the two the lease carries — never as an
 * expectation, so "derive the expectation from the code under test" does not apply. A mismatch
 * cannot pass silently either: the row locator would match nothing and the count assertion in
 * the test that uses it fails outright.
 *
 * `timeZone: 'UTC'` matches `format-date.ts`: a `period` is a zoneless calendar date, and
 * `new Date('2026-07-01')` is UTC midnight, so forcing UTC is what stops the host's zone from
 * rendering the previous month.
 */
const periodLabel = (period: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(period)
  )

const chargeRows = (page: Page) => page.locator('tbody tr')

/**
 * The past-month charge's row, addressed by its period.
 *
 * Positional addressing would work today — `getChargesForAgreement` orders `period` descending,
 * so the past row is the second of two — but it would silently start driving the *current*
 * month's charge if that ordering ever flipped, and the resulting failure would read as a
 * regression in the pill rather than in the row this test meant to touch.
 */
const pastChargeRow = (page: Page) => chargeRows(page).filter({ hasText: periodLabel(pastCharge.period) })

/**
 * The ✓ Saved flash inside the past charge's row.
 *
 * Scoped to the row rather than to the page, and located by text rather than by role:
 * `SavedIndicator` is an `aria-live="polite"` span, and Next renders a permanent `role="alert"`
 * announcer into every document that a bare role query would collect.
 */
const savedIndicator = (page: Page) => pastChargeRow(page).getByText(SAVED_TEXT, { exact: true })

// ---------------------------------------------------------------------------
// The detail page
// ---------------------------------------------------------------------------

/**
 * The detail page's heading and its Status field, in one value.
 *
 * The `<dl>` is read as `dt`/`dd` pairs through `textContent` rather than located by a text
 * matcher, because every `dt` carries Tailwind's `uppercase` — a CSS transform, so an
 * `innerText`-based matcher looks for "Status" and finds "STATUS". `read.ts` records the same
 * trap for `Th`.
 *
 * The heading travels with the status so the read cannot be satisfied by a page that failed:
 * `waitUntil: 'commit'` resolves before render, and a `notFound()` reaches the same URL.
 */
async function detailStatus(page: Page): Promise<{ heading: string; status: string }> {
  const heading = page.getByRole('heading', { name: LEASE_DETAIL_HEADING, exact: true })
  await heading.waitFor()
  const fields = page.locator('dl > div')
  await fields.first().waitFor()
  const pairs = await fields.evaluateAll((els) =>
    els.map((el) => [el.querySelector('dt')?.textContent ?? '', el.querySelector('dd')?.textContent ?? ''])
  )
  return {
    heading: (await heading.textContent()) ?? '',
    status: pairs.find(([term]) => term === 'Status')?.[1] ?? '',
  }
}

// ---------------------------------------------------------------------------
// The chain, in the order the checklist walks it
// ---------------------------------------------------------------------------
//
// `describe.serial` is what contains fact 15 here rather than merely surviving it: these tests
// share one barn and two of them write to it, so on a failure the remainder are skipped
// instead of running against a half-mutated fixture and reporting a second, invented failure.
//
// The seven read-only tests run first, and the six field reads among them observe the Unpaid pill
// in place, which is the state the seed leaves. Nothing they assert is affected by it: the pill is
// a separate `<span>` from the `{fee} · {status}` one every field read below goes through.
test.describe.serial('agreement cards', () => {
  // "Each of those cards shows its rider"
  test('each_agreement_card_shows_its_rider @manager', async ({ page }) => {
    expect(await fieldOnBothCards(page, (c) => c.rider)).toEqual({ lease: only(DANA), board: only(EMERY) })
  })

  // "Each of those cards shows its horse"
  test('each_agreement_card_shows_its_horse @manager', async ({ page }) => {
    expect(await fieldOnBothCards(page, (c) => c.horse)).toEqual({ lease: only(APPLE), board: only(BUTTER) })
  })

  // "Each of those cards shows its fee"
  //
  // The expectation is `formatFee`'s currency form written out, with only the numbers coming
  // from the seed constants — deriving the string by calling `formatFee` itself would make the
  // assertion agree with any bug in it. Slice 7's `memberCardLabel` makes the same split.
  test('each_agreement_card_shows_its_fee @manager', async ({ page }) => {
    expect(await fieldOnBothCards(page, feeOf)).toEqual({
      lease: only(feeText(LEASE_FEE)),
      board: only(feeText(BOARD_FEE)),
    })
  })

  // "Each of those cards shows **Active** status"
  //
  // Both agreements are `is_active` and `monthly`, which is `getAgreementStatusLabel`'s Active
  // branch. Read as the second half of the `·` line rather than as a substring search for the
  // word, so a card reading "Complete" or "Ended" fails here instead of anywhere else.
  //
  // Alone among the four field tests this one expects the SAME value on both sides, because both
  // agreements really are Active — so unlike DANA/EMERY or APPLE/BUTTER it cannot, by itself,
  // distinguish a correct page from a `getAgreementStatusLabel` that returned the constant
  // 'Active'. That discrimination is carried by
  // `a_one_time_lease_card_shows_complete_instead_of_active`, which asserts Active and Complete in
  // one expectation. Stated here so the pairing is not mistaken for redundancy at either end.
  test('each_agreement_card_shows_active_status @manager', async ({ page }) => {
    expect(await fieldOnBothCards(page, statusOf)).toEqual({ lease: only('Active'), board: only('Active') })
  })

  // "The whole card is the link"
  //
  // Three things have to hold together for that sentence to be true, and no one of them is
  // enough on its own:
  //
  //   1. the element carrying the card's box IS the anchor (`box`), not a wrapper around it;
  //   2. every line of content is INSIDE that anchor (`rider`/`horse`/`statusSpans`);
  //   3. the link region really extends over that content, rather than the content merely being
  //      nested inside a nominally-full-width anchor that a click elsewhere would miss.
  //
  // (3) is the click, and it deliberately targets the *horse* line — the middle of the card,
  // furthest from where a title-only link would sit. Playwright clicks an element's centre, so
  // this is a click at the card's interior rather than at its anchor's origin.
  //
  // No hydration barrier: `Card` renders a real `next/link` anchor, so the click navigates
  // whether or not React is listening, and nothing downstream reads client-derived state. (A nav
  // *highlight* read would need one — a pre-hydration click is a document navigation and React
  // 19 will not reconcile a mismatched `aria-current` afterwards, fact 7 — but the highlight
  // lines here belong to slices 4 and 7.)
  test('the_whole_agreement_card_is_the_link @manager', async ({ page }) => {
    await page.goto(listUrl('lease'))

    const card = listCard(page, monthlyLease.id, 'lease')
    // `toEqual` on the WHOLE read, not `toMatchObject` on four keys. Claim (2) is that every line
    // of content is inside the anchor, and `statusSpans` is one of those lines — under
    // `toMatchObject` an unlisted key is unchecked, so the status paragraph escaping the anchor
    // (which is exactly what the parser does when a stray `<a>` is added mid-card, see the control
    // count below) would leave `statusSpans: []` and this test would still pass while claiming to
    // cover it. The pill is present at this point in the chain: nothing has marked the past charge
    // paid yet.
    expect(await readCard(card)).toEqual({
      cards: 1,
      rider: DANA,
      horse: APPLE,
      statusSpans: [
        [`${feeText(LEASE_FEE)} · Active`, ''],
        ['Unpaid', AMBER_TOKEN],
      ],
      controls: 0,
      box: CARD_BOX_CLASSES,
    })

    await card.locator('p').nth(1).click()
    // A KIND-AGNOSTIC sync point, deliberately not `leaseDetailUrl(monthlyLease.id)`. Waiting on
    // the exact id would carry this test's real claim — that the deep click landed on *this*
    // card's agreement — inside a helper, where a regression surfaces as a timeout rather than
    // as an assertion, and where a mutation pass cannot score it (a timeout is not a kill).
    // Waiting only on "some lease detail page" leaves the identity claim in the expectation
    // below, which is the same split slice 4 makes for its two URL tests.
    await page.waitForURL(atSomeLeaseDetail(), { waitUntil: 'commit' })

    expect(new URL(page.url()).pathname).toBe(`/barn/${barn.slug}/agreements/${monthlyLease.id}`)
    await expect(
      page.getByRole('heading', { name: LEASE_DETAIL_HEADING, exact: true })
    ).toBeVisible()
  })

  // "No separate View/Edit buttons appear on that card"
  //
  // The absence and its anchor in ONE object (rule 4, #1434): a card that never rendered reports
  // `cards: 0` with empty strings and fails, where a bare `toHaveCount(0)` against a
  // View-or-Edit locator is satisfied on its first poll (fact 18) and would pass on a blank page.
  //
  // A control COUNT rather than a search for the words "View" and "Edit": the claim is that the
  // card offers no affordance of its own, and a count catches one whatever it is labelled,
  // including the icon-only kind a text query would miss.
  //
  // TWO COUNTS, AND THE SECOND IS THE ONE THAT CATCHES THE CHECKBOX'S OWN EXAMPLE. A descendant
  // count alone is blind to a nested `<a>` — and it is blind for a parser reason, not a selector
  // one. HTML tree construction runs the adoption agency algorithm on an `a` start tag while an
  // `a` is still open, so a `<Link>View</Link>` added inside `<Card href>` is not nested at all:
  // the parser closes the card's anchor and makes the new one its SIBLING. `card.controls` still
  // reads 0, `rider`/`horse`/`box` are untouched, and a visible "View" link on every card sails
  // through. (A nested `<button>` is retained by the parser, so an icon-only Edit *button* is
  // caught by the descendant count — it is precisely the View *link*, the wording the checklist
  // uses, that is invisible to it.)
  //
  // So the page-wide count is the real assertion and the descendant count is the narrow one.
  // `<main>` holds exactly one control per card plus the Add Lease button — `Button href` renders
  // an anchor — and the lease list holds one card at this point in the chain, so 2 is the whole
  // interactive surface. A reparented sibling anchor lands inside `<main>` and moves this to 3.
  test('no_view_or_edit_buttons_appear_on_an_agreement_card @manager', async ({ page }) => {
    await page.goto(listUrl('lease'))

    const card = await readCard(listCard(page, monthlyLease.id, 'lease'))
    const mainControls = await page.locator('main').locator(CONTROL_SELECTOR).count()

    expect({
      cards: card.cards,
      rider: card.rider,
      fee: feeOf(card),
      controls: card.controls,
      mainControls,
    }).toEqual({
      cards: 1,
      rider: DANA,
      fee: feeText(LEASE_FEE),
      controls: 0,
      mainControls: 2,
    })
  })

  // "On the monthly lease's detail page, leave a past month's charge unpaid (Payment Type blank)
  // → back on the Leases list, that agreement's card shows an amber **Unpaid** pill next to its
  // status"
  //
  // The seed leaves that charge unpaid — "leave" is not an action, and the header explains why
  // the chain cannot produce the charge by hand. What this asserts is the consequence.
  //
  // The whole status line as a sequence, which carries all three halves of the claim at once:
  // the pill's text is "Unpaid", its tone is amber, and it sits *next to the status* — an
  // adjacency this read expresses structurally, since only spans inside the `{fee} · {status}`
  // paragraph appear in the array at all. A pill rendered above the rider line would leave this
  // array one element long and fail.
  test('an_unpaid_past_charge_shows_an_amber_unpaid_pill_beside_the_card_status @manager', async ({
    page,
  }) => {
    await page.goto(listUrl('lease'))

    const card = await readCard(listCard(page, monthlyLease.id, 'lease'))
    expect({ cards: card.cards, statusSpans: card.statusSpans }).toEqual({
      cards: 1,
      statusSpans: [
        [`${feeText(LEASE_FEE)} · Active`, ''],
        ['Unpaid', AMBER_TOKEN],
      ],
    })
  })

  // "Mark that charge paid → refresh the list → the **Unpaid** pill disappears"
  //
  // Marked through the UI's own control, which is `mark_agreement_charge_paid` — the same route
  // the manager takes, and the function that sets `collected = (p_payment_type IS NOT NULL)` on
  // the ledger row `getUnpaidAgreementIds` reads.
  //
  // THE TWO ROW ASSERTIONS BEFORE THE DRIVE ARE THE PRECONDITION ANCHOR — do not delete them as
  // redundant. This test's expectation is that something is *gone*, and a pill that was never
  // there satisfies it just as well: marking the wrong row, or a charges table that rendered
  // nothing at all, both produce a green run. Pinning two rows and exactly one past-month row
  // first is what makes the pill's disappearance a transition rather than a snapshot.
  //
  // The current month's charge stays unpaid throughout, and that is the point — see the header.
  // The pill has to go while an unpaid charge remains on the agreement, which is what separates
  // "tracks a past outstanding charge" from "tracks any unpaid charge".
  test('marking_the_past_charge_paid_removes_the_unpaid_pill @manager', async ({ page }) => {
    test.slow()

    // THE BEFORE STATE, OBSERVED IN THIS TEST. The row assertions further down anchor the *drive
    // target*; they say nothing about the pill, which lives on another page. Without this read the
    // only evidence the pill was ever there is the previous test — an unstated ordering
    // dependency that `describe.serial` hides in a full run and that vanishes entirely under a
    // single-test rerun, which is how anyone iterating on a failure here would run it. A
    // `getUnpaidAgreementIds` that returned an empty set unconditionally would then satisfy the
    // final expectation vacuously. This turns the claim into an observed before/after.
    await page.goto(listUrl('lease'))
    expect(await readCard(listCard(page, monthlyLease.id, 'lease'))).toMatchObject({
      cards: 1,
      statusSpans: [
        [`${feeText(LEASE_FEE)} · Active`, ''],
        ['Unpaid', AMBER_TOKEN],
      ],
    })

    await page.goto(leaseDetailUrl(monthlyLease.id))
    // Fact 9's barrier. `ChargeRow` seeds `useState` from server props and renders markup
    // byte-identical pre- and post-hydration (fact 13), so it offers no zero-interaction signal
    // and a `selectOption` landing before React is listening moves the DOM value and writes
    // nothing — a 15s timeout on a ✓ Saved that was never going to appear.
    await waitForBarnPageHydrated(page)

    await expect(chargeRows(page)).toHaveCount(2)
    await expect(pastChargeRow(page)).toHaveCount(1)

    await pastChargeRow(page).locator('select').selectOption(PAID_WITH)

    // A settle point, not the assertion. `selectOption` resolves when React's onChange has been
    // dispatched, not when the Server Action has reached the database, and navigating away tears
    // the document down mid-flight. `handlePaymentTypeChange` calls `flash()` only after
    // awaiting the action and only on its non-error branch, so this cannot be satisfied by an
    // in-flight or failed save. Measured by slice 7 as a ~1-in-5 failure without it.
    await expect(savedIndicator(page)).toBeVisible({ timeout: SETTLE_AFTER_WRITE })

    await page.goto(listUrl('lease'))

    await expect
      .poll(
        async () => {
          const card = await readCard(listCard(page, monthlyLease.id, 'lease'))
          return { cards: card.cards, statusSpans: card.statusSpans }
        },
        { timeout: SETTLE_AFTER_WRITE }
      )
      .toEqual({ cards: 1, statusSpans: [[`${feeText(LEASE_FEE)} · Active`, '']] })
  })

  // "Add a one-time lease (rider Dana, horse Apple, cadence One time) → its card in the Leases
  // list shows **Complete** instead of Active"
  //
  // Driven through the form rather than seeded — see the header for why the cadence round-trip
  // is this slice's to close. Reached by `goto` on the form URL rather than by clicking Add
  // Lease: that click, and the `?kind=lease` it carries, are slice 4's line
  // ("**Add Lease** → the nav still shows **Leases** highlighted"), and re-asserting it here
  // would put this test's failure in someone else's territory.
  //
  // BOTH cards in one expectation, because "**Complete** instead of Active" is a CONTRAST.
  // Asserting only the new card would pass in a world where `getAgreementStatusLabel` had
  // regressed to returning Complete for everything. Read as a sorted set of the two `{fee} ·
  // {status}` lines rather than per-card, since the list's order is not the claim — and the fee
  // is what identifies each card, the two leases being on the same rider and the same horse.
  //
  // Every string in the expectation comes from this file's own constants; nothing is captured
  // off the list it is compared against.
  test('a_one_time_lease_card_shows_complete_instead_of_active @manager', async ({ page }) => {
    test.slow()
    await page.goto(`/barn/${barn.slug}/agreements/new?kind=lease`)
    // Fact 9's barrier: the fee input is React-*controlled* (`value={fee}` + `onChange`), so a
    // fill landing before hydration moves the DOM value and the controlled re-render discards
    // it. The selects are uncontrolled and would survive, but the barrier has to precede the
    // whole interaction to be worth anything.
    await waitForBarnPageHydrated(page)

    await page.locator('#agreement-rider').selectOption({ label: DANA })
    await page.locator('#agreement-horse').selectOption({ label: APPLE })
    await page.locator('#agreement-cadence').selectOption('one_time')
    await page.locator('#agreement-fee').fill(String(ONE_TIME_FEE))
    await page.getByRole('button', { name: 'Add Lease', exact: true }).click()

    // `createAgreementAction` re-renders the form with a `role="alert"` and does not navigate on
    // every rejection path, so this is the "saved with no error" half as well as a sync point.
    // It cannot no-op (fact 3) — the pattern excludes the `/agreements/new` it was submitted from.
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/agreements\\?kind=lease$`), {
      waitUntil: 'commit',
    })

    await expect
      .poll(() => statusLines(page), { timeout: SETTLE_AFTER_WRITE })
      .toEqual([`${feeText(LEASE_FEE)} · Active`, `${feeText(ONE_TIME_FEE)} · Complete`].sort())
  })

  // "That one-time lease's detail page also shows **Complete**"
  //
  // Reached by clicking its card, which is how the checklist arrives and what binds the page to
  // the right agreement without this test having to know its id. The card is selected by its
  // fee — the only rendered field distinguishing the two leases — and the count assertion is
  // both that binding and the positive anchor for the read.
  test('a_one_time_leases_detail_page_shows_complete @manager', async ({ page }) => {
    await page.goto(listUrl('lease'))

    // THE ONLY CHECK IN THE FILE THAT A CARD'S HREF IS PER-AGREEMENT RATHER THAN PER-LIST, and it
    // can only be made here, because this is the first test to see the Leases list holding two
    // cards. Every earlier href-addressed read ran against a single-card list, where a page that
    // pointed every card at `agreements[0]` would still address correctly. That regression would
    // otherwise leave all ten tests green: `getAgreementsByBarn` orders `created_at` descending,
    // so `agreements[0]` on this list is the one-time lease, and the click below would land on
    // the right detail page by accident. If the monthly card no longer carries its own id, this
    // reads 0 and fails.
    await expect(listCard(page, monthlyLease.id, 'lease')).toHaveCount(1)

    const card = agreementCards(page).filter({ hasText: feeText(ONE_TIME_FEE) })
    await expect(card).toHaveCount(1)

    await card.click()
    await page.waitForURL(atSomeLeaseDetail(), { waitUntil: 'commit' })

    expect(await detailStatus(page)).toEqual({
      heading: LEASE_DETAIL_HEADING,
      status: 'Complete',
    })
  })
})
