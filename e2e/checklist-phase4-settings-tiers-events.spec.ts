// covers: src/app/barn/[slug]/(protected)/settings/**
// covers: src/app/barn/[slug]/(protected)/lessons/**
//
// Manage Barn's two sub-page CRUD flows (checklists/pre-release/phase-4-manager-verification.md
// the tier block from "change its price → an amber warning" through "**Reactivate** it", and the
// Barn Events block): lesson tiers — the non-retroactive amber warnings, the new-tier instructor-cut
// pre-fill, and default/deactivate/reactivate as the New Lesson form sees them; and barn
// events — create, the visible-to defaults, edit, and delete.
//
// The `lessons/**` covers line is not decoration: three of the eight tier items assert on
// `/lessons/new`'s tier `<select>`, because "the lesson form offers it" is where the tier's
// default/active state is actually observable. A change to LessonForm's tier handling breaks
// this file, so it declares that route.
//
// Adjacent slices: #1204 owns the accordions and settings fields, #1252 the barn-local instant
// items, #1206/#1240 the Data Backup block. Nothing outside the tier and Barn Events blocks is
// touched here.
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { settledTextContents } from './support/read'
import { addBarnEvent, addHorse, addTier, updateBarnSettings } from './support/fixtures'
import { hydrateByDriving } from './support/hydration'
import type { CalendarDate, LessonTier } from '@/lib/db/types'
import { addDays, calendarDate } from '@/lib/local-day'
import { barnToday, wallClockToInstant } from '@/lib/barn-timezone'

// ---------------------------------------------------------------------------
// Seed inputs and the display forms they are expected to produce
// ---------------------------------------------------------------------------
//
// Written as literals beside the seed value rather than derived from the app's own
// formatters: an expectation computed by the code under test agrees with any bug in it.

/**
 * Distinct from every value the pre-fill could take by accident: 0 is TierForm's own
 * `defaultInstructorCut` prop default, 25 is both `addTier`'s default and the barn default
 * the checklist names, and 12 is what all three seeded tiers carry. So the "Instructor Cut field
 * pre-fills from the barn's Default Instructor Cut" line can only
 * pass by actually reading `barns.default_instructor_cut`.
 */
const BARN_DEFAULT_INSTRUCTOR_CUT = 37

/**
 * `LessonForm` falls back to `tiers.find(t => t.is_default) ?? tiers[0]`, and
 * `getTiersByBarn` orders by name. Making WINTER the tier the "Set a different tier as
 * **default**" line promotes puts the
 * expected answer clear of all four fallbacks — alphabetical-first, insertion-first,
 * `created_at`-first and the previous default — every one of which is ARENA.
 *
 * GROUP keeps the checklist's own name for the tier the **Deactivate** and **Reactivate** lines act
 * on.
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

/**
 * The price line claims "an amber warning" and the Instructor Cut line claims "the same style amber
 * warning", so the colour is part of both claims and text equality alone leaves it unasserted.
 * TierForm gives both warnings this identical class string — asserting the same literal in both
 * tests is what makes "same style" a checked claim rather than a described one.
 */
const AMBER_WARNING_CLASS = 'mt-1 text-xs text-amber-600 dark:text-amber-400'

// How LessonForm renders each option: `{name} - ${price}`.
const ARENA_OPTION = 'Arena Basics - $40'
const GROUP_OPTION = 'Group Special - $55'
const WINTER_OPTION = 'Winter Intensive - $80'
const CUSTOM_OPTION = 'Custom'

// The event the Barn Events lines create through the UI, from "Create an event with a title,
// date and start time, and notes" through "the event no longer appears". Its wall clock is
// entered in the barn's own frame and displayed in it, so the expected string holds whatever zone
// the barn is in (#1222).
//
// ITS DAY IS BARN-RELATIVE since #1645, where it had been a fixed 2030-05-14. The form's date
// field is now a month grid, and there is no way to reach a day ~45 months out except by clicking
// the pager 45 times. Three days ahead is at most one page forward, which is the bound
// `pickCalendarDay` below is written to.
const NEW_EVENT = {
  title: 'Spring Show Day',
  time: '14:00',
  notes: 'Bring your own tack.',
}
const NEW_EVENT_VISIBLE_TO = 'manager, trainer, rider'

/** `NEW_EVENT`'s day, and the Barn Events row's rendered date — both set from the barn's own
 *  today in the seed callback below. */
let newEventDay: CalendarDate
let newEventDisplayDate: string

/**
 * The survivor. "**Confirm Delete** → the event no longer appears in the Barn Events list"
 * asserts the deleted event is gone from the list, and an assertion
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

  await addBarnEvent(supabase, seededBarn, {
    at: SURVIVING_EVENT.at,
    title: SURVIVING_EVENT.title,
    visibleToRoles: ['manager'],
  })

  // Both derived from the barn's own today, never the host's (#1222). The display string is
  // reimplemented here from the wall clock rather than borrowed from `format-date.ts`, so the
  // "list entry shows the correct date" item compares the row against an independent answer
  // instead of against the renderer that produced it.
  newEventDay = addDays(calendarDate(barnToday(seededBarn.timezone)), 3)
  newEventDisplayDate = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(new Date(`${newEventDay}T${NEW_EVENT.time}:00Z`))
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/**
 * The field's own wrapper `<div>` — label, input, and the amber warning when it is showing.
 *
 * The two "warning disappears" items assert this wrapper's *full* text rather than the
 * warning's absence, which is what keeps them non-vacuous: a wrapper that failed to render
 * fails the assertion instead of satisfying it. The two "warning appears" items scope a
 * text lookup to the same wrapper, so the locator is exercised in both directions.
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
 * The one event row whose Title cell is exactly `title`.
 *
 * `filter({ has: cell })` rather than `filter({ hasText })`: `hasText` is a case-insensitive
 * *substring* over the whole row, so a future event whose title merely contained this one
 * would match a second row — and because the reads below use `nth()`, which selects rather
 * than throwing, that would silently return the wrong row's cells instead of raising a
 * strict-mode error. Matching the cell exactly removes the hazard rather than relying on the
 * seeded titles staying non-overlapping.
 */
function eventRow(page: Page, section: Locator, title: string) {
  return eventRows(section).filter({ has: page.getByRole('cell', { name: title, exact: true }) })
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
  await eventRow(page, section, title).getByRole('link', { name: 'Edit', exact: true }).click()
  await page.waitForURL(/\/settings\/events\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
}

function roleCheckbox(page: Page, role: string) {
  return page.locator(`input[name="visible_to_roles"][value="${role}"]`)
}

/**
 * Opens Add Event and blocks until React has taken the form over (#1645).
 *
 * `openNewLessonForm`'s barrier, applied to the form that now shares its shape. Waiting for
 * `#event-start-time` to appear would prove nothing — the day panel is `dayPanelAlwaysOpen`, so
 * that input is in the SERVER-rendered HTML and the day-cell click below would race hydration,
 * where a lost click is simply lost (e2e/CLAUDE.md facts 9 and 10). The barrier waits instead on
 * the hidden `event_at` input carrying the barn's today combined with the time just entered,
 * which only client-side `StartTimeField` can write — and which does not exist at all until a
 * time is entered, so it cannot pre-match a server-rendered value.
 */
async function openNewEventForm(page: Page): Promise<void> {
  test.slow()
  const timezone = barn.data.barn.timezone
  await page.goto(`/barn/${barn.slug}/settings/events/new`)
  await page.getByRole('heading', { level: 1, name: 'New Event' }).waitFor()

  const expected = wallClockToInstant(`${barnToday(timezone)}T${NEW_EVENT.time}:00`, timezone).toISOString()
  await hydrateByDriving(
    () => page.locator('#event-start-time').fill(NEW_EVENT.time),
    () =>
      page.evaluate((want) => {
        const el = document.querySelector('input[name="event_at"]')
        return el instanceof HTMLInputElement && el.value === want
      }, expected)
  )
}

/**
 * Pages the month grid to the month holding `day`, then taps it. Copied from
 * `checklist-phase4-barn-timezone.spec.ts`'s helper of the same name, bound the same way: the
 * only day this file picks is 3 ahead of the barn's today, so one page forward is the most that
 * is ever needed.
 */
async function pickCalendarDay(page: Page, day: string): Promise<void> {
  const monthHeading = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${day}T00:00:00Z`))
  for (let i = 0; i < 2 && !(await page.getByText(monthHeading, { exact: true }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Next month', exact: true }).click()
  }
  await expect(page.getByText(monthHeading, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: day, exact: true }).click()
}

/**
 * The day panel's schedule lines, scoped to the panel itself.
 *
 * `checklist-phase3-calendar-panel.spec.ts`'s `dayPanel`/`dayPanelItems`, verbatim and for its
 * reason: stated in DOM terms rather than by class, because `MonthCalendarPicker`'s bordered box
 * holds exactly three children in order — the month-nav header, the 7-column grid, and the panel
 * — so from the Previous-month button inside that header, the panel is the parent's second
 * following sibling.
 */
function dayPanelItems(page: Page): Locator {
  return page
    .locator('button[aria-label="Previous month"]')
    .locator('xpath=../following-sibling::div[2]')
    .locator('li')
}

/**
 * The day panel's schedule read is a Server Action fired after hydration, so it lands well after
 * the page does. `checklist-phase3-calendar-panel.spec.ts`'s budget and its reasoning: expect's
 * own 5s default is not raised by `test.slow()`, so a number here *loosens* rather than tightens
 * (fact 1), and 30s absorbs a cold route compile under full-suite worker contention.
 */
const SCHEDULE_FETCH_BUDGET = 30_000

/**
 * Submits a form by its Save button. focus()+Enter, per #501/`04c64505`.
 *
 * `savedSlug` is the section the action's redirect names (#1417) — `tiers` from a tier form,
 * `events` from an event form. Taken as an argument rather than matched loosely, so the wait
 * still proves *which* round trip completed.
 */
async function save(page: Page, savedSlug: 'tiers' | 'events') {
  await page.getByRole('button', { name: 'Save', exact: true }).focus()
  await page.keyboard.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings\\?saved=${savedSlug}$`), {
    waitUntil: 'commit',
  })
}

// ---------------------------------------------------------------------------
// Lesson tiers — the checklist block from "change its price → an amber warning" through
// "**Reactivate** it → it appears again when creating a lesson"
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Lesson Tiers', () => {
  test('changing_a_tier_price_warns_that_past_lessons_are_unaffected @manager', async ({ page }) => {
    await page.goto(tierEditUrl(arena.id))
    await page.locator('#tier-price').fill('99')

    // One assertion, both halves of the line: the locator resolves only if exactly one node
    // in the Price block carries exactly that text (strict mode), and toHaveClass pins the
    // amber styling the line names.
    await expect(
      fieldBlock(page, 'tier-price').getByText(PRICE_WARNING, { exact: true })
    ).toHaveClass(AMBER_WARNING_CLASS)
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

    // Same shape and the same expected class as the price warning above — which is exactly
    // what the Instructor Cut line's "the same style amber warning" claims.
    await expect(
      fieldBlock(page, 'tier-instructor-cut').getByText(INSTRUCTOR_CUT_WARNING, { exact: true })
    ).toHaveClass(AMBER_WARNING_CLASS)
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
    await save(page, 'tiers')

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
// Barn events — the checklist block from "**Add Event** under Barn Events" through
// "**Confirm Delete** → the event no longer appears in the Barn Events list"
// ---------------------------------------------------------------------------

test.describe.serial('Manage Barn — Barn Events', () => {
  test('add_event_form_checks_all_three_visible_to_roles_by_default @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/events/new`)
    const boxes = page.locator('input[name="visible_to_roles"]')
    await boxes.first().waitFor()

    // Label, submitted value and checked state together, as an exact array. The line names
    // the three checkboxes by their *labels*, so reading only `value` would pass on a form
    // whose labels had been swapped against their values. A fieldset that failed to render
    // reads `[]` and fails, rather than passing on nothing.
    expect(
      await boxes.evaluateAll((els) =>
        els.map((el) => {
          const input = el as HTMLInputElement
          return [input.closest('label')?.textContent, input.value, input.checked]
        })
      )
    ).toEqual([
      ['Manager', 'manager', true],
      ['Trainer', 'trainer', true],
      ['Rider', 'rider', true],
    ])
  })

  test('creating_a_barn_event_lists_it_under_its_title @manager', async ({ page }) => {
    await openNewEventForm(page)
    await page.locator('#event-title').fill(NEW_EVENT.title)
    await pickCalendarDay(page, newEventDay)
    await page.locator('#event-notes').fill(NEW_EVENT.notes)
    await save(page, 'events')

    expect(await eventTitles(page)).toEqual([NEW_EVENT.title, SURVIVING_EVENT.title])
  })

  test('barn_event_list_entry_shows_the_events_date_and_time @manager', async ({ page }) => {
    const section = await openSection(page, 'Barn Events')
    const row = eventRow(page, section, NEW_EVENT.title)

    await expect(row.locator('td').nth(1)).toHaveText(newEventDisplayDate)
  })

  // #1645 — the day panel the month grid opens under itself, on the form where a manager is
  // actually deciding a day. Asserted on the *edit* form of the event just created: its panel
  // opens on that event's own day from first render, so the schedule under test needs no paging
  // to reach, and the event itself is a row the barn is known to hold on that day.
  //
  // Deliberately says nothing about which *appointments* land on a day — #1640 is changing which
  // ones `getScheduleForRange` surfaces, and a line pinning that would have to be rewritten there.
  test('the_edit_event_day_panel_lists_that_days_event @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)

    // The whole panel as one array, so an extra line fails rather than being ignored, and an
    // empty panel reads `[]` rather than passing on nothing.
    await expect(dayPanelItems(page)).toHaveText([`2:00 PM${NEW_EVENT.title}`], {
      timeout: SCHEDULE_FETCH_BUDGET,
    })
  })

  test('barn_event_list_entry_shows_its_visible_to_roles @manager', async ({ page }) => {
    const section = await openSection(page, 'Barn Events')
    const row = eventRow(page, section, NEW_EVENT.title)

    // textContent, which is lowercase — the cell is `<Td className="capitalize">`, so the
    // screen reads "Manager, Trainer, Rider" while the node text is what the checklist's
    // "manager, trainer, rider" visible-to line quotes.
    // Asserted as the line writes it; the CSS transform is noted, not encoded.
    await expect(row.locator('td').nth(2)).toHaveText(NEW_EVENT_VISIBLE_TO)
  })

  test('unchecking_rider_on_an_event_persists_after_save @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)
    await roleCheckbox(page, 'rider').uncheck()
    await save(page, 'events')

    await openEventEdit(page, NEW_EVENT.title)
    const rider = roleCheckbox(page, 'rider')
    await rider.waitFor()

    // The title is read alongside the checkbox rather than asserted separately, and that
    // pairing is the point: the *other* seeded event is `visibleToRoles: ['manager']`, so it
    // also has Rider unchecked. "Rider is unchecked" alone would therefore be satisfied by
    // landing on the wrong event's form. One assertion, both claims.
    expect({
      title: await page.locator('#event-title').inputValue(),
      riderChecked: await rider.isChecked(),
    }).toEqual({ title: NEW_EVENT.title, riderChecked: false })
  })

  test('manager_and_trainer_stay_checked_after_unchecking_rider @manager', async ({ page }) => {
    await openEventEdit(page, NEW_EVENT.title)
    const boxes = page.locator('input[name="visible_to_roles"]:not([value="rider"])')
    await boxes.first().waitFor()

    // This is a companion control to the test above, not an independent observation: "Manager and
    // Trainer are still checked there" is a "still checked" claim, so its expected state is also
    // its pre-state and no amount of
    // structuring makes it falsifiable by a dropped write — the test above is what catches
    // that. What it does independently discriminate is *which* event's form was loaded, since
    // the other seeded event is `visibleToRoles: ['manager']` and so has Trainer unchecked.
    // The title is folded in to make that the assertion's job rather than a happy accident.
    expect({
      title: await page.locator('#event-title').inputValue(),
      boxes: await boxes.evaluateAll((els) =>
        els.map((el) => {
          const input = el as HTMLInputElement
          return [input.closest('label')?.textContent, input.value, input.checked]
        })
      ),
    }).toEqual({
      title: NEW_EVENT.title,
      boxes: [
        ['Manager', 'manager', true],
        ['Trainer', 'trainer', true],
      ],
    })
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
    await page.waitForURL(new RegExp(`/barn/${barn.slug}/settings\\?open=events$`), { waitUntil: 'commit' })

    // Absence paired with presence, in one equality — see SURVIVING_EVENT.
    expect(await eventTitles(page)).toEqual([SURVIVING_EVENT.title])
  })
})

// ---------------------------------------------------------------------------
// Sub-page round trip — the #1417 "**Add Tier** → Save → back on Manage Barn with **Lesson
// Tiers** open" line and its "The new tier is listed in that section" pair
// ---------------------------------------------------------------------------

// Declared last on purpose: it adds a tier, and the Lesson Tiers block above asserts the new
// lesson form's tier list by exact equality. `fullyParallel` is false, so declaration order is
// run order and those equalities keep their pre-state.
test.describe.serial('Manage Barn — Add Tier round trip', () => {
  const ROUND_TRIP_TIER = 'Round Trip'

  test('adding_a_tier_returns_to_settings_with_lesson_tiers_open @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/settings/tiers/new`)
    await page.locator('#tier-name').fill(ROUND_TRIP_TIER)
    await page.locator('#tier-price').fill('65')
    await save(page, 'tiers')

    // One read covering both lines: a `<td>` inside a closed `<details>` is never visible, so a
    // visible cell proves the section reopened *and* that the tier just created is the one
    // listed — which is the round trip the issue is about.
    const section = page
      .locator('details')
      .filter({ has: page.getByRole('heading', { name: 'Lesson Tiers', exact: true }) })
    await expect(section.getByRole('cell', { name: ROUND_TRIP_TIER, exact: true })).toBeVisible()
  })
})
