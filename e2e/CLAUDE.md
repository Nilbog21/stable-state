# E2E

The Playwright checklist suite. Harness, seeding and isolation live in `support/test.ts` and
`support/fixtures.ts`; run it via `scripts/run-checklist-suite.sh`.

## Framework facts (#1279)

Eighteen measured things about `@playwright/test`, Chromium and React 19 that are not obvious, are
not in the places you would look for them, and each of which cost a batch at least one round. This
is the index; the full statement and its provenance are the same-numbered section of
[`docs/e2e-framework-facts.md`](../docs/e2e-framework-facts.md). **Numbering is append-only** — a
new fact takes the next number and no existing number ever moves, because 87 citations across 29
files name a fact by number and renumbering breaks every one of them silently. **An entry is one
line** — headline, `[full]` link, issue refs, no elaboration (#1468).

**1. Timeouts come in three tiers, and only one of them wants a number.**
[full](../docs/e2e-framework-facts.md#fact-1)

**2. `support/read.ts`'s settled reads only reach what can become *visible*.**
[full](../docs/e2e-framework-facts.md#fact-2)

**3. `waitForURL` is a no-op sync point when the URL already matches.**
[full](../docs/e2e-framework-facts.md#fact-3) *(#1204)*

**4. Only `newContext({ storageState: { cookies: [], origins: [] } })` is anonymous.**
[full](../docs/e2e-framework-facts.md#fact-4) *(#1208, #1422 — browser contexts too)*

**5. `hasTouch` + `locator.tap()` does not isolate an element's `touchstart` path.**
[full](../docs/e2e-framework-facts.md#fact-5) *(#1207)*

**6. `test.use({ viewport })` asserts nothing about the viewport unless a test reads it.**
[full](../docs/e2e-framework-facts.md#fact-6) *(#1207)*

**7. React 19 does not reconcile a mismatched *attribute* during hydration** — so a pinned clock
only reaches values the client computes.
[full](../docs/e2e-framework-facts.md#fact-7) *(#1252)*

**8. A Server Action POST resolving does not imply React has committed the resulting state.**
[full](../docs/e2e-framework-facts.md#fact-8) *(#1208)*

**9. Filling a React-controlled input immediately after `page.goto` can lose the fill to
hydration.** [full](../docs/e2e-framework-facts.md#fact-9) *(#1205)*

**10. A click dispatched before React is listening is lost unless the served markup can carry it
on its own** — `<form onSubmit={handler}>` loses it, `<form action={serverAction}>` does not.
[full](../docs/e2e-framework-facts.md#fact-10) *(#1199, #1385, #1396)*

**11. Switching a tab or filter is a click on its `Pill`, not a re-`goto` with a different query
param.** [full](../docs/e2e-framework-facts.md#fact-11) *(#1244)*

**12. The barn-vs-host zone axis is open, and cannot be closed from inside a spec.**
[full](../docs/e2e-framework-facts.md#fact-12) *(#1288)*

**13. A page whose markup is byte-identical pre- and post-hydration has no barrier target at all.**
[full](../docs/e2e-framework-facts.md#fact-13) *(#1289)*

**14. A `waitForResponse` predicate matched on URL alone names every Server Action a page's own
client components fire, not just the submission under test.**
[full](../docs/e2e-framework-facts.md#fact-14) *(#1409)*

**15. Playwright discards the worker process after any test failure**, re-running every `beforeAll`
— so in an ordered file the first `✘` silences every test after it.
[full](../docs/e2e-framework-facts.md#fact-15) *(#1426)*

**16. `getByRole` returns zero matches inside a `display:none` container** — it resolves against
the accessibility tree, not the DOM. [full](../docs/e2e-framework-facts.md#fact-16) *(#1423)*

**17. A wait predicate satisfiable only by the success path cannot observe the failure it exists
to catch.** [full](../docs/e2e-framework-facts.md#fact-17) *(#1426)*

**18. A web-first matcher whose expectation is "nothing" is satisfied on its first poll** —
`toHaveCount(0)`/`not.toBeVisible` get no retry budget.
[full](../docs/e2e-framework-facts.md#fact-18) *(#1425, #1434)*

## Spec maintenance

Five rules about what a spec may leave behind, and what it may take for granted. Same conventions;
the full worked statement and each rule's reference implementation are the same-numbered section of
[`docs/e2e-spec-maintenance.md`](../docs/e2e-spec-maintenance.md).

**1. Never blind-write the three shared logins** (`manager@`/`trainer@`/`rider@e2e.test`) — their
`profiles` rows are per Supabase *project*, so no teardown reaches them.
[full](../docs/e2e-spec-maintenance.md#rule-1) *(#1282)*

**2. A spec that deletes a membership orphans that profile** — `teardownBarnData` reaches profile
rows *through* memberships. Hand it back in a `describe`-scoped `afterAll`.
[full](../docs/e2e-spec-maintenance.md#rule-2) *(#1282)*

**3. Never call `allInnerTexts()`/`allTextContents()` on a bare locator** — they don't auto-retry,
so an assertion accepting `[]` passes on nothing.
[full](../docs/e2e-spec-maintenance.md#rule-3) *(#1243)*

**4. Every absence assertion needs a positive anchor in the same test** proving the page region
rendered (fact 18). [full](../docs/e2e-spec-maintenance.md#rule-4) *(#1434)*

**5. A fixture mutation whose assertions depend on it having matched rows uses `mustAffect`** — a
mutation pass is blind to setup that did nothing. [full](../docs/e2e-spec-maintenance.md#rule-5)
*(#1424, #1435)*

## The rest of the e2e rules

These live elsewhere and are not repeated here:

- **Every spec declares `// covers:` globs** — `docs/scripts/suite.md`. `scripts/ci.sh` fails
  without them, and `scripts/select-specs.sh` is what turns them into a run scope.
- **No two fixture person names may collide, in either of two ways** — neither containing the
  other, nor sharing a first-initial-derived form. Both halves, and what binds them, are on
  `support/fixtures.ts`'s `E2E_STUB_RIDER`; the four `addMemberships` seeds are asserted in
  `support/fixtures.test.ts`.
- **Sorting and ordering helpers** — `support/sort.ts`'s module comment.
- **Barn seeding, isolation, and why `fullyParallel` and `retries` stay where they are** —
  `support/test.ts` and `playwright.config.ts`.
