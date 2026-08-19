// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/components/calendar/**
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, cancelLesson, daysFromNow } from './support/fixtures'
import { lessonCards, visibleLessonIds } from './support/lesson-pages'
import { goToDaysAhead } from './support/dashboard'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs the assertions read back by name. Horse and tier names are inputs to the
// builders rather than values they return, so naming them here is what keeps the filter
// assertions below free of loose string literals.
const APPLE = 'Apple'
const WILLOW = 'Willow'
const STANDARD_TIER = 'Standard'
const CUSTOM_TIER = 'Custom'
// The three shared logins' profile names (scripts/e2e-auth-users.ts) and the stub rider
// addMemberships plants. Used only as pill labels to click; every *expected* value below is
// an id a builder returned.
const TRAINER_NAME = 'Test Trainer'
const RIDER_NAME = 'Test Rider'

// Lesson ids, filled in by the seed. The list renders newest-first, and every expectation
// below is written in that order.
let cancelledId: string
let willowUpcomingId: string
let trainerRecentId: string
let managerRecentId: string
let willowPastId: string
let olderId: string
let trainerMembershipId: string

// Six normal lessons, each with an instructor, one horse and one rider — a deliberately
// uniform content shape, because the card-geometry checkbox below asserts sibling cards are
// uniform in height and a group lesson or a rider-less lesson renders a different number of
// detail lines. The *badges* are left to fall where the app puts them (Unpaid on the past
// ones, Cancelled on the cancelled one, Needs Attention on Willow's upcoming one): seeding
// those away to flatten the cards would assert the seed rather than the page.
//
// Five of the six land inside the page's 7-day recent window; `older` at -10 days is the one
// behind the toggle.
const barn = withBarn('phase4-lessons-list', async ({ supabase, barn, members }) => {
  trainerMembershipId = members.trainer.membershipId

  const standard = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: 80, isDefault: true })
  const custom = await addTier(supabase, barn.id, { name: CUSTOM_TIER, price: 55 })
  const apple = await addHorse(supabase, barn.id, APPLE)
  const willow = await addHorse(supabase, barn.id, WILLOW)

  const standardDefaults = { fee: standard.price, tierName: standard.name }

  cancelledId = (await addUnpaidLesson(supabase, barn, {
    ...standardDefaults,
    at: daysFromNow(3, barn.timezone),
    time: '15:00',
    instructorId: members.manager.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider2.membershipId],
  })).id

  // The only Custom-tier lesson in the barn, so the By Tier assertion has a one-element answer.
  // Its 14:00 is also one of the two afternoon times in the recent list (the cancelled lesson
  // above is at 15:00) — see the 12-hour test below for why an afternoon time is load-bearing.
  willowUpcomingId = (await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '14:00',
    instructorId: members.trainer.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider.membershipId],
    fee: custom.price,
    tierName: custom.name,
  })).id

  trainerRecentId = (await addUnpaidLesson(supabase, barn, {
    ...standardDefaults,
    at: daysFromNow(1, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apple.id],
    riderIds: [members.rider2.membershipId],
  })).id

  managerRecentId = (await addUnpaidLesson(supabase, barn, {
    ...standardDefaults,
    at: daysFromNow(-1, barn.timezone),
    time: '09:00',
    instructorId: members.manager.membershipId,
    horseIds: [apple.id],
    riderIds: [members.rider.membershipId],
  })).id

  willowPastId = (await addUnpaidLesson(supabase, barn, {
    ...standardDefaults,
    at: daysFromNow(-2, barn.timezone),
    time: '11:00',
    instructorId: members.trainer.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider.membershipId],
  })).id

  olderId = (await addUnpaidLesson(supabase, barn, {
    ...standardDefaults,
    at: daysFromNow(-10, barn.timezone),
    time: '08:00',
    instructorId: members.trainer.membershipId,
    horseIds: [apple.id],
    riderIds: [members.rider.membershipId],
  })).id

  await cancelLesson(supabase, barn, { lessonId: cancelledId })

  // Willow goes inactive *after* her lessons exist, and inline rather than through addHorse's
  // isAvailable option (ruling: seed inline, never edit fixtures.ts). Two reasons for the
  // ordering and the column: create_lesson_with_participants is the wrong place to find out
  // whether it screens unavailable horses, and the checklist says Willow is seeded *inactive*
  // — which is also the state #1190's detail-page banner ("Willow is inactive") reads back.
  // hydrateParticipants selects is_active alongside is_available, so needs_attention fires
  // either way.
  mustSucceed(
    await supabase.from('horses').update({ is_active: false }).eq('id', willow.id).select('id').single(),
    'mark Willow inactive'
  )
})

// ---------------------------------------------------------------------------
// Locators and readers
// ---------------------------------------------------------------------------

/** A lesson card in one of the list's <ul>s, addressed by the lesson it points at. */
function listCard(page: Page, lessonId: string): Locator {
  return page.locator(`main ul a[href$="/lessons/${lessonId}"]`)
}

/**
 * How many cards a locator matched, and how many of them carry the badge. Both halves in one
 * object so the badge-absent checks below can't pass vacuously: a locator that matched nothing
 * would report `cards: 0` and fail the assertion, where a bare toHaveCount(0) on the badge
 * would sail through.
 */
async function attentionBadgeState(card: Locator): Promise<{ cards: number; badges: number }> {
  return {
    cards: await card.count(),
    badges: await card.getByText('Needs Attention', { exact: true }).count(),
  }
}

/** The six top-row filter pills. Their hrefs are the only `?filter=`-relative links on the page. */
function filterPills(page: Page): Locator {
  return page.locator('main a[href^="?filter="]')
}

async function pickTopFilter(page: Page, label: string, expected: string) {
  await page.getByRole('link', { name: label, exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('filter') === expected, { waitUntil: 'commit' })
}

/**
 * A pill in the second row, which only appears once a top-row filter that takes a subject is
 * active. Waits for `id` to be *set* rather than for its value, so the tests that assert the
 * value are asserting something this helper hasn't already established.
 */
async function pickSubFilter(page: Page, label: string) {
  await page.getByRole('link', { name: label, exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('id') !== null, { waitUntil: 'commit' })
}

/**
 * Keyboard activation rather than a pointer .click(): this is the same button 04c64505 (#501)
 * fixed, and for the same reason — it sits at the very bottom of a long scrollable page, where
 * Chromium's scroll-into-view animation races Playwright's actionability check and a list item
 * intermittently intercepts the click mid-scroll. behaviors.spec.ts's
 * older_lessons_hidden_until_toggle_clicked still drives it this way under this same desktop
 * @manager project, so the hazard is not mobile-only.
 */
async function revealOlderLessons(page: Page) {
  const toggle = page.getByRole('button', { name: 'Show older lessons' })
  await toggle.focus()
  await toggle.press('Enter')
}

// ---------------------------------------------------------------------------
// The recent/older split
// ---------------------------------------------------------------------------

test('recent_lessons_are_shown_on_page_load @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect(listCard(page, managerRecentId)).toHaveCount(1)
})

// The two counts together: five recent cards rendered proves the list itself is populated, so
// the absent older card is an exclusion rather than an empty page.
test('older_lessons_are_not_shown_on_page_load @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect
    .poll(async () => ({ recent: await lessonCards(page).count(), older: await listCard(page, olderId).count() }))
    .toEqual({ recent: 5, older: 0 })
})

test('older_lessons_toggle_reveals_them @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await revealOlderLessons(page)
  await expect(listCard(page, olderId)).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// Card shape and tap target
// ---------------------------------------------------------------------------

// Measured against the list's own width rather than the viewport's, so "full-width" means what
// it means on the page: the card fills its column. Heights are rounded to whole pixels before
// being compared — sub-pixel layout noise is not what this checkbox is about.
test('lesson_cards_are_full_width_and_uniform_height @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  // evaluate() is a one-shot read with no auto-wait, so the list has to be up before it runs.
  await lessonCards(page).first().waitFor()
  const shape = await page.locator('main ul').first().evaluate((list) => {
    const boxes = [...list.querySelectorAll('a')].map((a) => a.getBoundingClientRect())
    const listWidth = list.getBoundingClientRect().width
    return {
      cards: boxes.length,
      fullWidth: boxes.every((b) => Math.abs(b.width - listWidth) < 1),
      uniformHeight: new Set(boxes.map((b) => Math.round(b.height))).size === 1,
    }
  })
  expect(shape).toEqual({ cards: 5, fullWidth: true, uniformHeight: true })
})

// Clicked at the card's far right edge, well clear of every line of text, so what this proves
// is that the whole card is the tap target and not just its contents.
test('whole_lesson_card_opens_its_detail_page @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  const card = listCard(page, trainerRecentId)
  // boundingBox() is a one-shot read like evaluate(): guarded so it can't measure a card that
  // hasn't laid out yet and hand back a degenerate box to click into.
  await card.waitFor()
  const box = (await card.boundingBox())!
  await card.click({ position: { x: box.width - 5, y: 10 } })
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons/${trainerRecentId}$`), { waitUntil: 'commit' })
  await expect(page.getByRole('heading', { name: 'Lesson Detail' })).toBeVisible()
})

// Cancelling is a detail-page action (#1190 covers the banner and buttons there); the list
// must not offer it per-row. Matched by visible text rather than by role, so a Cancel rendered
// as a link, a button or bare text is all caught — and "Cancelled", the badge the seeded
// cancelled lesson does carry, is excluded by `exact`. Paired with the card count so an empty
// page can't pass this.
test('no_cancel_button_appears_on_any_lesson_in_the_list @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect
    .poll(async () => ({
      cards: await lessonCards(page).count(),
      cancels: await page.locator('main').getByText('Cancel', { exact: true }).count(),
    }))
    .toEqual({ cards: 5, cancels: 0 })
})

// ---------------------------------------------------------------------------
// Filter pills
// ---------------------------------------------------------------------------

test('filter_pills_show_the_six_expected_filters @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect(filterPills(page)).toHaveText([
    'My Lessons',
    'All',
    'By Instructor',
    'By Rider',
    'By Horse',
    'By Tier',
  ])
})

// Bounding boxes, not a screenshot: distinct rounded `top` values are what "wraps onto
// multiple lines" means, and the row's own scrollWidth against its clientWidth is what
// "instead of requiring horizontal scroll" means. Scoped to the pill row rather than the
// document so an unrelated overflow elsewhere on the page can't decide this.
test('filter_pills_wrap_at_narrow_width_without_horizontal_scroll @manager', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(`/barn/${barn.slug}/lessons`)
  await filterPills(page).first().waitFor()
  const layout = await filterPills(page).first().evaluate((pill) => {
    const row = pill.parentElement!
    const tops = new Set([...row.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().top)))
    return { wrapsOntoMultipleRows: tops.size > 1, scrollsHorizontally: row.scrollWidth > row.clientWidth }
  })
  expect(layout).toEqual({ wrapsOntoMultipleRows: true, scrollsHorizontally: false })
})

// The active pill is the filled one and the inactive ones are bordered-only, so a
// non-transparent computed background is the structural discriminator — no palette value is
// hardcoded, and it survives dark mode, where the active fill merely changes colour.
test('all_is_the_active_pill_on_page_load @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await filterPills(page).first().waitFor()
  const active = await filterPills(page).first().evaluate((pill) =>
    [...pill.parentElement!.querySelectorAll('a')]
      .filter((a) => getComputedStyle(a).backgroundColor !== 'rgba(0, 0, 0, 0)')
      .map((a) => a.textContent?.trim() ?? '')
  )
  expect(active).toEqual(['All'])
})

// ---------------------------------------------------------------------------
// What each filter returns
// ---------------------------------------------------------------------------

test('my_lessons_filter_shows_only_lessons_you_instruct @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'My Lessons', 'mine')
  await expect.poll(() => visibleLessonIds(page)).toEqual([cancelledId, managerRecentId])
})

// Older lessons are revealed too, so "every barn lesson" is literally every one seeded —
// across both instructors, and including the cancelled one.
test('all_filter_shows_every_barn_lesson @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'All', 'all')
  await revealOlderLessons(page)
  await expect
    .poll(() => visibleLessonIds(page))
    .toEqual([cancelledId, willowUpcomingId, trainerRecentId, managerRecentId, willowPastId, olderId])
})

test('by_instructor_filter_shows_only_that_instructors_lessons @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Instructor', 'trainer')
  await pickSubFilter(page, TRAINER_NAME)
  await expect.poll(() => visibleLessonIds(page)).toEqual([willowUpcomingId, trainerRecentId, willowPastId])
})

test('by_instructor_filter_url_carries_the_instructor_membership_id @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Instructor', 'trainer')
  await pickSubFilter(page, TRAINER_NAME)
  expect(new URL(page.url()).search).toBe(`?filter=trainer&id=${trainerMembershipId}`)
})

test('by_rider_filter_shows_only_that_riders_lessons @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Rider', 'rider')
  await pickSubFilter(page, RIDER_NAME)
  await expect.poll(() => visibleLessonIds(page)).toEqual([willowUpcomingId, managerRecentId, willowPastId])
})

test('by_horse_filter_shows_only_that_horses_lessons @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Horse', 'horse')
  await pickSubFilter(page, APPLE)
  await expect.poll(() => visibleLessonIds(page)).toEqual([trainerRecentId, managerRecentId])
})

test('by_tier_filter_shows_only_that_tiers_lessons @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Tier', 'tier')
  await pickSubFilter(page, CUSTOM_TIER)
  await expect.poll(() => visibleLessonIds(page)).toEqual([willowUpcomingId])
})

// The tier filter keys on the tier *name*, not an id — that is what the URL carries.
test('by_tier_filter_url_carries_the_tier_name @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await pickTopFilter(page, 'By Tier', 'tier')
  await pickSubFilter(page, CUSTOM_TIER)
  expect(new URL(page.url()).search).toBe(`?filter=tier&id=${CUSTOM_TIER}`)
})

// ---------------------------------------------------------------------------
// Time display
// ---------------------------------------------------------------------------

// The hour clamp `(1[0-2]|[1-9])` is the whole assertion: it is what a 24-hour rendering
// fails. It bites because the seed pins two of the five recent lessons to afternoon hours —
// 14:00 and 15:00 barn-local — which a 24-hour rendering would print as "14:00"/"15:00". With
// a morning-only seed the pattern would be unfalsifiable, since 9:00 reads the same either
// way. Applied to all five cards at once via toHaveText's array form.
test('lesson_list_times_display_in_twelve_hour_format @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  const times = page.locator('main ul li > a > span:first-child')
  await expect(times).toHaveText(
    Array(5).fill(/^[A-Z][a-z]{2} \d{1,2}, \d{4}, (1[0-2]|[1-9]):\d{2} (AM|PM)$/)
  )
})

// ---------------------------------------------------------------------------
// The inactive-horse "Needs Attention" badge
// ---------------------------------------------------------------------------

test('willow_upcoming_lesson_shows_needs_attention_badge_on_lessons_list @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect.poll(() => attentionBadgeState(listCard(page, willowUpcomingId))).toEqual({ cards: 1, badges: 1 })
})

test('willow_upcoming_lesson_shows_needs_attention_badge_on_dashboard_day_view @manager', async ({ page }) => {
  await goToDaysAhead(page, barn.slug, 2)
  const card = page.locator(`main a[href$="/lessons/${willowUpcomingId}"]`)
  await expect.poll(() => attentionBadgeState(card)).toEqual({ cards: 1, badges: 1 })
})

test('needs_attention_badge_does_not_appear_on_willows_past_lesson @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect.poll(() => attentionBadgeState(listCard(page, willowPastId))).toEqual({ cards: 1, badges: 0 })
})

test('needs_attention_badge_does_not_appear_on_a_cancelled_lesson @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect.poll(() => attentionBadgeState(listCard(page, cancelledId))).toEqual({ cards: 1, badges: 0 })
})
