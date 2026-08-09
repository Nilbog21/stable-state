// The lesson list/detail/edit pages' shared locator-and-drive vocabulary, extracted 2026-08-08 from
// six specs that had been carrying byte-identical copies of it, several of them with comments
// apologising for the duplication. `checklist-phase4-lessons-detail.spec.ts` is the source of each
// canonical body unless noted, and each helper's docstring is that copy's own rationale moved
// verbatim — what is being shared here is the measured framework fact behind the body, not the
// line of code.
import type { Locator, Page } from '@playwright/test'
import { waitForHydrated } from './hydration'

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
export function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

/** Every lesson card currently rendered on the Lessons list. */
export function lessonCards(page: Page): Locator {
  return page.locator('main ul a[href*="/lessons/"]')
}

/**
 * The ids of the lessons the list is currently showing, in DOM order — which is the page's own
 * sort order.
 *
 * evaluateAll is one-shot and does not auto-retry, so an unsettled read yields [] and any
 * assertion that happens to accept an empty array passes on nothing (#1243). support/read.ts
 * wraps allInnerTexts/allTextContents for exactly this; it leaves evaluateAll its inline
 * guard ("a helper that has to wrap a callback reads worse than the guard it would replace"),
 * so the guard belongs here. It doubles as the assertion: waitFor throws on timeout, so a
 * list that renders nothing fails the test instead of satisfying it.
 */
export async function visibleLessonIds(page: Page): Promise<string[]> {
  await lessonCards(page).first().waitFor()
  return lessonCards(page).evaluateAll((els) => els.map((el) => el.getAttribute('href')!.split('/').pop()!))
}

/**
 * The set of lessons the list is currently showing. Sorted, because what these checkboxes
 * claim is *which* lessons appear, not in what order — and #1286 is still moving `ORDER BY`
 * around in the DAL, so a membership assertion is correct either side of it.
 *
 * The #1243 one-shot-`evaluateAll` guard is the same one `visibleLessonIds` above documents.
 */
export async function sortedVisibleLessonIds(page: Page): Promise<string[]> {
  await lessonCards(page).first().waitFor()
  const ids = await lessonCards(page).evaluateAll((els) =>
    els.map((el) => el.getAttribute('href')!.split('/').pop()!)
  )
  return ids.sort()
}

/**
 * Blocks until the edit form has hydrated, which every interaction below depends on and none of
 * them can prove on its own.
 *
 * The navigation guard is installed by a `useEffect` inside LessonForm (`setDirty(shouldWarn)`).
 * Until that effect has run, the nav bar's Horses entry is still an ordinary server-rendered
 * `<a>`: clicking it navigates straight through, no dialog is ever raised, and the check fails
 * for a reason that has nothing to do with the behaviour it is about — intermittently, under
 * whatever load the dev server happens to be carrying.
 *
 * An ExhaustionBar is the signal because it cannot exist before that effect has run: it is
 * rendered only once `exhaustionData` has arrived, and that state is set by a *second* effect
 * whose input (`lessonAt`) is itself only produced by LessonStartTime's mount effect, via a
 * server-action round trip. So a visible bar strictly post-dates hydration rather than merely
 * correlating with it. That ordering is the whole point of the wait — read as a bare "wait for
 * the page to settle" it looks like superstition and invites deletion.
 *
 * The barrier itself, and why no timeout is written here, live in `support/hydration.ts` (#1280).
 * This function is only the choice of signal.
 */
export async function waitForEditFormHydrated(page: Page): Promise<void> {
  await waitForHydrated(page.getByRole('button', { name: /^Exhaustion: / }))
}

/**
 * Keyboard activation rather than a pointer `.click()`. `LessonForm`'s submit sits at the bottom
 * of a long scrollable form — the shape #501 (04c64505) diagnosed, where Chromium's
 * scroll-into-view animation races Playwright's actionability check, and in `edit` mode the form
 * is longer still.
 *
 * `exact: true` and scoped to `main`: `getByRole`'s name match is a case-insensitive
 * **substring** by default, so a bare 'Save' would also match any future 'Save and close'/'Save
 * draft' control. Latent rather than live today — no other button on the edit page contains
 * 'Save' — and that is exactly when it is cheap to close.
 */
export async function saveLessonForm(page: Page): Promise<void> {
  const save = page.locator('main').getByRole('button', { name: 'Save', exact: true })
  await save.focus()
  await save.press('Enter')
}
