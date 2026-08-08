// covers: src/app/barn/[slug]/(protected)/layout.tsx
// covers: src/app/barn/[slug]/(protected)/NavDrawer.tsx
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/nav-active.ts
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/app/barn/[slug]/(protected)/NotificationBell.tsx
// covers: src/app/barn/[slug]/(protected)/UserMenu.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/**
//
// Phase 1's thirteen responsive-nav checks: the drawer that replaces the section links below the
// `md` breakpoint, and the active-link highlighting on both the desktop nav bar and the drawer
// (checklists/pre-release/phase-1-setup.md, the block from "Shrink the browser below 768px wide"
// through "Other links stay unhighlighted").
//
// `lessons/**` is declared alongside the nav modules because two checks navigate to a seeded
// lesson's detail page to assert the highlighting survives a nested route: if that route broke,
// those assertions would fail. The rest of the nav modules are reached because this file's whole
// subject is the chrome `(protected)/layout.tsx` renders.
//
// ---------------------------------------------------------------------------
// Five things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THE MOBILE HALF IS SCOPED BY `test.use` ON A DESCRIBE, NOT BY THE `@mobile` PROJECT.
//    The thirteen lines span two widths — the drawer lines are below `md`, but the three
//    desktop-nav-bar highlighting lines are explicitly about the *desktop* nav bar — so riding
//    the pre-existing `@mobile` project would either dispatch this whole file a second time and
//    seed a second barn, or run the desktop half under Pixel 5, whose `isMobile` routes the
//    render through Chromium's meta-viewport emulation. That is not what these lines are about.
//    `hasTouch` is what lets `tap()` dispatch touch events at all; `isMobile` is deliberately
//    not set. This follows checklist-phase4-notifications-profile.spec.ts's mobile spot-check,
//    which chose the same shape for the same reasons.
//
//    The `@manager` project tag is about collection and identity both: Phase 1 declares
//    `role-agnostic`, so scripts/check-e2e-tags.sh accepts any configured project, and the
//    manager nav is the one with enough links for the "other links stay unhighlighted" check to
//    mean something.
//
// 2. EVERY TEST READS `page.viewportSize()!.width` IN ITS OWN EXPECTATION, AND THAT IS NOT
//    DECORATION. `test.use({ viewport })` asserts nothing about the viewport unless a test reads
//    it (e2e/CLAUDE.md fact 6, #1207): four mobile tests in the phase 4 spec all passed unchanged
//    at 1280x800, including the two whose entire claim was about a narrow viewport. The mobile
//    block below pins 390 exactly; the desktop block pins `>= MD_BREAKPOINT`, which is the claim
//    "in the desktop nav bar" actually makes.
//
//    The bell/avatar ordering check goes further and asserts the order at BOTH widths in one
//    test, resizing between them. Not because the property is width-invariant — it is not;
//    `layout.tsx` reverses it with `order-1 md:order-2` / `order-2 md:order-1`, so `bell.x <
//    avatar.x` is true at 390 and false at 1280, which is what the two expectations below say.
//    The reason is that a single 390px assertion cannot tell "the bell leads at mobile width"
//    from "the bell always leads": delete the `md:order-*` half of that pair and a mobile-only
//    check stays green, leaving the line's "(reversed from desktop's avatar-then-bell order)"
//    clause asserted by nothing. Reading the width proves which viewport ran; only the second
//    assertion proves the order depends on it.
//
// 3. `MANAGER_NAV_LABELS` IS THE PIVOT FOR "THE DRAWER LISTS THE SAME LINKS", NOT A DIRECT
//    COMPARISON OF THE TWO CONTAINERS. Two constraints, and only the second is the deciding one.
//    First, the obvious spelling of the direct comparison is closed off: at 390px the desktop
//    container is `display:none`, and BOTH readers in support/read.ts bottom out in `waitFor()`,
//    whose default is `state: 'visible'`, so a *settled* read of it can only run out the test's
//    budget (e2e/CLAUDE.md fact 2; swapping `settledInnerTexts` for `settledTextContents` does not
//    lift that, as read.ts's ceiling section says outright). That section also names the ways
//    through — `toHaveText`, or `waitFor({ state: 'attached' })` before a bare `allTextContents` —
//    and `desktopNavAnchors` below reaches the collapsed container by the same principle, so
//    "impossible" would be the wrong word and is not the argument here.
//
//    The deciding constraint is the second: two locators compared against each other can drift
//    together and still pass, which is precisely the failure this line exists to catch. So the
//    drawer's labels are pinned to the constant here, the desktop container's labels are pinned to
//    the same constant by the "other links stay unhighlighted" check below (where the container is
//    genuinely visible), and the "same links" claim holds transitively with both ends nailed down
//    against a value neither container can influence. Stronger than the direct comparison, not a
//    substitute forced by a limitation.
//
// 4. THE DESKTOP LINK CONTAINER IS LOCATED BY ITS `hidden` CLASS, AND THAT COUPLING IS THE RIGHT
//    ONE. The usual objection to a class locator is brittle coupling to styling, and it does not
//    apply here: `hidden md:flex` IS the mechanism the first checklist line asserts ("the nav bar's
//    section links disappear"), so the locator is coupled to the behaviour under test rather than
//    to an incidental style. That is the durable reason, and it does not expire. (The immediate
//    reason a `data-testid` was not added instead was that #1423 put nav-component changes out of
//    scope — true when this was written, and not an argument to rely on afterwards.)
//    The link-count floor on that first check is what stops a page that failed to render from
//    reading as a correctly-hidden container.
//
// 5. WHAT THE TWO TAP-TO-DISMISS CHECKS DO NOT PROVE, STATED SO NEITHER OVERCLAIMS.
//    Chromium's tap emulation emits the compatibility mouse events after the touch sequence, so a
//    `mousedown`/`click` listener serves the interaction (e2e/CLAUDE.md fact 5, #1207). That is
//    faithful to a real phone — "closes on backdrop tap" is genuinely what is asserted — but it
//    does not isolate a touch handler, and here there is no touch handler to isolate: the scrim
//    carries `onClick` alone. Separately, the link-tap check cannot separate the link's own
//    `onClick={close}` from NavDrawer's other close path — the render-phase `lastPathname`
//    comparison, which closes the drawer on any navigation. Render-phase and not an effect: #543's
//    `320a821e` deliberately removed the `useEffect` that used to do this because it tripped
//    `react-hooks/set-state-in-effect`. Either path would satisfy the checklist line, which claims
//    only the outcome.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'
import type { Lesson } from '@/lib/db/types'

const HORSE = 'Compass'

/** The nested route the two "stays highlighted" checks navigate to — a real id, never a made-up one. */
let lesson: Lesson

const barn = withBarn('phase1-nav-responsive', async ({ supabase, barn, members }) => {
  const compass = await addHorse(supabase, barn.id, HORSE)
  lesson = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [compass.id],
    riderIds: [members.rider.membershipId],
    fee: 60,
  })
})

const MOBILE_VIEWPORT = { width: 390, height: 844 }

/**
 * The width the resize half of the bell/avatar check widens to. Any value at or above the
 * breakpoint would do; this is Desktop Chrome's own, so the assertion runs at the width the rest
 * of this file's tests already run at.
 */
const DESKTOP_VIEWPORT = { width: 1280, height: 720 }

/** Tailwind's `md`, which is where `hidden md:flex` and `md:hidden` switch over. */
const MD_BREAKPOINT = 768

/**
 * `buildNavLinks`' manager set, in DOM order. Stated here rather than derived from the app so the
 * expectation cannot agree with a bug in the code it checks — and so it can serve as note 3's
 * pivot, which requires a value neither container can influence.
 */
const MANAGER_NAV_LABELS = [
  'Lessons',
  'Expenses',
  'Horses',
  'Leases',
  'Boarding',
  'Members',
  'Finances',
  'Manage Barn',
  'Guide',
]

const LESSONS = 'Lessons'
/** The link the drawer's link-tap check taps: a section link, never the one under test. */
const HORSES = 'Horses'

/** Tailwind `font-semibold` / `font-medium`, the two weights the active and inactive classes set. */
const ACTIVE_FONT_WEIGHT = '600'
const INACTIVE_FONT_WEIGHT = '500'

/**
 * A point inside the scrim and outside the drawer panel, which is `w-64` (256px) and pinned to the
 * left edge. Relative to the scrim's own top-left, which is the viewport's — the scrim is
 * `fixed inset-0`. Passing it as a `position` rather than tapping raw coordinates keeps
 * Playwright's hit-target check in play, so the tap is verified to land on the scrim rather than
 * merely at a spot the scrim is assumed to own — the tradeoff against the phase-4 spot-check's raw
 * viewport coordinates, which bake in no layout assumption but also verify nothing about what they
 * hit. The assumption baked in here is the panel's width: widen it past this x and the check fails
 * as an opaque "element intercepts pointer events" timeout rather than as a named assertion, so
 * move this point rather than debugging the drawer.
 */
const BACKDROP_TAP = { x: 330, y: 400 }

/** DesktopNavLinks' root — see note 4. The only `div` child of `<nav>` carrying `hidden`. */
function desktopNavContainer(page: Page) {
  return page.locator('nav > div.hidden')
}

function desktopNavLinks(page: Page) {
  return desktopNavContainer(page).getByRole('link')
}

/**
 * The same anchors, located by tag rather than by role — the one form that can count them while
 * the container is collapsed. `getByRole` resolves against the **accessibility tree**, and a
 * `display:none` subtree is absent from it, so the role query returns 0 below the breakpoint even
 * though all nine anchors are attached. Measured, not inferred: the hidden-links check below read
 * `linksInDom: 0` against a container demonstrably carrying nine, which would have made its
 * positive control unsatisfiable — the same class of hazard as read.ts's visibility ceiling
 * (note 3), reached through the a11y tree instead of through `waitFor`.
 */
function desktopNavAnchors(page: Page) {
  return desktopNavContainer(page).locator('a')
}

function desktopNavLink(page: Page, label: string) {
  return desktopNavContainer(page).getByRole('link', { name: label, exact: true })
}

function hamburger(page: Page) {
  return page.getByRole('button', { name: 'Open navigation menu', exact: true })
}

function drawer(page: Page) {
  return page.getByRole('dialog', { name: 'Navigation menu' })
}

function drawerLinks(page: Page) {
  return drawer(page).getByRole('link')
}

function drawerLink(page: Page, label: string) {
  return drawer(page).getByRole('link', { name: label, exact: true })
}

function scrim(page: Page) {
  return page.getByTestId('nav-drawer-scrim')
}

function bellButton(page: Page) {
  return page.getByRole('button', { name: 'Notifications', exact: true })
}

function avatarButton(page: Page) {
  return page.getByRole('button', { name: 'User menu', exact: true })
}

/**
 * Opens the drawer, through a hydration barrier: the hamburger is a bare `<button onClick>` with
 * no form around it, so a click dispatched before React is listening is simply lost and nothing
 * replays it (e2e/CLAUDE.md fact 10). The barrier drives the avatar menu rather than the
 * hamburger — a different control, in the same React root — so it never stands in for the thing
 * the "tapping the hamburger opens a drawer" check is asserting.
 */
async function openDrawer(page: Page): Promise<void> {
  await waitForBarnPageHydrated(page)
  await hamburger(page).tap()
  await drawer(page).waitFor()
}

/**
 * Both halves of "bolded/highlighted" in one read: the semantic (`aria-current`) and the visual
 * (the weight `font-semibold` sets). Non-retrying by construction — `expect.poll` owns the pacing
 * at every call site.
 */
async function highlightOf(link: Locator): Promise<{ ariaCurrent: string | null; fontWeight: string }> {
  return {
    ariaCurrent: await link.getAttribute('aria-current'),
    fontWeight: await link.evaluate((el) => getComputedStyle(el).fontWeight),
  }
}

/**
 * Every link's label paired with BOTH halves of its highlight state — `aria-current` and the
 * computed font weight — in DOM order.
 *
 * The weight is in here rather than only in `highlightOf` because the negative direction needs it
 * just as much as the positive one: a regression that applied the active class (`font-semibold`,
 * and the `underline` that rides with it) to every link while leaving `aria-current` correct is
 * exactly "other links are highlighted", and an `aria-current`-only map calls that page clean.
 * `DesktopNavLinks`' unit tests treat the active and inactive classes as a matched pair for the
 * same reason; this is the e2e half of that pair.
 */
async function highlightMap(links: Locator): Promise<string[][]> {
  // The inline wait `evaluateAll` keeps rather than delegating to support/read.ts (that module's
  // comment says why): a not-yet-rendered container yields `[]`, and `[]` must not reach an
  // expectation as a shortened answer.
  await links.first().waitFor()
  return links.evaluateAll((els) =>
    els.map((el) => [
      el.textContent ?? '',
      el.getAttribute('aria-current') ?? 'none',
      getComputedStyle(el).fontWeight,
    ])
  )
}

/** The expected map on `/lessons`: Lessons active, the other eight inert. */
function expectedHighlightMap(): string[][] {
  return MANAGER_NAV_LABELS.map((label) =>
    label === LESSONS
      ? [label, 'page', ACTIVE_FONT_WEIGHT]
      : [label, 'none', INACTIVE_FONT_WEIGHT]
  )
}

// ---------------------------------------------------------------------------
// The desktop nav bar's active link (Desktop Chrome's own viewport — no test.use here)
// ---------------------------------------------------------------------------

test('the_desktop_nav_bar_highlights_lessons_on_the_lessons_list @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)

  await expect
    .poll(async () => ({
      atLeastBreakpoint: page.viewportSize()!.width >= MD_BREAKPOINT,
      ...(await highlightOf(desktopNavLink(page, LESSONS))),
    }))
    .toEqual({ atLeastBreakpoint: true, ariaCurrent: 'page', fontWeight: ACTIVE_FONT_WEIGHT })
})

test('the_desktop_nav_bar_keeps_lessons_highlighted_on_a_lesson_detail_page @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons/${lesson.id}`)

  await expect
    .poll(async () => ({
      atLeastBreakpoint: page.viewportSize()!.width >= MD_BREAKPOINT,
      ...(await highlightOf(desktopNavLink(page, LESSONS))),
    }))
    .toEqual({ atLeastBreakpoint: true, ariaCurrent: 'page', fontWeight: ACTIVE_FONT_WEIGHT })
})

test('the_desktop_nav_bar_leaves_the_other_links_unhighlighted @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)

  // Full-set ordered equality over every link the container carries, not a spot check on one
  // sibling, and it catches drift in BOTH directions rather than only the leaking one: an inert
  // link that lit up fails on its own row, and so does an active link that went inert. That
  // second direction is the one this module has actually regressed in — #544 fixed
  // `isNavLinkActive` dropping its nested-path match for any href carrying a query string, so
  // Leases and Boarding never highlighted on a nested agreements route (a case whose own coverage
  // lives on phase 2's checklist, since both nested-route checks here use query-less Lessons).
  // Naming links individually would leave whichever one was not named uncovered. This also pins
  // the desktop container's labels to MANAGER_NAV_LABELS, which is the other end of note 3's pivot.
  await expect
    .poll(async () => ({
      atLeastBreakpoint: page.viewportSize()!.width >= MD_BREAKPOINT,
      links: await highlightMap(desktopNavLinks(page)),
    }))
    .toEqual({ atLeastBreakpoint: true, links: expectedHighlightMap() })
})

// ---------------------------------------------------------------------------
// Below the md breakpoint (~390px) — see notes 1, 2 and 5
// ---------------------------------------------------------------------------

test.describe('below the md breakpoint', () => {
  test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true })

  test('below_the_md_breakpoint_the_desktop_nav_section_links_are_hidden @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)

    // The link count is the positive control (note 4): without it, a nav bar that rendered no
    // links at all satisfies "the section links disappear" exactly as a correctly-collapsed one
    // does. Counted rather than read as text — at `display:none` the links are attached but can
    // never become visible, which is the ceiling note 3 records. And counted through
    // `desktopNavAnchors`, not the role query, for the a11y-tree reason stated there.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        containerVisible: await desktopNavContainer(page).isVisible(),
        linksInDom: await desktopNavAnchors(page).count(),
      }))
      .toEqual({
        width: MOBILE_VIEWPORT.width,
        containerVisible: false,
        linksInDom: MANAGER_NAV_LABELS.length,
      })
  })

  test('below_the_md_breakpoint_a_hamburger_button_appears @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)

    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        hamburgerVisible: await hamburger(page).isVisible(),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, hamburgerVisible: true })
  })

  test('tapping_the_hamburger_opens_a_left_drawer @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await openDrawer(page)

    // "Left drawer" is a geometric claim, so it is read geometrically: flush to the left edge and
    // narrower than the viewport. Not compared against `w-64`'s 256px, which would assert the
    // panel's exact styling rather than that it is a drawer. `openDrawer` already waited for the
    // panel, so this box read is settled.
    const box = (await drawer(page).boundingBox())!
    expect({
      width: page.viewportSize()!.width,
      leftEdge: box.x,
      narrowerThanViewport: box.width < page.viewportSize()!.width,
    }).toEqual({ width: MOBILE_VIEWPORT.width, leftEdge: 0, narrowerThanViewport: true })
  })

  test('the_drawer_lists_the_same_links_the_desktop_nav_bar_carries @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await openDrawer(page)

    // Note 3: pinned to the constant, not to a same-run read of the hidden desktop container.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        labels: await settledTextContents(drawerLinks(page)),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, labels: MANAGER_NAV_LABELS })
  })

  test('the_drawer_closes_when_a_link_in_it_is_tapped @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await openDrawer(page)
    await drawerLink(page, HORSES).tap()
    // `waitForURL` rather than letting the poll below wait for the navigation, per support/test.ts's
    // suite-wide URL rule: `expect.poll` carries the same 5s expect budget `toHaveURL` does, and the
    // dev server can exceed it cold-compiling a route under full-suite load. `/horses` is visited by
    // no other test in this file, so it is guaranteed cold here. This is a real sync point and not
    // fact 3's no-op — the tap starts on the barn dashboard, a URL the pattern cannot already match.
    await page.waitForURL(`**/barn/${barn.slug}/horses`, { waitUntil: 'commit' })

    // The landed-on path is the positive control: without it a tap that missed the link entirely
    // and merely dismissed the drawer would pass. See note 5 for what this does NOT separate.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        drawers: await drawer(page).count(),
        pathname: new URL(page.url()).pathname,
      }))
      .toEqual({
        width: MOBILE_VIEWPORT.width,
        drawers: 0,
        pathname: `/barn/${barn.slug}/horses`,
      })
  })

  test('the_drawer_closes_when_the_backdrop_is_tapped @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await openDrawer(page)
    await scrim(page).tap({ position: BACKDROP_TAP })

    // The dismissal is an absence, so it carries its positive half in the same rendered document:
    // the trigger must still be there, or a page that fell over satisfies the zero on its own.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        drawers: await drawer(page).count(),
        triggers: await hamburger(page).count(),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, drawers: 0, triggers: 1 })
  })

  test('the_drawer_closes_on_escape @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await openDrawer(page)
    await page.keyboard.press('Escape')

    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        drawers: await drawer(page).count(),
        triggers: await hamburger(page).count(),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, drawers: 0, triggers: 1 })
  })

  test('at_mobile_width_the_bell_sits_to_the_left_of_the_avatar @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await bellButton(page).waitFor()
    await avatarButton(page).waitFor()

    const bellIsLeftOfAvatar = async () =>
      (await bellButton(page).boundingBox())!.x < (await avatarButton(page).boundingBox())!.x

    await expect
      .poll(async () => ({ width: page.viewportSize()!.width, bellIsLeftOfAvatar: await bellIsLeftOfAvatar() }))
      .toEqual({ width: MOBILE_VIEWPORT.width, bellIsLeftOfAvatar: true })

    // The other half of the line, and the half that makes the first one mean something (note 2):
    // widen past the breakpoint and the order must reverse. Polled rather than read once, because
    // the reflow the resize triggers is not synchronous with `setViewportSize` resolving.
    await page.setViewportSize(DESKTOP_VIEWPORT)
    await expect
      .poll(async () => ({ width: page.viewportSize()!.width, bellIsLeftOfAvatar: await bellIsLeftOfAvatar() }))
      .toEqual({ width: DESKTOP_VIEWPORT.width, bellIsLeftOfAvatar: false })
  })

  test('the_drawer_highlights_lessons_on_the_lessons_list @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons`)
    await openDrawer(page)

    // The whole drawer map, not just the Lessons row. The checklist's "other links stay
    // unhighlighted" line sits after both the desktop and the drawer highlighting lines, and #1423
    // groups it with the desktop pair — so the drawer's negative half is claimed by no checkbox of
    // its own, and reading only Lessons here would leave a regression that lit up all nine drawer
    // links green across the whole file. Asserting the full map costs nothing and closes that.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        links: await highlightMap(drawerLinks(page)),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, links: expectedHighlightMap() })
  })

  test('the_drawer_keeps_lessons_highlighted_on_a_lesson_detail_page @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons/${lesson.id}`)
    await openDrawer(page)

    // The whole drawer map, not just the Lessons row. The checklist's "other links stay
    // unhighlighted" line sits after both the desktop and the drawer highlighting lines, and #1423
    // groups it with the desktop pair — so the drawer's negative half is claimed by no checkbox of
    // its own, and reading only Lessons here would leave a regression that lit up all nine drawer
    // links green across the whole file. Asserting the full map costs nothing and closes that.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        links: await highlightMap(drawerLinks(page)),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, links: expectedHighlightMap() })
  })
})
