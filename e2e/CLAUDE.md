# E2E

The Playwright checklist suite. Harness, seeding and isolation live in `support/test.ts` and
`support/fixtures.ts`; run it via `scripts/run-checklist-suite.sh`.

## Framework facts (#1279)

Ten things about `@playwright/test`, Chromium and React 19 that are not obvious, are not in the
places you would look for them, and each of which cost the #1187–#1252 batch at least one round
— several rediscovered independently by two or three slices. Every one is measured, not
inferred. The spec named after each fact carries the worked example.

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
passes or fails for reasons unrelated to what it claims. Suite-wide risk; drive a control and
wait for a client-only consequence before the fill matters. *(#1205)*

**10. A click dispatched before React is listening is simply lost, and nothing replays it.**
This is why a hydration barrier on an interaction-only page has to *retry* rather than wait
once — see `checklist-phase4-horses-documents.spec.ts`'s `waitForHorseDetailHydrated`, whose
`toPass` loop re-clicks until the `useState`-gated popover opens. Three specs hand-roll a
barrier three different ways today; #1280 extracts the shared one, covering both this case
and the page that has a zero-interaction signal. *(#1199)*

## The rest of the e2e rules

These live elsewhere and are not repeated here:

- **Never call `allInnerTexts()`/`allTextContents()` on a bare locator** — root `CLAUDE.md`'s
  E2E spec maintenance section, and `support/read.ts`.
- **Every spec declares `// covers:` globs** — `scripts/CLAUDE.md`. `scripts/ci.sh` fails
  without them, and `scripts/select-specs.sh` is what turns them into a run scope.
- **Sorting and ordering helpers** — `support/sort.ts`'s module comment.
- **Barn seeding, isolation, and why `fullyParallel` and `retries` stay where they are** —
  `support/test.ts` and `playwright.config.ts`.
