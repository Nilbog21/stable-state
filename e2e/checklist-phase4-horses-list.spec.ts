// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/components/ExhaustionBar.tsx
//
// The Horses list's Available section: its name sort, one exhaustion bar per card, the three
// colour bands, and the breakdown popover's open / retap-to-close / tap-outside-to-close /
// does-not-navigate behaviours (checklists/pre-release/phase-4-manager-verification.md, the block
// from "The Available section is sorted by horse name" through "Tapping the bar does not
// navigate to the horse detail page").
//
// Every test does its own goto and mutates nothing, so this file is a set of independent reads of
// one seeded barn rather than a chain — no test.describe.serial, and no test can be running
// against state a previous one left.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addUnpaidLesson, daysFromNow, updateBarnSettings } from './support/fixtures'

// Seed inputs, not builder outputs. These three names are what the spec puts in; the assertions
// below read them back as card text.
const APPLE = 'Apple'
const BUTTER = 'Butter'
const CLOVER = 'Clover'

// Barn-wide exhaustion thresholds, pinned rather than inherited from the column defaults so the
// band each seeded total lands in is a property of this file and not of a migration.
const MODERATE_THRESHOLD = 5
const HIGH_THRESHOLD = 11

// The seeded lessons, one row per (horse, day, time). lesson_horses.exertion_level is CHECK 1..5,
// so the three horses are separated by lesson *count* as much as by per-lesson exertion.
//
// Days are -1/0/+1 against get_horse_exertion_summary's +/-3-day window, which is an instant
// window (`lesson_at BETWEEN p_target_date -/+ INTERVAL '3 days'`), not a calendar one. The
// furthest any seeded lesson sits from the moment the page reads it is ~37h — day +1 at 13:00
// barn-local, read just after barn-local midnight — or ~39h if the run crosses barn-local
// midnight, since daysFromNow fixes "today" at seed time. Both are comfortably inside 72h, which
// is why this file needs no clock pinning. Adding a further-out day would eat that margin.
//
// Times are distinct per horse so no two seeded lessons share an instant.
const LESSON_PLAN = {
  apple: [
    { day: -1, time: '09:00', exertion: 4 },
    { day: 1, time: '09:00', exertion: 4 },
  ],
  butter: [
    { day: -1, time: '11:00', exertion: 5 },
    { day: 0, time: '11:00', exertion: 5 },
    { day: 1, time: '11:00', exertion: 5 },
  ],
  clover: [{ day: 0, time: '13:00', exertion: 2 }],
}

// The totals those lessons add up to, and the band each lands in, written out as literals next to
// the plan rather than recomputed from it — a total derived from LESSON_PLAN by the same reduce
// ExhaustionBar performs would agree with any bug in that reduce.
//
//   Clover  2  <= 5  -> low       bg-green-500
//   Apple   8  in (5, 11]  -> moderate  bg-amber-500
//   Butter 15  >  11 -> high      bg-red-500
//
// (The issue's acceptance criteria say bg-orange-500 for moderate; src/lib/band-colors.ts says
// bg-amber-500, and its own docstring records the orange -> amber realignment. The code is
// authoritative.)
const LOW_BAND_FILL = /bg-green-500/
const MODERATE_BAND_FILL = /bg-amber-500/
const HIGH_BAND_FILL = /bg-red-500/

// The Available section sorts by name (#1553), so the expected order is Apple, Butter, Clover.
// The two orders it could produce by accident both differ from it: insertion order (Butter,
// Clover, Apple, seeded that way below on purpose) and the exertion-ascending order the page
// sorted by before #1553 (Clover, Apple, Butter, per the totals above). No accidentally-correct
// ordering can pass this.
const EXPECTED_NAME_ORDER = [APPLE, BUTTER, CLOVER]

// The breakdown popover's header for Apple, written as the literal string the page must render.
// "1 lessons" would be the Clover form — the component does not pluralise — which is noted only
// so a reader doesn't mistake this line for a typo if the file ever grows a Clover case.
const APPLE_BREAKDOWN = '8 points from 2 lessons (±3-day window)'

// The captions ExhaustionBar prints above each bar since #1552, in the DOM order EXPECTED_NAME_ORDER
// fixes — Apple (8, moderate), Butter (15, high), Clover (2, low), the same totals and bands the
// table above states for the fills. Written as literals for that table's reason: a caption composed
// here from LESSON_PLAN would agree with any bug in the reduce that produced it.
const EXPECTED_CAPTIONS = ['Moderate · 8 points', 'High · 15 points', 'Low · 2 points']
const APPLE_CAPTION = EXPECTED_CAPTIONS[0]

const SOLID_BAR = '[data-testid="exhaustion-bar-solid"]'
const BAR_BUTTON = 'button[aria-label^="Exhaustion:"]'

let appleId: string
let butterId: string
let cloverId: string

const barn = withBarn('phase4-horses-list', async ({ supabase, barn, members }) => {
  await updateBarnSettings(supabase, barn.id, {
    exhaustionThresholdModerate: MODERATE_THRESHOLD,
    exhaustionThresholdHigh: HIGH_THRESHOLD,
  })

  // Butter, then Clover, then Apple: see EXPECTED_NAME_ORDER. Neither horse gets an owner or a
  // custom availability, so createHorse's defaults put all three in Available with no My Horses
  // section above them.
  butterId = (await addHorse(supabase, barn.id, BUTTER)).id
  cloverId = (await addHorse(supabase, barn.id, CLOVER)).id
  appleId = (await addHorse(supabase, barn.id, APPLE)).id

  const lessons = [
    ...LESSON_PLAN.apple.map((l) => ({ ...l, horseId: appleId })),
    ...LESSON_PLAN.butter.map((l) => ({ ...l, horseId: butterId })),
    ...LESSON_PLAN.clover.map((l) => ({ ...l, horseId: cloverId })),
  ]
  for (const lesson of lessons) {
    await addUnpaidLesson(supabase, barn, {
      at: daysFromNow(lesson.day, barn.timezone),
      time: lesson.time,
      instructorId: members.trainer.membershipId,
      horseIds: [lesson.horseId],
      riderIds: [members.rider.membershipId],
      exertionLevels: [lesson.exertion],
      fee: 50,
    })
  }
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function horseHref(horseId: string): string {
  return `/barn/${barn.slug}/horses/${horseId}`
}

/** The <section> owning the Available h2 — the Horses list is h2-partitioned. */
function availableSection(page: Page) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: 'Available', exact: true }) })
}

/**
 * One horse's card, addressed by the horse it links to rather than by name.
 *
 * `> a` pins the match to the Card root: HorseCard renders the Link as a direct child of Card's
 * bordered div, and the ExhaustionBar sits beside it as a sibling — so this div's text is the
 * horse's name, the bar's caption (#1552) and whatever the popover is currently showing, and
 * nothing else. That is what the two dismissal tests read.
 *
 * This constant is deliberately shared with the tests that assert something *present* inside the
 * card (a bar, an open breakdown). A locator that silently resolved to nothing would make the
 * dismissal assertions vacuous; it makes those two fail outright, so they are this locator's
 * positive control.
 */
function cardOf(page: Page, horseId: string) {
  return availableSection(page).locator(`div:has(> a[href="${horseHref(horseId)}"])`)
}

function bar(page: Page, horseId: string) {
  return cardOf(page, horseId).getByRole('button', { name: /^Exhaustion:/ })
}

/**
 * The breakdown popover's header line, matched on its exact full text.
 *
 * Exact rather than substring (#1202): '8 points' is a prefix of '80 points', and the enclosing
 * header div's text carries the close button's "×" so it cannot match this by accident either.
 * The locator resolves to nothing whenever the popover is closed or the numbers are wrong, so
 * toBeVisible below fails in both cases rather than passing on an empty match.
 */
function breakdown(page: Page, horseId: string, summary: string) {
  return cardOf(page, horseId).getByText(summary, { exact: true })
}

// ---------------------------------------------------------------------------
// Sort, bars, bands
// ---------------------------------------------------------------------------

// toHaveText's array form pins the link list to exactly three entries in exactly this order, so a
// section that renders nothing fails rather than satisfying the claim vacuously.
test('available_section_is_sorted_by_horse_name @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(availableSection(page).getByRole('link')).toHaveText(EXPECTED_NAME_ORDER)
})

// One clause per horse, each requiring a bar *inside that horse's own card* — so three bars stacked
// in one card, or two cards sharing one, drops the count. A card that fails to render drops it too.
test('each_available_horse_card_shows_an_exhaustion_bar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  const cardsWithABar = availableSection(page).locator(
    [cloverId, appleId, butterId].map((id) => `div:has(> a[href="${horseHref(id)}"]):has(${SOLID_BAR})`).join(', ')
  )
  await expect(cardsWithABar).toHaveCount(3)
})

// Read off the bar elements themselves, not off a wrapper: a class attribute is not inherited, so
// this cannot resolve from the card or the track and report a colour for a bar that isn't there.
// The array form asserts the count as well as the classes, so three missing bars fail rather than
// match nothing. DOM order is the name order above — Apple (8), Butter (15), Clover (2) — hence
// moderate -> high -> low.
test('the_three_bars_land_in_three_different_color_bands @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(availableSection(page).locator(SOLID_BAR)).toHaveClass([
    MODERATE_BAND_FILL,
    HIGH_BAND_FILL,
    LOW_BAND_FILL,
  ])
})

// Same array form as the band-colour test above, and for the same reasons: it pins the count as
// well as the three strings, so three missing captions fail rather than matching nothing, and no
// horse can borrow another's band. Read off the caption spans themselves — a card-level text read
// would also swallow the horse's name and the popover, and could not tell a caption apart from a
// breakdown line that happened to contain the same words.
test('each_available_horse_card_captions_its_bar_with_that_horses_band_and_total @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(availableSection(page).locator(`${BAR_BUTTON} > span`)).toHaveText(EXPECTED_CAPTIONS)
})

// ---------------------------------------------------------------------------
// The breakdown popover
// ---------------------------------------------------------------------------

// The caption sits inside the bar's own button, so it opens the same popover the bar does — the
// point of #1552, which put it there rather than above the control precisely so a tap on the words
// is not dead on touch. Tapped by its text rather than by the button, so a caption that had drifted
// out of the tap target would miss it and fail.
test('tapping_the_caption_expands_the_same_breakdown_the_bar_does @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await cardOf(page, appleId).getByText(APPLE_CAPTION, { exact: true }).click()

  await expect(breakdown(page, appleId, APPLE_BREAKDOWN)).toBeVisible()
})

// The header is asserted rather than the <li> rows, and it covers them: `existingRows.length`
// renders both the "2 lessons" here and the <ul> beneath it, and a zero-length popover renders
// the "No lessons in window" branch instead. So a header reading exactly this cannot coexist
// with a missing or differently-sized row list — which keeps the claim to one assertion while
// still pinning the aggregate (8), the lesson count (2) and the window label.
test('tapping_a_bar_expands_the_three_day_lesson_breakdown @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await bar(page, appleId).click()

  await expect(breakdown(page, appleId, APPLE_BREAKDOWN)).toBeVisible()
})

// Asserted as the card's *whole* text rather than as a count of the popover: closed, this div holds
// the horse's name and its bar's caption and nothing else, so there is no N-plus-or-minus-one a
// stale mid-transition DOM could satisfy, and a card that stopped rendering fails instead of
// counting zero. The caption joined that text in #1552 and is included deliberately — dropping to a
// substring match to avoid naming it would give the popover somewhere to hide.
//
// The waitFor between the two taps is a guard, not the assertion — without it the second tap could
// land before the popover ever opened, and "again" would be the wrong word for what happened.
test('tapping_the_bar_again_dismisses_the_breakdown @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await bar(page, appleId).click()
  await breakdown(page, appleId, APPLE_BREAKDOWN).waitFor()
  await bar(page, appleId).click()

  await expect(cardOf(page, appleId)).toHaveText(`${APPLE}${APPLE_CAPTION}`)
})

// "Elsewhere" is the page heading: outside the ExhaustionBar's ref'd container, inside the page, and
// not itself a link, so the dismissal is the only thing the tap can cause. useOutsideDismiss listens
// on mousedown, which a real click dispatches.
test('tapping_elsewhere_dismisses_the_breakdown @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await bar(page, appleId).click()
  await breakdown(page, appleId, APPLE_BREAKDOWN).waitFor()
  await page.getByRole('heading', { name: 'Horses', exact: true }).click()

  await expect(cardOf(page, appleId)).toHaveText(`${APPLE}${APPLE_CAPTION}`)
})

// Recorded navigations rather than a final URL read, because a URL read cannot express this
// claim safely. `expect(page).toHaveURL` retries until it *matches*, so it passes on its first
// poll — and an App Router <Link> commits its history.pushState only once the RSC payload for the
// destination arrives, which on a dev server compiling that route on demand is well after the
// popover has opened. A tap that really did navigate would therefore still read the old URL and
// pass. Recording every main-frame navigation instead moves the claim off "where am I now" and
// onto "what did the browser do", which no in-flight navigation can hide from.
//
// The listener is attached *before* the goto on purpose, so that navigation lands in the array
// too: the expectation is "exactly the one destination I asked for", not "none", and an empty
// array fails it. That is the positive control — a listener that never fired, or a frame filter
// that matched nothing, cannot pass this.
//
// Distinct paths, because the count is not stable and the destination is: one page.goto to this
// route fires framenavigated *twice* for the same path (measured — the document commit, then the
// App Router's own client navigation). Deduplicating keeps the claim on "which destinations were
// ever navigated to", which is what the checkbox is about, and off an event count that would be a
// silent flake. A Set preserves insertion order, so the comparison stays ordered.
//
// Deliberately not the suite's post-click `page.waitForURL` idiom (e2e/support/test.ts): that
// idiom asserts a navigation *happened* and has no negative form. Paths are compared, not full
// URLs, so the assertion doesn't restate the base URL; '/horses' vs '/horses/<id>' is an
// equality here rather than a prefix match, so the boundary the old anchored regex needed is
// structural now.
test('tapping_the_bar_does_not_navigate_to_the_horse_detail_page @manager', async ({ page }) => {
  const navigations: string[] = []
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname)
  })

  await page.goto(`/barn/${barn.slug}/horses`)
  await bar(page, appleId).click()
  await breakdown(page, appleId, APPLE_BREAKDOWN).waitFor()

  expect([...new Set(navigations)]).toEqual([`/barn/${barn.slug}/horses`])
})
