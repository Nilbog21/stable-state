// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/NavigationBlocker.tsx
// covers: src/app/barn/[slug]/(protected)/DesktopNavLinks.tsx
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addTier, addUnpaidLesson, daysFromNow } from './support/fixtures'
import { settledTextContents } from './support/read'
import { mustSucceed } from '@/lib/db/service-role'

// Seed inputs the assertions read back by name. Horse names are inputs to addHorse rather than
// values it returns, so naming them here is what keeps the banner and checkbox locators below
// free of loose string literals.
const APPLE = 'Apple'
const BUTTERCUP = 'Buttercup'
const WILLOW = 'Willow'
const STANDARD_TIER = 'Standard'
const SEEDED_FEE = 80

// Notes planted directly on the junction rows (addUnpaidLesson takes none), read back verbatim
// by the read-only checks.
const SEEDED_HORSE_NOTE = 'Stiff on the left rein today.'
const SEEDED_RIDER_NOTE = 'Working on two-point position.'
const SEEDED_PRIVATE_NOTE = 'Invoice runs a month behind.'

// The edit round-trip's three fields. Deliberately not built through the page's own `$${fee}`
// expression: an expected value derived from the code under test agrees with any bug in it.
const ROUND_TRIP_FEE = 95
const ROUND_TRIP_FEE_DISPLAY = '$95'
const ROUND_TRIP_HORSE_NOTE = 'Round-trip horse note.'
const ROUND_TRIP_RIDER_NOTE = 'Round-trip rider note.'

// The three message strings the app puts in front of the user, quoted rather than imported for
// the same reason the fee displays are.
const HORSE_ISSUE_PROMPT = 'This lesson has an unresolved horse issue. Leave without addressing it?'
const DOWNGRADE_WARNING =
  'Switching to Normal will remove extra riders and horses. Select one rider and one horse to keep.'
const DELETE_CONFIRM =
  'Permanently delete this lesson? This cannot be undone, and unlike Cancel, no cancellation record, fee, or notification is created.'

// Every label the detail page can put above a note. The no-notes check asserts all five are
// absent; three of them are present on the noted lesson, which is that check's positive control.
const NOTE_LABELS = ['Horse Notes', 'Rider Notes', 'Private', 'Your Notes', 'Cancellation Notes']

// Filled in by the seed.
let appleId: string
let riderMembershipId: string
let flaggedId: string
let notedId: string
let bareId: string
let roundTripId: string
let groupId: string
let deletableId: string

// Six lessons, all in the future, so all six sit inside the Lessons list's 7-day recent window
// and the delete check can count them without touching the older-lessons toggle. One lesson per
// page state this slice needs — sharing one lesson across the banner, notes and round-trip
// checks would make each of them depend on the order the others ran in.
const barn = withBarn('phase4-lessons-detail', async ({ supabase, barn, members }) => {
  riderMembershipId = members.rider.membershipId

  const standard = await addTier(supabase, barn.id, { name: STANDARD_TIER, price: SEEDED_FEE, isDefault: true })
  const apple = await addHorse(supabase, barn.id, APPLE)
  const buttercup = await addHorse(supabase, barn.id, BUTTERCUP)
  const willow = await addHorse(supabase, barn.id, WILLOW)
  appleId = apple.id

  const defaults = {
    fee: standard.price,
    tierName: standard.name,
    instructorId: members.manager.membershipId,
    riderIds: [members.rider.membershipId],
  }

  deletableId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(1, barn.timezone),
    time: '08:00',
    horseIds: [apple.id],
  })).id

  // Two horses and two riders, so the downgrade warning's "select one rider and one horse to
  // keep" is describing a real surplus rather than a no-op.
  groupId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(2, barn.timezone),
    time: '09:00',
    horseIds: [apple.id, buttercup.id],
    riderIds: [members.rider.membershipId, members.rider2.membershipId],
    lessonType: 'group',
  })).id

  flaggedId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(3, barn.timezone),
    time: '10:00',
    horseIds: [willow.id],
  })).id

  notedId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(4, barn.timezone),
    time: '11:00',
    horseIds: [apple.id],
  })).id

  bareId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(5, barn.timezone),
    time: '12:00',
    horseIds: [apple.id],
  })).id

  roundTripId = (await addUnpaidLesson(supabase, barn, {
    ...defaults,
    at: daysFromNow(6, barn.timezone),
    time: '13:00',
    horseIds: [apple.id],
  })).id

  // Notes are planted straight onto the junction rows rather than through a builder: no builder
  // takes them, and the ruling for this batch is to seed inline in the slice's own barn rather
  // than grow fixtures.ts. `rider_notes`/`private_notes` are excluded from lesson_riders' own
  // GRANT SELECT (#999) and reach the page only via get_lesson_rider_notes — irrelevant to a
  // service-role write, but it is why these can't be read back with a plain client either.
  mustSucceed(
    await supabase
      .from('lesson_horses')
      .update({ horse_notes: SEEDED_HORSE_NOTE })
      .eq('lesson_id', notedId)
      .eq('horse_id', apple.id)
      .select('id')
      .single(),
    'seed horse notes'
  )
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ rider_notes: SEEDED_RIDER_NOTE, private_notes: SEEDED_PRIVATE_NOTE })
      .eq('lesson_id', notedId)
      .eq('rider_id', members.rider.membershipId)
      .select('id')
      .single(),
    'seed rider notes'
  )

  // Willow goes inactive *after* her lesson exists — create_lesson_with_participants is the
  // wrong place to find out whether it screens inactive horses, and the checklist wants Willow
  // seeded inactive so the banner reads "Willow is inactive" (getHorseAttentionReasons keys the
  // wording off is_active, not is_available). Seeded here rather than inherited from any sibling
  // spec: each spec file owns its own barn.
  mustSucceed(
    await supabase.from('horses').update({ is_active: false }).eq('id', willow.id).select('id').single(),
    'mark Willow inactive'
  )
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function detailPath(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}`
}

function editPath(lessonId: string): string {
  return `/barn/${barn.slug}/lessons/${lessonId}/edit`
}

/**
 * The Needs Attention banner, addressed as main's *first child block* rather than by its text —
 * which is what makes "a banner at the top" an assertion rather than an assumption, and what
 * stops the check passing on a banner rendered halfway down the page. Both the detail page and
 * the edit page render HorseStatusBanner as the first <div> inside <main>, and both render it as
 * nothing at all when there are no reasons, so a missing banner resolves this locator to the
 * page's own content block and fails the text comparison rather than passing vacuously.
 */
function firstBlockInMain(page: Page): Locator {
  return page.locator('main > div').first()
}

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

/**
 * The paragraph a note label sits above. Relational rather than class-based, so it survives a
 * restyle, and it is the same shape for horse notes and rider notes.
 */
function labelledNote(page: Page, label: string): Locator {
  return page.locator(`main p:text-is("${label}") + p`)
}

/** Every note label currently on the page, whichever of the five it is. */
function noteLabels(page: Page): Locator {
  return page.locator('main').getByText(new RegExp(`^(${NOTE_LABELS.join('|')})$`))
}

/**
 * The nav bar's Horses link. Only DesktopNavLinks is rendered at the desktop widths the
 * @manager project uses (NavDrawer renders its own copies only while the drawer is open, and
 * the drawer's trigger is `md:hidden`), so this resolves to exactly one link.
 */
function horsesNavLink(page: Page): Locator {
  return page.locator('nav').getByRole('link', { name: 'Horses', exact: true })
}

/** A lesson card in one of the Lessons list's `<ul>`s, addressed by the lesson it points at. */
function listCard(page: Page, lessonId: string): Locator {
  return page.locator(`main ul a[href$="/lessons/${lessonId}"]`)
}

/** Every lesson card currently rendered on the Lessons list. */
function lessonCards(page: Page): Locator {
  return page.locator('main ul a[href*="/lessons/"]')
}

/**
 * Blocks until the edit form has hydrated, which every interaction below depends on and none of
 * them can prove on its own.
 *
 * The navigation guard is installed by a `useEffect` inside LessonForm (`setDirty(shouldWarn)`).
 * Until that effect has run, the nav bar's Horses entry is still an ordinary server-rendered
 * `<a>`: clicking it navigates straight through, no dialog is ever raised, and the check fails
 * for a reason that has nothing to do with the behaviour it is about — intermittently, under
 * whatever load the dev server happens to be carrying.
 *
 * An ExhaustionBar is the signal because it cannot exist before that effect has run: it is
 * rendered only once `exhaustionData` has arrived, and that state is set by a *second* effect
 * whose input (`lessonAt`) is itself only produced by DateHourPicker's mount effect, via a
 * server-action round trip. So a visible bar strictly post-dates hydration rather than merely
 * correlating with it. That ordering is the whole point of the wait — read as a bare "wait for
 * the page to settle" it looks like superstition and invites deletion.
 *
 * No explicit timeout: @playwright/test sets actionTimeout to 0, so waitFor is already unbounded
 * and any number written here could only tighten it (#1211).
 */
async function waitForEditFormHydrated(page: Page) {
  await page.getByRole('button', { name: /^Exhaustion: / }).first().waitFor()
}

// ---------------------------------------------------------------------------
// The unresolved-horse banner, and the navigation guard behind it
//
// These run in file order against one shared lesson, and the order matters in exactly one
// place: the swap check below is what removes Willow, so it has to come last. Everything before
// it re-navigates from scratch, so nothing else here depends on what ran before it — which is
// why this is not a describe.serial block. Serial would buy skip-on-first-failure at the cost
// of hiding every later failure behind the first one.
// ---------------------------------------------------------------------------

test('willows_flagged_lesson_detail_page_shows_the_inactive_horse_attention_banner @manager', async ({ page }) => {
  await page.goto(detailPath(flaggedId))
  await expect(firstBlockInMain(page)).toHaveText(new RegExp(`^Needs Attention\\s*${WILLOW} is inactive$`))
})

test('willows_flagged_lesson_edit_page_shows_the_same_attention_banner @manager', async ({ page }) => {
  await page.goto(editPath(flaggedId))
  await expect(firstBlockInMain(page)).toHaveText(new RegExp(`^Needs Attention\\s*${WILLOW} is inactive$`))
})

// No test for "The banner does not block editing or saving that lesson" — that line is
// `(manual)`, because the app currently contradicts it. Saving this lesson with Willow still
// assigned renders `horse not found in this barn` and never redirects:
// `lessons/[id]/edit/page.tsx` re-injects the lesson's inactive horses into the form as checked,
// enabled options, while `parseLessonFormData` validates every submitted `horse_id` against
// `getHorsesByBarn`, which filters `is_active = true`. Tagging it `(e2e: …)` would claim
// automated coverage of behaviour that does not exist; see the PR body and the filed follow-up.
// The save path itself is healthy — the swap check below performs the same Save successfully
// once the inactive horse is removed.

// Not page.on('dialog'): this confirm is the app's own NavigationConfirmDialog — a React
// `role="dialog"` with explicit Stay/Leave buttons — not window.confirm, so no browser dialog
// event is ever emitted for it. (The Delete confirm at the bottom of this file *is*
// window.confirm, and is driven that way.) What the issue asked for either way is that the
// check asserts on the dialog rather than only on the resulting navigation, which it does.
test('clicking_a_nav_link_on_the_flagged_edit_page_raises_the_unresolved_horse_dialog @manager', async ({ page }) => {
  await page.goto(editPath(flaggedId))
  await waitForEditFormHydrated(page)
  await horsesNavLink(page).click()
  await expect(page.getByRole('dialog').locator('p').first()).toHaveText(HORSE_ISSUE_PROMPT)
})

// Narrowed from "That dialog defaults to Stay": the dialog implements no focus or keyboard
// default at all — no autofocus, no Escape handler, no Enter handler — so the line as written
// names a behaviour that does not exist. What survives is the invariant the line was standing
// in for: Stay is the non-destructive choice, and taking it leaves you exactly where you were.
// Both halves in one toEqual, so a dialog that closed by navigating away can't pass on the
// count alone.
test('choosing_stay_dismisses_the_dialog_and_keeps_you_on_the_edit_page @manager', async ({ page }) => {
  await page.goto(editPath(flaggedId))
  await waitForEditFormHydrated(page)
  await horsesNavLink(page).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Stay', exact: true }).click()
  await expect
    .poll(async () => ({
      dialogs: await page.getByRole('dialog').count(),
      path: new URL(page.url()).pathname,
    }))
    .toEqual({ dialogs: 0, path: editPath(flaggedId) })
})

// Last of the flagged-lesson checks, because it is the one that resolves the horse issue.
// waitForURL is what proves the navigation was not blocked — a raised dialog leaves the URL on
// the edit page and this fails outright — and the dialog count is the assertion the issue asked
// for on top of it.
test('swapping_the_inactive_horse_for_an_active_one_stops_the_navigation_prompt @manager', async ({ page }) => {
  await page.goto(editPath(flaggedId))
  await waitForEditFormHydrated(page)
  await page.getByRole('checkbox', { name: `${WILLOW} (inactive)`, exact: true }).uncheck()
  await page.getByRole('checkbox', { name: APPLE, exact: true }).check()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(new RegExp(`/lessons/${flaggedId}$`), { waitUntil: 'commit' })
  // 'commit' resolves before the new document renders, so waitForURL alone is also satisfied by
  // a notFound() or a 500 at that same URL — and this one was selected *by* the id it waits for,
  // which makes it tautological on its own. The heading is the render proof.
  await page.getByRole('heading', { name: 'Lesson Detail' }).waitFor()

  await page.goto(editPath(flaggedId))
  await waitForEditFormHydrated(page)
  await horsesNavLink(page).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/horses$`), { waitUntil: 'commit' })
  // Same guard on the far side: without it an errored /horses would render no dialog either,
  // and toHaveCount(0) would pass on a page that never loaded.
  await page.getByRole('heading', { name: 'Horses', exact: true }).waitFor()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Notes on the detail page
// ---------------------------------------------------------------------------

// "Read-only" is a pair of facts and neither half means much alone: the note has to render, and
// it has to render as text. Asserting both in one toEqual is also what stops the check passing
// vacuously — a page that rendered no notes at all would report zero form controls too, and a
// bare `formControls: 0` would sail through. settledTextContents throws rather than returning []
// if the note never appears (#1243), so the count below is only ever taken on a rendered page.
test('horse_notes_render_read_only_on_the_lesson_detail_page @manager', async ({ page }) => {
  await page.goto(detailPath(notedId))
  const text = (await settledTextContents(labelledNote(page, 'Horse Notes')))[0]
  const formControls = await page.locator('main input:not([type="hidden"]), main textarea, main select').count()
  expect({ text, formControls }).toEqual({ text: SEEDED_HORSE_NOTE, formControls: 0 })
})

test('rider_notes_render_read_only_on_the_lesson_detail_page @manager', async ({ page }) => {
  await page.goto(detailPath(notedId))
  const text = (await settledTextContents(labelledNote(page, 'Rider Notes')))[0]
  const formControls = await page.locator('main input:not([type="hidden"]), main textarea, main select').count()
  expect({ text, formControls }).toEqual({ text: SEEDED_RIDER_NOTE, formControls: 0 })
})

test('the_edit_link_is_visible_on_the_lesson_detail_page @manager', async ({ page }) => {
  await page.goto(detailPath(notedId))
  await expect(page.locator('main').getByRole('link', { name: 'Edit', exact: true })).toBeVisible()
})

// A positive control rather than an argument: the same locator is pointed first at a lesson
// where three of the five labels genuinely render, and only then at the bare one. An absence
// check whose locator is simply wrong reports 0 on both pages and fails the first half, instead
// of reading as a clean pass. (Horse Notes, Rider Notes and Private are the three a manager sees
// on the noted lesson; Your Notes is rider-only and Cancellation Notes needs a cancellation, so
// neither can appear on either page — which is exactly the claim for the bare one.)
test('every_note_label_is_hidden_on_a_lesson_with_no_notes @manager', async ({ page }) => {
  await page.goto(detailPath(notedId))
  await noteLabels(page).first().waitFor()
  const onNotedLesson = await noteLabels(page).count()

  await page.goto(detailPath(bareId))
  await page.locator('main dl').waitFor()
  const onBareLesson = await noteLabels(page).count()

  expect({ onNotedLesson, onBareLesson }).toEqual({ onNotedLesson: 3, onBareLesson: 0 })
})

// ---------------------------------------------------------------------------
// The edit round-trip
// ---------------------------------------------------------------------------

// One test for four checklist lines — the save and its three read-backs — under the
// one-assertion-per-test exception the user ratified on #1200 for an indivisible round-trip
// (set N fields, save, reload, all N persist). Splitting it would make three of the four checks
// assert against state a *different* test had written, which is precisely the ordering
// dependency the rest of this file avoids. The four lines stay four lines and all name this test.
test('editing_a_lessons_fee_and_notes_persists_them_to_the_detail_page @manager', async ({ page }) => {
  await page.goto(editPath(roundTripId))
  await waitForEditFormHydrated(page)
  await page.getByLabel('Fee', { exact: true }).fill(String(ROUND_TRIP_FEE))
  await page.locator(`textarea[name="horse_notes_${appleId}"]`).fill(ROUND_TRIP_HORSE_NOTE)
  await page.locator(`textarea[name="rider_notes_${riderMembershipId}"]`).fill(ROUND_TRIP_RIDER_NOTE)
  await page.getByRole('button', { name: 'Save' }).click()
  await page.waitForURL(new RegExp(`/lessons/${roundTripId}$`), { waitUntil: 'commit' })

  expect({
    fee: (await settledTextContents(detailField(page, 'Fee')))[0].trim(),
    horseNotes: (await settledTextContents(labelledNote(page, 'Horse Notes')))[0],
    riderNotes: (await settledTextContents(labelledNote(page, 'Rider Notes')))[0],
  }).toEqual({
    fee: ROUND_TRIP_FEE_DISPLAY,
    horseNotes: ROUND_TRIP_HORSE_NOTE,
    riderNotes: ROUND_TRIP_RIDER_NOTE,
  })
})

// ---------------------------------------------------------------------------
// Group downgrade, and delete
// ---------------------------------------------------------------------------

// Cancelled without saving, per the checklist line: the form is left dirty and the test ends.
// The alert does not exist until the switch is made, so a locator that never resolves fails
// here rather than matching an empty string.
test('switching_a_group_lesson_to_normal_warns_before_dropping_extra_riders_and_horses @manager', async ({ page }) => {
  await page.goto(editPath(groupId))
  await waitForEditFormHydrated(page)
  await page.getByRole('button', { name: 'Normal', exact: true }).click()
  await expect(page.locator('main').getByRole('alert')).toHaveText(DOWNGRADE_WARNING)
})

// The one genuine window.confirm in this slice, so the one place page.on('dialog') applies. The
// message is collected into an array rather than a scalar so the assertion also pins *how many*
// confirms were raised, and so the delete cannot pass by way of a dialog nobody looked at.
// Deletion is asserted against the surviving card count as well as the removed one: a list that
// rendered nothing would report `deleted: 0` on its own.
// Runs last — it is the only check that changes how many lessons the barn has.
test('deleting_a_lesson_removes_it_from_the_lessons_list @manager', async ({ page }) => {
  const confirmMessages: string[] = []
  page.on('dialog', async (dialog) => {
    confirmMessages.push(dialog.message())
    await dialog.accept()
  })

  await page.goto(detailPath(deletableId))
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
  await lessonCards(page).first().waitFor()

  expect({
    confirmMessages,
    remaining: await lessonCards(page).count(),
    deleted: await listCard(page, deletableId).count(),
  }).toEqual({ confirmMessages: [DELETE_CONFIRM], remaining: 5, deleted: 0 })
})
