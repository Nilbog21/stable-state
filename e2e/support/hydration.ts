// Hydration barriers for the checklist specs (#1280).
//
// Two framework facts, both measured, both stated in e2e/CLAUDE.md as facts 9 and 10 — a
// correction made here goes there as well:
//
// 1. **`page.goto` returns long before React hydrates.** On a page that hasn't hydrated,
//    `fill()` moves the DOM value and nothing else: no `onChange` fires, no state updates, and
//    an assertion about a state-derived consequence passes or fails for reasons unrelated to
//    what it claims. #1199 measured about three seconds on an already-warm route between an
//    `<input>` being present and fully actionable and its React props being attached.
//
// 2. **A click dispatched before React is listening is simply lost, and nothing replays it.**
//    This is why `hydrateByDriving` retries rather than driving once and waiting. A barrier that
//    drives once can only run out the test's budget when that one drive lands early.
//
// ## Why both failure modes are quiet
//
// Neither throws. An unhydrated `fill()` leaves the typed value on screen; an unhydrated click
// leaves the page exactly as the server rendered it — and the server's answer is usually the
// right one, so the assertion passes for the wrong reason. #1252 found this with a
// break-the-code probe that PASSED. That is what makes a barrier a precondition rather than a
// nicety, and what makes "the suite is green" no evidence at all that one was needed.
//
// ## Picking a signal
//
// A signal has to be something that *cannot* exist before hydration — `useState`-gated markup,
// or a value only client-side React writes. An element merely being present proves nothing: it
// is in the server-rendered HTML too. React 19 makes the trap sharper by not reconciling a
// mismatched *attribute* during hydration (e2e/CLAUDE.md fact 7), so a barrier gating on an
// `aria-*`/`data-*` a client component computes reads the server's value and passes vacuously.
//
// A signal also has to be able to become **visible**, which is `support/read.ts`'s ceiling
// (e2e/CLAUDE.md fact 2) reaching this module for the same reason: `waitForHydrated` bottoms out
// in the same `waitFor()`, whose default is `state: 'visible'`. Point it at an `<option>` inside
// a collapsed `<select>` (#1205) or anything inside a closed `<details>` (#1204) and it cannot
// succeed — it can only run out the test's budget. Both are normal markup, not edge cases, and
// the two hazards are independent: `useState`-gated markup inside a closed `<details>` is a
// perfectly trustworthy hydration signal that this helper still cannot reach. For those, drive
// the container open and use `hydrateByDriving`.
//
// ## No explicit timeouts
//
// `waitFor` is already unbounded under `actionTimeout: 0`, and `toPass` is unbounded for its own
// reason — its `timeout` defaults to 0 and it ignores the configured expect budget. A number
// written here could only tighten them (#1211, #1279). Both are bounded by the test's own budget.

import { expect, type Locator } from '@playwright/test'

/**
 * Blocks until `signal` is visible, where `signal` is markup that **cannot** exist before
 * hydration — so its appearance strictly post-dates hydration rather than merely correlating
 * with it. See the module comment's signal section for what qualifies, including the ceiling:
 * a signal that can never become *visible* runs out the budget rather than failing.
 *
 * For a page that renders identically until it is driven, there is no such signal and this is
 * the wrong tool: use `hydrateByDriving`.
 */
export async function waitForHydrated(signal: Locator): Promise<void> {
  await signal.first().waitFor()
}

/**
 * Drives a control until a client-only consequence lands, for a page with no zero-interaction
 * hydration signal.
 *
 * `isLive` must be a **non-retrying** predicate — one `count()`/`evaluate()`, no `waitFor` and no
 * web-first matcher. `toPass` owns the pacing; a retrying read inside would spend the whole
 * expect budget on every attempt that lands before hydration.
 *
 * `drive` is re-dispatched only while `isLive` is false, which is what makes a *toggle* safe to
 * pass here: an attempt whose re-render merely lagged the read is not undone by the next one.
 * Without that guard a toggle oscillates instead of converging.
 *
 * Prefer driving a control the test does not assert on, and one whose repeat is harmless — a
 * retried write would issue duplicate saves. Leaving the page as it was found (toggling a
 * popover shut again) is the caller's job, as is any precondition wait that names the cause
 * before the retry loop can bury it: both are one line at the call site.
 */
export async function hydrateByDriving(
  // `Promise<unknown>` rather than `Promise<void>`: whatever the drive resolves to is discarded,
  // and requiring void would force an async wrapper around every action that returns something —
  // `selectOption` resolves to the selected values, `click` to nothing.
  drive: () => Promise<unknown>,
  isLive: () => Promise<boolean>
): Promise<void> {
  await expect(async () => {
    if (!(await isLive())) await drive()
    expect(await isLive()).toBe(true)
  }).toPass()
}
