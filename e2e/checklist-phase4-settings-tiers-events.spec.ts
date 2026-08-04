// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/lessons/**
//
// Manage Barn's two sub-page CRUD flows (PRE_RELEASE_TEST_CHECKLIST.md lines 676-683 and
// 713-720): lesson tiers — the non-retroactive amber warnings, the new-tier instructor-cut
// pre-fill, and default/deactivate/reactivate as the New Lesson form sees them; and barn
// events — create, the visible-to defaults, edit, and delete.
//
// The `lessons/**` covers line is not decoration: three of the eight tier items assert on
// `/lessons/new`'s tier `<select>`, because "the lesson form offers it" is where the tier's
// default/active state is actually observable. A change to LessonForm's tier handling breaks
// this file, so it declares that route.
//
// Adjacent slices: #1204 owns 665-675 and 684-701, #1252 owns 702-712, #1206/#1240 own
// 721-761. Nothing outside 676-683 and 713-720 is touched here.
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { settledTextContents } from './support/read'
import { addBarnEvent, addHorse, addTier, updateBarnSettings } from './support/fixtures'
import type { LessonTier } from '@/lib/db/types'

// ---------------------------------------------------------------------------
// Seed inputs and the display forms they are expected to produce
// ---------------------------------------------------------------------------
//
// Written as literals beside the seed value rather than derived from the app's own
// formatters: an expectation computed by the code under test agrees with any bug in it.

/**
 * Distinct from every value the pre-fill could take by accident: 0 is TierForm's own
 * `defaultInstructorCut` prop default, 25 is both `addTier`'s default and the barn default
 * the checklist names, and 12 is what all three seeded tiers carry. So line 680 can only
 * pass by actually reading `barns.default_instructor_cut`.
 */
const BARN_DEFAULT_INSTRUCTOR_CUT = 37

/**
 * `LessonForm` falls back to `tiers.find(t => t.is_default) ?? tiers[0]`, and
 * `getTiersByBarn` orders by name. Making WINTER the tier line 681 promotes puts the
 * expected answer clear of all four fallbacks — alphabetical-first, insertion-first,
 * `created_at`-first and the previous default — every one of which is ARENA.
 *
 * GROUP keeps the checklist's own name for the tier lines 682/683 deactivate and reactivate.
 */
const ARENA = { name: 'Arena Basics', price: 40 }
const GROUP = { name: 'Group Special', price: 55 }
const WINTER = { name: 'Winter Intensive', price: 80 }
const SEEDED_TIER_CUT = 12

// TierForm's two non-retroactive warnings, verbatim. Shared between each "warning appears"
// assertion and its paired "warning disappears" positive control, so the two halves are
// literally the same string against the same locator.
const PRICE_WARNING = 'Changing the price will not affect past lessons'
const INSTRUCTOR_CUT_WARNING = 'Changing the instructor cut will not affect past lessons'

// How LessonForm renders each option: `{name} - ${price}`.
const ARENA_OPTION = 'Arena Basics - $40'
const GROUP_OPTION = 'Group Special - $55'
const WINTER_OPTION = 'Winter Intensive - $80'
const CUSTOM_OPTION = 'Custom'

// The event lines 714-720 create through the UI. Fixed 2030 wall clock, entered in the
// barn's own frame and displayed in it, so the expected string holds whatever zone the barn
// is in (#1222).
const NEW_EVENT = {
  title: 'Spring Show Day',
  date: '2030-05-14',
  hour: '14',
  notes: 'Bring your own tack.',
}
const NEW_EVENT_DISPLAY_DATE = 'May 14, 2030, 2:00 PM'
const NEW_EVENT_VISIBLE_TO = 'manager, trainer, rider'

/**
 * The survivor. Line 720 asserts the deleted event is gone from the list, and an assertion
 * that a list no longer holds something is satisfied just as well by a list that renders
 * nothing at all — so the expectation pairs that absence with this row's presence in a
 * single equality. Its 2031 date sorts it after NEW_EVENT under `getEventsByBarn`'s
 * `order('event_at')`.
 */
const SURVIVING_EVENT = { title: 'Winter Clinic', at: new Date('2031-01-20T15:00:00Z') }

let arena: LessonTier
let group: LessonTier
let winter: LessonTier

const barn = withBarn('settings-tiers-events', async ({ supabase, barn: seededBarn }) => {
  await updateBarnSettings(supabase, seededBarn.id, {
    defaultInstructorCut: BARN_DEFAULT_INSTRUCTOR_CUT,
  })

  // Insertion order is deliberate — see the ARENA/WINTER comment above.
  arena = await addTier(supabase, seededBarn.id, {
    ...ARENA,
    isDefault: true,
    instructorCut: SEEDED_TIER_CUT,
  })
  group = await addTier(supabase, seededBarn.id, { ...GROUP, instructorCut: SEEDED_TIER_CUT })
  winter = await addTier(supabase, seededBarn.id, { ...WINTER, instructorCut: SEEDED_TIER_CUT })

  // The New Lesson form is read three times below; a horse keeps it in its populated shape
  // rather than whatever a horseless barn renders.
  await addHorse(supabase, seededBarn.id, 'Juniper')

  await addBarnEvent(supabase, seededBarn.id, {
    at: SURVIVING_EVENT.at,
    title: SURVIVING_EVENT.title,
    visibleToRoles: ['manager'],
  })
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * The field's own wrapper `<div>` — label, input, and the amber warning when it is showing.
 * Asserting the wrapper's full text rather than the warning's presence is what makes the
 * "warning disappears" half non-vacuous: a wrapper that failed to render fails the
 * assertion instead of satisfying it, and the identical locator is read in the paired
 * "warning appears" test, so its ability to resolve is observed rather than assumed.
 */
function fieldBlock(page: Page, inputId: string) {
  return page.locator(`div:has(> #${inputId})`)
}

/**
 * Same-document positive control for the two "warning disappears" items.
 *
 * Both warnings are React state — `priceChanged`/`instructorCutChanged` derive from an
 * `onChange`-backed `useState` — so on a page that never hydrated, `fill()` moves the DOM
 * value and nothing else, no warning ever renders, and the disappearance assertion passes
 * for entirely the wrong reason, with the same text a correct pass produces. A control in
 * the paired *appear* test does not close this: it proves a different document hydrated. So
 * each revert test watches its own warning appear first, in its own page instance, before
 * reverting. `waitFor` rather than `expect`, so the test keeps one assertion and this stays
 * what it is — a precondition that throws. Verified it can fail: pointed at a string the
 * block never renders, the revert test times out here rather than reaching its assertion.
 */
async function warningShows(block: Locator, warning: string) {
  await block.getByText(warning, { exact: true }).waitFor()
}

function tierEditUrl(tierId: string) {
  return `/barn/${barn.slug}/settings/tiers/${tierId}`
}

/**
 * Every option the New Lesson form's Tier select offers, in render order.
 *
 * Deliberately not `settledInnerTexts`/`settledTextContents`: an `<option>` inside a
 * collapsed `<select>` never becomes *visible*, so read.ts's `waitFor()` guard can only time
 * out on it. `toHaveText` with an array is the guard instead — it auto-retries, reads
 * textContent, and pins the option count as well as each string, so an unrendered select
 * reads zero options and fails rather than passing on nothing.
 */
function tierOptions(page: Page) {
  return page.locator('#tier_name option')
}

/** Every section on Manage Barn renders as a closed <details>; its <h2> is in the <summary>. */
async function openSection(page: Page, title: string) {
  await page.goto(`/barn/${barn.slug}/settings`)
  const section = page
    .locator('details')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
  await section.locator('summary').click()
  return section
}

function eventRows(section: Locator) {
  return section.locator('tbody tr')
}

/**
 * Each event row's Title cell. `td:first-child`, not `.locator('td').first()` — the latter
 * flattens every row's cells into one list and takes the single first cell of the whole
 * table, which reads one title however many rows there are.
 */
async function eventTitles(page: Page): Promise<string[]> {
  const section = await openSection(page, 'Barn Events')
  return settledTextContents(eventRows(section).locator('td:first-child'))
}

/** Walks Manage Barn → Barn Events → that row's Edit, the way the checklist item does. */
async function openEventEdit(page: Page, title: string) {
  const section = await openSection(page, 'Barn Events')
  await eventRows(section).filter({ hasText: title }).getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/settings\/events\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
}

function roleCheckbox(page: Page, role: string) {
  return page.locator(`input[name="visible_to_roles"][value="${role}"]`)
}

/** Submits a form by its Save button. focus()+Enter, per #501/`04c64505`. */
async function save(page: Page) {
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings$`), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// Lesson tiers — checklist lines 676-683
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Lesson Tiers', () => {
  test('changing_a_tier_price_warns_that_past_lessons_are_unaffected @manager', async ({ page }) => {
    await page.goto(tierEditUrl(arena.id))
    await page.locator('#tier-price').fill('99')

    await expect(fieldBlock(page, 'tier-price')).toHaveText(`Price${PRICE_WARNING}`)
  })

  test('reverting_a_tier_price_removes_the_warning @manager', async ({ page }) => {
    await page.goto(tierEditUrl(arena.id))
    const block = fieldBlock(page, 'tier-price')
    await page.locator('#tier-price').fill('99')
    await warningShows(block, PRICE_WARNING)

    await page.locator('#tier-price').fill(String(ARENA.price))

    await expect(block).toHaveText('Price')
  })

  test('changing_a_tier_instructor_cut_warns_that_past_lessons_are_unaffected @manager', async ({
    page,
  }) => {
    await page.goto(tierEditUrl(arena.id))
    await page.locator('#tier-instructor-cut').fill('99')

    await expect(fieldBlock(page, 'tier-instructor-cut')).toHaveText(
      `Instructor Cut${INSTRUCTOR_CUT_WARNING}`
    )
  })

  test('reverting_a_tier_instructor_cut_removes_the_warning @manager', async ({ page }) => {
    await page.goto(tierEditUrl(arena.id))
    const block = fieldBlock(page, 'tier-instructor-cut')
    await page.locator('#tier-instructor-cut').fill('99')
    await warningShows(block, INSTRUCTOR_CUT_WARNING)

    await page.locator('#tier-instructor-cut').fill(String(SEEDED_TIER_CUT))

    await expect(block).toHaveText('Instructor Cut')
  })

  test('new_tier_form_prefills_instructor_cut_from_the_barn_default @manager', async ({ page }) => {
    const section = await openSection(page, 'Lesson Tiers')
    await section.getByRole('link', { name: 'Add Tier', exact: true }).click()
    await page.waitForURL(/\/settings\/tiers\/new$/, { waitUntil: 'commit' })

    // Destination-only content, not a URL read: 37 is a value no tier edit page can show
    // (every seeded tier carries 12) and the origin page has no such field at all.
    await expect(page.locator('#tier-instructor-cut')).toHaveValue(
      String(BARN_DEFAULT_INSTRUCTOR_CUT)
    )
  })

  test('setting_a_tier_as_default_preselects_it_on_the_new_lesson_form @manager', async ({
    page,
  }) => {
    await page.goto(tierEditUrl(winter.id))
    await page.locator('#set-as-default').check()
    await save(page)

    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await expect(page.locator('#tier_name')).toHaveValue(winter.id)
  })

  test('deactivating_a_tier_removes_it_from_the_new_lesson_form @manager', async ({ page }) => {
    await page.goto(tierEditUrl(group.id))
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: 'Deactivate', exact: true }).click()
    // The action revalidates in place rather than redirecting; Activate replacing Deactivate
    // is the rendered proof it landed. A `waitFor` precondition rather than an `expect`, so
    // the test keeps one assertion — the same choice `warningShows` above makes.
    //
    // `exact: true` is load-bearing here, not tidiness. getByRole's accessible-name match is a
    // case-insensitive *substring* by default, so `name: 'Activate'` also matches the
    // **De**activate button this test has just clicked — the wait then resolved against the
    // pre-click state and the /lessons/new read raced the server action. Measured, not
    // reasoned: on an active tier's edit page the loose locator counts 1 and the exact one
    // counts 0. It is why a mutation asserting Group Special was *still* offered after
    // deactivation passed. Every getByRole in this file is exact for the same reason.
    await page.getByRole('button', { name: 'Activate', exact: true }).waitFor()

    // Exact equality, so the claim is "gone, and the others are still there" — a positive
    // containment set would be satisfied by a select rendering nothing.
    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await expect(tierOptions(page)).toHaveText([ARENA_OPTION, WINTER_OPTION, CUSTOM_OPTION])
  })

  test('reactivating_a_tier_restores_it_to_the_new_lesson_form @manager', async ({ page }) => {
    await page.goto(tierEditUrl(group.id))
    await page.getByRole('button', { name: 'Activate', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Deactivate', exact: true }).waitFor()

    await page.goto(`/barn/${barn.slug}/lessons/new`)
    await expect(tierOptions(page)).toHaveText([
      ARENA_OPTION,
      GROUP_OPTION,
      WINTER_OPTION,
      CUSTOM_OPTION,
    ])
  })
})

// ---------------------------------------------------------------------------
// Barn events — checklist lines 713-720
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Barn Events', () => {
  test('add_event_form_checks_all_three_visible_to_roles_by_default @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/events/new`)
    const boxes = page.locator('input[name="visible_to_roles"]')
    await boxes.first().waitFor()

    // Value and checked state together, as an exact array: a section that failed to render
    // reads `[]` and fails, rather than passing on nothing.
    expect(
      await boxes.evaluateAll((els) =>
        els.map((el) => [(el as HTMLInputElement).value, (el as HTMLInputElement).checked])
      )
    ).toEqual([
      ['manager', true],
      ['trainer', true],
      ['rider', true],
    ])
  })

  test('creating_a_barn_event_lists_it_under_its_title @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/events/new`)
    await page.locator('#event-title').fill(NEW_EVENT.title)
    await page.locator('#dh-date').fill(NEW_EVENT.date)
    await page.locator('#dh-hour').selectOption(NEW_EVENT.hour)
    await page.locator('#event-notes').fill(NEW_EVENT.notes)
    await save(page)

    expect(await eventTitles(page)).toEqual([NEW_EVENT.title, SURVIVING_EVENT.title])
  })

  test('barn_event_list_entry_shows_the_events_date_and_time @manager', async ({ page }) => {
    const section = await openSection(page, 'Barn Events')
    const row = eventRows(section).filter({ hasText: NEW_EVENT.title })

    await expect(row.locator('td').nth(1)).toHaveText(NEW_EVENT_DISPLAY_DATE)
  })

  test('barn_event_list_entry_shows_its_visible_to_roles @manager', async ({ page }) => {
    const section = await openSection(page, 'Barn Events')
    const row = eventRows(section).filter({ hasText: NEW_EVENT.title })

    await expect(row.locator('td').nth(2)).toHaveText(NEW_EVENT_VISIBLE_TO)
  })

  test('unchecking_rider_on_an_event_persists_after_save @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)
    await roleCheckbox(page, 'rider').uncheck()
    await save(page)

    await openEventEdit(page, NEW_EVENT.title)
    // The positive form, not `.not.toBeChecked()`: this one requires the element to exist.
    await expect(roleCheckbox(page, 'rider')).toBeChecked({ checked: false })
  })

  test('manager_and_trainer_stay_checked_after_unchecking_rider @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)
    const boxes = page.locator('input[name="visible_to_roles"]:not([value="rider"])')
    await boxes.first().waitFor()

    expect(
      await boxes.evaluateAll((els) =>
        els.map((el) => [(el as HTMLInputElement).value, (el as HTMLInputElement).checked])
      )
    ).toEqual([
      ['manager', true],
      ['trainer', true],
    ])
  })

  test('event_delete_confirm_page_names_the_event @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)
    await page.getByRole('link', { name: 'Delete', exact: true }).click()
    await page.waitForURL(/\/settings\/events\/[0-9a-f-]{36}\/delete$/, { waitUntil: 'commit' })

    // Rendered content that exists only on the destination — the edit form has no prose
    // paragraph at all — so this proves the confirm page rendered, not merely that a URL
    // committed.
    await expect(page.locator('main p')).toHaveText(
      `This will permanently delete “${NEW_EVENT.title}”. This cannot be undone.`
    )
  })

  test('confirming_delete_removes_the_event_from_the_barn_events_list @manager', async ({
    page,
  }) => {
    await openEventEdit(page, NEW_EVENT.title)
    await page.getByRole('link', { name: 'Delete', exact: true }).click()
    await page.waitForURL(/\/settings\/events\/[0-9a-f-]{36}\/delete$/, { waitUntil: 'commit' })
    await page.getByRole('button', { name: 'Confirm Delete', exact: true }).focus()
    await page.keyboard.press('Enter')
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings$`), { waitUntil: 'commit' })

    // Absence paired with presence, in one equality — see SURVIVING_EVENT.
    expect(await eventTitles(page)).toEqual([SURVIVING_EVENT.title])
  })
})
