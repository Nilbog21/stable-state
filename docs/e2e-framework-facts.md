# E2E framework facts

Eighteen things about `@playwright/test`, Chromium and React 19 that are not obvious, are not in
the places you would look for them, and each of which cost a batch at least one round — several
rediscovered independently by two or three slices. Facts 1–11 come from the #1187–#1252 batch,
12 and 13 from the 2026-08-04 backlog run, 14 from #1409's flake reproduction, 15 from #1426's
mutation pass, 16 and 17 from the #1422–#1426 fleet batch (16 found by #1423, 17 by #1426's review
fan-out, both harvested into this file by #1433), 18 from the same batch by way of a #1425 mutant
that survived, harvested by #1434; fact 10 was later
sharpened by #1385, which found its original unconditional form too broad, and again by 14, which
found its multipart observation load-bearing in the other direction. Every one is measured, not
inferred. The spec named after each fact carries the worked example, with fact 12 the exception by
construction: it exists to say why no spec does the thing it describes.

Facts 1 and 2 are stated in full where you meet them; the rest are stated here.

The index — headlines only, plus facts 7's and 10's inversions — is `e2e/CLAUDE.md`'s
`## Framework facts`, which is auto-loaded whenever `e2e/` is touched. **Numbering is append-only**:
a new fact takes the next number and no existing number ever moves. 87 citations across 29 files
name a fact by number, and renumbering breaks every one of them silently.

## Fact 1

**Timeouts come in three tiers, and only one of them wants a number.** Every `waitFor*` and
`expect(…).toPass()` is already unbounded; `expect.poll` and every web-first `expect` matcher run
on expect's 5s default, which `test.slow()` does not raise. So a number on the first two
*tightens* and a number on the third *loosens*. Full statement: `support/test.ts`'s Timeouts
block.

## Fact 2

**`support/read.ts`'s settled reads only reach what can become *visible*.** On an
`<option>` inside a collapsed `<select>`, or anything inside a closed `<details>`, the guard can
only run out the test's budget. Full statement: `support/read.ts`'s ceiling section.

## Fact 3

**`waitForURL` is a no-op sync point when the URL already matches.** A submit that redirects
to the page it was already on returns immediately and whatever follows races the redirect. Full
statement: `support/test.ts`'s URL block. *(#1204)*

## Fact 4

**Only `newContext({ storageState: { cookies: [], origins: [] } })` is anonymous.** The
`request` fixture and a bare `playwright.request.newContext()` both carry
`sb-<ref>-auth-token`, because the runner pushes `use.storageState` into them — "a fresh
context" is not a fresh session. Measured three ways: the two inheriting forms land a `/profile`
GET on `/profile`, only the explicit empty state lands on `/login`. The wrong forms fail
**silently**, returning a good authenticated response that a route with no auth check answers
identically. See `checklist-phase4-calendar-feed.spec.ts`'s `unauthenticatedRequest`, which
throws if it ever stops being that third form. *(#1208)*

**The same holds on the *browser* side, and the mechanism is one hook rather than two.** A bare
`browser.newContext()` carries `sb-<ref>-auth-token` too — measured by dropping the explicit
`storageState` from `checklist-phase1-terms-privacy.spec.ts`'s `anonPage` fixture, whose guard
then named the cookie on all six tests. `@playwright/test`'s `_setupArtifacts` fixture
(`node_modules/playwright/lib/index.js`) registers `runBeforeCreateBrowserContext` /
`runBeforeCreateRequestContext` instrumentation hooks that copy every `_combinedContextOptions`
key **not already present** into the caller's options bag, for *any* context the runner sees
built — fixture-made or hand-made. Two consequences, and both matter. An explicitly named key
wins, which is why the empty `storageState` survives; and an unnamed one is inherited, which is
why `baseURL` reaches a hand-made context and a relative `goto('/login')` resolves from it.
Reading `playwright-core`'s `Browser` class alone says the opposite — that class passes options
through untouched, because the back-fill happens in the runner above it, not in the client
library. *(#1422)*

## Fact 5

**`hasTouch` + `locator.tap()` does not isolate an element's `touchstart` path.** Chromium's
tap emulation emits the compatibility mouse events after the touch sequence, so a `mousedown`
listener serves the interaction. Measured by deleting `useOutsideDismiss`'s `touchstart`
listener and watching both tap tests still pass. That is faithful to a real phone — "dismisses
by tap" is genuinely asserted — but a spec meaning *the touch handler specifically* needs a
synthetic `TouchEvent`. *(#1207)*

## Fact 6

**`test.use({ viewport })` asserts nothing about the viewport unless a test reads it.**
`checklist-phase4-notifications-profile.spec.ts`'s four mobile tests all passed unchanged at
1280×800 — including the two whose entire claim is *"no horizontal scrolling at ~390px"*. Put
`page.viewportSize()!.width` in the expectation of any test whose checklist line says "at this
width". *(#1207)*

## Fact 7

**React 19 does not reconcile a mismatched *attribute* during hydration.** A server-rendered
`aria-pressed` — or any `aria-*`/`data-*` a client component computes from a clock or other
client-varying input — survives hydration *and* a subsequent state-change re-render; only a full
remount was observed to move it. Corollary, and the one with teeth: **a pinned clock only
reaches values the client computes.** A read taken pre-hydration, or off an attribute, silently
gets the server's answer, and the server's answer is usually right — so the assertion passes for
the wrong reason. Found by a break-the-code probe that *passed*. See
`checklist-phase4-barn-timezone.spec.ts`'s `hydrateByChangingHour`. *(#1252)*

## Fact 8

**A Server Action POST resolving does not imply React has committed the resulting state.**
The response landing and the DOM reflecting it are separate events, and nothing bridges them.
Where the control itself flips — an enabled state, a `Copied!` label — that flip is the sound
synchronisation point: `checklist-phase4-calendar-feed.spec.ts`'s regenerate test awaits the
POST and *then* `toBeEnabled()`, because `handleRegenerate` sets the new token and clears
`pending` in one continuation, so the button being interactive again means the state has
already advanced. Where nothing rendered changes at all, the POST *is* the only signal there
is — `checklist-phase4-horses-documents.spec.ts`'s `setReminderDate`, whose cell holds the
typed date in React state and shows it whether or not the save ever landed. *(#1208)*

## Fact 9

**Filling a React-controlled input immediately after `page.goto` can lose the fill to
hydration.** On a page that hasn't hydrated, `fill()` moves the DOM value and nothing else — no
`onChange` fires, no state updates, and a subsequent assertion about a state-derived warning
passes or fails for reasons unrelated to what it claims. Suite-wide risk; put a barrier from
`support/hydration.ts` in front of the fill. *(#1205)*

## Fact 10

**A click dispatched before React is listening is lost unless the served markup can carry it
on its own, and nothing replays it.** This is why a hydration barrier on an interaction-only page
has to *retry* rather than drive once and wait — a single drive that lands early can only run out
the budget. Both shapes now live in `support/hydration.ts` (#1280): `waitForHydrated` for a page
with markup that cannot exist before hydration, `hydrateByDriving` for a page that renders
identically until it is driven. Full statement, including what makes a signal trustworthy, is that
module's comment. *(#1199)*

The discriminator is the form's own markup, not the fact that a button was clicked. A click is
lost only where the behaviour lives in JS the browser doesn't have yet — `<form onSubmit={handler}>`,
whose server markup is a bare `<form>` the browser would GET. `<form action={serverAction}>` is
*not* in that class: React emits the enhanced markup with the response, measured as
`<form action="" encType="multipart/form-data" method="POST">` plus
`$ACTION_REF_*`/`$ACTION_*:0`/`$ACTION_*:1`/`$ACTION_KEY` hidden fields carrying the action id and
its bound arguments. An early click submits *that*, so the interaction survives and needs no
barrier. That multipart encoding is the *markup*'s, and describes only the pre-hydration submit — a
hydrated React dispatch of the same form posts `text/plain` like any other action call (#1409), so
it is not a way to recognise a form submission on the wire. Two conditions, both load-bearing: the
value passed to `useActionState` (or to `action=` directly) must be the Server Function itself or a
`.bind` of one — an inline `async () => …` closure wrapping it is an ordinary client function and
gets no markup, now caught by `eslint-rules/no-wrapped-server-action.js` — and the same is true of
a `<button onClick>` with no form around it. Reference:
`checklist-phase4-members-media.spec.ts`'s `deleting_a_member_document_removes_its_row`, whose
`goto`→`click` flaked until #1385 converted the component, and which now asserts that markup on
both of the member detail page's forms. *(#1385, #1396)*

## Fact 11

**Switching a tab or filter is a click on its `Pill`, not a re-`goto` with a different
query param.** The app's switchers are `<Pill href>` → a Next `Link`, so the user's tab change
costs no document load and a spec that re-navigates is paying for one the UI never asks for —
five of them, in the case this rule came from: `readTabExpenseTotals` in
`checklist-phase4-finances-outstanding.spec.ts` is why the check calling it was the suite's
slowest and the only one holding a timeout exemption. What makes the substitution safe
unconditionally, unlike rule 10's button, is that a pill is an anchor: a click landing before
React is listening navigates the document rather than being lost, so the worst case is the
`goto` you were doing anyway. The one thing it does need is a settle barrier before any
**one-shot** read — a soft nav's re-render races `innerText`/`textContent` and hands back the
previous tab's figure — so wait on something that differs *between* tabs (a first column
header, not a shared Gross/Expenses/Net one) with an auto-retrying matcher. *(#1244)*

## Fact 12

**The barn-vs-host zone axis is open, and cannot be closed from inside a spec.** The dev
server runs under `TZ=UTC` — measured by #1252's probe, which rendered a 4:00 PM Eastern lesson
as 8:00 PM from a Server Component with the barn zone dropped, and only then confirmed against
`package.json`'s `dev` script (pinned by #1221) — and the barn-day
checklist items fix the barn to Eastern, so a regression that reads the host's clock instead of
`barns.timezone` fails only in the ~4–5 hour window where the barn's day and the server's UTC day
differ — and passes unnoticed outside it. That window cannot be arranged: `page.clock.setFixedTime`
pins the browser, and the server's clock is unreachable from a browser context. Nor can any *date*
assertion separate all three frames at once, because Eastern always equals either the Honolulu day
or the UTC day; only an *hour* assertion does, which is how
`checklist-phase4-barn-timezone.spec.ts`'s pin-arithmetic items close the UTC axis on a different
page. This is the stated reason no spec pins the server clock — it is a known-open axis, not an
oversight, so don't spend a round rediscovering that it can't be closed. *(#1288)*

## Fact 13

**A page whose markup is byte-identical pre- and post-hydration has no barrier target at
all.** Facts 9 and 10 both prescribe a barrier, and both assume a signal exists; on some pages
neither shape in `support/hydration.ts` applies. Bare `/profile` is the measured example. Every
`ProfileForm` field is `useState`-seeded from a server prop, so the rendered value is the same
before and after hydration and `waitForHydrated` has nothing to bind to; and its only conditional
markup — the `error` and `saved` lines — appears solely in response to a real form submit, which
is not harmless to repeat, so `hydrateByDriving` has no safe control to drive. Where the
`?barn=<slug>` variant of the route is acceptable, the barn nav that `src/app/profile/layout.tsx`
then renders brings a target with it: the `UserMenu` popover toggle is `useState`-gated markup and
a toggle, so it is safe to re-dispatch. Reference implementation:
`checklist-phase56-nav-profile.spec.ts`'s `openAvatarMenu` (drive open, assert, then
`closeAvatarMenu` to leave the page as it was found). *(#1289)*

## Fact 14

**A `waitForResponse` predicate matched on URL alone names every Server Action a page's own
client components fire, not just the submission under test** — they all post to the page's URL,
and on the wire they are indistinguishable but for the `next-action` header, whose ids are build
outputs a spec cannot name. Resolving on the wrong one is not a stale read: the `page.reload()`
that follows **aborts the real action's in-flight POST**, so the mutation never runs and no
retrying assertion can converge on it. Where the action redirects, its 303 is the discriminator —
a property of the action's own code, unlike the encoding (see fact 10). The suite's three
URL-only call sites are safe only because their pages fire no competing actions. Full statement:
the stop-series test's comment in `checklist-phase5-lessons-cancel.spec.ts`. *(#1409)*

## Fact 15

**Playwright discards the worker process after any test failure and starts a new one.** The
replacement re-imports the spec file, so every module-scope variable resets and every `beforeAll`
re-runs — fixtures included, which for this suite means the barns are re-seeded. In a file whose
tests are *ordered* — one test performing a mutation the rest observe — the first failure
therefore silences everything after it: those tests run against freshly seeded state in which the
mutation never happened, and report timeouts and "did not complete" throws that say nothing about
their own claims. **The first `✘` in an ordered file is the finding; the rest is noise until it is
fixed.** `retries: 0` (playwright.config.ts) is the same property seen from the other side, and
its comment there has always said so about a *retry*; this is the same restart happening on the
*first* attempt of every later test.

Measured on `checklist-phase7-multi-barn.spec.ts`, whose whole-file mutant batch produced exactly
that pattern: eight 30s timeouts, a `no claim landing URL — the claim test did not complete` throw
from a test whose module variable the restart had reset, and one mutant that *passed* because the
element it asserted the absence of legitimately no longer existed in the re-seeded session. The
corollary, and the reason this is worth a numbered fact rather than a comment: **mutation-testing
an ordered file has to run one mutant per run, or re-establish the ordered state in `beforeAll`
for the duration of the pass.** A whole-file batch measures the restart, not the assertions —
and its survivors are false reassurance, not evidence. *(#1426)*

## Fact 16

**`getByRole` returns zero matches inside a `display:none` container**, because it resolves
against the **accessibility tree** rather than the DOM, and a `display:none` subtree is absent
from that tree even though every one of its elements is attached. Locating by tag —
`container.locator('a')` — is the one form that can still count them.

Measured, not inferred. #1423's "the desktop nav's section links are hidden below the md
breakpoint" check read `linksInDom: 0` against a container demonstrably carrying nine anchors.
That reading would have made the check's own **positive control unsatisfiable**: the count is
there so that a nav bar rendering no links at all cannot pass as a correctly-collapsed one, and a
locator that returns 0 either way cannot tell those two apart. A test that cannot distinguish
"correctly hidden" from "the page failed to render" is not a weaker test — it is asserting
something other than what its name claims.

This is a trap for **any spec asserting something is hidden**, which is a whole class of
responsive checklist line: the hidden state is exactly the state in which the natural locator
stops working, so the hazard arrives at the moment the assertion becomes interesting. Same family
as fact 2's visibility ceiling — an element that is attached but unreachable by the reader you
picked — reached through the accessibility tree instead of through `waitFor`. Fixed in #1423 with
a tag-based `desktopNavAnchors` for that one count, keeping the role query everywhere the
container is visible, so the a11y-tree semantics are still exercised where they hold. Reference
implementation: `checklist-phase1-nav-responsive.spec.ts`'s `desktopNavAnchors`. *(#1423)*

## Fact 17

**A wait predicate satisfiable only by the success path cannot observe the failure it exists to
catch.** The wait then constrains the *helper's* return value rather than the app's behavior, and
every assertion downstream of it inherits that — passing on a property established by
construction.

Measured on `checklist-phase7-multi-barn.spec.ts`'s `claimInvite`. The obvious spelling is
`waitForURL(new RegExp('/barn/<slug>/?$'))`, and Playwright matches a `waitForURL` regex against
the **whole URL**, query included — so `acceptInvite`'s failure redirect,
`/barn/<slug>/register?token=…&error=1`, could never satisfy it. Every URL the helper returned
carried an empty query *by construction*, which is precisely what the
`the_second_barn_claim_produced_no_error_redirect` check exists to detect. The check would have
read as covered while asserting nothing.

The reason this is worth a numbered fact rather than a comment is how it survives review: **a
mutant of the expectation literal still goes red**, because the success path is genuinely being
waited on, so a mutation pass is structurally blind to this class — the defect is in what the
predicate *cannot* match, and no mutation of the matching branch reaches it. Four of six review
agents found it independently by reading. Fixed in #1426 as a two-branch predicate admitting both
outcomes (`url.pathname !== registerPath || url.searchParams.has('error')`), leaving the
discrimination to the assertions that follow, which is where it belongs. Note that the error
redirect keeps `/register`'s pathname, so "left the page" alone would not have worked either — the
query is the discriminator. Same polarity as this suite's third spec-maintenance rule
([`e2e-spec-maintenance.md`](e2e-spec-maintenance.md#rule-3)): an assertion that can only be
satisfied one way is not an assertion. *(#1426)*

## Fact 18

**A web-first matcher whose expectation is "nothing" is satisfied on its first poll.**
`toHaveCount(0)`, `not.toBeVisible` and `not.toBeAttached` all have the empty page as a passing
state, so unlike every other matcher in the suite they get no retry budget working for them: the
one poll that decides them can land while the document is still committing, and it reads zero
because nothing has rendered yet — not because the thing under assertion is gone.

Measured, not inferred, and measured by accident. #1425 planted a `toHaveCount(0)` as a mutant on
a link that demonstrably renders on that page, expecting it to die. It **survived**. The mutant was
at fault rather than the test: re-run against the expected value it died immediately. A mutant that
survives on a locator you can watch render is the clearest possible statement that the assertion is
being decided before the page exists.

What makes this worth a numbered fact is how ordinary the vulnerable shape is — `goto`, then assert
absent, two lines, nothing about it looks like a race — and that the shape is exactly what an
absence check naturally wants to be. The audit in #1434 found 13 of the suite's 41 executable
absence assertions in it, including two reached through a `waitForURL` sync point rather than a
bare `goto` — one inherited from a helper ending on `{ waitUntil: 'commit' }` — which pins the
navigation and proves nothing about the render.

Same family as fact 16 (an assertion that cannot tell "correctly hidden" from "the page failed to
render") and fact 17 (a predicate satisfiable only one way), reached through the matcher's polling
contract instead. The fix is a same-test positive anchor, which is
[`e2e-spec-maintenance.md`](e2e-spec-maintenance.md#rule-4)'s fourth rule; that rule also carries
why a paired positive *test* does not substitute for one. *(#1425, #1434)*
