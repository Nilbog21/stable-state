// Settling text reads for the checklist specs (#1243).
//
// `Locator.allInnerTexts` and `Locator.allTextContents` are one-shot: unlike `expect`'s matchers
// they do not auto-retry, so a table that hasn't rendered yet yields `[]` and the read returns
// successfully with nothing in it. Under load — a `next dev` server compiling on demand while
// several Playwright workers hit it — that window is wide enough to hit routinely (#1238).
//
// ## Why `[]` is worse than a flake
//
// A read that yields `[]` fails loudly only when the assertion happens to reject an empty array.
// When it doesn't, the check *passes on nothing*: `expect([]).toEqual([])` comparing two
// one-shot reads of different columns, or `expect([]).toEqual([...[]].sort())` for a row-order
// claim. Both shipped here (#1243) as `PRE_RELEASE_TEST_CHECKLIST.md` items reading as covered
// while asserting nothing at all — invisible to any amount of green-suite evidence, and strictly
// worse than an untagged item, which at least admits it isn't covered.
//
// ## Why a helper rather than a `waitFor` per call site
//
// The fix is one line — `await locator.first().waitFor()` — and that is exactly the problem.
// `sort.ts`'s module comment records the same hazard shipping four times (#1089, #1090, #1091,
// #1093) because the safe path was the one you had to hand-roll. Here the safe path is the only
// path with a name; a bare `allInnerTexts` in a spec is now a greppable defect rather than a
// judgment call about whether that particular site happens to be settled already.
//
// The wait doubles as the assertion this file exists to restore: `waitFor` throws on timeout, so
// a table that renders no rows fails the test instead of satisfying it vacuously.
//
// `evaluateAll` carries the identical hazard but keeps its inline `waitFor` — a helper that has
// to wrap a callback reads worse than the guard it would replace.
//
// ## The ceiling: these read only what can become VISIBLE (#1279)
//
// `waitFor()` defaults to `state: 'visible'`, so on an element that is in the DOM but can never
// be visible, the guard cannot succeed — it can only run out the test's budget. The module
// presenting itself as "the one safe path" is what made that expensive to discover twice: an
// `<option>` inside a collapsed `<select>` (#1205) and every Manage Barn section, which renders
// as a closed `<details>` (#1204, its whole spec). Both are *normal* markup, not edge cases.
//
// For those, don't reach for a settled read at all. `expect(locator).toHaveText([...])` is the
// better guard anyway: it auto-retries, reads textContent, and pins the match count as well as
// each string — so an unrendered container reads zero and fails, which is the property this
// module exists for. `waitFor({ state: 'attached' })` before a bare `allTextContents` works too,
// but proves less. See checklist-phase4-settings-tiers-events.spec.ts's `tierOptions`.

import type { Locator } from '@playwright/test'

/**
 * Every match's `innerText`, read only once the first match is **visible**. Not for anything
 * that can't be — a collapsed `<select>`'s options, a closed `<details>`' contents — where the
 * wait can only time out. See the module comment's ceiling section.
 */
export async function settledInnerTexts(locator: Locator): Promise<string[]> {
  await locator.first().waitFor()
  return locator.allInnerTexts()
}

/**
 * Every match's `textContent`, read only once the first match is **visible**. For text whose
 * rendered casing differs from the source — `Th` uppercases its label in CSS, so `innerText`
 * reads the wrong string — and for reads that need the raw node text rather than the laid-out
 * text.
 *
 * Reading textContent does not lift the visibility requirement: the wait is the same one, so
 * this is no more usable than `settledInnerTexts` on a never-visible element. See the module
 * comment's ceiling section.
 */
export async function settledTextContents(locator: Locator): Promise<string[]> {
  await locator.first().waitFor()
  return locator.allTextContents()
}
