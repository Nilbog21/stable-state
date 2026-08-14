// covers: src/app/barn/[slug]/(protected)/horses/**
//
// The second half of Eclipse's Access section in Phase 2
// (checklists/pre-release/phase-2-manager-seeding.md, from "Grant access to rider Emery → Emery
// appears in the grants list" through "Emery is selectable again in the add-member dropdown"):
// a second rider granted with no privileges, the Documents and Lesson Schedule columns and their
// persistence, then the teardown half — un-owning Dana, revoking both riders, and the revoked
// rider becoming selectable again.
//
// One `covers:` glob is the whole blast radius: every control this file drives is a
// `<form action={…}>` in `horses/[id]/HorseAccessSection.tsx` bound to `horses/[id]/actions.ts`,
// and the identity header it reads is `horses/[id]/page.tsx`. The DAL and RPC underneath
// (`member-horse-privileges.ts`, `set_horse_owner`, `revoke_horse_privilege`) need no declaration
// — `src/lib/**` is in select-specs.sh's ALWAYS_FULL, so a change there selects every spec anyway.
// Nothing here touches the inline Add Horse form, so `NavigationBlocker` is not in scope the way
// it is for checklist-phase2-horses-owner.spec.ts.
//
// ## Where this slice starts, and why the seed calls an RPC
//
// It opens mid-chain, on the state checklist-phase2-horses-owner.spec.ts (#1453) proves the app
// *reaches*: Eclipse exists, owned by the manager who created it (#998's auto-assign in
// `createHorse`), with Dana granted through the Access table and then promoted to owner. That
// file drives the whole chain through the UI; this one reseeds its end state and carries on.
//
// The promotion is reseeded by calling **`set_horse_owner`** — the RPC `setHorseOwnerAction`
// itself calls — rather than by writing `member_horse_privileges` and `horses.owning_member_id`
// by hand. The two are not equivalent: that RPC sets the owner *and* elevates the grant to
// `write`/`lesson_read` in one statement, so a hand-written midpoint could put Eclipse in an
// owner/privilege combination the app never produces, and every "flips back to" assertion below
// would then be asserting a transition out of a state that cannot occur. Dana's grant row itself
// *is* inserted inline, and that is not the same shortcut: it is byte-for-byte what
// `grantHorsePrivilege` inserts (barn/horse/member, all three privilege columns left at their
// defaults), and it is a hard precondition of the RPC, which raises `privilege_grant_not_found`
// without it (20260725115546). Same seeding shape as checklist-phase4-horses-detail.spec.ts's
// Clover grant.
//
// ## Two narrowed checklist lines, and why
//
// Both are the issue's "narrowed, not dropped" ruling, and both are the *same* narrowing #1453
// made against this header — not `(manual)` downgrades.
//
// "Refresh the page → the 'Owner:' line above the photo is gone", and its twin after the revoke.
// There is no literal `Owner:` prefix anywhere in `src/`, the line sits beside the photo (below
// it at mobile widths) rather than above it, and it never goes anywhere: `page.tsx` renders the
// owner's name as a link *or* the string "No owner set", so the line is present either way. Both
// lines are rewritten to assert what actually distinguishes the two states — the line reads
// "No owner set" and carries no link.
//
// That is **strictly stronger** than what it replaces, not weaker. "The line is gone" is
// unverifiable against a line that always renders: any check phrased that way passes vacuously
// forever, whichever state the page is in. Pinning both the substitute text and the link's
// disappearance is falsifiable — a page that kept the owner fails on the text, and a page that
// rendered the name as plain text without clearing ownership fails on the link count.
//
// ## Why nothing here uses `mustAffect` (#1435)
//
// Not an oversight, and the reason is structural rather than local to this file. Rule 5 binds a
// `.update(`/`.delete(` in a seed callback whose zero-row result would go unnoticed. This
// callback contains neither: a builder call, one insert ending `.select('id').single()` — which
// PostgREST already fails with `PGRST116` on zero rows, the carve-out `support/must-affect.ts`'s
// own header names — and one `.rpc()`. And the RPC *cannot* take the guard: `mustAffect` reads
// `result.data`, while a `RETURNS void` function answers `data: null`, which it would count as
// zero rows and throw on every success.
//
// So the batch ruling that mid-chain state be reseeded through the RPC the UI calls is precisely
// what removes the `.update()` sites rule 5 exists to guard. The slice most likely to need the
// helper is, by construction, the one least able to use it. Recorded as a follow-up on #1454
// rather than fixed here: inventing a `mustAffectRpc` mid-slice would mean editing
// `e2e/support/**`, which is in ALWAYS_FULL and would take the fleet-wide suite mutex.
//
// **No read-back stands in for it either, because one is not needed.**
// `an_owner_button_taps_back_to_set_as_owner` reads Dana's Owner button *before* it taps it, so a
// seed that silently did nothing fails there, loudly, naming the state that was missing — the
// same guarantee `mustAffect` buys, obtained from the assertions instead of from the setup.
//
// ## Absence assertions and their anchors (#1434)
//
// Three tests make one. The two identity-header tests read `main header p` through
// `settledInnerTexts` first — a settled read waits for visibility and throws if the header never
// rendered — and only then assert the owner link's count is zero, both in one expect on the same
// page state. `revoking_a_grant_empties_the_grants_list` waits on the Access section's empty
// state, which renders only at zero grants, before counting rows. Nothing here reaches for
// `toHaveCount(0)` straight off a `goto`, which is fact 18's trap.
//
// The grants-list claims are not absences at all: each asserts the *whole* list by equality, so
// an unrendered table reads `[]` and fails rather than satisfying "Dana is not there".
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { settledInnerTexts, settledTextContents } from './support/read'
import { waitForBarnPageHydrated } from './support/hydration'
import { openSection, accordionSection } from './support/accordion'
import { addHorse, E2E_USERS, E2E_STUB_RIDER } from './support/fixtures'
import { mustSucceed } from '@/lib/db/service-role'

// ---------------------------------------------------------------------------
// Seed inputs, and the labels the app answers with
// ---------------------------------------------------------------------------

/** The one horse this slice needs — the checklist's Eclipse. */
const ECLIPSE = 'Eclipse'

/**
 * The checklist's "Dana" and "Emery", rebuilt from the fixture rather than spelled out.
 * `resolveMemberNames` renders `first_name || ' ' || last_name` off the very profiles these
 * constants seed, so a literal here would be an expectation comparing the app's answer to a copy
 * of its own input. Emery is the managed stub — a member with no login, which is all this slice
 * needs of him, since every tap below is the manager's.
 */
const DANA = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const EMERY = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`

/** What the identity header renders in place of the owner link when the horse has no owner. */
const NO_OWNER = 'No owner set'

/** The empty state the Access section renders instead of the table at zero grants. */
const NO_GRANTS = 'No additional members have been granted access'

/** `HorseAccessSection`'s Revoke confirmation, per member. Derived, for the same reason the two
 *  names above are. */
function revokeConfirm(name: string): string {
  return `Revoke ${name}'s access to this horse?`
}

/**
 * The Access table's column order, as the indices this file addresses cells by.
 *
 * `a_new_grants_document_access_starts_at_none` is what pins these to the table: it reads the
 * header row back alongside the cell, and it runs before every other indexed read in the serial
 * chain, so a table that reordered its columns fails there rather than silently feeding the wrong
 * cell to every test after it. That is also part of the item's own claim — "Emery's row shows
 * Documents set to **None**" is a statement about the *Documents column*, not about some cell in
 * Emery's row.
 */
const OWNER_COLUMN = 1
const DOCUMENTS_COLUMN = 2
const LESSON_COLUMN = 3
const ACCESS_COLUMNS = ['Member', 'Owner', 'Documents', 'Lesson Schedule', 'Actions']

/**
 * The wait budget for a write that has no navigation to synchronise on.
 *
 * Every control in the Access table is a `<form action={serverAction}>` refreshing its row
 * through `revalidatePath` — the POST resolving and the DOM reflecting it are separate events
 * (fact 8), with no URL change to wait on. Web-first matchers run on expect's 5s default, which
 * is the third of fact 1's tiers and the one place a number *loosens* rather than tightens.
 * Applied to web-first matchers only, never to a `waitFor*`. File-local on purpose (#1469).
 */
const SETTLE_AFTER_WRITE = 15_000

let eclipseId: string

const barn = withBarn('phase2-horses-access', async ({ supabase, barn, members }) => {
  // Owned by the manager at creation, which is what `addHorseAction` produces: it calls
  // `createHorse(barn.id, name, membership.id)` (#998), so the manager who adds a horse through
  // the inline form is its first owner. Seeding an ownerless Eclipse would skip a step the chain
  // this slice resumes actually took.
  const eclipse = await addHorse(supabase, barn.id, ECLIPSE, {
    owningMemberId: members.manager.membershipId,
  })
  eclipseId = eclipse.id

  // All three privilege columns left at their defaults, exactly as `grantHorsePrivilege`'s insert
  // leaves them — the elevation below is `set_horse_owner`'s to perform, and seeding it here
  // would erase the distinction the two `(#1069)` items in the previous slice exist to prove.
  mustSucceed(
    await supabase
      .from('member_horse_privileges')
      .insert({ barn_id: barn.id, horse_id: eclipse.id, member_id: members.rider.membershipId })
      .select('id')
      .single(),
    'grant Dana access to Eclipse'
  )

  // The promotion, through the RPC the Set as Owner button calls. See the header: this is the one
  // write that must not be hand-rolled, and it is self-guarding — it raises
  // `privilege_grant_not_found` if the insert above did not land.
  mustSucceed(
    await supabase.rpc('set_horse_owner', {
      p_horse_id: eclipse.id,
      p_barn_id: barn.id,
      p_member_id: members.rider.membershipId,
    }),
    'promote Dana to Eclipse’s owner'
  )
})

// ---------------------------------------------------------------------------
// The horse detail page
// ---------------------------------------------------------------------------

function horsePath(): string {
  return `/barn/${barn.slug}/horses/${eclipseId}`
}

/**
 * The identity header's text lines, in DOM order. Read as the whole list rather than as an index
 * into it — a line that vanished, moved, or arrived unexpectedly fails, where a single-line read
 * would not. Eclipse carries neither a registered name nor an unavailability reason, so the owner
 * line is the only one there is.
 */
function headerLines(page: Page): Locator {
  return page.locator('main header p')
}

/** The owner line's link. Absent entirely when the horse has no owner, which is what makes this a
 *  real locator rather than a text match on a line that always exists. */
function ownerLink(page: Page): Locator {
  return headerLines(page).getByRole('link')
}

// ---------------------------------------------------------------------------
// The Access table
// ---------------------------------------------------------------------------

/** Every read below opens the section first — `getByRole` and `getByLabel` resolve against the
 *  accessibility tree, and a closed `<details>` is `display:none`, where they return zero matches
 *  (fact 16). A fresh render re-shuts it, so this runs on every landing, not once. */
async function openAccess(page: Page) {
  await page.goto(horsePath())
  await openSection(page, 'Access')
}

/**
 * The same landing, hydrated.
 *
 * Only the two Revoke tests need it, and they need it for one control: Revoke is the single
 * button in this table carrying an `onClick`, because `window.confirm` has nowhere else to live.
 * Before hydration that handler does not exist, the form submits unconfirmed, and the prompt this
 * slice asserts on never fires (fact 10). Every other control here is a bare
 * `<form action={serverAction}>`, which the served markup carries on its own.
 */
async function openAccessHydrated(page: Page) {
  await page.goto(horsePath())
  await waitForBarnPageHydrated(page)
  await openSection(page, 'Access')
}

function accessSection(page: Page): Locator {
  return accordionSection(page, 'Access')
}

/** The header row, read in the same test as the first cell index, so `DOCUMENTS_COLUMN` and
 *  friends are checked against the table rather than assumed about it. */
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

/** Whichever of a row's three Documents buttons is pressed. All three labels render in that cell
 *  at all times, so only `aria-pressed` tells them apart — the same reason `HorseAccessSection`
 *  emits it rather than relying on the fill colour. */
function pressedDocumentState(row: Locator): Locator {
  return row.locator('td').nth(DOCUMENTS_COLUMN).locator('button[aria-pressed="true"]')
}

/** The Lesson Schedule cell. Read whole rather than as a presence check on one label: `Can View`
 *  and `Cannot View` are the two states of one button, and reading the cell is what distinguishes
 *  them. Same for the Owner cell below. */
function lessonCell(row: Locator): Locator {
  return row.locator('td').nth(LESSON_COLUMN)
}

function ownerCell(row: Locator): Locator {
  return row.locator('td').nth(OWNER_COLUMN)
}

function memberSelect(page: Page): Locator {
  return accessSection(page).getByLabel('Select member', { exact: true })
}

/**
 * The membership ids the add-member dropdown currently offers, sorted, with the placeholder's
 * empty value included.
 *
 * **Sorted, because the render order is genuinely undefined.** `page.tsx` concatenates
 * `getActiveMembersWithProfiles` per role, each ordered by `created_at` — and `addMemberships`
 * inserts all four seeded members in one statement, so the two riders share a timestamp to the
 * microsecond and tie. Asserting their order would be asserting a coin flip.
 *
 * **Not a settled read, and not `allTextContents`.** An `<option>` inside a collapsed `<select>`
 * can never become *visible*, so `support/read.ts`'s guard can only run out the budget on it
 * (fact 2) — its module comment names this exact case and blesses the `waitFor({ state:
 * 'attached' })` + `evaluateAll` shape used here, which keeps rule 3's guarantee: an unrendered
 * select fails on the wait rather than answering `[]`.
 *
 * Values rather than labels because the value is what the form submits and what
 * `grantHorsePrivilege` writes, so each one is derived from a builder return rather than typed
 * twice.
 */
async function grantDropdownValues(page: Page): Promise<string[]> {
  const options = memberSelect(page).locator('option')
  await options.first().waitFor({ state: 'attached' })
  const values = await options.evaluateAll((els) =>
    els.map((el) => (el as HTMLOptionElement).value)
  )
  return values.sort()
}

/** The dropdown's expected contents: the placeholder plus whichever members are ungranted. */
function dropdownOffering(...membershipIds: string[]): string[] {
  return ['', ...membershipIds].sort()
}

// ---------------------------------------------------------------------------
// "Grant access to rider Emery" through "Emery is selectable again in the add-member dropdown"
// ---------------------------------------------------------------------------
//
// Serial, and ordered: every test reads state an earlier one left behind, which is the shape the
// checklist itself is written in. Under `fullyParallel: false` declaration order is run order.
//
// `describe.serial` is what contains fact 15 here rather than merely surviving it: on a failure
// Playwright discards the worker and re-runs `beforeAll`, re-seeding a barn where Emery has no
// grant and Dana is still the owner — but a serial block mass-skips its remaining tests instead
// of running them against that barn. A failing run reads as one ✘ plus N "did not run", and the
// ✘ is the finding.

test.describe.serial('Eclipse — a second grant, its columns, and the revokes', () => {
  /**
   * The checkbox is the grants list; the dropdown halves are here because there is nowhere else
   * they can be. `a_revoked_member_is_offered_in_the_grant_dropdown_again` claims revoke
   * *released* the grant rather than merely hiding the row, and that claim is vacuous unless
   * Emery stopped being an option in between — which is only observable while the grant is live,
   * i.e. here. The issue asks for both halves on that line; this is the half that cannot wait
   * for it.
   */
  test('granting_a_second_rider_adds_them_to_the_grants_list @manager', async ({ page }) => {
    await openAccess(page)
    const members = barn.data.members
    const before = {
      grants: await settledInnerTexts(grantedMembers(page)),
      dropdown: await grantDropdownValues(page),
    }

    // Selected by the option's own value — the membership id — rather than by its label: the
    // value is what the form submits, so this is derived from the fixture rather than a name
    // typed twice. The row that comes back is asserted by *name*, which is the half a
    // value-based selection cannot fake.
    await memberSelect(page).selectOption(members.rider2.membershipId)
    await accessSection(page).getByRole('button', { name: 'Grant Access', exact: true }).click()
    // A wait, not the assertion: the table refreshes through the action's own `revalidatePath`
    // with no navigation to wait on (fact 8).
    await expect(grantedMembers(page)).toHaveCount(2, { timeout: SETTLE_AFTER_WRITE })

    expect({
      before,
      after: {
        grants: await settledInnerTexts(grantedMembers(page)),
        dropdown: await grantDropdownValues(page),
      },
    }).toEqual({
      before: {
        grants: [DANA],
        dropdown: dropdownOffering(
          members.manager.membershipId,
          members.trainer.membershipId,
          members.rider2.membershipId
        ),
      },
      after: {
        grants: [DANA, EMERY],
        dropdown: dropdownOffering(members.manager.membershipId, members.trainer.membershipId),
      },
    })
  })

  test('a_new_grants_document_access_starts_at_none @manager', async ({ page }) => {
    await openAccess(page)

    // The header row travels with the cell read — see ACCESS_COLUMNS. `settledTextContents`
    // rather than `settledInnerTexts`, because `Th` uppercases its label in CSS and innerText
    // would read "MEMBER" where the source says "Member".
    expect({
      columns: await settledTextContents(accessColumns(page)),
      documents: await settledInnerTexts(pressedDocumentState(grantRow(page, EMERY))),
    }).toEqual({ columns: ACCESS_COLUMNS, documents: ['None'] })
  })

  test('a_new_grants_lesson_access_starts_at_cannot_view @manager', async ({ page }) => {
    await openAccess(page)

    expect(await settledInnerTexts(lessonCell(grantRow(page, EMERY)))).toEqual(['Cannot View'])
  })

  test('tapping_cannot_view_flips_a_grant_to_can_view @manager', async ({ page }) => {
    await openAccess(page)
    const row = grantRow(page, EMERY)
    const before = await settledInnerTexts(lessonCell(row))

    await row.getByRole('button', { name: 'Cannot View', exact: true }).click()
    // The wait, again — and `exact: true` is load-bearing on both labels, since getByRole's
    // accessible-name match is a case-insensitive substring by default.
    await expect(row.getByRole('button', { name: 'Can View', exact: true })).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })

    // The before half is what makes this the *flip* the item claims rather than a reading of
    // whatever the row happened to hold.
    expect({ before, after: await settledInnerTexts(lessonCell(row)) }).toEqual({
      before: ['Cannot View'],
      after: ['Can View'],
    })
  })

  test('a_lesson_access_choice_survives_a_reload @manager', async ({ page }) => {
    await openAccess(page)

    // Durability, not redraw: a fresh navigation in a fresh test, so this value comes off a new
    // server render rather than off the DOM the tap above left behind.
    expect(await settledInnerTexts(lessonCell(grantRow(page, EMERY)))).toEqual(['Can View'])
  })

  test('an_owner_button_taps_back_to_set_as_owner @manager', async ({ page }) => {
    await openAccess(page)
    const row = grantRow(page, DANA)
    // Also the seed's own check: Dana reads `Owner` here only because `set_horse_owner` ran in
    // `withBarn`. A seed that silently did nothing fails on this line, naming the state that was
    // missing — see the header's `mustAffect` block.
    const before = await settledInnerTexts(ownerCell(row))

    await row.getByRole('button', { name: 'Owner', exact: true }).click()
    await expect(row.getByRole('button', { name: 'Set as Owner', exact: true })).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })

    expect({ before, after: await settledInnerTexts(ownerCell(row)) }).toEqual({
      before: ['Owner'],
      after: ['Set as Owner'],
    })
  })

  // Narrowed — see the header. The claim is the owner line's *contents*, because the line itself
  // never goes anywhere.
  test('clearing_the_owner_leaves_the_identity_header_reading_no_owner_set @manager', async ({
    page,
  }) => {
    await page.goto(horsePath())

    // The settled read is the positive anchor (#1434): it waits for the header to be visible and
    // throws if it never renders, so the count below cannot be taken against an undrawn page.
    // Both halves are asserted together, on the one page state.
    const lines = await settledInnerTexts(headerLines(page))
    expect({ lines, ownerLinks: await ownerLink(page).count() }).toEqual({
      lines: [NO_OWNER],
      ownerLinks: 0,
    })
  })

  test('revoking_the_owners_grant_removes_them_from_the_grants_list @manager', async ({ page }) => {
    // Installed before the click, never after: `window.confirm` blocks the page until it is
    // answered, so a `waitForEvent('dialog')` awaited after the click deadlocks — the click waits
    // on the dialog and the dialog waits on the click. checklist-phase4-lessons-delete.spec.ts
    // states the idiom and how it was measured. The click returning is itself the sync point, so
    // `messages` is populated by the time the await resolves; no poll is needed.
    const messages: string[] = []
    page.on('dialog', async (dialog) => {
      messages.push(dialog.message())
      await dialog.accept()
    })

    await openAccessHydrated(page)
    const row = grantRow(page, DANA)

    // Dana is made owner again first, exactly as the item says — which is what gives the next
    // test something to prove: without it, "the owner line is still gone" would be a restatement
    // of the tap two tests up rather than a claim about what revoking an owner does.
    await row.getByRole('button', { name: 'Set as Owner', exact: true }).click()
    await expect(row.getByRole('button', { name: 'Owner', exact: true })).toBeVisible({
      timeout: SETTLE_AFTER_WRITE,
    })

    await row.getByRole('button', { name: 'Revoke', exact: true }).click()
    await expect(grantedMembers(page)).toHaveCount(1, { timeout: SETTLE_AFTER_WRITE })

    // The message, not merely that *a* dialog appeared: it is what proves the confirm ran on
    // Dana's row rather than that something somewhere was dismissed. The list is asserted whole,
    // so "Dana no longer appears" is carried by an equality an empty table would fail.
    expect({ messages, grants: await settledInnerTexts(grantedMembers(page)) }).toEqual({
      messages: [revokeConfirm(DANA)],
      grants: [EMERY],
    })
  })

  // Narrowed, same as its twin above — and not a duplicate of it: the tap in the previous test
  // restored Dana as owner, so what this asserts is `revoke_horse_privilege`'s own second write,
  // which clears `horses.owning_member_id` when the revoked grant belonged to the owner.
  test('revoking_the_owners_grant_leaves_the_horse_with_no_owner @manager', async ({ page }) => {
    await page.goto(horsePath())

    const lines = await settledInnerTexts(headerLines(page))
    expect({ lines, ownerLinks: await ownerLink(page).count() }).toEqual({
      lines: [NO_OWNER],
      ownerLinks: 0,
    })
  })

  test('revoking_a_grant_empties_the_grants_list @manager', async ({ page }) => {
    const messages: string[] = []
    page.on('dialog', async (dialog) => {
      messages.push(dialog.message())
      await dialog.accept()
    })

    await openAccessHydrated(page)
    await grantRow(page, EMERY).getByRole('button', { name: 'Revoke', exact: true }).click()

    // The positive anchor, and the wait: this empty state renders only at zero grants, so it
    // cannot appear until the revoke has landed and the section has re-rendered without a table.
    // A `waitFor`, not an assertion, so the test keeps one expect.
    await accessSection(page).getByText(NO_GRANTS, { exact: true }).waitFor()

    expect({ messages, rows: await accessSection(page).locator('tbody tr').count() }).toEqual({
      messages: [revokeConfirm(EMERY)],
      rows: 0,
    })
  })

  test('a_revoked_member_is_offered_in_the_grant_dropdown_again @manager', async ({ page }) => {
    await openAccess(page)
    const members = barn.data.members

    // Every seeded member, because every grant is now revoked — asserted as the whole offering
    // rather than as Emery's presence in it, so a dropdown that started listing granted members
    // too would fail here as well. Paired with the first test's before/after, this is what says
    // revoke *released* the grant rather than hiding its row.
    expect(await grantDropdownValues(page)).toEqual(
      dropdownOffering(
        members.manager.membershipId,
        members.trainer.membershipId,
        members.rider.membershipId,
        members.rider2.membershipId
      )
    )
  })
})
