// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
//
// Phase 2's horse-seeding block (checklists/pre-release/phase-2-manager-seeding.md, from
// "Create horses **Daisy**, **Eclipse**, and **Flint**" through "Refresh the page → Dana's row
// in the Access table still shows **Owner**, not **Set as Owner**"): the three creates driven
// through the inline Add Horse form, Daisy taken Unavailable with a reason, and the first half
// of Eclipse's Access section — granting Dana, promoting her to owner, and #1069's
// auto-elevation of her Documents and lesson-access columns as a consequence of that promotion.
//
// The second `covers:` glob is not decoration: the Add Horse form is `NavigationBlocker`'s
// `GuardedForm`, so a change there breaks the first test in this file and nothing else in it.
// The grant/owner writes go through `horses/[id]/actions.ts`, which the first glob already
// names.
//
// **This file is what proves the app produces the state slice 3 (#1454) starts from.** #1454
// reseeds Dana-as-owner by calling `set_horse_owner` directly; here the promotion is driven
// through the Access table, which is the only UI-driven path to it in the suite. That is why
// the two `(#1069)` items below are not narrowed into a `member_horse_privileges` read: their
// whole claim is that the *page* shows the elevated values without the tester having tapped
// them.
//
// Adjacent prior art, not a duplicate of it: checklist-phase4-horses-detail.spec.ts owns the
// Horse Settings form's rename/threshold/registered-name round trips and the Access table's
// progressive-enhancement checks, against horses seeded by `addHorse`. Nothing there creates a
// horse through the UI, and nothing there promotes an owner. The one overlap is that both files
// open accordions, which is why each keeps its own local landing helpers.
//
// ## Two narrowed checklist lines, and why (#1453)
//
// Both are the issue's standing "narrowed, not dropped" ruling applied to lines whose claims are
// false against deliberate, documented behaviour — not `(manual)` downgrades.
//
// 1. "Horses page now shows Daisy under **Unavailable**" — she is not under Unavailable, she is
//    under **My Horses**. `addHorseAction` calls `createHorse(barn.id, name, membership.id)`
//    (#998), so the manager who adds a horse through the inline form becomes its owner, and
//    `horses/page.tsx` filters every owned horse out of Available/Unavailable and renders it
//    under My Horses instead. `20260725115546_set_horse_owner_requires_privilege_row.sql` states
//    the auto-assignment in as many words. `HorseCard`'s `owned` variant still renders the amber
//    **Unavailable** badge and the reason, so the item's point survives intact — only the
//    section name was wrong.
//
// 2. "an 'Owner: Dana Rider' line appears above the photo" — there is no literal `Owner:` prefix
//    anywhere in `src/`; #1390's identity header renders the owner's name alone as a link, or
//    the string "No owner set". The line also sits beside the photo (below it at mobile widths),
//    not above it. And because the creating manager already owns Eclipse, the line does not
//    *appear* — it **changes**, from the manager's name to Dana's. The rewritten line asserts
//    that change, which is **strictly stronger** than the appearance it replaces: an assertion
//    that a line appeared is satisfied by a page that always showed it, while one that it moved
//    from a named previous value is not.
//
// ## Why three checkboxes share one test (#1069)
//
// `promoting_a_granted_rider_to_owner_elevates_their_document_and_lesson_access` carries the
// "Tap **Set as Owner**" item and both `(#1069)` items. That is the issue's "genuinely one
// indivisible interaction" carve-out and it is forced, not convenient: there is exactly one
// `Set as Owner` tap available on Eclipse, and `set_horse_owner` elevates without ever
// un-elevating, so the pre-promotion `None`/`Cannot View` state is unobservable to any later
// test. Split across tests, the two auto-elevation items could only assert the post-state — and
// an elevation assertion with no pre-state passes just as well against a grant that was already
// elevated, which is the vacuous-check class this batch has already paid for.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Not an oversight. Rule 5 binds a `.update(`/`.delete(` in a seed callback whose zero-row result
// would go unnoticed; this file's `withBarn` takes **no seed callback at all**. Every row its
// assertions read — the three horses, Daisy's unavailability, Dana's grant, Dana's ownership —
// is produced by the tests themselves through the UI, which is the point of the slice. There is
// no fixture mutation here for the rule to bind.
//
// ## Why nothing here needs a positive anchor (#1434)
//
// Also not an oversight. Rule 4 binds absence assertions; this file makes none. Every claim is
// positive — a card renders, a badge reads Unavailable, a button carries `aria-pressed="true"`,
// an `href` resolves. The closest thing to an absence is the pre-promotion `None`/`Cannot View`
// state, and that is asserted as the *value the row shows*, not as the absence of another one,
// so there is no matcher here that could be satisfied on its first poll (fact 18).
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { settledInnerTexts, settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'
import { openSection, accordionSection } from './support/accordion'
import { E2E_USERS } from './support/fixtures'

// ---------------------------------------------------------------------------
// Seed inputs, and the labels the app answers with
// ---------------------------------------------------------------------------
//
// The three horse names are what this file types into the Add Horse form. No name contains
// another and none collides with a seeded member name — every Playwright text matcher is a
// substring match.

const DAISY = 'Daisy'
const ECLIPSE = 'Eclipse'
const FLINT = 'Flint'

/** Typed into the Reason textarea, and read back off both the form and the horse's card. */
const THROWN_SHOE = 'Thrown shoe'

/**
 * The checklist's "Dana" and the manager who walks the phase, rebuilt from the fixture rather
 * than spelled out — `resolveMemberNames` renders `first_name || ' ' || last_name` off the
 * profiles `e2e-auth-users.ts` fills from these same constants, so a literal here would be an
 * expectation comparing the app's answer to a copy of its own input.
 */
const DANA = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const CREATING_MANAGER = `${E2E_USERS.manager.firstName} ${E2E_USERS.manager.lastName}`

/**
 * The Access table's column order, as the indices this file addresses cells by.
 *
 * Named rather than inlined because two of the checklist items are *column* claims — "Dana's row
 * carries an **Owner** column showing **Set as Owner**", "**Write** selected in the
 * **Documents** column" — so which cell the value came out of is part of what is being asserted.
 * `accessColumns` reads the header row back in the same test that uses an index, which is what
 * keeps these numbers honest.
 */
const OWNER_COLUMN = 1
const DOCUMENTS_COLUMN = 2
const LESSON_COLUMN = 3
const ACCESS_COLUMNS = ['Member', 'Owner', 'Documents', 'Lesson Schedule', 'Actions']

/**
 * The wait budget for a write that has no navigation to synchronise on.
 *
 * Every control in the Access table is a `<form action={serverAction}>` that refreshes its row
 * through `revalidatePath` — the POST resolving and the DOM reflecting it are separate events
 * (fact 8), and there is no URL change to wait on. Web-first matchers run on expect's 5s
 * default, which is the third of fact 1's tiers and the one place a number *loosens* rather than
 * tightens. Applied to web-first matchers only, never to a `waitFor*` (fact 1 tier 1 — those are
 * unbounded, and a number there could only tighten them). Kept file-local on purpose (#1469).
 */
const SETTLE_AFTER_WRITE = 15_000

const barn = withBarn('phase2-horses-owner')

// ---------------------------------------------------------------------------
// The horses list
// ---------------------------------------------------------------------------

/** A horse's card, addressed by the name on it. Scoped to `main` — the nav carries a Horses link
 *  whose href would otherwise match the same attribute selector. */
function horseCard(page: Page, name: string): Locator {
  return page.locator('main a[href*="/horses/"]').filter({ hasText: name })
}

/** The same card, required to be inside a named list section. The section is the assertion's
 *  subject wherever this is used, so the locator resolving at all is half the claim. */
function horseCardIn(page: Page, heading: string, name: string): Locator {
  return page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
    .locator(`a[href*="/horses/"]`)
    .filter({ hasText: name })
}

/**
 * Add one horse through the inline form in the page header.
 *
 * The card appearing is the wait, not an assertion: `addHorseAction` is a `<form action={…}>`
 * with no redirect, so the only signal that the write landed is the revalidated list growing.
 * The input is uncontrolled and the form's action is the Server Function itself, so neither the
 * fill nor the click needs hydration to survive (fact 10) — `GuardedForm`'s only client
 * behaviour is the dirty flag it sets on change and clears on submit.
 */
async function addHorseThroughForm(page: Page, name: string) {
  await page.getByPlaceholder('Horse name').fill(name)
  await page.locator('main').getByRole('button', { name: 'Add', exact: true }).click()
  await expect(horseCard(page, name)).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })
}

/** Reach a horse's detail page the way a manager does — from its card in the list. */
async function openHorse(page: Page, name: string) {
  await page.goto(`/barn/${barn.slug}/horses`)
  await horseCard(page, name).click()
  await page.waitForURL(/\/horses\/[0-9a-f-]{36}$/, { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// The horse detail page
// ---------------------------------------------------------------------------

/**
 * The identity header's text lines, in DOM order — registered name, unavailability reason, and
 * the owner line, which always renders (as the owner's name, or as "No owner set").
 *
 * Asserted as the whole list rather than as an index into it, the way
 * checklist-phase56-horses-media.spec.ts reads the same header: a line that vanished, moved, or
 * arrived unexpectedly fails, where a single-line read would not.
 */
function headerLines(page: Page): Locator {
  return page.locator('main header p')
}

/** The owner line's link. Absent entirely when the horse has no owner, which is what makes this
 *  a real locator rather than a text match on a line that always exists. */
function ownerLink(page: Page): Locator {
  return headerLines(page).getByRole('link')
}

/** Horse Settings, open and hydrated. Both halves are load-bearing: the section is a collapsed
 *  `<details>` on every fresh render (`support/accordion.ts`), and the status pills are
 *  `<button type="button" onClick>` — the one shape a pre-hydration click is silently lost on
 *  (fact 10). */
async function openHorseSettings(page: Page) {
  await waitForBarnPageHydrated(page)
  await openSection(page, 'Horse Settings')
}

function statusPill(page: Page, label: string): Locator {
  return accordionSection(page, 'Horse Settings').getByRole('button', { name: label, exact: true })
}

/** Whichever status pill is currently pressed. `aria-pressed` rather than the fill colour, which
 *  is the same reasoning `HorseAccessSection` states for its own Documents buttons. */
function pressedStatus(page: Page): Locator {
  return accordionSection(page, 'Horse Settings').locator('button[aria-pressed="true"]')
}

/**
 * Save the Horse Settings form and wait for the write to land.
 *
 * A wait, never the assertion: `SavedIndicator` renders only when the action returned no error,
 * so it is the one available success signal — the same reasoning
 * checklist-phase4-horses-detail.spec.ts's `saveAndSettle` gives, and reloading without it races
 * the Server Action.
 */
async function saveHorseSettings(page: Page) {
  const form = accordionSection(page, 'Horse Settings').locator('form')
  await form.getByRole('button', { name: 'Save', exact: true }).click()
  await form.getByText('✓ Saved', { exact: true }).waitFor()
}

// ---------------------------------------------------------------------------
// The Access table
// ---------------------------------------------------------------------------

/** Every read below opens the section first — `getByRole` resolves against the accessibility
 *  tree, and a closed `<details>` is `display:none`, where it returns zero matches (fact 16). */
async function openAccess(page: Page, horseName: string) {
  await openHorse(page, horseName)
  await openSection(page, 'Access')
}

function accessSection(page: Page): Locator {
  return accordionSection(page, 'Access')
}

/** The header row, read in the same test as any cell index, so `OWNER_COLUMN` and friends are
 *  checked against the table rather than assumed about it. */
function accessColumns(page: Page): Locator {
  return accessSection(page).locator('thead th')
}

function grantRow(page: Page, name: string): Locator {
  return accessSection(page)
    .locator('tbody tr')
    .filter({ has: page.getByRole('cell', { name, exact: true }) })
}

/** The member names the grants list currently holds. */
function grantedMembers(page: Page): Locator {
  return accessSection(page).locator('tbody tr td:first-child')
}

/**
 * One row's three togglable states, as one object.
 *
 * Read together and asserted as a single value because the promotion item is a conjunction —
 * one tap, three consequences — and splitting it would let two pass while the third silently
 * described a different row. The Documents state is "which button is pressed" rather than a
 * cell text, since all three labels render in that cell at all times and only `aria-pressed`
 * tells them apart.
 */
async function rowState(row: Locator) {
  return {
    owner: await settledInnerTexts(row.locator('td').nth(OWNER_COLUMN)),
    documents: await settledInnerTexts(
      row.locator('td').nth(DOCUMENTS_COLUMN).locator('button[aria-pressed="true"]')
    ),
    lesson: await settledInnerTexts(row.locator('td').nth(LESSON_COLUMN)),
  }
}

// ---------------------------------------------------------------------------
// "Create horses **Daisy**, **Eclipse**, and **Flint**" through "…still shows **Owner**"
// ---------------------------------------------------------------------------
//
// Serial, and ordered: every test below reads state an earlier one produced through the UI, which
// is what makes this slice the proof that the app *reaches* the state #1454 reseeds. Under
// `fullyParallel: false` declaration order is run order, and a failure anywhere restarts the
// worker and re-seeds an empty barn (fact 15) — so the first ✘ here is the finding and every
// test below it is running against a barn with no horses in it at all.

test.describe.serial('Horses — creation, unavailability, and the Access table', () => {
  test('adding_three_horses_through_the_inline_form_lists_all_three @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/horses`)
    await addHorseThroughForm(page, DAISY)
    await addHorseThroughForm(page, ECLIPSE)
    await addHorseThroughForm(page, FLINT)

    // Counted rather than merely found, and read through `settledInnerTexts` so an unrendered
    // list fails here instead of answering `[]` (rule 3). Exactly one card per name is the
    // claim: a form that submitted twice would satisfy a presence check and fail this.
    const cards = await settledInnerTexts(page.locator('main a[href*="/horses/"]'))
    expect({
      daisy: cards.filter((text) => text.includes(DAISY)).length,
      eclipse: cards.filter((text) => text.includes(ECLIPSE)).length,
      flint: cards.filter((text) => text.includes(FLINT)).length,
    }).toEqual({ daisy: 1, eclipse: 1, flint: 1 })
  })

  test('marking_a_horse_unavailable_with_a_reason_stores_both @manager', async ({ page }) => {
    await openHorse(page, DAISY)
    await openHorseSettings(page)
    await statusPill(page, 'Unavailable').click()
    await page.locator('#horse-reason').fill(THROWN_SHOE)
    await saveHorseSettings(page)

    // Read back off the reloaded form rather than off the flash: landing on "✓ Saved" only says
    // the action returned without an error. The reload is what says both fields persisted — and
    // the Reason textarea is rendered at all only while the status is `unavailable`, so its
    // value carries the status claim a second time.
    await page.reload()
    await openSection(page, 'Horse Settings')
    expect({
      status: await settledInnerTexts(pressedStatus(page)),
      reason: await page.locator('#horse-reason').inputValue(),
    }).toEqual({ status: ['Unavailable'], reason: THROWN_SHOE })
  })

  // Narrowed — see divergence 1 in the header. The section is **My Horses**, not Unavailable,
  // because the manager who added her through the form owns her; the badge and the reason are
  // what the item is actually about, and both render on the owned card.
  test('the_horses_list_shows_an_unavailable_horse_with_its_reason @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/horses`)

    // One settled read of the card's own text, then three independent claims about it, so a run
    // that lost only the reason names which of the three went missing rather than failing on an
    // opaque string comparison. The locator is section-scoped, which is how "under My Horses"
    // is asserted rather than merely narrated.
    const card = (await settledInnerTexts(horseCardIn(page, 'My Horses', DAISY)))[0]
    expect({
      name: card.includes(DAISY),
      badge: card.includes('Unavailable'),
      reason: card.includes(THROWN_SHOE),
    }).toEqual({ name: true, badge: true, reason: true })
  })

  test('granting_a_rider_access_adds_them_to_the_grants_list @manager', async ({ page }) => {
    await openAccess(page, ECLIPSE)

    // Selected by the option's own value — the membership id — rather than by its label. The
    // value is what the form submits and what `grantHorsePrivilege` writes, so this is a
    // DOM-relational choice derived from the fixture rather than a name typed twice. The row
    // that comes back is asserted by *name*, which is the half a value-based selection cannot
    // fake.
    await accessSection(page)
      .getByLabel('Select member', { exact: true })
      .selectOption(barn.data.members.rider.membershipId)
    await accessSection(page).getByRole('button', { name: 'Grant Access', exact: true }).click()

    // The whole grants list, not just Dana's presence: before this tap the table did not exist
    // (the section renders an EmptyState at zero grants), so exactly-one-row is the claim.
    await expect(grantedMembers(page)).toHaveText([DANA], { timeout: SETTLE_AFTER_WRITE })
  })

  test('a_granted_riders_row_offers_set_as_owner @manager', async ({ page }) => {
    await openAccess(page, ECLIPSE)

    // The header row travels with the cell read, which is what makes this a claim about the
    // **Owner column** rather than about "some cell in Dana's row". A table that reordered its
    // columns fails here rather than reading `Set as Owner` out of whatever now sits at index 1.
    expect({
      // `settledTextContents`, not `settledInnerTexts`: `Th` uppercases its label in CSS, so
      // innerText reads "MEMBER" where the source says "Member" — the exact case read.ts's
      // module comment names. Measured, not reasoned: this file's first run failed here.
      columns: await settledTextContents(accessColumns(page)),
      ownerCell: await settledInnerTexts(grantRow(page, DANA).locator('td').nth(OWNER_COLUMN)),
    }).toEqual({ columns: ACCESS_COLUMNS, ownerCell: ['Set as Owner'] })
  })

  /**
   * Three checkboxes, one test — the issue's "genuinely one indivisible interaction" carve-out,
   * and forced rather than convenient. See the header's `(#1069)` block: the pre-promotion state
   * is unobservable after the single tap that this test exists to make, so the two auto-elevation
   * items can only be asserted here, alongside the tap's own visible effect.
   *
   * The `before` half is what makes them non-vacuous: without it, `Write`/`Can View` would pass
   * just as readily against a grant that had been elevated by hand, and the item's operative
   * phrase is "without tapping it directly".
   */
  test('promoting_a_granted_rider_to_owner_elevates_their_document_and_lesson_access @manager', async ({
    page,
  }) => {
    await openAccess(page, ECLIPSE)
    const row = grantRow(page, DANA)
    const before = await rowState(row)

    await row.getByRole('button', { name: 'Set as Owner', exact: true }).click()
    // A wait, not the assertion: the table refreshes through the action's own `revalidatePath`
    // with no navigation to wait on, and all three columns re-render together, so the Owner
    // button settling is the signal that the other two are readable (fact 8).
    await expect(row.getByRole('button', { name: 'Owner', exact: true })).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })

    expect({ before, after: await rowState(row) }).toEqual({
      before: { owner: ['Set as Owner'], documents: ['None'], lesson: ['Cannot View'] },
      after: { owner: ['Owner'], documents: ['Write'], lesson: ['Can View'] },
    })
  })

  // Narrowed — see divergence 2 in the header. The assertion is the *change*, which is what
  // makes it stronger than the "a line appears" it replaces, and Flint is what supplies the
  // control: he was added through the same form by the same manager and never promoted, so his
  // owner line still names her. Read together, the pair says the line tracks ownership rather
  // than rendering a constant — an assertion on Eclipse alone would pass against a header that
  // named Dana on every horse in the barn.
  //
  // Each side is the header's whole line list, so a second line arriving, or the owner line
  // collapsing to "No owner set", fails rather than passing on a substring.
  test('the_identity_header_owner_line_names_the_new_owner @manager', async ({ page }) => {
    await openHorse(page, ECLIPSE)
    const promoted = await settledInnerTexts(headerLines(page))
    await openHorse(page, FLINT)
    const untouched = await settledInnerTexts(headerLines(page))

    expect({ promoted, untouched }).toEqual({
      promoted: [DANA],
      untouched: [CREATING_MANAGER],
    })
  })

  test('the_identity_header_owner_line_links_to_the_owners_member_detail_page @manager', async ({
    page,
  }) => {
    await openHorse(page, ECLIPSE)

    // Derived from the seeded membership id rather than hardcoded, per the issue: the link's
    // whole claim is that it resolves to *Dana's* member detail page, and a literal path could
    // only restate the route pattern.
    await expect(ownerLink(page)).toHaveAttribute(
      'href',
      `/barn/${barn.slug}/members/${barn.data.members.rider.membershipId}`
    )
  })

  test('the_owner_button_still_reads_owner_after_a_reload @manager', async ({ page }) => {
    await openAccess(page, ECLIPSE)

    // Durability, not redraw: this is a fresh navigation from the horses list in a fresh test,
    // so the value comes off a new server render rather than off the DOM the promotion left
    // behind. `Owner` and `Set as Owner` are the two states of one button, so reading the cell
    // whole — rather than asserting the presence of one label — is what distinguishes them.
    expect(await settledInnerTexts(grantRow(page, DANA).locator('td').nth(OWNER_COLUMN))).toEqual([
      'Owner',
    ])
  })
})
