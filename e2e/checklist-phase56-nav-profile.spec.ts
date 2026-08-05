// covers: src/app/barn/[slug]/(protected)/layout.tsx
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/BarnSwitcher.tsx
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/app/barn/[slug]/(protected)/UserMenu.tsx
// covers: src/app/barn/[slug]/(protected)/expenses/**
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/app/profile/**
// covers: src/app/calendar.ics/**
//
// The barn chrome a non-manager sees, both roles, in one file: the four-link nav and what it
// omits, the two manager-only routes that must 404 rather than bounce to a login page, the same
// nav rendered on the barn-scoped Profile page, and #1018's calendar feed scoped to the caller's
// own membership (checklists/pre-release/phase-5-trainer.md 17-19, 95, 102-104, and
// phase-6-rider.md 13-15, 73, 100-102).
//
// `layout.tsx` is already in select-specs.sh's ALWAYS_FULL, and is declared above anyway per
// #1281 — the nav bar it renders is this file's main subject, so the declaration states
// something true about what the spec drives.
//
// ---------------------------------------------------------------------------
// Four things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. IT IS A PAIRED SLICE, SO THE FIXTURE SEEDS BOTH ROLES' SUBJECTS UNCONDITIONALLY.
//    `withBarn`'s callback cannot see the Playwright project name (support/test.ts resolves it
//    in beforeAll, after the callback signature is fixed), so "the acting member owns X" cannot
//    be seeded conditionally. Both barns get both lessons; each role's tests target their own.
//
// 2. THE TWO SEEDED LESSONS ARE EACH OTHER'S NEGATIVE CONTROL, ON ONE VARIABLE EACH.
//    `trainerLesson` is instructed by the trainer and ridden by the stub rider; `riderLesson` is
//    instructed by the manager and ridden by the rider login. Against get_calendar_feed's role
//    branches (20260724034551_calendar_feed_title_rider_horse.sql) that makes each exclusion
//    single-variable: the trainer's feed drops `riderLesson` because of its instructor alone,
//    and the rider's feed drops `trainerLesson` because of its rider alone. Collapse the trainer
//    branch to the manager's and the trainer feed gains a lesson; collapse it to the rider's and
//    it loses its own — two distinct failures, which is what a third and fourth participant
//    would have bought without the extra rows.
//
// 3. THE NAV'S LINK ORDER IS ASSERTED, AND THAT IS THE ONE PLACE IT IS SAFE.
//    `buildNavLinks` returns a literal array and the layout renders the barn-name link ahead of
//    it, so these five anchors are fixed JSX siblings rather than rows out of a query. Every
//    list here that IS query-derived — the calendar feed's UIDs — is compared as a sorted set,
//    because #1286 adds ORDER BY to get_calendar_feed and a membership assertion is correct
//    either side of it. `toHaveText` on the array auto-retries and pins the match count
//    as well as each string, so it is its own settle guard (support/read.ts's ceiling section).
//
// 4. THE FEED FETCHES DELIBERATELY USE THE PLAIN `request` FIXTURE, WHICH CARRIES A SESSION.
//    e2e/CLAUDE.md fact 4 is that `request` is NOT anonymous, and that the wrong form fails
//    silently — so this is a decision, not the oversight that fact describes. Lines 910/1011
//    claim what the feed's PAYLOAD contains, and `/calendar.ics` has no auth check at all (the
//    token is the credential), so the session cannot reach the answer. That a subscriber with no
//    session can read the feed is checklist line 799's claim, and stays asserted where it lives,
//    in checklist-phase4-calendar-feed.spec.ts's `unauthenticatedRequest`.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import type { Lesson } from '@/lib/db/types'

const TRAINER_HORSE = 'Solstice'
const RIDER_HORSE = 'Lantern'

/** Instructed by the trainer login; its rider is the stub, never the rider login. See note 2. */
let trainerLesson: Lesson
/** Ridden by the rider login; its instructor is the manager, never the trainer login. */
let riderLesson: Lesson

const barn = withBarn('phase56-nav-profile', async ({ supabase, barn, members }) => {
  const solstice = await addHorse(supabase, barn.id, TRAINER_HORSE)
  const lantern = await addHorse(supabase, barn.id, RIDER_HORSE)

  trainerLesson = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [solstice.id],
    riderIds: [members.rider2.membershipId],
    fee: 60,
  })

  // `members.manager` carries can_instruct: true (fixtures.ts's addMemberships), so it stands in
  // for the checklist's second instructor without a fourth persona.
  riderLesson = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(4, barn.timezone),
    time: '10:00',
    instructorId: members.manager.membershipId,
    horseIds: [lantern.id],
    riderIds: [members.rider.membershipId],
    fee: 60,
  })
})

// ---------------------------------------------------------------------------
// The nav bar
// ---------------------------------------------------------------------------

/**
 * The one <nav> on a barn page and on the barn-scoped Profile page alike. The drawer's own
 * <nav>, and every dropdown's links (UserMenu, NotificationBell, BarnSwitcher), render only
 * while open — so with nothing driven, this holds exactly the barn-name link plus
 * DesktopNavLinks' output. Both projects here are Desktop Chrome, so `md:flex` is live.
 */
function nav(page: Page) {
  return page.locator('nav')
}

/**
 * What a trainer's and a rider's nav both carry, in DOM order (see note 3). Shared by the
 * barn-page tests and the Profile-page tests, which is what makes checklist lines 909/1010's
 * "same set as the regular barn pages" true by construction rather than by a cross-page read —
 * a read of both pages compared against each other would pass if BOTH navs lost their links.
 */
const FOUR_LINK_NAV = ['Lessons', 'Horses', 'Members', 'Guide']

function navWithBarnName(): string[] {
  return [barn.data.barn.name, ...FOUR_LINK_NAV]
}

/**
 * Asserted separately per role rather than as one shared list: a trainer hides Finances and
 * Manage Barn that a rider's nav never carried, so a single shared constant would silently
 * over-claim on the rider side. Anchored, so `Expenses` cannot be satisfied by a substring.
 */
const TRAINER_HIDDEN = /^(Finances|Manage Barn|Leases|Boarding|Expenses)$/
const RIDER_HIDDEN = /^(Leases|Boarding|Expenses)$/

/**
 * Positive control for the two "hides X" tests, and not one of their assertions — a zero count
 * is satisfied by a page that never rendered, and `toHaveCount(0)` would happily agree with it.
 * Waiting on a link the nav DOES carry means the zero is read from a nav that exists.
 *
 * A bare `waitFor` rather than a second `expect`, so each of those tests carries exactly one
 * assertion (root CLAUDE.md's testing conventions). It loses nothing: `waitFor` throws on
 * timeout, so the guard still fails the test outright, and it is unbounded where an `expect`
 * matcher would have run on expect's 5s budget (e2e/CLAUDE.md fact 1).
 */
async function navHasRendered(page: Page): Promise<void> {
  await nav(page).getByRole('link', { name: 'Lessons', exact: true }).waitFor()
}

function barnPageUrl(): string {
  return `/barn/${barn.slug}/lessons`
}

function profileUrl(): string {
  return `/profile?barn=${barn.slug}`
}

test('trainer_nav_shows_the_four_link_nav_beside_the_barn_name @trainer', async ({ page }) => {
  await page.goto(barnPageUrl())
  await expect(nav(page).getByRole('link')).toHaveText(navWithBarnName())
})

test('trainer_nav_hides_finances_manage_barn_leases_boarding_and_expenses @trainer', async ({ page }) => {
  await page.goto(barnPageUrl())
  await navHasRendered(page)

  await expect(nav(page).getByRole('link', { name: TRAINER_HIDDEN })).toHaveCount(0)
})

test('rider_nav_shows_the_four_link_nav_beside_the_barn_name @rider', async ({ page }) => {
  await page.goto(barnPageUrl())
  await expect(nav(page).getByRole('link')).toHaveText(navWithBarnName())
})

test('rider_nav_hides_leases_boarding_and_expenses @rider', async ({ page }) => {
  await page.goto(barnPageUrl())
  await navHasRendered(page)

  await expect(nav(page).getByRole('link', { name: RIDER_HIDDEN })).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// The two blocked routes
// ---------------------------------------------------------------------------

/**
 * Both halves of the checklist line in one assertion, because "404" and "not a login redirect"
 * are one claim: a 404 rendered at `/barn/<slug>/login` satisfies the status half alone, and a
 * 200 at the requested path satisfies the URL half alone.
 *
 * The URL is read plainly rather than through `waitForURL` — `page.goto` already resolves after
 * redirects (support/test.ts's URL block), so there is nothing left to wait for, and a
 * `waitForURL` on the requested path would be the no-op sync point fact 3 warns about.
 */
async function blockedRoute(page: Page, path: string) {
  const response = await page.goto(path)
  return { status: response!.status(), path: new URL(page.url()).pathname }
}

test('trainer_expenses_route_404s_rather_than_redirecting_to_login @trainer', async ({ page }) => {
  const path = `/barn/${barn.slug}/expenses`
  expect(await blockedRoute(page, path)).toEqual({ status: 404, path })
})

test('trainer_finances_route_404s_rather_than_redirecting_to_login @trainer', async ({ page }) => {
  const path = `/barn/${barn.slug}/finances`
  expect(await blockedRoute(page, path)).toEqual({ status: 404, path })
})

test('rider_expenses_route_404s_rather_than_redirecting_to_login @rider', async ({ page }) => {
  const path = `/barn/${barn.slug}/expenses`
  expect(await blockedRoute(page, path)).toEqual({ status: 404, path })
})

test('rider_finances_route_404s_rather_than_redirecting_to_login @rider', async ({ page }) => {
  const path = `/barn/${barn.slug}/finances`
  expect(await blockedRoute(page, path)).toEqual({ status: 404, path })
})

// ---------------------------------------------------------------------------
// The Profile page, reached the way the checklist reaches it
// ---------------------------------------------------------------------------

/**
 * Opens the avatar dropdown, and doubles as this file's hydration barrier.
 *
 * The dropdown is `useState`-gated markup, so it cannot exist before hydration — a signal that
 * strictly post-dates it rather than merely correlating (support/hydration.ts). `isLive` is a
 * single non-retrying `count()`, as that helper requires, and the drive is a toggle, which it
 * re-dispatches only while `isLive` is false.
 */
async function openAvatarMenu(page: Page) {
  const avatar = page.getByRole('button', { name: 'User menu', exact: true })
  const profileLink = page.getByRole('link', { name: 'Profile', exact: true })
  await hydrateByDriving(
    () => avatar.click(),
    async () => (await profileLink.count()) > 0
  )
  return profileLink
}

/** Leaves the page as it was found, so a later read of the nav's links sees no menu items. */
async function closeAvatarMenu(page: Page) {
  await page.getByRole('button', { name: 'User menu', exact: true }).click()
  await expect(page.getByRole('link', { name: 'Profile', exact: true })).toHaveCount(0)
}

async function goToProfileViaAvatarMenu(page: Page) {
  await page.goto(barnPageUrl())
  const profileLink = await openAvatarMenu(page)
  await profileLink.click()
  // No explicit timeout: navigationTimeout defaults to unbounded and a number could only
  // tighten it (#1211). 'commit' is enough — the claim is that the URL changed.
  await page.waitForURL(new RegExp(`/profile\\?barn=${barn.slug}$`), { waitUntil: 'commit' })
  // And then a DESTINATION-ONLY signal, which is the half that actually matters here. The nav
  // bar the caller is about to assert on renders on the SOURCE page too, and a `Link` click is
  // a soft navigation: the URL flips while the previous route is still mounted, so an assertion
  // taken at `commit` can match the page we just left and pass without the Profile page ever
  // rendering. `Edit Profile` is ProfileForm's heading and exists nowhere on a barn page, so
  // waiting on it is what makes the URL claim and the render claim the same event. #1207 fixed
  // this exact shape once already, on the manager's copy of this flow.
  await page.getByRole('heading', { name: 'Edit Profile', exact: true }).waitFor()
}

/**
 * The barn-name link is what distinguishes the barn-scoped nav bar from profile/layout.tsx's
 * fallback, which renders a lone `← Back` link and nothing else — so a page that lost the
 * `?barn=` scoping fails here rather than passing on a nav bar that is merely present.
 */
test('trainer_profile_reached_from_the_avatar_menu_renders_the_barn_nav_bar @trainer', async ({ page }) => {
  await goToProfileViaAvatarMenu(page)
  await expect(nav(page).getByRole('link', { name: barn.data.barn.name, exact: true })).toBeVisible()
})

test('rider_profile_reached_from_the_avatar_menu_renders_the_barn_nav_bar @rider', async ({ page }) => {
  await goToProfileViaAvatarMenu(page)
  await expect(nav(page).getByRole('link', { name: barn.data.barn.name, exact: true })).toBeVisible()
})

// Reached by URL rather than through the avatar menu: the menu is the previous line's claim, and
// driving it here would leave its own `Profile`/`User Guide`/`About` links inside the nav being
// read. `navWithBarnName()` is the same expectation the barn-page tests use — see FOUR_LINK_NAV.
test('trainer_profile_nav_carries_the_same_four_link_set_as_a_barn_page @trainer', async ({ page }) => {
  await page.goto(profileUrl())
  await expect(nav(page).getByRole('link')).toHaveText(navWithBarnName())
})

test('rider_profile_nav_carries_the_same_four_link_set_as_a_barn_page @rider', async ({ page }) => {
  await page.goto(profileUrl())
  await expect(nav(page).getByRole('link')).toHaveText(navWithBarnName())
})

// ---------------------------------------------------------------------------
// #1018 — the Calendar Feed link's scoping
// ---------------------------------------------------------------------------

/**
 * Mints the caller's feed link and reads it off the clipboard, the way the checklist line says
 * to ("your Calendar Feed link"). Chromium needs `clipboard-read` granted before
 * `navigator.clipboard.readText` resolves; `clipboard-write` goes with it so the component's own
 * `writeText` can never be the thing that fails.
 *
 * The hydration barrier is driven through the AVATAR, not through `Get my calendar link`: that
 * button is `pending`-disabled for the whole flight of its Server Action and is then replaced by
 * `Copy Link`, so a re-dispatched drive would block on a locator that never becomes actionable
 * again — for the rest of the test's budget. support/hydration.ts asks for a control the test
 * does not assert on whose repeat is harmless, and the avatar toggle is exactly that.
 *
 * "Copied!" is the sync point for the clipboard write, because it is set only after `writeText`
 * RESOLVES — the app's own signal that the clipboard is populated (e2e/CLAUDE.md fact 8).
 */
async function copyCalendarFeedUrl(
  page: Page,
  context: { grantPermissions: (p: string[]) => Promise<void> }
): Promise<string> {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(profileUrl())
  await openAvatarMenu(page)
  await closeAvatarMenu(page)

  await page.getByRole('button', { name: 'Get my calendar link', exact: true }).click()
  await page.getByRole('button', { name: 'Copy Link', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

/**
 * Every VEVENT's UID, sorted — a set comparison, never an index (see note 3). `buildIcsFeed`
 * folds content lines over 75 octets onto a continuation beginning with a space (RFC 5545 §3.1),
 * which a `UID:` prefix test cannot mistake for a property line; the UIDs here are 63 octets and
 * do not fold anyway.
 */
function feedUids(body: string): string[] {
  return body
    .split('\r\n')
    .filter((line) => line.startsWith('UID:'))
    .map((line) => line.slice('UID:'.length))
    .sort()
}

/** src/lib/ics.ts's `${itemType}-${id}@stablestate.app`, derived from the seeded row's own id. */
function uidFor(lesson: Lesson): string {
  return `lesson-${lesson.id}@stablestate.app`
}

test('trainer_calendar_feed_carries_only_lessons_they_instruct @trainer', async ({ page, context, request }) => {
  const url = await copyCalendarFeedUrl(page, context)
  const response = await request.get(url)

  // Set equality over EVERY UID, not containment: containment on `trainerLesson` alone would
  // pass against a feed that also leaked the manager-instructed one, which is the whole of what
  // "not Blake's" claims.
  expect(feedUids(await response.text())).toEqual([uidFor(trainerLesson)])
})

test('rider_calendar_feed_carries_only_lessons_they_are_enrolled_in @rider', async ({ page, context, request }) => {
  const url = await copyCalendarFeedUrl(page, context)
  const response = await request.get(url)

  // The mirror claim, and the reason the fixture seeds two lessons rather than one: the stub
  // rider's lesson is in the same barn and is excluded on enrollment alone.
  expect(feedUids(await response.text())).toEqual([uidFor(riderLesson)])
})
