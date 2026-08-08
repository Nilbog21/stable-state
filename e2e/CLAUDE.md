# E2E

The Playwright checklist suite. Harness, seeding and isolation live in `support/test.ts` and
`support/fixtures.ts`; run it via `scripts/run-checklist-suite.sh`.

## Framework facts (#1279)

Fourteen things about `@playwright/test`, Chromium and React 19 that are not obvious, are not in
the places you would look for them, and each of which cost a batch at least one round — several
rediscovered independently by two or three slices. Facts 1–11 come from the #1187–#1252 batch,
12 and 13 from the 2026-08-04 backlog run, 14 from #1409's flake reproduction; fact 10 was later
sharpened by #1385, which found its original unconditional form too broad, and again by 14, which
found its multipart observation load-bearing in the other direction. Every one is measured, not
inferred. The spec named after each fact carries the worked example, with fact 12 the exception by
construction: it exists to say why no spec does the thing it describes.

Facts 1 and 2 are stated in full where you meet them; the rest are stated here.

**1. Timeouts come in three tiers, and only one of them wants a number.** Every `waitFor*` and
`expect(…).toPass()` is already unbounded; `expect.poll` and every web-first `expect` matcher run
on expect's 5s default, which `test.slow()` does not raise. So a number on the first two
*tightens* and a number on the third *loosens*. Full statement: `support/test.ts`'s Timeouts
block.

**2. `support/read.ts`'s settled reads only reach what can become *visible*.** On an
`<option>` inside a collapsed `<select>`, or anything inside a closed `<details>`, the guard can
only run out the test's budget. Full statement: `support/read.ts`'s ceiling section.

**3. `waitForURL` is a no-op sync point when the URL already matches.** A submit that redirects
to the page it was already on returns immediately and whatever follows races the redirect. Full
statement: `support/test.ts`'s URL block. *(#1204)*

**4. Only `newContext({ storageState: { cookies: [], origins: [] } })` is anonymous.** The
`request` fixture and a bare `playwright.request.newContext()` both carry
`sb-<ref>-auth-token`, because the runner pushes `use.storageState` into them — "a fresh
context" is not a fresh session. Measured three ways: the two inheriting forms land a `/profile`
GET on `/profile`, only the explicit empty state lands on `/login`. The wrong forms fail
**silently**, returning a good authenticated response that a route with no auth check answers
identically. See `checklist-phase4-calendar-feed.spec.ts`'s `unauthenticatedRequest`, which
throws if it ever stops being that third form. *(#1208)*

**5. `hasTouch` + `locator.tap()` does not isolate an element's `touchstart` path.** Chromium's
tap emulation emits the compatibility mouse events after the touch sequence, so a `mousedown`
listener serves the interaction. Measured by deleting `useOutsideDismiss`'s `touchstart`
listener and watching both tap tests still pass. That is faithful to a real phone — "dismisses
by tap" is genuinely asserted — but a spec meaning *the touch handler specifically* needs a
synthetic `TouchEvent`. *(#1207)*

**6. `test.use({ viewport })` asserts nothing about the viewport unless a test reads it.**
`checklist-phase4-notifications-profile.spec.ts`'s four mobile tests all passed unchanged at
1280×800 — including the two whose entire claim is *"no horizontal scrolling at ~390px"*. Put
`page.viewportSize()!.width` in the expectation of any test whose checklist line says "at this
width". *(#1207)*

**7. React 19 does not reconcile a mismatched *attribute* during hydration.** A server-rendered
`aria-pressed` — or any `aria-*`/`data-*` a client component computes from a clock or other
client-varying input — survives hydration *and* a subsequent state-change re-render; only a full
remount was observed to move it. Corollary, and the one with teeth: **a pinned clock only
reaches values the client computes.** A read taken pre-hydration, or off an attribute, silently
gets the server's answer, and the server's answer is usually right — so the assertion passes for
the wrong reason. Found by a break-the-code probe that *passed*. See
`checklist-phase4-barn-timezone.spec.ts`'s `hydrateByChangingHour`. *(#1252)*

**8. A Server Action POST resolving does not imply React has committed the resulting state.**
The response landing and the DOM reflecting it are separate events, and nothing bridges them.
Where the control itself flips — an enabled state, a `Copied!` label — that flip is the sound
synchronisation point: `checklist-phase4-calendar-feed.spec.ts`'s regenerate test awaits the
POST and *then* `toBeEnabled()`, because `handleRegenerate` sets the new token and clears
`pending` in one continuation, so the button being interactive again means the state has
already advanced. Where nothing rendered changes at all, the POST *is* the only signal there
is — `checklist-phase4-horses-documents.spec.ts`'s `setReminderDate`, whose cell holds the
typed date in React state and shows it whether or not the save ever landed. *(#1208)*

**9. Filling a React-controlled input immediately after `page.goto` can lose the fill to
hydration.** On a page that hasn't hydrated, `fill()` moves the DOM value and nothing else — no
`onChange` fires, no state updates, and a subsequent assertion about a state-derived warning
passes or fails for reasons unrelated to what it claims. Suite-wide risk; put a barrier from
`support/hydration.ts` in front of the fill. *(#1205)*

**10. A click dispatched before React is listening is lost unless the served markup can carry it
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
barrier. That multipart encoding is the *markup*'s, and describes only the pre-hydration submit —
a hydrated React dispatch of the same form posts `text/plain` like any other action call (#1409),
so it is not a way to recognise a form submission on the wire. Two conditions, both load-bearing:
the value passed to `useActionState` (or to `action=`
directly) must be the Server Function itself or a `.bind` of one — an inline
`async () => …` closure wrapping it is an ordinary client function and gets no markup, now caught
by `eslint-rules/no-wrapped-server-action.js` — and the same is true of a `<button onClick>` with
no form around it. Reference:
`checklist-phase4-members-media.spec.ts`'s `deleting_a_member_document_removes_its_row`, whose
`goto`→`click` flaked until #1385 converted the component, and which now asserts that markup on
both of the member detail page's forms. *(#1385, #1396)*

**11. Switching a tab or filter is a click on its `Pill`, not a re-`goto` with a different
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

**12. The barn-vs-host zone axis is open, and cannot be closed from inside a spec.** The dev
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

**13. A page whose markup is byte-identical pre- and post-hydration has no barrier target at
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

**14. A `waitForResponse` predicate matched on URL alone names every Server Action a page's own
client components fire, not just the submission under test** — they all post to the page's URL,
and on the wire they are indistinguishable but for the `next-action` header, whose ids are build
outputs a spec cannot name. Resolving on the wrong one is not a stale read: the `page.reload()`
that follows **aborts the real action's in-flight POST**, so the mutation never runs and no
retrying assertion can converge on it. Where the action redirects, its 303 is the discriminator —
a property of the action's own code, unlike the encoding (see fact 10). The suite's three
URL-only call sites are safe only because their pages fire no competing actions. Full statement:
the stop-series test's comment in `checklist-phase5-lessons-cancel.spec.ts`. *(#1409)*

## Spec maintenance

- **Never blind-write the three shared logins** (`manager@`/`trainer@`/`rider@e2e.test`). Their `profiles` rows are per Supabase *project*, not per barn, so `teardownBarnData` can never reach them and whatever a spec leaves there is inherited by every later slice and every later run — #1282 found `trainer@e2e.test` still pointing at a photo in a barn deleted a week earlier. Capture the old value, write, and restore it in an **unconditional** `afterAll` (no pass/fail gate, no early return except "the capture never happened"), then read the row back and throw on a mismatch — an unverified restore is one that can stop working silently. Restore the row *before* deleting any storage object: an un-restored row is a shared-state failure every later slice inherits, an orphaned object is only a leak, and deleting first converts the cheap failure into the expensive one. Reference implementation: `checklist-phase4-members-media.spec.ts`'s own-photo block. Nulling a field instead of restoring it is the same violation.
- **A spec that deletes a membership orphans that profile.** `teardownBarnData` reaches profile rows *through* the barn's memberships, so severing the edge leaves the row behind permanently — one per run per Playwright project, even though the row is a perfectly ordinary stub. Hand it back with a `describe`-scoped `afterAll` (Playwright completes an inner suite's hooks before the file-scoped one `withBarn` registers) that deletes the profile **only if no membership still references it**, so a chain that failed before the removal leaves the row for `teardownBarnData` rather than tripping the FK. Reference implementation: `checklist-phase4-members-access.spec.ts`. Demoting a stub to `is_managed = false` needs no such hook — the sweep filters on `user_id IS NULL` (#1282), which a demotion can't change.
- **Never call `allInnerTexts()`/`allTextContents()` on a bare locator** — they don't auto-retry, so a not-yet-rendered table yields `[]`, and an assertion that accepts an empty array then *passes on nothing* (#1243 found four such checks reading as covered while asserting nothing). Read through `settledInnerTexts`/`settledTextContents` in `e2e/support/read.ts`, whose wait doubles as the non-empty assertion. `evaluateAll` has the same hazard but keeps an inline `await locator.first().waitFor()` — wrapping a callback reads worse than the guard it replaces.

## The rest of the e2e rules

These live elsewhere and are not repeated here:

- **Every spec declares `// covers:` globs** — `docs/scripts.md`. `scripts/ci.sh` fails
  without them, and `scripts/select-specs.sh` is what turns them into a run scope.
- **No two fixture person names may collide, in either of two ways** — `support/fixtures.ts`'s
  `E2E_STUB_RIDER`. Neither containing the other (every Playwright text matcher is substring-based)
  *and* neither sharing a first-initial-derived form (`get_calendar_feed` truncates the surname,
  and no boundary-safe locator defends against that one). Binds any name added there or passed to
  `addManagedMember`; the four `addMemberships` seeds are asserted in `support/fixtures.test.ts`.
- **Sorting and ordering helpers** — `support/sort.ts`'s module comment.
- **Barn seeding, isolation, and why `fullyParallel` and `retries` stay where they are** —
  `support/test.ts` and `playwright.config.ts`.
