// covers: src/app/barn/[slug]/(protected)/horses/**
//
// This file is one long chained scenario: Apple is renamed, given threshold overrides, given and
// then stripped of a registered name, reverted to barn defaults and finally given notes, and
// Clover is handed to the caller as its owning member — each test reading the state the ones
// above it left. That is the shape #1198 asks for (one test() per checkbox, shared setup,
// per-step failure names), and it is safe because the file owns its barn.
//
// The consequence to know when reading a failure: Playwright restarts the worker process after a
// failing test, which re-runs withBarn's beforeAll and seeds a *fresh* barn. So the first failure
// here is the real one and everything below it is running against a re-seeded Apple — a cascade,
// not twenty regressions. Fix the top one and re-run before reading any of the rest.
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, updateBarnSettings } from './support/fixtures'
import { openSection } from './support/accordion'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs, not builder outputs. The two horse names and the registered name are what this
// spec puts in; every *expected* value below is either one of these or read back off a builder
// return (barnDefaults), never a literal re-stating something the app computed.
const APPLE = 'Apple'
const CLOVER = 'Clover'
const APPLE_RENAMED = 'Apple Blossom'
const REGISTERED_NAME = 'Four-Leaf Clover'
// Typed into Barn Name during a save the server must reject, so the "unchanged" assertion has
// something to be unchanged *from* — a rejected save that changed nothing anyway proves nothing.
const APPLE_REJECTED = 'Apple Rejected'
// #1277 — typed once, then saved a second time without retyping. Distinct from APPLE_RENAMED so
// a form that reverted to its page-load value shows APPLE_RENAMED and the assertion can see it.
const APPLE_RENAMED_TWICE = 'Apple Bloom'
const FEED_NOTES = 'Two flakes of hay, morning and night.'
const MEDICATION_NOTES = 'Bute 1g with the evening feed.'

// Three distinct override pairs, one per save. Each is different from what the form already
// shows when the test loads it, so no assertion below can pass without its save having landed.
const FIRST_OVERRIDE = { moderate: 4, high: 9 }
const SECOND_OVERRIDE = { moderate: 3, high: 8 }
const THIRD_OVERRIDE = { moderate: 6, high: 10 }
// The transient success confirmation's text, shared by the appears and doesn't-appear cases.
const SAVED_TEXT = '✓ Saved'
// moderate === high is the boundary the action rejects (`moderate >= high`).
const REJECTED_THRESHOLD = 9
// The ExhaustionBar's filled segment — the same testid checklist-phase56-horses-list.spec.ts
// addresses the bar by, and the only part of the bar that is present iff HorseCard was handed an
// `exhaustion` prop.
const SOLID_BAR = '[data-testid="exhaustion-bar-solid"]'

let appleId: string
let cloverId: string
let barnDefaults: { moderate: number; high: number }

const barn = withBarn('phase4-horses-detail', async ({ supabase, barn, members }) => {
  // 5/11 are already the column defaults, but going through the builder is what lets the
  // "reverts to barn defaults" assertion below read the numbers back rather than re-state them.
  const settings = await updateBarnSettings(supabase, barn.id, {
    exhaustionThresholdModerate: 5,
    exhaustionThresholdHigh: 11,
  })
  barnDefaults = {
    moderate: settings.exhaustion_threshold_moderate,
    high: settings.exhaustion_threshold_high,
  }

  // Neither horse gets an owner: createHorse writes owning_member_id: null when none is passed,
  // so both start under Available and the My Horses section starts absent — which is what makes
  // the #1000 block below a state *change* rather than a state check.
  appleId = (await addHorse(supabase, barn.id, APPLE)).id
  cloverId = (await addHorse(supabase, barn.id, CLOVER)).id

  // Seeded inline rather than through a builder, per this batch's seed-inline ruling. The
  // Access table only renders "Set as Owner" for a member who already holds a
  // member_horse_privileges row, and set_horse_owner raises 'privilege_grant_not_found' if the
  // new owner has none (20260725115546) — so the grant is a hard precondition of the #1000
  // block, not decorative seeding.
  mustSucceed(
    await supabase
      .from('member_horse_privileges')
      .insert({ barn_id: barn.id, horse_id: cloverId, member_id: members.manager.membershipId })
      .select('id')
      .single(),
    'grant the manager access to Clover'
  )
})

// ---------------------------------------------------------------------------
// Locators
// ---------------------------------------------------------------------------

function horseHref(horseId: string): string {
  return `/barn/${barn.slug}/horses/${horseId}`
}

/**
 * Land on a horse's page with Horse Settings expanded (#1390). Almost every test below drives
 * the manager form, and since that form now lives in a collapsed accordion, a bare `goto` leaves
 * every one of its fields permanently unreachable — see `support/accordion.ts`.
 */
async function gotoHorseSettings(page: Page, horseId: string) {
  await page.goto(horseHref(horseId))
  await openSection(page, 'Horse Settings')
}

/** The <section> owning a given h2 — the Horses list is h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/** A horse's card in a list section, addressed by the horse it points at rather than by name. */
function horseCardLink(page: Page, sectionName: string, horseId: string) {
  return section(page, sectionName).locator(`a[href="${horseHref(horseId)}"]`)
}

/**
 * The manager form, identified by the two things the first checkbox claims share it: the Barn
 * Name field and the Exhaustion Thresholds heading. Both filters are the assertion's subject,
 * so this locator resolving at all is already half the claim.
 */
function sharedForm(page: Page) {
  return page
    .locator('form')
    .filter({ has: page.getByLabel('Barn Name', { exact: true }) })
    .filter({ has: page.getByRole('heading', { name: 'Exhaustion Thresholds', exact: true }) })
}

function saveButton(page: Page) {
  return sharedForm(page).getByRole('button', { name: 'Save', exact: true })
}

/** The row holding the Save button and, on a successful save, the transient confirmation. */
function saveRow(page: Page) {
  return saveButton(page).locator('..')
}

/**
 * The save confirmation, scoped to the Save row — which is the "next to the Save button" half of
 * the checkbox that asserts it appears. One literal, `SAVED_TEXT`, is shared with the row read
 * that asserts its absence, so the two cases cannot drift apart.
 */
function savedIndicator(page: Page) {
  return saveRow(page).getByText(SAVED_TEXT, { exact: true })
}

/**
 * Card text for a horse with a registered name. HorseCard renders the two spans adjacent with
 * no literal whitespace between them (the gap is a margin), so the parenthetical is matched
 * with optional space rather than a literal one. Neither interpolated constant contains a
 * regex metacharacter.
 */
function cardTextWithRegisteredName(name: string, registeredName: string): RegExp {
  return new RegExp(`^${name}\\s*\\(${registeredName}\\)$`)
}

// ---------------------------------------------------------------------------
// Interactions
// ---------------------------------------------------------------------------

/**
 * Empty a field the real way, with select-all and Delete, rather than `fill('')`.
 *
 * Both fields this is used on are *controlled* React inputs, and `fill('')` mis-clears them:
 * Playwright's fill blanks the DOM value from the page side without dispatching an input event,
 * so React's next reconciliation restores the old string from state with the caret collapsed to
 * offset 0, and the Delete that fill then sends removes exactly one character. The field saves
 * as the original text minus its first letter — which is worse than an outright failure, since
 * the write succeeds and only the assertion catches it. A real select-all mutates nothing behind
 * React's back, so the single resulting input event carries the empty value it should.
 */
async function clear(field: ReturnType<Page['getByLabel']>) {
  await field.press('ControlOrMeta+a')
  await field.press('Delete')
}

async function overrideThresholds(page: Page, moderate: number, high: number) {
  await page.getByLabel('Use barn defaults').uncheck()
  await page.getByLabel('Moderate threshold').fill(String(moderate))
  await page.getByLabel('High threshold').fill(String(high))
}

/**
 * Click Save and wait for the write to land. A wait, never the test's assertion: SavedIndicator
 * renders only when the action returned no error, so this is the one available success signal —
 * the Save button carries no `loading` prop, so there is no disabled state to wait on, and
 * reloading without this races the server action.
 */
async function saveAndSettle(page: Page) {
  await saveButton(page).click()
  await savedIndicator(page).waitFor()
}

/** The rejected-save mirror of saveAndSettle — also a wait, not an assertion. */
async function saveAndSettleRejected(page: Page) {
  await saveButton(page).click()
  await sharedForm(page).getByRole('alert').waitFor()
}

// ---------------------------------------------------------------------------
// The shared Save, the rename, and the threshold override
// ---------------------------------------------------------------------------

// #1390 — the page's shape, asserted before anything below drives it.
//
// Titles and open state only, deliberately: the collapsed rows also carry a count or state hint,
// but every one of those figures is something a later test in this chained file changes (Apple
// gains a registered name, loses her threshold overrides, gains notes), so an assertion on them
// would really be an assertion about declaration order. `page.test.tsx` owns the hints, where the
// page's inputs are fixed. What only an e2e run can show is that the real page renders these five
// sections, in this order, with exactly one of them open.
const MANAGER_SECTIONS = ['Feed & Medication', 'Upcoming Lessons', 'Documents', 'Access', 'Horse Settings']

test('the_horse_page_renders_its_five_sections_in_read_often_to_touched_rarely_order @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await expect(page.locator('details summary h2')).toHaveText(MANAGER_SECTIONS)
})

// The whole open/closed vector rather than "Feed & Medication is open": a page that shipped every
// section expanded satisfies that narrower claim, and is exactly the flat stack this issue exists
// to undo.
test('the_horse_page_opens_with_feed_and_medication_alone_expanded @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  // A precondition, not the claim — `evaluateAll` is one-shot, and on an unrendered page it
  // answers `[]`, which no `toEqual` against a five-element array would catch as *why*.
  await expect(page.locator('details')).toHaveCount(MANAGER_SECTIONS.length)

  const open = await page
    .locator('details')
    .evaluateAll((els) => els.map((el) => (el as HTMLDetailsElement).open))

  expect(open).toEqual([true, false, false, false, false])
})

test('manager_form_and_exhaustion_thresholds_share_one_save_button @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await expect(saveButton(page)).toHaveCount(1)
})

test('renaming_apple_with_threshold_overrides_updates_the_heading @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Barn Name', { exact: true }).fill(APPLE_RENAMED)
  await overrideThresholds(page, FIRST_OVERRIDE.moderate, FIRST_OVERRIDE.high)
  await saveAndSettle(page)

  // The action revalidates both horse paths, so the server-rendered h1 refreshes in place —
  // asserting there rather than on the input proves the *saved* name, not the typed one.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(APPLE_RENAMED)
})

// Two assertions, by the ratified indivisible-save-round-trip exception (#1200's
// managed_rider_contact_info_values_persist_after_save_and_reload set the precedent): one Save
// writes both thresholds, so splitting this would re-run the save and leave the checklist line
// naming two tests. The form loads showing FIRST_OVERRIDE, so neither value can pass unchanged.
test('threshold_overrides_update_from_the_same_save @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Barn Name', { exact: true }).fill(APPLE_RENAMED)
  await overrideThresholds(page, SECOND_OVERRIDE.moderate, SECOND_OVERRIDE.high)
  await saveAndSettle(page)

  await expect(page.getByLabel('Moderate threshold')).toHaveValue(String(SECOND_OVERRIDE.moderate))
  await expect(page.getByLabel('High threshold')).toHaveValue(String(SECOND_OVERRIDE.high))
})

// Deliberately not routed through saveAndSettle: that helper's own waitFor would absorb the
// thing this checkbox is about, leaving the test asserting nothing that can fail.
test('saved_confirmation_appears_next_to_the_save_button @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await saveButton(page).click()

  await expect(savedIndicator(page)).toBeVisible()
})

// Three assertions, same ratified exception as threshold_overrides_update_from_the_same_save.
test('renamed_name_and_thresholds_persist_on_reload @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Barn Name', { exact: true }).fill(APPLE_RENAMED)
  await overrideThresholds(page, THIRD_OVERRIDE.moderate, THIRD_OVERRIDE.high)
  await saveAndSettle(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByLabel('Barn Name', { exact: true })).toHaveValue(APPLE_RENAMED)
  await expect(page.getByLabel('Moderate threshold')).toHaveValue(String(THIRD_OVERRIDE.moderate))
  await expect(page.getByLabel('High threshold')).toHaveValue(String(THIRD_OVERRIDE.high))
})

// The seeded horse has no per-horse overrides, so this box starts *checked*; every save above
// submitted it unchecked. A fresh goto is the reload.
test('use_barn_defaults_toggle_is_still_unchecked_on_reload @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await expect(page.getByLabel('Use barn defaults')).not.toBeChecked()
})

// ---------------------------------------------------------------------------
// Barn Name and Registered Name
// ---------------------------------------------------------------------------

// The label-to-control binding is the claim: if "Barn Name" labelled the registered-name field
// instead, this reads the still-blank registered name rather than the horse's barn name.
test('manager_form_name_field_is_labeled_barn_name @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await expect(page.getByLabel('Barn Name', { exact: true })).toHaveValue(APPLE_RENAMED)
})

test('registered_name_persists_on_reload @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Registered Name', { exact: true }).fill(REGISTERED_NAME)
  await saveAndSettle(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByLabel('Registered Name', { exact: true })).toHaveValue(REGISTERED_NAME)
})

test('horses_list_card_shows_registered_name_in_parentheses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(horseCardLink(page, 'Available', appleId)).toHaveText(
    cardTextWithRegisteredName(APPLE_RENAMED, REGISTERED_NAME)
  )
})

// ---------------------------------------------------------------------------
// #1000 — becoming a horse's owning member
// ---------------------------------------------------------------------------

// The first mutating test of the #1000 block: everything below reads the ownership it sets.
// Asserting on the *first* section rather than on the heading's mere presence covers both
// halves of the checkbox — the section appears, and it appears at the top.
test('setting_yourself_as_owner_puts_my_horses_at_the_top_of_the_horses_list @manager', async ({ page }) => {
  await page.goto(horseHref(cloverId))
  await openSection(page, 'Access')
  await page.getByRole('button', { name: 'Set as Owner', exact: true }).click()
  // A wait, not an assertion: the row refreshes through the action's own revalidatePath with no
  // navigation to wait on (#1390 dropped the router.refresh() that used to do this alongside it),
  // and the button relabelling is the signal the action resolved.
  await page.getByRole('button', { name: 'Owner', exact: true }).waitFor()

  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(page.locator('main > section').first().getByRole('heading')).toHaveText('My Horses')
})

test('owned_horse_appears_under_my_horses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(horseCardLink(page, 'My Horses', cloverId)).toHaveCount(1)
})

// "Green" is asserted as the tone Badge selected, not as a rendered colour: Badge.test.tsx
// already holds every tone to ≥4.5:1 in both schemes, so re-litigating legibility here would
// duplicate it, and a pixel judgment is what @visual was deferred for.
test('owned_horse_shows_a_green_active_badge_under_my_horses @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(section(page, 'My Horses').getByText('Active', { exact: true })).toHaveClass(/bg-green-100/)
})

// Deliberately not `toHaveCount(0)` on Clover's card: that passes on nothing if the Available
// section stops rendering entirely. toHaveText's array form pins the section's link list to
// exactly one entry — Apple's — so Clover's absence is a real absence and an empty section is
// a failure.
test('owned_horse_no_longer_appears_under_available @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(section(page, 'Available').getByRole('link')).toHaveText([
    cardTextWithRegisteredName(APPLE_RENAMED, REGISTERED_NAME),
  ])
})

// #1391 — the manager's half of the same claim the trainer and rider halves make in
// checklist-phase56-horses-list.spec.ts. Nothing role-specific changed for a manager;
// get_horse_projected_exhaustion has always admitted one. What changed is that page.tsx stopped
// excluding owned horses from the fan-out (#1000), so the section that already renders Clover's
// card now feeds it a bar too.
//
// Presence rather than toBeVisible, for the reason the phase56 halves give: Clover has no
// lessons, so the solid segment renders at width 0% and Playwright calls a zero-width element
// hidden. Presence is the claim anyway — HorseCard renders this div iff it was handed an
// `exhaustion` prop.
test('owned_horse_card_shows_an_exhaustion_bar @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(section(page, 'My Horses').locator(SOLID_BAR)).toHaveCount(1)
})

// ---------------------------------------------------------------------------
// #1390 — the Access table's controls are progressively enhanced
// ---------------------------------------------------------------------------

/**
 * The served HTML between the Access accordion's summary and the Horse Settings one — the Access
 * table and nothing else.
 *
 * Read off the **server's** response rather than off the DOM, because that is the whole claim:
 * the question is what a browser could submit before React has hydrated, and the DOM is what
 * exists after. `page.request` inherits the context's cookies, so this is the manager's own HTML
 * (e2e/CLAUDE.md fact 4's inheritance, wanted here rather than avoided).
 *
 * Both boundary markers are asserted before the slice is taken, so a page that renamed or
 * dropped either section fails here rather than silently measuring an empty string.
 */
async function servedAccessMarkup(page: Page, horseId: string): Promise<string> {
  const response = await page.request.get(horseHref(horseId))
  expect(response.status()).toBe(200)
  const html = await response.text()

  const start = html.indexOf('Access</h2>')
  const end = html.indexOf('Horse Settings</h2>')
  expect({ hasAccess: start !== -1, hasSettings: end !== -1, ordered: start < end })
    .toEqual({ hasAccess: true, hasSettings: true, ordered: true })

  return html.slice(start, end)
}

// Five controls, five forms: Grant Access, and then Set as Owner / the document-access select /
// the Can View toggle / Revoke on the single seeded grant row. Before #1390 every one was a
// `<button type="button" onClick>` with no form at all, so each was a silent no-op inside the
// hydration window — the defect #1385 fixed for member documents, on a page a manager lands on
// and immediately clicks.
//
// A count rather than four presence checks, and taken on the *served* markup: React emits the
// enhanced `method="POST"` form only for a Server Function or a `.bind` of one, so a control
// that regressed to an inline closure — the shape e2e/CLAUDE.md fact 10 warns about — drops out
// of this count while still looking correct in the browser and still passing every other test in
// this file.
const EXPECTED_ACCESS_FORMS = 5

test('the_access_tables_controls_all_submit_through_enhanced_forms @manager', async ({ page }) => {
  const markup = await servedAccessMarkup(page, cloverId)

  expect((markup.match(/<form[^>]*method="POST"/gi) ?? []).length).toBe(EXPECTED_ACCESS_FORMS)
})

// The companion half: `method="POST"` alone would be satisfied by a plain form the browser GETs
// nowhere useful. React carries the action's identity and its bound arguments in `$ACTION_*`
// hidden fields, which is what makes a pre-hydration submit reach the right Server Function.
test('the_access_tables_forms_carry_their_action_reference_in_hidden_fields @manager', async ({ page }) => {
  const markup = await servedAccessMarkup(page, cloverId)

  expect((markup.match(/name="\$ACTION_[^"]*"/g) ?? []).length).toBeGreaterThanOrEqual(EXPECTED_ACCESS_FORMS)
})

// ---------------------------------------------------------------------------
// Clearing the registered name, and reverting to barn defaults
// ---------------------------------------------------------------------------

test('clearing_registered_name_removes_the_card_parenthetical @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await clear(page.getByLabel('Registered Name', { exact: true }))
  await saveAndSettle(page)

  await page.goto(`/barn/${barn.slug}/horses`)
  await expect(horseCardLink(page, 'Available', appleId)).toHaveText(APPLE_RENAMED)
})

// The reload proves durability, not redraw. The checkbox used to carry a "known limitation,
// accepted as-is: the Moderate/High inputs don't visually refresh until reload"; #1288 deleted
// that clause, because it was stale by the time it was written. HorseManagerForm remounts both
// inputs on every successful save (`key={saveCount}`) and seeds them from the submitted
// FormData, and its unit test
// should_display_barn_defaults_after_save_when_checked_instead_of_stale_horse_prop_values asserts
// 5/11 immediately after submit with no reload. So the reload here earns its keep by proving the
// per-horse overrides were actually nulled in the database, which is the half a redraw can't show.
// Two assertions, same ratified exception; the form held THIRD_OVERRIDE going in, so neither value
// can pass unchanged.
test('re_checking_use_barn_defaults_reverts_thresholds_on_reload @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Use barn defaults').check()
  await saveAndSettle(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByLabel('Moderate threshold')).toHaveValue(String(barnDefaults.moderate))
  await expect(page.getByLabel('High threshold')).toHaveValue(String(barnDefaults.high))
})

// ---------------------------------------------------------------------------
// The rejected save
// ---------------------------------------------------------------------------

// The app renders one form-level <p role="alert"> rather than a per-field message, so that is
// what "rejected with a field error" is asserted as. Matching the exact message rather than
// mere presence is what distinguishes this rejection from any other error the action can return.
test('moderate_not_below_high_is_rejected_with_an_error @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await overrideThresholds(page, REJECTED_THRESHOLD, REJECTED_THRESHOLD)
  await saveButton(page).click()

  await expect(sharedForm(page).getByRole('alert')).toHaveText('Moderate threshold must be less than high threshold')
})

test('no_saved_confirmation_appears_for_a_rejected_save @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await overrideThresholds(page, REJECTED_THRESHOLD, REJECTED_THRESHOLD)
  // saveAndSettleRejected's waitFor is what stops this asserting an absence that is merely the
  // save not having resolved yet: the error alert and the flash that isn't there land in the same
  // React commit, so this is exactly the instant a successful save would be showing one.
  await saveAndSettleRejected(page)

  // One-shot, deliberately, and *not* `expect(...).toHaveCount(0)`: the flash clears itself after
  // 2s (SavedIndicator's FLASH_DURATION_MS) while expect retries for 5s, so a retrying absence
  // matcher passes on a save that did flash, purely by outlasting it. Confirmed by probe — forcing
  // this test's save to succeed leaves the retrying form green and fails this one.
  //
  // Read off the Save row rather than counting the indicator, because a count of a locator that
  // never matches anything is zero for the wrong reason. `innerText` auto-waits for the row and
  // throws if it is missing, so this either sees the row's real text or fails outright — the
  // absence is structural rather than an inference about when React commits the two together.
  expect(await saveRow(page).innerText()).not.toContain(SAVED_TEXT)
})

// The name and status are *changed in the form* before the rejected save, so "unchanged" is a
// claim about what the server refused to write rather than about a form nobody touched. Two
// assertions, same ratified exception — one rejected save, two values read back.
test('a_rejected_save_leaves_the_name_and_status_unchanged @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Barn Name', { exact: true }).fill(APPLE_REJECTED)
  await page.getByRole('button', { name: 'Inactive', exact: true }).click()
  await overrideThresholds(page, REJECTED_THRESHOLD, REJECTED_THRESHOLD)
  await saveAndSettleRejected(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByLabel('Barn Name', { exact: true })).toHaveValue(APPLE_RENAMED)
  await expect(page.getByRole('button', { name: 'Active', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

// Two assertions, same ratified exception. The horse is back on barn defaults from the revert
// above, so a rejected save that had gone through would show REJECTED_THRESHOLD in both fields.
test('a_rejected_save_leaves_the_thresholds_unchanged @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await overrideThresholds(page, REJECTED_THRESHOLD, REJECTED_THRESHOLD)
  await saveAndSettleRejected(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByLabel('Moderate threshold')).toHaveValue(String(barnDefaults.moderate))
  await expect(page.getByLabel('High threshold')).toHaveValue(String(barnDefaults.high))
})

// ---------------------------------------------------------------------------
// Feed and medication notes
// ---------------------------------------------------------------------------
//
// #1390 moved these two fields out of the manager form into their own Feed & Medication section,
// which saves through update_horse_notes rather than update_horse_details. So they no longer
// share the Save button the block above drives — hence the separate form scope and helpers below.
// The section renders defaultOpen, which is why these tests need no openSection call.

/** The Feed & Medication form — the only form on the page carrying the two notes fields. */
function notesForm(page: Page) {
  return page
    .locator('form')
    .filter({ has: page.getByLabel('Feed Notes', { exact: true }) })
    .filter({ has: page.getByLabel('Medication Notes', { exact: true }) })
}

/** Same shape as saveAndSettle, scoped to the notes form's own Save. A wait, not an assertion. */
async function saveNotesAndSettle(page: Page) {
  await notesForm(page).getByRole('button', { name: 'Save', exact: true }).click()
  await notesForm(page).getByText(SAVED_TEXT, { exact: true }).waitFor()
}

test('feed_notes_persist_on_reload @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await page.getByLabel('Feed Notes', { exact: true }).fill(FEED_NOTES)
  await saveNotesAndSettle(page)
  await page.reload()

  await expect(page.getByLabel('Feed Notes', { exact: true })).toHaveValue(FEED_NOTES)
})

test('medication_notes_persist_on_reload @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await page.getByLabel('Medication Notes', { exact: true }).fill(MEDICATION_NOTES)
  await saveNotesAndSettle(page)
  await page.reload()

  await expect(page.getByLabel('Medication Notes', { exact: true })).toHaveValue(MEDICATION_NOTES)
})

// The failure this guards is a clear that silently does nothing, which would leave FEED_NOTES
// still in the field after the reload — so the UI-level read is the whole check, and no
// direct column read is needed to distinguish it.
test('clearing_feed_notes_leaves_the_field_empty_on_reload @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await clear(page.getByLabel('Feed Notes', { exact: true }))
  await saveNotesAndSettle(page)
  await page.reload()

  await expect(page.getByLabel('Feed Notes', { exact: true })).toHaveValue('')
})

// #1390 — the manager's notes save must go through update_horse_notes, which until this issue
// admitted the owning member alone. Apple has no owner, so a manager who was not admitted by the
// new auth_is_barn_manager branch would get 'not_authorized' and no confirmation at all. The
// three tests above would then fail on the value; this one names the reason.
test('a_manager_saving_notes_on_an_unowned_horse_is_not_rejected @manager', async ({ page }) => {
  await page.goto(horseHref(appleId))
  await page.getByLabel('Feed Notes', { exact: true }).fill(FEED_NOTES)
  await saveNotesAndSettle(page)

  await expect(notesForm(page).getByRole('alert')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// #1277 — a second save in one page session
// ---------------------------------------------------------------------------

// Last in the chain: it renames Apple again, and nothing below reads the name. The second save
// deliberately retypes nothing — `fill`ing between the saves would overwrite a reverted field and
// mask what this watches for, which is the form quietly holding the page-load name after save one
// and writing it back on save two.
//
// Read this as a forward guard, not as #1277's proof. It passes both with and against #1277's fix
// on a local dev server: React 19's post-action form reset resolves after revalidatePath's refresh
// has landed there, so even the pre-fix uncontrolled field reverts to the *new* name. #1277's
// discriminating coverage is the unit test, where the `horse` prop is frozen and the race is lost
// by construction. What this test is still worth is the case where that ordering changes — a
// framework upgrade, or a server slow enough to lose the race the way #759 once did.
test('a_second_save_keeps_the_first_saves_name @manager', async ({ page }) => {
  await gotoHorseSettings(page, appleId)
  await page.getByLabel('Barn Name', { exact: true }).fill(APPLE_RENAMED_TWICE)
  await saveAndSettle(page)
  // SavedIndicator self-hides after 2s. Waiting it out is what stops the second saveAndSettle
  // from settling instantly on the first save's still-visible confirmation.
  await savedIndicator(page).waitFor({ state: 'detached' })
  await saveAndSettle(page)
  await page.reload()
  await openSection(page, 'Horse Settings')

  await expect(page.getByRole('heading', { level: 1 })).toHaveText(APPLE_RENAMED_TWICE)
})
