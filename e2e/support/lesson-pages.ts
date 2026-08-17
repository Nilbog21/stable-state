// The lesson list/detail/edit/cancel pages' shared locator-and-drive vocabulary, extracted
// 2026-08-08 from six specs that had been carrying byte-identical copies of it, several of them
// with comments apologising for the duplication. `checklist-phase4-lessons-detail.spec.ts` is the
// source of each canonical body unless noted, and each helper's docstring is that copy's own
// rationale moved verbatim — what is being shared here is the measured framework fact behind the
// body, not the line of code.
//
// The cancellation-cluster names below were extracted 2026-08-11 from the four cancellation specs,
// with `checklist-phase5-lessons-cancel.spec.ts` the source of each canonical body unless noted.
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
  await waitForHydrated(page.getByRole('button', { name: / Exhaustion \(/ }))
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

// The badge text the detail header, rider rows, and list cards all render; previously five per-spec copies.
export const CANCELLED_BADGE = 'Cancelled'

/** The detail page's header block — the `<div>` that holds the `<h1>` and the badges beside it. */
export function detailHeader(page: Page): Locator {
  return page.locator('main div:has(> h1)')
}

/**
 * The detail page header's action group, addressed as the sibling of the block holding the `<h1>`
 * rather than by its Tailwind classes. That relationship is what makes the header **Cancel**
 * button line a claim about the
 * *header* rather than about the page: a Cancel control rendered anywhere else falls outside this
 * locator entirely.
 */
export function headerActions(page: Page): Locator {
  return page.locator('main div:has(> h1) + div')
}

/** The header's Cancel control, which is a `<Button href>` and therefore a link. */
export function headerCancelLink(page: Page): Locator {
  return headerActions(page).getByRole('link', { name: 'Cancel', exact: true })
}

/** The Cancelled badge in the detail page header — not a rider row's badge, which is separate. */
export function headerCancelledBadge(page: Page): Locator {
  return detailHeader(page).getByText(CANCELLED_BADGE, { exact: true })
}

/** One `<li>` per enrolled rider, inside the detail page's Rider(s) field. */
export function riderRows(page: Page): Locator {
  return detailField(page, 'Rider(s)').locator('li')
}

/** A single rider's row, addressed by the name it displays. */
export function riderRow(page: Page, name: string): Locator {
  return riderRows(page).filter({ hasText: name })
}

/** The cancel page's Type toggle, as a whole, so its options can be asserted in one string. */
export function cancelTypeFieldset(page: Page): Locator {
  return page.locator('main fieldset:has(input[name="cancel_type"])')
}

export function cancelTypeRadio(page: Page, value: 'instructor' | 'rider'): Locator {
  return page.locator(`input[name="cancel_type"][value="${value}"]`)
}

/**
 * Land back on a lesson's detail page after a redirect.
 *
 * Both halves are needed and neither replaces the other, which is the pairing
 * `e2e/support/test.ts`'s convention block mandates after a click. `waitForURL` pins **which**
 * lesson the server redirected to — a redirect wired to the wrong id lands on a real, rendering
 * detail page and would satisfy any content check. `'commit'` resolves before that document
 * renders, though, so a 404 or a 500 at the right URL satisfies the URL half equally; the `<dl>`
 * is the render proof, and neither `/cancel` nor `/edit` has one, so a submit that failed and
 * re-rendered its own page fails here rather than sailing through.
 *
 * That `<dl>` is also what makes this helper safe against the soft-nav hazard #1319's review
 * found: after a `waitUntil: 'commit'` the previous route can still be mounted, so a read taken
 * on markup **both** pages render can answer from the page just left. `<dl>` appears nowhere in
 * the `lessons/` route tree except the detail page itself, so it cannot resolve against `/cancel`
 * or `/edit`. Copying this helper onto a flow whose *source* page has a `<dl>` reintroduces the
 * hazard; check that before reusing it.
 */
export async function landOnDetail(page: Page, lessonId: string): Promise<void> {
  await page.waitForURL(new RegExp(`/lessons/${lessonId}$`), { waitUntil: 'commit' })
  await page.locator('main dl').waitFor()
}
