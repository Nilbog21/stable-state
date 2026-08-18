// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/UserMenu.tsx
// covers: src/app/barn/[slug]/(protected)/NotificationBell.tsx
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
// covers: src/app/barn/[slug]/(protected)/NavDrawer.tsx
// covers: src/app/barn/[slug]/(protected)/nav-links.ts
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/components/useOutsideDismiss.ts
// covers: src/components/MarkdownDocument.tsx
// covers: src/lib/markdown-toc.ts
// covers: src/lib/changelog.ts
// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/guide/**
// covers: src/app/actions/notifications.ts
// covers: src/app/profile/**
// covers: src/app/barns/page.tsx
// covers: src/app/about/page.tsx
// covers: src/app/changelog/page.tsx
// covers: src/app/terms/page.tsx
// covers: src/app/privacy/page.tsx
//
// checklists/pre-release/phase-4-manager-verification.md, the block from "Notification bell shows
// an unread-count badge" through "The Horses list stays readable without horizontal scrolling":
// the notification bell, the profile page reached from the avatar menu, the four static pages off
// that menu, and the ~390px mobile spot-check.
//
// The `covers:` block above was written by enumerating the modules this file actually drives,
// not by trusting `scripts/select-specs.sh --lint`: that lint catches a *missing* header and a
// glob matching no path, and cannot catch a glob absent for a module the spec genuinely
// exercises — the one failure that silently shrinks the blast radius (#1195 shipped exactly
// that). `src/lib/**`, `src/app/actions/**`, `src/components/**` and the protected layout are in
// `ALWAYS_FULL` — verified rather than assumed. `useOutsideDismiss` and `src/app/actions/`
// entries therefore document what this file drives rather than select it, and stay declared for
// that reason (docs/scripts/suite.md): before #1281 only `src/components/ui/**` was always-full, and
// the open and tap-dismiss state this file asserts on for both dropdowns is that module's own.
//
// The list is what this spec DRIVES, not what it renders, and the difference is deliberate.
// `ExhaustionBar`, `EmptyState` and `calendar/CalendarDayView` all render on pages loaded here
// and none is declared, because no assertion in this file reads their output — the horses-list
// check below measures the document's own scroll width, not any component's. Declaring them
// would make a change to them select a spec that cannot detect it. Each is declared by the
// specs that do assert on it.
//
// Every glob was then checked mechanically, by feeding a real path to `select-specs.sh` and
// confirming this spec comes back: a `/**` glob is a literal string *prefix*, so one that is
// well-formed and `--lint`-green can still match nothing it was meant to — and an exact path
// carrying the wrong extension reports `mode=none`, which reads exactly like "no spec declares
// this" when it in fact means "this path does not exist".
import { readFileSync } from 'fs'
import path from 'path'
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addNotification, addTier, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { settledTextContents } from './support/read'
import { wallClockToInstant } from '@/lib/barn-timezone'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs — naming them here is what keeps the assertions below free
// of loose string literals.
const HORSE = 'Marigold'
const TIER = 'Standard'

// The nine manager nav labels, in the order phase-4-manager-verification.md's "**full 9-link
// manager nav**" line enumerates them. Written out rather than imported from `buildNavLinks`:
// the checklist line *is* the
// specification, and importing the code under test would make this assertion agree with any
// future reordering or omission in it.
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

/**
 * Four notifications, and every field of every one of them is load-bearing.
 *
 * **Distinct `type`s.** `addNotification` upserts on `(user_id, barn_id, type)`, so four rows of
 * one type would collapse to one and the whole "lists the notifications" claim would be asserted
 * against a single row.
 *
 * **Exactly one of them is already read**, which is the only reason the "unread-count badge" line's
 * assertion says anything. `upsertNotification` hard-codes `read_at: null`, so with an all-unread
 * fixture `unreadCount` and `notifications.length` are the same number — and a bell computing
 * `notifications.length`, ignoring `read_at` entirely, renders an identical badge. The word the
 * checklist line turns on is *unread*, so the fixture has to be able to tell those apart: the badge
 * reads 3 while the list holds 4.
 *
 * **`day` is a fixed past date, never today.** The bell renders `formatBarnDate(created_at)`.
 * Seeded at today's date the assertion would be vacuous in the fourth shape: a bell that ignored
 * `created_at` entirely and stamped `now` renders identical DOM. A fixed past date is reachable
 * only from the fixture. Past rather than future because a future date would be a claim about a
 * state the app never produces. `prune-old-notifications` deletes read rows older than 30 days,
 * which the read row below is — but it is a nightly cron, never run by this suite, and a barn
 * lives for one spec file.
 *
 * **All five orderings are distinct**, which is what makes deleting `getNotifications`'
 * `ORDER BY created_at DESC` a genuine kill rather than a coin flip:
 *   - expected (created_at DESC): Jumping, Farrier, Overdue, Emergency
 *   - created_at ascending:       Emergency, Overdue, Farrier, Jumping
 *   - alphabetical by title:      Emergency, Farrier, Jumping, Overdue
 *   - reverse alphabetical:       Overdue, Jumping, Farrier, Emergency
 *   - insertion order (below):    Farrier, Overdue, Jumping, Emergency
 *
 * `rendered` is the literal string the bell must print, written out rather than computed with
 * `formatBarnDate`: importing the app's own formatter would make the test agree with any bug in
 * it. The seeded time is 10:00 barn-local so the rendered day cannot depend on the barn's zone.
 */
const NOTIFICATIONS = [
  {
    type: 'expense_past_due' as const,
    title: 'Farrier Visit Past Due',
    body: 'A scheduled farrier appointment has passed its due date.',
    day: '2026-02-10',
    rendered: 'Feb 10, 2026',
    read: false,
  },
  {
    type: 'outstanding_payment' as const,
    title: 'Overdue Board Payment',
    body: 'Two board charges are still outstanding for this barn.',
    day: '2026-01-15',
    rendered: 'Jan 15, 2026',
    read: false,
  },
  {
    type: 'lesson_cancelled' as const,
    title: 'Jumping Lesson Cancelled',
    body: 'The Thursday jumping lesson was called off by its instructor.',
    day: '2026-03-02',
    rendered: 'Mar 2, 2026',
    read: false,
  },
  {
    type: 'incomplete_profile' as const,
    title: 'Emergency Contact Missing',
    body: 'Your rider profile has no emergency contact on file yet.',
    day: '2025-12-05',
    rendered: 'Dec 5, 2025',
    read: true,
  },
]

/** Display order is `created_at` descending: Mar 2, Feb 10, Jan 15, then Dec 5. */
const IN_DISPLAY_ORDER = [NOTIFICATIONS[2], NOTIFICATIONS[0], NOTIFICATIONS[1], NOTIFICATIONS[3]]

/** What the badge must read — deliberately not `NOTIFICATIONS.length`. See the docstring. */
const UNREAD_COUNT = NOTIFICATIONS.filter((n) => !n.read).length

const barn = withBarn('phase4-notifications-profile', async ({ supabase, barn, members }) => {
  const managerUserId = members.manager.userId
  if (!managerUserId) throw new Error('the manager login has no auth user — seeding cannot proceed')

  for (const n of NOTIFICATIONS) {
    await addNotification(supabase, {
      userId: managerUserId,
      barnId: barn.id,
      type: n.type,
      title: n.title,
      body: n.body,
    })
    // Inline rather than a `fixtures.ts` change (batch ruling 4): `addNotification` has neither a
    // created_at nor a read_at parameter, and twenty-odd slices share that file. Keyed on the
    // same (user_id, barn_id, type) triple the builder upserts on.
    mustSucceed(
      await supabase
        .from('notifications')
        .update({
          created_at: wallClockToInstant(`${n.day}T10:00:00`, barn.timezone).toISOString(),
          read_at: n.read ? wallClockToInstant(`${n.day}T11:00:00`, barn.timezone).toISOString() : null,
        })
        .eq('user_id', managerUserId)
        .eq('barn_id', barn.id)
        .eq('type', n.type)
        .select('id')
        .single(),
      `backdate ${n.type} notification`
    )
  }

  // Content for the two mobile no-overflow checks. Each of those tests guards on the horse name
  // being rendered before measuring, so an empty or 404 page cannot satisfy them trivially.
  const tier = await addTier(supabase, barn.id, { name: TIER, price: 80, isDefault: true })
  const marigold = await addHorse(supabase, barn.id, HORSE)
  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: '14:00',
    instructorId: members.trainer.membershipId,
    horseIds: [marigold.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

const bellButton = (page: Page) => page.getByRole('button', { name: 'Notifications', exact: true })
const avatarButton = (page: Page) => page.getByRole('button', { name: 'User menu', exact: true })

// The bell trigger's parent is NotificationBell's own ref'd container, so this scopes every
// read to that dropdown and cannot pick up a list belonging to the page underneath.
const bellRoot = (page: Page) => bellButton(page).locator('..')
const notificationRows = (page: Page) => bellRoot(page).locator('ul > li')

/** The badge is the trigger's only `<span>`; its sibling is the bell `<svg>`. */
const unreadBadge = (page: Page) => bellButton(page).locator('span')

// Positional rather than by text: the row's three paragraphs are title, body, timestamp in that
// order, so `nth-child` is what pins "the title is the first line" instead of merely "the title
// appears somewhere in the row".
const rowLine = (page: Page, nth: number) =>
  bellRoot(page).locator(`ul > li > div > p:nth-child(${nth})`)

// `getByRole`'s name match is a case-insensitive *substring*, so every one of these carries
// exact: true — a loose match here resolves the control you just interacted with (#1205).
const aboutMenuLink = (page: Page) => page.getByRole('link', { name: 'About', exact: true })
const backLink = (page: Page) => page.getByRole('link', { name: '← Back', exact: true })

async function openAvatarMenu(page: Page) {
  await avatarButton(page).click()
  await expect(aboutMenuLink(page)).toBeVisible()
}

function changelogSource(): string {
  // `__dirname`-relative rather than cwd-relative so the read cannot depend on where the runner
  // was launched from.
  return readFileSync(path.join(__dirname, '..', 'CHANGELOG.md'), 'utf-8')
}

/**
 * The current version, derived from CHANGELOG.md by taking the numerically highest version token
 * anywhere in the file. `parseLatestVersion` (`src/lib/changelog.ts`) instead reads by *position* —
 * the first `- **vN.0.x` bullet under the top `## vN.0.0` heading, falling back to the heading. Two
 * different methods on purpose: importing that helper, or copying its pattern, would make the
 * assertion agree with any bug in it, and this method is the one that survives #1589's restructure
 * without inheriting its assumption about where the newest release sits in the document.
 */
function currentVersionFromChangelog(): string {
  const rank = (v: string) =>
    v
      .slice(1)
      .split('.')
      .reduce((acc, part) => acc * 1000 + Number(part), 0)
  const versions = changelogSource().match(/v\d+\.\d+\.\d+/g) ?? []
  const newest = versions.sort((a, b) => rank(a) - rank(b)).at(-1)
  if (newest === undefined) {
    throw new Error('no version token found in CHANGELOG.md')
  }
  return newest
}

/** The text of every `## ` heading in CHANGELOG.md — post-#1589, one per major version. */
function majorVersionHeadings(): string[] {
  return changelogSource()
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3))
}

// ---------------------------------------------------------------------------
// The notification bell
//
// Declaration order is load-bearing: `mark_all_read_clears_the_unread_badge` is this file's
// only mutator and it marks *every* one of the caller's rows in the barn read, so the four
// reads above it must run first. It is not left to ordering alone, though — that test guards on
// the badge being present before it clicks, so a run that reached it out of order fails loudly
// rather than passing against an already-read barn.
// ---------------------------------------------------------------------------

test('notification_bell_shows_an_unread_count_badge @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  // UNREAD_COUNT, not NOTIFICATIONS.length: with an all-unread fixture those are the same
  // number and a bell that ignored `read_at` would pass. The read row is what separates them.
  await expect(unreadBadge(page)).toHaveText(String(UNREAD_COUNT))
})

test('opening_the_bell_lists_the_notifications @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await bellButton(page).click()
  // Exactly four, not at least four: a superset render satisfies a containment check silently,
  // and the dropdown's rows do not exist at all until the click, so this also proves the reveal
  // happened rather than reading a server-rendered list. Four rows against a badge of three is
  // also what pins the list to every notification rather than only the unread ones.
  await expect(notificationRows(page)).toHaveCount(NOTIFICATIONS.length)
})

test('each_listed_notification_shows_its_title @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await bellButton(page).click()
  expect(await settledTextContents(rowLine(page, 1))).toEqual(IN_DISPLAY_ORDER.map((n) => n.title))
})

test('each_listed_notification_shows_its_body @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await bellButton(page).click()
  // textContent, not innerText: the body paragraph is `line-clamp-2`, so the laid-out text can
  // be visually truncated while the node text is whole.
  expect(await settledTextContents(rowLine(page, 2))).toEqual(IN_DISPLAY_ORDER.map((n) => n.body))
})

test('each_listed_notification_shows_its_timestamp @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await bellButton(page).click()
  expect(await settledTextContents(rowLine(page, 3))).toEqual(IN_DISPLAY_ORDER.map((n) => n.rendered))
})

test('mark_all_read_clears_the_unread_badge @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await bellButton(page).click()
  // Pre-state proof, and the guard that makes a mis-ordered run fail loudly instead of passing
  // against a barn something else already marked read.
  await expect(unreadBadge(page)).toHaveText(String(UNREAD_COUNT))

  await page.getByRole('button', { name: 'Mark all read', exact: true }).click()

  // An absence assertion reached through an interaction, so it needs its positive half in the
  // same rendered document. It cannot be "another notification is still unread" —
  // markAllNotificationsReadAction marks every row in the barn, so no such row can exist by
  // construction. The available positive control is the four rows still rendering in the
  // still-open dropdown: same data path, so a blank or failed re-render cannot produce the
  // passing zero. Both halves are read inside one poll so they describe one render.
  await expect
    .poll(async () => ({ badge: await unreadBadge(page).count(), rows: await notificationRows(page).count() }))
    .toEqual({ badge: 0, rows: NOTIFICATIONS.length })
})

// ---------------------------------------------------------------------------
// The avatar menu and the profile page
// ---------------------------------------------------------------------------

test('avatar_menu_profile_opens_the_profile_page_with_the_barn_nav_bar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await openAvatarMenu(page)
  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/profile', { waitUntil: 'commit' })
  // Both halves in one poll, and the `heading` half is why. This is a soft navigation, so the
  // previous tree is still mounted when the URL flips and `waitUntil: 'commit'` resolves before
  // the destination renders — and the barn-name link is NOT destination-only: `BarnSwitcher`
  // renders a link with exactly that accessible name on the barn dashboard we clicked from, in
  // both its branches. On its own it was satisfiable by the page we left. "Edit Profile" is
  // `ProfileForm`'s heading and appears nowhere on the dashboard, so it pins the document; the
  // barn-name link is then the nav bar the checklist line actually asks about.
  await expect
    .poll(async () => ({
      heading: await page.getByRole('heading', { name: 'Edit Profile', exact: true }).count(),
      barnNavLink: await page.getByRole('link', { name: barn.data.barn.name, exact: true }).count(),
    }))
    .toEqual({ heading: 1, barnNavLink: 1 })
})

/**
 * `nav > div` also matches the trailing user-controls div; filtering on a link only the desktop
 * row carries selects `DesktopNavLinks`' container.
 */
function desktopNavLabels(page: Page) {
  const row = page
    .locator('nav > div')
    .filter({ has: page.getByRole('link', { name: 'Manage Barn', exact: true }) })
  return settledTextContents(row.getByRole('link'))
}

test('the_profile_nav_bar_carries_the_full_nine_link_manager_nav @manager', async ({ page }) => {
  // Both pages, because the "**full 9-link manager nav**" line makes two claims: the nine
  // links, *and* "same set as the regular barn pages". Reading only `/profile` leaves the
  // second clause unasserted, and it is
  // the clause a divergence between ProfileLayout's own `buildNavLinks` call and the protected
  // layout's would break. Full arrays rather than a length or a containment check, so the
  // comparison pins the set, the order, and that nothing else is in either row.
  await page.goto(`/profile?barn=${barn.slug}`)
  const onProfile = await desktopNavLabels(page)
  await page.goto(`/barn/${barn.slug}`)
  const onBarnPage = await desktopNavLabels(page)
  expect({ onProfile, onBarnPage }).toEqual({
    onProfile: MANAGER_NAV_LABELS,
    onBarnPage: MANAGER_NAV_LABELS,
  })
})

// This block writes `profiles.phone` on the shared `manager@e2e.test` row — the only identity
// that can reach an "edit your own profile" item, so it is the user's #1201 ruling applied:
// capture the prior value, restore *that* value unconditionally, and verify the restore by
// reading it back. Never blanked: `isProfileIncomplete` treats a null phone as incomplete and
// the auth callback would start rerouting every later run to /profile/complete.
test.describe('editing your own profile', () => {
  // Chosen to differ from the value `scripts/e2e-auth-users.ts` leaves on this row, measured
  // rather than assumed: it is `555-0100`. That is what stops the `toHaveValue` guard below
  // being vacuous — a fill lost to hydration would restore `555-0100` and fail it, whereas a
  // fixture that happened to equal the stored value would pass whether the fill landed or not.
  const PHONE = '(555) 010-1207'
  /**
   * A *third* value, distinct from both the seeded `555-0100` and `PHONE` above, and that
   * distinctness is the whole of what makes the read-back in `..._persists_it_across_a_reload`
   * falsifiable.
   *
   * Reuse `PHONE` here and the reload assertion would be satisfied by whichever of the two tests
   * ran first — an `updateProfileAction` that silently dropped `phone` while returning
   * `{ error: null }`, which is the exact bug #1289 exists to catch, would still pass. Reuse the
   * seeded `555-0100` and it passes against a save that never happened at all. Only a value no
   * other writer produces can be in the database *because this test's own save put it there*.
   *
   * Being a third value also makes the check order-independent, which is worth more than relying
   * on `fullyParallel: false`: whether this test runs before or after the redirect test, the
   * pre-state it overwrites (`555-0100` or `PHONE`) differs from what it asserts.
   */
  const RELOADED_PHONE = '(555) 010-1289'
  let priorPhone: string | null | undefined

  test.beforeAll(async () => {
    const { supabase, members } = barn.data
    priorPhone = mustSucceed<{ phone: string | null }>(
      await supabase.from('profiles').select('phone').eq('id', members.manager.profileId).single(),
      'capture the shared manager profile phone'
    ).phone
  })

  test.afterAll(async () => {
    if (priorPhone === undefined) return
    const { supabase, members } = barn.data
    mustSucceed(
      await supabase
        .from('profiles')
        .update({ phone: priorPhone })
        .eq('id', members.manager.profileId)
        .select('id')
        .single(),
      'restore the shared manager profile phone'
    )
    const readBack = mustSucceed<{ phone: string | null }>(
      await supabase.from('profiles').select('phone').eq('id', members.manager.profileId).single(),
      'verify the shared manager profile phone restore'
    ).phone
    if (readBack !== priorPhone) {
      throw new Error(`shared manager phone not restored: expected ${priorPhone}, found ${readBack}`)
    }
  })

  test('saving_an_edited_phone_redirects_back_to_the_barn @manager', async ({ page }) => {
    await page.goto(`/profile?barn=${barn.slug}`)
    const phoneInput = page.getByLabel('Phone', { exact: true })
    await phoneInput.fill(PHONE)
    // Guard, not decoration: React can reset a controlled input if the fill lands before
    // hydration, and this fails loudly rather than submitting the old value.
    await expect(phoneInput).toHaveValue(PHONE)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await page.waitForURL((url) => url.pathname === `/barn/${barn.slug}`, { waitUntil: 'commit' })
    // Render proof for the destination, which a URL read cannot supply: the dashboard's day
    // heading exists on the barn page and nowhere on /profile.
    await expect(page.getByRole('heading', { name: /Today$/ })).toBeVisible()
  })

  /**
   * The redirect test above asserts only that Save navigates. That leaves the save itself
   * unasserted: an `updateProfileAction` that dropped `phone` and returned `{ error: null }`
   * redirects identically, and no checklist line could see it (#1289).
   *
   * Shares this block's capture/restore hooks deliberately. It writes the same `profiles.phone`
   * column on the same shared `manager@e2e.test` row, and that row is per Supabase *project* —
   * `teardownBarnData` can never reach it. One `beforeAll` capture and one unconditional
   * `afterAll` restore covering both writers is the shape root `CLAUDE.md` asks for; a second
   * separately-hooked writer of a shared row is the hazard, not the fix.
   */
  test('saving_an_edited_phone_persists_it_across_a_reload @manager', async ({ page }) => {
    await page.goto(`/profile?barn=${barn.slug}`)
    const phoneInput = page.getByLabel('Phone', { exact: true })
    await phoneInput.fill(RELOADED_PHONE)
    // NOT a hydration guard, despite the redirect test above describing its identical line as
    // one. `fill()` moves the DOM value whether or not React is listening, and this reads that
    // same DOM property straight back, so it passes in both worlds and can prove nothing about
    // hydration — `support/hydration.ts`'s module comment is explicit that a signal has to be
    // something that cannot exist before hydration, and a value this test just wrote itself is
    // weaker than "merely present".
    //
    // What it does prove is worth one line: the field about to be submitted is the one this test
    // located, and it holds exactly what was typed. A wrong locator, or an input that reformats
    // its value, fails here rather than four lines later wearing the costume of a persistence
    // bug.
    //
    // A fill lost to hydration is caught by the read-back at the end of this test instead — the
    // stale value is what reaches the database, and the final assertion fails on it. That makes
    // the failure loud rather than silent, which is the property that actually matters here,
    // because fact 9's prescribed remedy has nothing on this page to bind to — this page is
    // fact 13's measured example, and this is the observation it was drawn from: `ProfileForm` and
    // `CalendarFeedSection` seed every piece of state from a server prop, so there is no markup
    // that cannot exist before hydration for `waitForHydrated`, and no control whose repeat is
    // harmless for `hydrateByDriving`.
    await expect(phoneInput).toHaveValue(RELOADED_PHONE)

    await page.getByRole('button', { name: 'Save', exact: true }).click()
    // A sync point, not a second claim — the redirect *is* the test above's claim, and this one
    // borrows it only as a signal. `ProfileForm.handleSubmit` calls `router.push` in the
    // continuation *after* `updateProfileAction` resolves, so the URL flipping is what proves
    // the write reached the database rather than merely that a form was submitted. It also
    // catches a click lost to hydration loudly rather than silently: `handleSubmit` would never
    // run, so `e.preventDefault()` would never fire, the form would submit natively back to
    // `/profile`, and this would time out instead of the assertion below passing vacuously.
    await page.waitForURL((url) => url.pathname === `/barn/${barn.slug}`, { waitUntil: 'commit' })

    // A fresh document load rather than a read of the form the save left mounted, which is the
    // entire point of the check. `/profile` is dynamic — it reads cookies through the auth
    // client, so nothing serves it from a cache — meaning this re-runs `ProfilePage` →
    // `getProfileByUserId` and re-renders the input from the row on disk. Reading the mounted
    // form instead would only ever prove React kept its own state, which it does whether or not
    // the save landed. A `reload()` is not available: Save navigates away from `/profile`.
    await page.goto(`/profile?barn=${barn.slug}`)
    await expect(page.getByLabel('Phone', { exact: true })).toHaveValue(RELOADED_PHONE)
  })
})

test('avatar_menu_user_guide_opens_the_manager_guide @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await openAvatarMenu(page)
  await page.getByRole('link', { name: 'User Guide', exact: true }).click()
  await page.waitForURL((url) => url.pathname === `/barn/${barn.slug}/guide`, { waitUntil: 'commit' })
  // The manager guide specifically: GuidePage picks its markdown file by the viewer's role, and
  // the trainer and rider guides carry different h1s.
  await expect(page.getByRole('heading', { name: 'Stable State — Manager Guide', exact: true })).toBeVisible()
})

// ---------------------------------------------------------------------------
// The static pages off the avatar menu
// ---------------------------------------------------------------------------

test('avatar_menu_about_opens_the_app_overview @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await openAvatarMenu(page)
  await aboutMenuLink(page).click()
  await page.waitForURL((url) => url.pathname === '/about', { waitUntil: 'commit' })
  // The overview prose, not the h1: "Stable State" is also the site title and the terms page's
  // heading prefix, so it proves far less about having landed on the overview.
  await expect(page.getByText(/multi-tenant lesson-tracking application/)).toBeVisible()
})

test('the_changelog_link_on_about_includes_the_current_version @manager', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('link', { name: /^Changelog/ })).toHaveText(
    `Changelog — Version ${currentVersionFromChangelog()}`
  )
})

test('the_changelog_link_on_about_opens_the_changelog_page @manager', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('link', { name: /^Changelog/ }).click()
  await page.waitForURL((url) => url.pathname === '/changelog', { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: 'Changelog', exact: true })).toBeVisible()
})

// #1589. Read against the file's own `## ` headings rather than a hardcoded version list, so the
// assertion survives every release cut. That makes it a check on the *depth limit*: the file's 28
// `###` feature headings are what an unlimited list would add, and a `toHaveText` array is exact on
// count, so any of them appearing fails here.
test('the_changelog_contents_list_names_the_major_versions @manager', async ({ page }) => {
  await page.goto('/changelog')
  await expect(
    page.getByRole('navigation', { name: 'Contents' }).getByRole('link')
  ).toHaveText(majorVersionHeadings())
})

test('the_terms_of_service_link_on_about_opens_the_terms_page @manager', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('link', { name: 'Terms of Service', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/terms', { waitUntil: 'commit' })
  await expect(
    page.getByRole('heading', { name: 'Stable State — Terms of Service', exact: true })
  ).toBeVisible()
})

test('the_privacy_policy_link_on_about_opens_the_privacy_page @manager', async ({ page }) => {
  await page.goto('/about')
  await page.getByRole('link', { name: 'Privacy Policy', exact: true }).click()
  await page.waitForURL((url) => url.pathname === '/privacy', { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: 'Privacy Policy', exact: true })).toBeVisible()
})

/** Every ← Back lands on /barns, proved by that page's own heading rather than by its URL. */
async function tapBackAndLandOnBarnList(page: Page, from: string) {
  await page.goto(from)
  await backLink(page).click()
  await page.waitForURL((url) => url.pathname === '/barns', { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: 'Select a Barn', exact: true })).toBeVisible()
}

test('the_back_link_on_about_returns_to_the_barn_list @manager', async ({ page }) => {
  await tapBackAndLandOnBarnList(page, '/about')
})

test('the_back_link_on_changelog_returns_to_the_barn_list @manager', async ({ page }) => {
  await tapBackAndLandOnBarnList(page, '/changelog')
})

test('the_back_link_on_terms_returns_to_the_barn_list @manager', async ({ page }) => {
  await tapBackAndLandOnBarnList(page, '/terms')
})

test('the_back_link_on_privacy_returns_to_the_barn_list @manager', async ({ page }) => {
  await tapBackAndLandOnBarnList(page, '/privacy')
})

// ---------------------------------------------------------------------------
// Mobile spot-check (~390px)
//
// test.use on a describe rather than a playwright.config.ts change or the pre-existing @mobile
// project: #1221 owns the runner's config, and the @mobile project would dispatch this whole
// file a second time and seed a second barn for four tests. `hasTouch` is what lets `tap()`
// dispatch touch events at all. `isMobile` is deliberately *not* set: it would route the
// overflow measurement below through Chromium's meta-viewport emulation, which is not what
// these checklist items are about.
//
// EVERY test in this block asserts the width it ran at, and that is not decoration. Measured,
// not assumed: with the viewport swapped to 1280x800 and nothing else changed, all four of
// these tests still passed — so before this pin the "at this width" half of each checklist line
// was unasserted, and the "Lessons list stays readable without horizontal scrolling" and
// "Horses list stays readable without horizontal scrolling" lines in particular, whose entire
// claim is about a narrow viewport, were being satisfied by a desktop-width render.
//
// A second measurement worth recording, because it bounds what the two tap tests prove:
// deleting `useOutsideDismiss`'s `touchstart` listener does NOT fail them. Chromium's tap
// emulation emits the compatibility mouse events after the touch sequence, so `mousedown`
// serves the dismissal. That does not make the tests wrong — a real tap on a real phone emits
// those same compatibility events, so "dismisses by tap" is exactly what is being asserted —
// but they do not isolate *which* listener does the work, and a test claiming that would need
// a synthetic touch event rather than user emulation.
// ---------------------------------------------------------------------------

const MOBILE_VIEWPORT = { width: 390, height: 844 }

test.describe('mobile spot-check', () => {
  test.use({ viewport: MOBILE_VIEWPORT, hasTouch: true })

  /**
   * Taps the nav bar's own left padding — inside `<nav>`, outside both dropdowns' containers,
   * and not on any link, so the tap can only dismiss and can never navigate. Viewport
   * coordinates rather than an element position so no layout assumption is baked in.
   */
  async function tapOutsideDropdowns(page: Page) {
    await page.touchscreen.tap(2, 2)
  }

  test('at_mobile_width_the_avatar_menu_opens_and_dismisses_by_tap @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await avatarButton(page).tap()
    await expect(aboutMenuLink(page)).toHaveCount(1)

    await tapOutsideDropdowns(page)
    // Three things in one read. The dismissal is an absence, so it carries its positive half in
    // the same rendered document — the trigger must still be there, or a page that failed to
    // render satisfies the zero on its own. And `width` pins the viewport this ran at, without
    // which the whole test passes identically at 1280px and the line's "at this width" clause
    // asserts nothing.
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        menu: await aboutMenuLink(page).count(),
        trigger: await avatarButton(page).count(),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, menu: 0, trigger: 1 })
  })

  test('at_mobile_width_the_notification_bell_dropdown_opens_and_dismisses_by_tap @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    await bellButton(page).tap()
    await expect(notificationRows(page)).toHaveCount(NOTIFICATIONS.length)

    await tapOutsideDropdowns(page)
    await expect
      .poll(async () => ({
        width: page.viewportSize()!.width,
        rows: await notificationRows(page).count(),
        trigger: await bellButton(page).count(),
      }))
      .toEqual({ width: MOBILE_VIEWPORT.width, rows: 0, trigger: 1 })
  })

  /**
   * The horizontal-overflow half of "stays readable without horizontal scrolling" — the
   * legibility judgment is the pixel call this batch defers to `@visual` everywhere else. The
   * guard is the positive control: an empty list or a 404 has no horizontal overflow either, so
   * the measurement means nothing until seeded content is on screen. Measured on
   * `documentElement` because the repo's own convention is that wide content scrolls inside its
   * own `overflow-x: auto` container while the page body never does.
   *
   * `width` is in the expectation because without it this passes at any viewport at all — a
   * 1280px render has no horizontal overflow either, and these two lines are *only* about a
   * narrow one. Reported as an overflow *amount* rather than a boolean so a failure names how
   * many pixels over it went.
   */
  async function expectNoHorizontalOverflow(page: Page, at: string) {
    await page.goto(at)
    await expect(page.getByText(HORSE, { exact: true }).first()).toBeVisible()
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    )
    expect({ width: page.viewportSize()!.width, overflow }).toEqual({
      width: MOBILE_VIEWPORT.width,
      overflow: 0,
    })
  }

  test('the_lessons_list_has_no_horizontal_overflow_at_mobile_width @manager', async ({ page }) => {
    await expectNoHorizontalOverflow(page, `/barn/${barn.slug}/lessons`)
  })

  test('the_horses_list_has_no_horizontal_overflow_at_mobile_width @manager', async ({ page }) => {
    await expectNoHorizontalOverflow(page, `/barn/${barn.slug}/horses`)
  })
})
