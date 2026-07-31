// Shared sort-header helpers for the Finances breakdown tables (#1153).
//
// Every breakdown table renders its headers through SortableTh, which emits the sort control as
// a <button> inside the <th> — alongside InfoPopover's ⓘ trigger, hence the aria-label exclusion
// throughout — carrying the column label plus, when that column is active, a trailing ▲/▼. The
// glyph is a sibling text node in the same button, so the button's textContent reads "Net ▲".
//
// ## Why tapSort does not wait, and tapSortAndSettle does
//
// Sorting is client-side React state. `click()` resolves once the event is dispatched, not once
// the re-render has committed — so a *row-order* test, whose reads go through
// `allInnerTexts`/`evaluateAll` and therefore do not auto-retry, can sample the order the tap
// was about to replace. Those tests need a settle, and `tapSortAndSettle` is it.
//
// An *indicator* test must not have one. Its single claim is where the indicator sits, so a
// setup step that waits for the indicator to arrive pre-establishes exactly that claim and
// leaves the assertion with nothing left to catch. That defect shipped four times (#1089, #1090,
// #1091, #1093) — every time from a spec whose only local helper was the settling one, so the
// safe path was the one you had to hand-roll. Here the default is the safe one and settling
// costs a longer name.
//
// So: assert the indicator with a retrying `expect(headersShowing(…)).toHaveText([…])` after a
// bare `tapSort`. The tap whose result the test asserts is always a `tapSort`.
//
// The one exception is a *precondition* tap. A "second tap flips it to ▼" test has to get the
// column into the ▲ state first, and that first tap does settle — otherwise the second tap can
// land before the first has been applied and the test is racing itself. Settling on ▲ cannot
// pre-establish a claim about ▼, so the circularity this module exists to prevent isn't in
// play. The rule is about the indicator being *asserted*, not about the call appearing at all.
//
// `tapSortAndSettle` waits on the control it just tapped rather than on the thead at large: on
// the first tap the ▲ is still sitting on the previously-active column, so a table-wide wait
// would already be satisfied and would return before the re-sort had happened at all (#1090).

import type { Locator } from '@playwright/test'

export type SortIndicator = '▲' | '▼'

/** Every sortable column's control, excluding the ⓘ trigger sharing the same header cell. */
export function sortControls(table: Locator): Locator {
  return table.locator('thead th button:not([aria-label="Info"])')
}

/**
 * One column's sort control, by label. A string matches case-insensitively as a substring, so
 * the locator keeps matching once the column goes active and its label picks up a ▲/▼.
 */
export function sortControl(table: Locator, label: string | RegExp): Locator {
  return sortControls(table).filter({ hasText: label })
}

/**
 * The controls currently carrying `indicator` — a locator rather than text already read out, so
 * callers assert it with an auto-retrying `toHaveText` and need no settle of their own. Matching
 * the full set (not just the expected column) is what covers "and disappears from the previous
 * column" in the same assertion.
 */
export function headersShowing(table: Locator, indicator: SortIndicator): Locator {
  return sortControls(table).filter({ hasText: indicator })
}

/** Taps a sort control. Does not wait — the correct default; see the module comment. */
export function tapSort(control: Locator): Promise<void> {
  return control.click()
}

/**
 * Taps a sort control and blocks until `indicator` lands on it. For row-order tests only.
 * `indicator` is passed in rather than derived from a tap counter, so a test that taps twice
 * with a read in between still names the right glyph for each tap.
 *
 * A wait (`Locator.waitFor`), deliberately not an `expect` — an assertion here would add a
 * second one to a test that makes a single claim.
 */
export async function tapSortAndSettle(control: Locator, indicator: SortIndicator): Promise<void> {
  await control.click()
  await control.filter({ hasText: indicator }).waitFor()
}
