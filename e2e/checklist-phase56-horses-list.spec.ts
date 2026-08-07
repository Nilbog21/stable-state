// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/components/ExhaustionBar.tsx
//
// The Horses list through a non-manager's eye: #1000's My Horses section (its position, its
// status badge, the owned horse's disappearance from Available/Unavailable, and — since #1391 —
// its exhaustion bar), plus the rider-only claims that the *unowned* Available/Unavailable cards
// carry the name and unavailability reason and nothing else, show no exhaustion bar, render no
// Inactive section, and are tappable through to the horse detail page (#1002).
// checklists/pre-release/phase-5-trainer.md's "**Available** cards each show an exhaustion bar"
// line and its "**My Horses** section at the top" block, and phase-6-rider.md's card-sections
// and "**My Horses** section at the top" blocks.
//
// A paired slice: the same file is greped by @trainer and @rider, so Playwright dispatches it
// twice and each run seeds its own barn (support/test.ts). withBarn's callback cannot see the
// project name — test.ts resolves it in beforeAll, after the callback signature is fixed — so
// "the acting member owns X" cannot be seeded conditionally. Both barns therefore get *both*
// subject horses, one owned by members.trainer and one by members.rider, and each role's tests
// target their own.
//
// ## Why the rider's subject horse is not called Clover
//
// The rider's three **My Horses** lines name Clover, and this file's rider tests assert against
// Willow instead. That is deliberate, and it is forced by the paired-slice seeding above. Both
// subjects live in one barn, so the trainer's Clover is an ordinary unowned horse from the rider's
// side and sits in the rider's *Available* section — which is exactly the region the "no longer
// appears under Available/Unavailable" absence assertion scopes to. A second horse called Clover
// would make that assertion unfalsifiable.
//
// The checklist lines keep their wording: their Clover is the manual dev-barn walkthrough's horse,
// planted by the "grant Dana a horse-privileges row on **Clover**" Setup line above them, which
// this slice must not touch. Rewording the rider's **My Horses** lines alone would contradict it.
// The claim each test makes is the line's claim; only the fixture's name differs, which is how
// the whole #1187-#1208 batch worked.
//
// Every test does its own goto and mutates nothing, so this file is a set of independent reads
// of one seeded barn — no test.describe.serial, and no test runs against state a previous one
// left behind.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse } from './support/fixtures'

// Seed inputs, not builder outputs — these are what the spec puts in. No name contains another
// (every Playwright text matcher is substring-based), and none collides with the four seeded
// member names.
const CLOVER = 'Clover' // the trainer's subject
const WILLOW = 'Willow' // the rider's subject
const APPLE = 'Apple' // available, unowned
const BUTTER = 'Butter' // unavailable, unowned
const DOMINO = 'Domino' // inactive, unowned

const UNAVAILABILITY_REASON = 'Out with a stone bruise'

// HorseCard's owned variant maps (is_active, is_available) to one of Inactive / Unavailable /
// Active. Both subjects are seeded active and available, so this is the badge they must carry.
// `exact` at every use site is load-bearing: 'Inactive' contains 'Active'.
const ACTIVE_BADGE = 'Active'

// The page is h2-partitioned, and for a non-manager these are all of them: the Inactive section
// is isManager-gated, which is what "No Inactive section appears on that page" asserts. h1
// first, then the sections in DOM order.
const NON_MANAGER_HEADINGS = ['Horses', 'My Horses', 'Available', 'Unavailable']

const SOLID_BAR = '[data-testid="exhaustion-bar-solid"]'

let cloverId: string
let willowId: string
let appleId: string
let butterId: string

// Both roles end up with a symmetric page: My Horses holds their own subject, Available holds
// Apple plus the *other* role's subject, Unavailable holds Butter, and Domino is absent —
// getHorsesByBarn filters is_active for the rider, and the Inactive section is manager-only for
// the trainer.
const barn = withBarn('phase56-horses-list', async ({ supabase, barn, members }) => {
  cloverId = (await addHorse(supabase, barn.id, CLOVER, { owningMemberId: members.trainer.membershipId })).id
  willowId = (await addHorse(supabase, barn.id, WILLOW, { owningMemberId: members.rider.membershipId })).id
  appleId = (await addHorse(supabase, barn.id, APPLE)).id
  butterId = (
    await addHorse(supabase, barn.id, BUTTER, {
      isAvailable: false,
      unavailabilityReason: UNAVAILABILITY_REASON,
    })
  ).id

  // The rider's grant on their own horse, seeded inline (no builder for this table; same shape
  // as checklist-phase6-horse-privileges.spec.ts). `member_id` is a *membership* id despite the
  // name, and `barn_id` is required — the table's FKs are composite.
  //
  // Ownership does not carry the grant with it here, which is the whole reason this row is
  // explicit: addHorse writes owning_member_id straight to the table, while the app's only
  // rider-ownership path is set_horse_owner, which elevates lesson_read_privileges in the same
  // statement and raises without a row to elevate. #1391's owned-card bar is gated on the grant
  // rather than on ownership, because get_horse_projected_exhaustion is, so the fixture has to
  // reproduce what set_horse_owner would have left behind.
  const { error: privilegeError } = await supabase.from('member_horse_privileges').insert({
    barn_id: barn.id,
    horse_id: willowId,
    member_id: members.rider.membershipId,
    document_privileges: 'none',
    lesson_read_privileges: true,
  })
  if (privilegeError) throw privilegeError

  // Deactivated inline rather than through addHorse: HorseOptions has no isActive, and this
  // batch may not edit support/fixtures.ts. Without this horse "no Inactive section appears"
  // would be a claim about a barn that has nothing to put in one.
  const domino = await addHorse(supabase, barn.id, DOMINO)
  const { error } = await supabase.from('horses').update({ is_active: false }).eq('id', domino.id)
  if (error) throw error
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function horsesPath(): string {
  return `/barn/${barn.slug}/horses`
}

function horseHref(horseId: string): string {
  return `/barn/${barn.slug}/horses/${horseId}`
}

/** The <section> owning a given h2 — the Horses list is h2-partitioned. */
function sectionByHeading(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/**
 * The My Horses section, pinned to main's *first* section rather than found by its heading.
 *
 * That is the "at the top" half of the trainer's and rider's **My Horses** lines, expressed
 * structurally: if My Horses renders
 * anywhere but first, the filter matches nothing and the assertion fails rather than quietly
 * covering only half the line.
 */
function myHorsesSection(page: Page) {
  return page
    .locator('main > section')
    .first()
    .filter({ has: page.getByRole('heading', { name: 'My Horses', exact: true }) })
}

/**
 * One horse's card, addressed by the horse it links to rather than by name.
 *
 * `> a` pins the match to the Card root: HorseCard renders the Link as a direct child of Card's
 * bordered div, so this div's text is the horse's name plus whatever else that variant renders,
 * and nothing else.
 */
function cardOf(page: Page, horseId: string) {
  return page.locator(`div:has(> a[href="${horseHref(horseId)}"])`)
}

/**
 * Every horse href inside the Available and Unavailable sections, sorted.
 *
 * Sorted, not in DOM order: #1286 is still moving ORDER BY around underneath these lists, and
 * the claim here is membership, not order.
 *
 * The waitFor is what keeps the absence claim honest. evaluateAll is one-shot — an unrendered
 * section yields [] (e2e/CLAUDE.md's read.ts rule), and "Clover is not in []" is true of every
 * broken page there is. Both sections are seeded non-empty for both roles, so each waitFor is a
 * real precondition and a section that fails to render fails the test.
 */
async function regionHrefs(page: Page, heading: string): Promise<string[]> {
  const links = sectionByHeading(page, heading).getByRole('link')
  await links.first().waitFor()
  return links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))
}

async function availableAndUnavailableHrefs(page: Page): Promise<string[]> {
  const available = await regionHrefs(page, 'Available')
  const unavailable = await regionHrefs(page, 'Unavailable')
  return [...available, ...unavailable].sort()
}

// ---------------------------------------------------------------------------
// Phase 5 — the trainer's own horse: "The Horses list shows a **My Horses** section at the top"
// through "Clover no longer appears under Available/Unavailable"
// ---------------------------------------------------------------------------

test('trainer_my_horses_section_at_the_top_lists_the_owned_horse @trainer', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(myHorsesSection(page).locator(`a[href="${horseHref(cloverId)}"]`)).toBeVisible()
})

test('trainer_owned_horse_card_carries_a_status_badge @trainer', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(cardOf(page, cloverId).getByText(ACTIVE_BADGE, { exact: true })).toBeVisible()
})

// Absence, scoped to the two sections the line names — and stated as who *is* there rather than
// as who isn't. A page-wide "Clover is not visible" would pass trivially off the My Horses card
// above, and a bare toHaveCount(0) inside these sections would pass on a page that rendered
// neither. Naming the three other horses' hrefs asserts the exclusion and the sections'
// contents in one comparison, so nothing here can pass vacuously.
test('trainer_owned_horse_is_absent_from_available_and_unavailable @trainer', async ({ page }) => {
  await page.goto(horsesPath())
  expect(await availableAndUnavailableHrefs(page)).toEqual(
    [horseHref(appleId), horseHref(butterId), horseHref(willowId)].sort()
  )
})

// The positive control for the rider's
// rider_horse_cards_show_no_exhaustion_bar below. That test asserts a count of zero, so a
// renamed testid or a bar that stopped rendering for *everyone* would satisfy it silently. The
// trainer takes the exertion path through the page, so the same locator must find a bar in each
// of their two Available cards.
test('trainer_available_horse_cards_show_an_exhaustion_bar @trainer', async ({ page }) => {
  await page.goto(horsesPath())
  const cardsWithABar = sectionByHeading(page, 'Available').locator(
    [appleId, willowId].map((id) => `div:has(> a[href="${horseHref(id)}"]):has(${SOLID_BAR})`).join(', ')
  )
  await expect(cardsWithABar).toHaveCount(2)
})

// #1391 put the bar on the owned variant too, and the trainer needs no privileges row for it —
// get_horse_projected_exhaustion admits any barn trainer, so the only thing that changed for
// this role is that page.tsx stopped excluding owned horses from the fan-out (#1000).
//
// Presence, not toBeVisible, and the same idiom as the Available test above for the same reason:
// the seeded subjects have no lessons, so the solid segment renders at width 0% and Playwright
// calls a zero-width element hidden. Presence is the exact claim anyway — HorseCard renders this
// div if and only if page.tsx handed the card an `exhaustion` prop, which is what changed here.
test('trainer_owned_horse_card_shows_an_exhaustion_bar @trainer', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(cardOf(page, cloverId).locator(SOLID_BAR)).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's card sections: "Horses page shows Available/Unavailable cards" through
// "Tapping an Available or Unavailable card navigates to that horse's detail page"
// ---------------------------------------------------------------------------

// "Only" is the whole claim, so it is asserted as the cards' complete text: Apple's card is its
// name and nothing more, Butter's is its name and its reason and nothing more. The array form
// pins the count too, so a card that stopped rendering fails rather than matching nothing.
//
// useInnerText because textContent runs the two spans together — 'ButterOut with a stone
// bruise' — while innerText reflects the block-level reason the way the page lays it out.
// Cards are listed in DOM order, which is Available (Apple) before Unavailable (Butter);
// that is page structure, not row order, so it is stable under #1286.
test('rider_available_and_unavailable_cards_carry_only_name_and_reason @rider', async ({ page }) => {
  await page.goto(horsesPath())
  const cards = page.locator([appleId, butterId].map((id) => `div:has(> a[href="${horseHref(id)}"])`).join(', '))
  await expect(cards).toHaveText([APPLE, `${BUTTER} ${UNAVAILABILITY_REASON}`], { useInnerText: true })
})

// Scoped to the three horses the rider doesn't own, which is as wide as the claim goes since
// #1391: the owned variant renders a bar now, so the page-wide form this test used to take
// would fail against Willow — see rider_owned_horse_card_shows_an_exhaustion_bar below. What
// the rider still must not see is exhaustion for a barn horse, which is the get_horse_exertion_summary
// restriction #765 put in place and #1391 left alone.
//
// The count assertion is the anti-vacuity precondition, same role as regionHrefs' waitFor: an
// unrendered page has no bars either, and "0 bars among 0 cards" is true of every broken page
// there is. Falsifiability now has a same-barn anchor as well as the trainer's — the rider's own
// owned test drives this very locator to a visible bar in the same run.
test('rider_horse_cards_show_no_exhaustion_bar @rider', async ({ page }) => {
  await page.goto(horsesPath())
  const unownedCards = page.locator(
    [appleId, butterId, cloverId].map((id) => `div:has(> a[href="${horseHref(id)}"])`).join(', ')
  )
  await expect(unownedCards).toHaveCount(3)
  await expect(unownedCards.locator(SOLID_BAR)).toHaveCount(0)
})

// Asserted as the page's whole heading list rather than as "no Inactive heading". A count of
// zero would be satisfied by a page that rendered nothing at all, which is the failure mode
// worth guarding here; this fails in that case and still fails the moment an Inactive section
// appears. Heading roles, not text — the owned card's Inactive *badge* is not a heading, and
// it is the thing a looser matcher would trip over.
test('rider_horses_page_shows_no_inactive_section @rider', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(page.locator('main').getByRole('heading')).toHaveText(NON_MANAGER_HEADINGS)
})

// One card covers the line's "Available or Unavailable": page.tsx passes `linkable` identically
// to both variants, so they are linkable for the same reason or not at all.
//
// waitForURL is the assertion — it fails the test outright if the navigation never lands — and
// carries no timeout, since navigationTimeout is already unbounded and a number could only
// tighten it (#1211). A predicate rather than a glob so '/horses/<id>' is an equality rather
// than a prefix match. Safe to click without a hydration barrier: the card is an anchor, so a
// click landing before React is listening navigates the document rather than being lost
// (e2e/CLAUDE.md fact 11).
test('rider_tapping_an_available_card_opens_the_horse_detail_page @rider', async ({ page }) => {
  await page.goto(horsesPath())
  await sectionByHeading(page, 'Available').locator(`a[href="${horseHref(appleId)}"]`).click()
  await page.waitForURL((url) => url.pathname === horseHref(appleId), { waitUntil: 'commit' })
})

// ---------------------------------------------------------------------------
// Phase 6 — the rider's own horse: "The Horses list shows a **My Horses** section at the top"
// through "Clover no longer appears under Available/Unavailable"
// ---------------------------------------------------------------------------

test('rider_my_horses_section_at_the_top_lists_the_owned_horse @rider', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(myHorsesSection(page).locator(`a[href="${horseHref(willowId)}"]`)).toBeVisible()
})

test('rider_owned_horse_card_carries_a_status_badge @rider', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(cardOf(page, willowId).getByText(ACTIVE_BADGE, { exact: true })).toBeVisible()
})

// #1391 — the one place a rider sees exhaustion on this page, and the reason
// rider_horse_cards_show_no_exhaustion_bar above is no longer page-wide. The bar is here because
// the seeded lesson_read_privileges row admits the rider through get_horse_projected_exhaustion,
// not because they own the horse; the seeding comment says why those are two different things.
// Presence rather than toBeVisible for the reason given on the trainer's half.
test('rider_owned_horse_card_shows_an_exhaustion_bar @rider', async ({ page }) => {
  await page.goto(horsesPath())
  await expect(cardOf(page, willowId).locator(SOLID_BAR)).toHaveCount(1)
})

// The rider's half of the same scoped-absence claim — see the trainer's comment above.
//
// Read the expected set carefully before concluding this test contradicts its checklist line.
// The checklist says "Clover no longer appears under Available/Unavailable" and CLOVER is in the
// expected-*present* set here — but those are two different horses. The line's Clover is the
// one the rider owns in the manual dev-barn walkthrough; this file's CLOVER is the *trainer's*
// subject, which the rider does not own and therefore should see, exactly like any other barn
// horse. The horse this line is about is WILLOW, and its absence is what the comparison
// asserts. See the header's "Why the rider's subject horse is not called Clover".
test('rider_owned_horse_is_absent_from_available_and_unavailable @rider', async ({ page }) => {
  await page.goto(horsesPath())
  expect(await availableAndUnavailableHrefs(page)).toEqual(
    [horseHref(appleId), horseHref(butterId), horseHref(cloverId)].sort()
  )
})
