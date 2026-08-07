import { expect, type Locator, type Page } from '@playwright/test'

/**
 * An `AccordionSection` as a scope, for the `section(page, 'Documents')`-shaped locators these
 * specs were written around. #1390 replaced the horse detail page's `<section>` elements with
 * accordions, so `page.locator('section').filter({ has: heading })` now matches nothing there —
 * silently, since a locator that resolves to zero elements fails on the assertion rather than on
 * the locator.
 *
 * Scoped through the `<summary>`'s parent rather than by `has:` on the heading, because two
 * accordions' `<details>` are siblings and a `has:` filter would be satisfied by neither's
 * ancestor.
 */
export function accordionSection(page: Page, title: string): Locator {
  return page.getByRole('heading', { name: title, exact: true }).locator('../..')
}

/**
 * Open a collapsed `AccordionSection`.
 *
 * #1390 put every section of the horse detail page behind one, joining Manage Barn, so most of
 * what these specs assert now starts life inside a closed `<details>`. `e2e/CLAUDE.md`'s fact 2
 * is why that can't be waved through: a settled read — or any web-first matcher — on an element
 * inside a closed `<details>` can only run out the test's budget, because the element can never
 * become visible. The failure reads as a timeout on the assertion rather than as "you forgot to
 * open the section", which is the whole reason this is a named helper instead of a `.click()`
 * inline at each site.
 *
 * Idempotent by design: `Feed & Medication` renders `defaultOpen`, and several chained specs
 * revisit a section they already opened. Clicking a `<summary>` toggles, so a blind click would
 * *close* those — hence the `open` read first.
 *
 * The click target is the `<summary>` rather than the heading inside it: the hint span
 * (`Documents · 2`) is a sibling of the `<h2>`, so the heading is not the whole hit area a user
 * taps.
 */
export async function openSection(page: Page, title: string): Promise<void> {
  const summary = page.getByRole('heading', { name: title, exact: true }).locator('..')
  const details = accordionSection(page, title)

  if (await details.evaluate((el) => (el as HTMLDetailsElement).open)) return

  await summary.click()
  await expect(details).toHaveJSProperty('open', true)
}
