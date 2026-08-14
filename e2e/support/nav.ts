// The desktop nav's shared highlight-read vocabulary, extracted 2026-08-14 from
// `checklist-phase2-agreements-charges.spec.ts` (the canonical body and docstring source) and
// `checklist-phase2-agreements-detail.spec.ts`, which carried byte-identical copies; the weight
// consts also replace identical copies in `checklist-phase2-agreements-create.spec.ts` and
// `checklist-phase1-nav-responsive.spec.ts`. The variants stayed put, on purpose:
// `checklist-phase1-nav-responsive.spec.ts`'s `desktopNavContainer` family is fact 16's reference
// implementation and reads the container *below* the breakpoint, where `desktopNav`'s docstring
// claims do not hold — do not converge it onto this module — and that file's `highlightMap` is a
// nine-link variant of `navHighlightMap` with a different signature, while its `highlightOf` and
// `checklist-phase2-agreements-create.spec.ts`'s are per-link variants whose missing-attribute
// defaults differ (`null` and `'none'`).
import type { Page } from '@playwright/test'

/**
 * `DesktopNavLinks`' two class sets, reduced to the property that renders "highlighted" —
 * Tailwind's `font-semibold` and `font-medium`. Written out rather than imported from the
 * component, so a change there fails here instead of agreeing with itself.
 */
export const ACTIVE_FONT_WEIGHT = '600'
export const INACTIVE_FONT_WEIGHT = '500'

/**
 * `DesktopNavLinks`' root — the only `div` child of `<nav>` carrying `hidden`. Desktop Chrome's
 * viewport is above the `md` breakpoint, so this is the nav that renders; `NavDrawer` gates its
 * whole panel behind `{open && (…)}`, so a closed drawer's links are not in the DOM at all and
 * cannot join a match set. Deliberately NOT fact 16: that fact is about links which *are*
 * attached but sit in a `display:none` container, where `getByRole` reads zero and
 * `locator('a')` still counts them. Nothing is attached here, so no locator form reaches them.
 */
export const desktopNav = (page: Page) => page.locator('nav > div.hidden')

/**
 * Both agreement nav entries paired with both halves of their highlight state, in DOM order.
 *
 * `aria-current` alone is not enough in either direction: a regression applying the active class
 * to every link while leaving `aria-current` correct is exactly "the other one is highlighted
 * too", and an `aria-current`-only read calls that page clean. The computed weight is the half
 * that catches it. `checklist-phase1-nav-responsive.spec.ts` records the same reasoning at
 * length; this is the two-link form of its `highlightMap`.
 *
 * Non-retrying by construction — `expect.poll` owns the pacing at every call site. The inline
 * `waitFor` is what stops `[]` reaching an expectation as a shortened answer, which for
 * `checklist-phase2-agreements-charges.spec.ts`'s absence-shaped test is the positive anchor
 * rule 4 requires.
 */
export async function navHighlightMap(page: Page): Promise<string[][]> {
  const links = desktopNav(page).getByRole('link', { name: /^(Leases|Boarding)$/ })
  await links.first().waitFor()
  return links.evaluateAll((els) =>
    els.map((el) => [
      el.textContent ?? '',
      el.getAttribute('aria-current') ?? 'none',
      getComputedStyle(el).fontWeight,
    ])
  )
}

/** One nav entry's expected `navHighlightMap` row — label, `aria-current`, computed weight. */
export const HIGHLIGHTED = (label: string) => [label, 'page', ACTIVE_FONT_WEIGHT]
export const INERT = (label: string) => [label, 'none', INACTIVE_FONT_WEIGHT]
