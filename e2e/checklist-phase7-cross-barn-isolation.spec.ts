// covers: src/app/barn/[slug]/(protected)/layout.tsx
// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/members/**
// covers: src/app/barn/[slug]/(protected)/finances/**
//
// Cross-barn isolation for a manager who holds an active membership in both barns
// (checklists/pre-release/phase-7-multi-barn.md's "Cross-barn isolation" block). The phase is
// headed "Cross-barn isolation, not cross-role" and, until #1415, asserted none of it.
//
// ---------------------------------------------------------------------------
// Three things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THE DIRECT-URL TESTS ARE THE POINT; THE LIST TESTS ARE THE COMFORTABLE HALF.
//    A spec that only navigates through the UI never tests the boundary at all — client-side
//    scoping is not the boundary, RLS is, and the four list checks would pass with every policy
//    dropped. Addressing barn A's own record id under barn B's slug is the assertion that
//    reaches the DAL's barn_id filter and the policies behind it.
//
// 2. THE TWO BARNS ARE SEEDED IDENTICALLY IN SHAPE AND DIFFERENTLY IN VALUE.
//    Same three records each, distinct names and distinct lesson fees, so a leak changes a
//    *figure* and not merely a row count — and so each barn is the other's negative control on
//    one variable at a time.
//
// 3. EVERY LIST IS READ AS A SET OF RECORD IDS, NOT OF NAMES.
//    An id is what the isolation claim is actually about, and a name assertion additionally
//    depends on both halves of the fixture-name collision rule (support/fixtures.ts's
//    E2E_STUB_RIDER) holding forever. The reads go through `recordIds`, whose wait doubles as
//    the non-empty assertion — an unrendered page yields [] and fails rather than passing on
//    nothing (e2e/CLAUDE.md's spec-maintenance rule 3).
import { test, expect, withBarn, withSecondBarn, type Page, type SeedContext } from './support/test'
import { addHorse, addManagedMember, addPaidLesson, monthAnchor } from './support/fixtures'
import { settledInnerTexts } from './support/read'
import { formatMonthParam } from '@/lib/finances-month'
import { formatCurrency } from '@/lib/format-currency'
import type { Horse, Lesson } from '@/lib/db/types'

// Distinct fees, so the Finances check below fails on a leak rather than on a coincidence: if
// barn A's lesson reached barn B's page, the Gross figure moves as well as the row count.
const BARN_A_FEE = 90
const BARN_B_FEE = 40

// One horse and one managed stub per barn. Both halves of E2E_STUB_RIDER's collision rule hold
// across all six names here and the four members addMemberships seeds: no name contains another,
// and no two share a `first-initial-of-surname` form.
const BARN_A_HORSE = 'Aurora'
const BARN_B_HORSE = 'Blizzard'
const BARN_A_MEMBER = { firstName: 'Alder', lastName: 'Vance' }
const BARN_B_MEMBER = { firstName: 'Brook', lastName: 'Quinlan' }

/** The Gross column of the Finances By Horse breakdown — label, Gross, Expenses, Net. */
const GROSS_COL = 1

type Seeded = { horse: Horse; lesson: Lesson; stubMembershipId: string }

let seededA: Seeded
let seededB: Seeded

/**
 * One barn's three records. Shared by both seeds rather than written twice, so the two barns
 * can only differ in the values this takes as arguments — a spec whose "identical in shape"
 * claim rested on two hand-kept copies would drift the first time one was edited.
 */
async function seedRecords(
  { supabase, barn, members }: SeedContext,
  horseName: string,
  fee: number,
  member: { firstName: string; lastName: string }
): Promise<Seeded> {
  const horse = await addHorse(supabase, barn.id, horseName)
  // Paid, not merely booked: getEntityIncome counts collected lessons only, so an unpaid
  // lesson would leave the Finances By Horse table empty and that check vacuous.
  const lesson = await addPaidLesson(supabase, barn, {
    monthsAgo: 0,
    instructorId: members.trainer.membershipId,
    horseIds: [horse.id],
    riderIds: [members.rider.membershipId],
    fee,
  })
  const stub = await addManagedMember(supabase, barn.id, { ...member, role: 'rider' })
  return { horse, lesson, stubMembershipId: stub.membershipId }
}

const barnA = withBarn('phase7-cross-barn-isolation', async (ctx) => {
  seededA = await seedRecords(ctx, BARN_A_HORSE, BARN_A_FEE, BARN_A_MEMBER)
})

const barnB = withSecondBarn('phase7-cross-barn-isolation', async (ctx) => {
  seededB = await seedRecords(ctx, BARN_B_HORSE, BARN_B_FEE, BARN_B_MEMBER)
})

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** A record link's trailing segment, as against `/lessons/new` and the like. */
const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/**
 * The id of every record linked under `prefix`, sorted, read only once the first link has
 * rendered.
 *
 * `evaluateAll` does not auto-retry — the same hazard `allInnerTexts` carries — so it keeps the
 * inline `waitFor` e2e/CLAUDE.md prescribes for exactly this case; a page that rendered no rows
 * yields [] here and fails the comparison rather than passing on nothing. Sorted because these
 * lists are query-derived, and each of the four pages orders by something (name, date, role
 * section) this file has no claim about.
 *
 * The prefix carries barn B's own slug, and that is not a way of ignoring barn A's rows: every
 * one of these pages builds its hrefs from the slug in the URL, so a leaked barn A record would
 * appear here as a barn B href carrying a barn A id — which is exactly what the comparisons
 * below reject.
 *
 * Ids rather than whole hrefs, because one of the four links carries a query string
 * (ByHorseTable's drill-down pins `?month=`) and the id is the whole of the claim either way.
 */
async function recordIds(page: Page, prefix: string): Promise<string[]> {
  const locator = page.locator(`a[href^="${prefix}"]`)
  await locator.first().waitFor()
  const hrefs = await locator.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('href') ?? ''))
  return hrefs.map((href) => href.slice(prefix.length).split('?')[0]).filter((id) => RECORD_ID.test(id)).sort()
}

/** The month the seeded lessons land in, framed in the barn's own zone rather than the host's. */
function financesUrl(): string {
  return `/barn/${barnB.slug}/finances?month=${formatMonthParam(monthAnchor(0, barnB.data.barn.timezone))}`
}

/**
 * Both halves of a direct-URL check in one value, the shape
 * checklist-phase56-nav-profile.spec.ts's `blockedRoute` established: a 404 rendered at some
 * other path satisfies the status half alone, and a 200 at the requested path satisfies the path
 * half alone. `page.goto` already resolves after redirects, so the URL is read plainly.
 */
async function statusAndPathOf(page: Page, path: string) {
  const response = await page.goto(path)
  return { status: response!.status(), path: new URL(page.url()).pathname }
}

// ---------------------------------------------------------------------------
// Barn B's lists hold only barn B's rows
// ---------------------------------------------------------------------------

test('barn_b_horses_page_lists_only_barn_b_horses @manager', async ({ page }) => {
  const prefix = `/barn/${barnB.slug}/horses/`
  await page.goto(`/barn/${barnB.slug}/horses`)

  expect(await recordIds(page, prefix)).toEqual([seededB.horse.id])
})

test('barn_b_lessons_page_lists_only_barn_b_lessons @manager', async ({ page }) => {
  const prefix = `/barn/${barnB.slug}/lessons/`
  await page.goto(`/barn/${barnB.slug}/lessons`)

  expect(await recordIds(page, prefix)).toEqual([seededB.lesson.id])
})

/**
 * The five memberships barn B holds: the caller's own (the You section links to it), the trainer
 * and rider logins, addMemberships' stub second rider, and this barn's own managed stub. Barn A
 * holds five of its own, and the manager, trainer and rider logins are members of both — which
 * is what makes this a real cross-barn read rather than a read of rows only barn B could have.
 */
test('barn_b_members_page_lists_only_barn_b_members @manager', async ({ page }) => {
  const prefix = `/barn/${barnB.slug}/members/`
  await page.goto(`/barn/${barnB.slug}/members`)
  const { members } = barnB.data

  expect(await recordIds(page, prefix)).toEqual(
    [members.manager, members.trainer, members.rider, members.rider2]
      .map((m) => m.membershipId)
      .concat(seededB.stubMembershipId)
      .sort()
  )
})

/**
 * Two assertions in one test because they are one claim: the table holding only barn B's horse
 * says nothing on its own if the figure beside it is the sum of both barns' lessons.
 */
test('barn_b_finances_shows_only_barn_b_income @manager', async ({ page }) => {
  const prefix = `/barn/${barnB.slug}/finances/horses/`
  await page.goto(financesUrl())

  const row = page.locator('tbody tr').filter({ has: page.locator(`a[href^="${prefix}${seededB.horse.id}"]`) })
  expect({
    horses: await recordIds(page, prefix),
    gross: (await settledInnerTexts(row.locator('td').nth(GROSS_COL)))[0].trim(),
  }).toEqual({
    horses: [seededB.horse.id],
    gross: formatCurrency(BARN_B_FEE),
  })
})

// ---------------------------------------------------------------------------
// Barn A's own ids, addressed under barn B's slug
// ---------------------------------------------------------------------------

test('a_barn_a_horse_id_under_barn_b_404s @manager', async ({ page }) => {
  const path = `/barn/${barnB.slug}/horses/${seededA.horse.id}`
  expect(await statusAndPathOf(page, path)).toEqual({ status: 404, path })
})

test('a_barn_a_lesson_id_under_barn_b_404s @manager', async ({ page }) => {
  const path = `/barn/${barnB.slug}/lessons/${seededA.lesson.id}`
  expect(await statusAndPathOf(page, path)).toEqual({ status: 404, path })
})

test('a_barn_a_membership_id_under_barn_b_404s @manager', async ({ page }) => {
  const path = `/barn/${barnB.slug}/members/${seededA.stubMembershipId}`
  expect(await statusAndPathOf(page, path)).toEqual({ status: 404, path })
})

/**
 * The positive control for the three above, and not optional: a 404 assertion that would also
 * pass against a *valid* id is asserting that the route is broken, not that the boundary holds.
 * Barn B's own horse at the same URL shape has to render.
 */
test('barn_b_own_horse_id_under_barn_b_renders @manager', async ({ page }) => {
  const path = `/barn/${barnB.slug}/horses/${seededB.horse.id}`
  expect(await statusAndPathOf(page, path)).toEqual({ status: 200, path })
})

// ---------------------------------------------------------------------------
// The barn chrome
// ---------------------------------------------------------------------------

/**
 * Barn A first, so the assertion is about the barn in the URL rather than about the only barn
 * the session has ever seen. Name, href and document title together: the title comes from the
 * layout's generateMetadata and the link from BarnSwitcher, so a page that resolved the wrong
 * barn in only one of the two still fails here.
 */
test('the_barn_chrome_follows_the_url_not_the_previously_visited_barn @manager', async ({ page }) => {
  await page.goto(`/barn/${barnA.slug}`)
  await page.goto(`/barn/${barnB.slug}`)

  const barnLink = page.locator(`nav a[href="/barn/${barnB.slug}"]`)
  expect({
    name: (await settledInnerTexts(barnLink))[0],
    title: await page.title(),
  }).toEqual({
    name: barnB.data.barn.name,
    title: `${barnB.data.barn.name} | Stable State`,
  })
})
