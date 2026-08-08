# E2E

The Playwright checklist suite. Harness, seeding and isolation live in `support/test.ts` and
`support/fixtures.ts`; run it via `scripts/run-checklist-suite.sh`.

## Framework facts (#1279)

Fourteen measured things about `@playwright/test`, Chromium and React 19 that are not obvious, are
not in the places you would look for them, and each of which cost a batch at least one round. This
is the index: headline only, and the full worked statement is the same-numbered section of
[`docs/e2e-framework-facts.md`](../docs/e2e-framework-facts.md), which also carries their
provenance. **Numbering is append-only** — a new fact takes the next number and no existing number
ever moves, because 52 comments across 22 files cite a fact by number and renumbering breaks every
one of them silently.

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

**7. React 19 does not reconcile a mismatched *attribute* during hydration.** Corollary, and the
half with teeth: **a pinned clock only reaches values the client computes** — a read taken
pre-hydration, or off an attribute, silently gets the server's answer, and the server's answer is
usually right, so the assertion passes for the wrong reason.
[full](../docs/e2e-framework-facts.md#fact-7) *(#1252)*

**8. A Server Action POST resolving does not imply React has committed the resulting state.**
[full](../docs/e2e-framework-facts.md#fact-8) *(#1208)*

**9. Filling a React-controlled input immediately after `page.goto` can lose the fill to
hydration.** [full](../docs/e2e-framework-facts.md#fact-9) *(#1205)*

**10. A click dispatched before React is listening is lost unless the served markup can carry it
on its own, and nothing replays it.** The discriminator is the form's own markup, not the fact that
a button was clicked: `<form onSubmit={handler}>` serves as a bare `<form>` and loses the click,
while `<form action={serverAction}>` is **not** in that class — React emits enhanced markup that an
early click submits on its own, so it needs no barrier.
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
