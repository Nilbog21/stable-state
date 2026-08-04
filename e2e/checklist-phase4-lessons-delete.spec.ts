// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/lessons.ts
// covers: src/app/barn/[slug]/(protected)/finances/**
// covers: src/components/ExhaustionBar.tsx
//
// `ExhaustionBar` is declared because `waitForEditFormHydrated` below gates the two edit-and-save
// tests on `getByRole('button', { name: /^Exhaustion: / })`, and that accessible name is that
// component's own `aria-label` (`ExhaustionBar.tsx:57`). `src/components/**` is **not** in
// select-specs.sh's ALWAYS_FULL — only `src/components/ui/**` is — so without this line a PR that
// reworded that label would not select this spec, and both tests would break with no signal at
// review time. Exactly the hole `--lint` cannot see: it catches a malformed glob, never a missing
// one. (`checklist-phase4-lessons-detail.spec.ts` uses the same helper and omits it — that is a gap
// in the sibling, not a licence.)
//
// `src/app/actions/lesson-cancellation.ts` is deliberately NOT declared. Every cancelled-lesson
// state in this file is planted by the `cancelLesson` fixture — a service-role table write — and
// no test here ever clicks a Cancel control or loads `/lessons/[id]/cancel`. Declaring it would be
// a *false* declaration rather than a merely missing one, which makes the selector run a spec that
// cannot detect the change. `src/lib/**` and `src/components/ui/**` are in select-specs.sh's
// ALWAYS_FULL list, so the DAL, `Badge` and `Card` need no declaration of their own.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import {
  addHorse,
  addNotification,
  addPaidLesson,
  addTier,
  addUnpaidLesson,
  cancelLesson,
  daysFromNow,
} from './support/fixtures'
import { settledTextContents } from './support/read'
import { mustSucceed } from '@/lib/db/service-role'

// ---------------------------------------------------------------------------
// Seed inputs
// ---------------------------------------------------------------------------

const APPLE = 'Apple'
const STANDARD_TIER = 'Standard'

// The tier's own price, deliberately not any lesson's fee below: a fee that happened to equal the
// tier default could have been produced by a lesson nothing ever touched.
const TIER_PRICE = 80

/**
 * `addTier` defaults `instructorCut` to 25, and that default is load-bearing here rather than
 * incidental — it is what makes the By Tier table's **Gross** and **Net** columns differ.
 *
 * The two Finances checks below read a single cell out of a four-column table, and #1195's
 * column-ambiguity finding is that a correct index proves nothing when two columns render the same
 * string. With a non-zero cut, an off-by-one column read of the `Deleted Lesson` row yields
 * `fee - 25` where the assertion expects `fee`, and an off-by-one read of the footer's Total row
 * yields a different delta again. A zero cut would have made Gross and Net numerically identical
 * and the reads mutually indistinguishable.
 */
const INSTRUCTOR_CUT = 25

/**
 * One distinct three-digit fee per lesson. None is zero, none equals TIER_PRICE, and no value is a
 * substring of another (all three digits, all distinct), which matters because the Outstanding
 * table is reached by filtering rows on the rendered fee and Playwright's text matching is
 * substring-based (#1202).
 *
 * **Every one of them being non-zero is a correctness requirement, not tidiness.** The detail
 * page's delete fork is `lesson.fee === 0 || lesson.payment_type !== null` — a *disjunction*. A
 * "paid" lesson seeded at `fee: 0` reaches the `/delete` link arm through the first term, with the
 * payment state contributing nothing, so lines 330-335 would all have been satisfiable by a page
 * that ignored `payment_type` entirely. That is the fourth vacuity shape in a control-flow form:
 * not a value coinciding with a default, but a *condition satisfied by an unrelated disjunct* —
 * and no mutation of any expectation could surface it, because every expectation would be right.
 * Keeping every fee non-zero is what makes `payment_type` the only live term.
 */
const FEES = {
  notesTextarea: 341,
  noNotesTextarea: 342,
  notesEdit: 343,
  notesClear: 344,
  deleteFromList: 345,
  deleteFromFinances: 346,
  deleteNoBadge: 347,
  deleteNoNotification: 348,
  cancelledDeletable: 349,
  promptControl: 350,
  paidInspect: 351,
  paidUnchecked: 352,
  paidIncomeKept: 353,
  paidIncomeGone: 354,
  survivor: 355,
  cancelledControl: 356,
} as const

type LessonKey = keyof typeof FEES

/**
 * The notes the four Edit-form lessons are cancelled with, and the string line 323 types over one
 * of them. Both are non-empty and different from each other, which is what makes the round-trip
 * discriminating: `LessonForm`'s textarea is `defaultValue={initialLesson.cancellation_notes ?? ''}`,
 * so a form that ignored the stored value renders `''`, and a save that ignored the submitted value
 * leaves SEEDED_NOTES on the detail page. Either failure shows up as a mismatch rather than as a
 * coincidence.
 */
const SEEDED_NOTES = 'Ring closed for resurfacing.'
const EDITED_NOTES = 'Rescheduled to Thursday afternoon.'

// The app's own strings, quoted rather than imported: an expected value derived from the code under
// test agrees with any bug in it.
const DELETE_CONFIRM =
  'Permanently delete this lesson? This cannot be undone, and unlike Cancel, no cancellation record, fee, or notification is created.'
const CANCELLED_BADGE = 'Cancelled'
const CANCELLATION_NOTES_LABEL = 'Cancellation Notes'
const INSTRUCTOR_LABEL = 'Instructor'

/**
 * Line 328's positive control, and its **type** is the whole design.
 *
 * `upsertNotification` keys on `(user_id, barn_id, type)`. A control sharing a type that an errant
 * delete might write — `lesson_cancelled`, say — would be *overwritten* rather than added, so the
 * row count would not move and the check would pass through the very bug it exists to catch.
 * `incomplete_profile` is unrelated to anything a lesson delete could plausibly emit, and the
 * assertion compares `type:title` pairs rather than a count, so even an overwrite of this row is
 * visible.
 */
const CONTROL_NOTIFICATION_TYPE = 'incomplete_profile' as const
const CONTROL_NOTIFICATION_TITLE = 'Control notification — must survive a lesson delete'
const CONTROL_NOTIFICATION_FINGERPRINT = `${CONTROL_NOTIFICATION_TYPE}:${CONTROL_NOTIFICATION_TITLE}`

// Filled in by the seed.
const ids: Record<LessonKey, string> = {} as Record<LessonKey, string>
let appleId: string
let instructorUserId: string
let riderUserId: string

/**
 * An instant safely in the past, for every lesson that has to appear under **Outstanding Income**.
 *
 * `getOutstandingLessonRows` filters on `lesson_at < now`, so "past" is the load-bearing property
 * here and the calendar month is irrelevant (Outstanding is all-time). `pastInstantInMonth(0)`
 * guarantees the month instead and only *almost* guarantees the past — its own docstring records
 * that it clamps to the month start inside the first hour of a month, and a clamped instant is not
 * strictly in the past. So the two groups of lessons below choose deliberately different helpers,
 * each taking the guarantee it actually needs:
 *
 *   - **unpaid delete targets** use this, because they are asserted through Outstanding;
 *   - **paid lessons** use `monthsAgo: 0`, because they are asserted through the Finances *month*
 *     view and the month is the property that has to hold.
 *
 * Two hours also keeps every one of them inside the Lessons list's 7-day recent window
 * (`lessons/page.tsx:102-105`), so no test has to open the older-lessons toggle.
 *
 * `new Date(ms)` is zone-free arithmetic on an instant; the eslint date fence bans the host's
 * calendar getters and the multi-argument constructor, neither of which appears here.
 */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000)
}

/**
 * Sixteen lessons, one page state each, and **no `describe.serial` anywhere**.
 *
 * Eleven of them exist purely so that every test drives a lesson of its own. Nine of these fifteen
 * checks delete something, and deletion is one-way, so sharing a lesson would force a serial chain
 * — which is exactly where this batch's two worst mutation blind spots live: `describe.serial`
 * skips every test after the first failure, so only one test per chain can be falsified per
 * mutation pass, and a failing test restarts the Playwright worker, which re-runs `beforeAll` and
 * re-seeds the barn underneath any mutation whose expected value happens to match the seed. Eleven
 * extra rows is cheap next to either.
 *
 * Two of the sixteen are never deleted at all. `survivor` is the same-document positive control for
 * every "it disappeared" claim — from the Lessons list and from Outstanding Income — and
 * `cancelledControl` is what *cancelled* looks like, which is the only way line 327's "it's gone,
 * not cancelled" has two arms to compare.
 */
const barn = withBarn('phase4-lessons-delete', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, {
    name: STANDARD_TIER,
    price: TIER_PRICE,
    instructorCut: INSTRUCTOR_CUT,
  })
  const apple = await addHorse(supabase, barn.id, APPLE)
  appleId = apple.id

  // Both are the long-lived logins rather than managed stubs, because line 328 asserts that no
  // notification reaches the instructor *or the riders* — and a managed stub has no `user_id` for
  // a notification to be addressed to, which would make that check vacuous by construction.
  const instructorId = members.trainer.membershipId
  const riderId = members.rider.membershipId
  instructorUserId = members.trainer.userId!
  riderUserId = members.rider.userId!

  const seedUnpaid = async (key: LessonKey, at: Date) => {
    const lesson = await addUnpaidLesson(supabase, barn, {
      at,
      tierName: tier.name,
      horseIds: [apple.id],
      riderIds: [riderId],
      instructorId,
      fee: FEES[key],
    })
    ids[key] = lesson.id
  }

  const seedPaid = async (key: LessonKey) => {
    const lesson = await addPaidLesson(supabase, barn, {
      monthsAgo: 0,
      tierName: tier.name,
      horseIds: [apple.id],
      riderIds: [riderId],
      instructorId,
      fee: FEES[key],
    })
    ids[key] = lesson.id
  }

  // The Edit-form thread (321-324). Future-dated so nothing about them depends on the past-lesson
  // machinery the delete thread needs.
  const future = daysFromNow(3, barn.timezone)
  for (const key of ['notesTextarea', 'noNotesTextarea', 'notesEdit', 'notesClear'] as const) {
    await seedUnpaid(key, future)
  }

  // Three of the four are already cancelled, which is the fixture line 321's textarea is gated on
  // (`LessonForm.tsx:696`). `noNotesTextarea` is deliberately left active — it is line 322, and it
  // is also the *only* thing that catches a form which rendered the textarea unconditionally.
  for (const key of ['notesTextarea', 'notesEdit', 'notesClear'] as const) {
    await cancelLesson(supabase, barn, { lessonId: ids[key], notes: SEEDED_NOTES, isLate: true })
  }

  // `cancelLesson` writes the note to `lesson_riders.cancellation_notes` as well as to the lesson,
  // and the detail page renders the per-rider copy under its own "Cancellation Notes" heading
  // (`[id]/page.tsx:44-49`). Cleared here so the *only* element carrying that label on these pages
  // is the lesson-level `<dt>` — which is what lets line 324 assert the honest, whole-page reading
  // of "the row disappears entirely" rather than a `<dt>`-scoped near-miss of it.
  mustSucceed(
    await supabase
      .from('lesson_riders')
      .update({ cancellation_notes: null })
      .eq('barn_id', barn.id)
      .in('lesson_id', [ids.notesTextarea, ids.notesEdit, ids.notesClear]),
    'clear seeded per-rider cancellation notes',
  )

  // The browser-prompt delete thread (325-329) plus its two controls. Unpaid and in the past, so
  // each has fee > 0 and payment_type null — the only combination that reaches DeleteLessonButton.
  for (const key of [
    'deleteFromList',
    'deleteFromFinances',
    'deleteNoBadge',
    'deleteNoNotification',
    'cancelledDeletable',
    'promptControl',
    'survivor',
    'cancelledControl',
  ] as const) {
    await seedUnpaid(key, hoursAgo(2))
  }

  // `isLate: true` on both, and it is the entire fixture for line 329.
  //
  // A *non*-late cancellation zeroes `lessons.fee`, and a zero fee takes the delete fork's first
  // disjunct straight to the `/delete` page — so a conventionally-cancelled lesson could not
  // exercise the browser-prompt arm at all. `sync_rider_cancellation_fee` deletes a late-cancelled
  // normal lesson's `lesson_fee` transaction and replaces it with a `rider_cancellation_fee` row,
  // which `get_lesson_payment_info` (keyed on `kind = 'lesson_fee'`) cannot see, so `payment_type`
  // stays null while the fee survives. Cancelled, fee > 0, unpaid: the prompt arm.
  for (const key of ['cancelledDeletable', 'cancelledControl'] as const) {
    await cancelLesson(supabase, barn, { lessonId: ids[key], isLate: true })
  }

  // The /delete-page thread (330-335). Paid, so `payment_type !== null` is the live term of the
  // fork; `monthsAgo: 0` puts their income in the Finances month the last two checks read.
  for (const key of ['paidInspect', 'paidUnchecked', 'paidIncomeKept', 'paidIncomeGone'] as const) {
    await seedPaid(key)
  }

  await addNotification(supabase, {
    userId: instructorUserId,
    barnId: barn.id,
    type: CONTROL_NOTIFICATION_TYPE,
    title: CONTROL_NOTIFICATION_TITLE,
  })
})

// ---------------------------------------------------------------------------
// Paths, locators and service-role reads
// ---------------------------------------------------------------------------

function detailPath(key: LessonKey): string {
  return `/barn/${barn.slug}/lessons/${ids[key]}`
}

function editPath(key: LessonKey): string {
  return `${detailPath(key)}/edit`
}

function deletePath(key: LessonKey): string {
  return `${detailPath(key)}/delete`
}

/** A lesson card in one of the Lessons list's `<ul>`s, addressed by the lesson it points at. */
function listCard(page: Page, key: LessonKey): Locator {
  return page.locator(`main ul a[href$="/lessons/${ids[key]}"]`)
}

/** The `<dd>` of a detail-page `<dt>`/`<dd>` pair, addressed by the label above it. */
function detailField(page: Page, label: string): Locator {
  return page.locator(`main dl dt:text-is("${label}") + dd`)
}

/**
 * Every element on the detail page whose whole text is a given label — not just the `<dl>` rows.
 *
 * Line 324 says the Cancellation Notes row disappears "entirely from the detail page", and a
 * `<dt>`-scoped locator would answer a narrower question than the line asks. The seed clears the
 * per-rider copies precisely so this whole-page form is the one that can be asserted.
 */
function labelsOnDetailPage(page: Page, label: string): Locator {
  return page.locator('main').getByText(label, { exact: true })
}

/** The edit form's cancellation-notes textarea, addressed by the id its `<label>` points at. */
function cancellationNotesTextarea(page: Page): Locator {
  return page.locator('main textarea#cancellation_notes')
}

/**
 * A horse-notes textarea from the same Notes section.
 *
 * This is line 322's positive control and it has to live in the same rendered document as the
 * absence it guards: `LessonForm` renders the whole Notes block or none of it (`initialNotes &&`),
 * so an edit page that failed to render — or a `main` that stopped resolving — reads zero here and
 * fails, instead of reporting a clean absence of the cancellation textarea.
 */
function horseNotesTextarea(page: Page): Locator {
  return page.locator(`main textarea[name="horse_notes_${appleId}"]`)
}

/**
 * The Outstanding Income table on `/finances`, scoped by the section heading rather than by
 * position: the page renders a second `<section>` for Outstanding *Expenses* and a breakdown table
 * below both, so `main table` alone is ambiguous.
 */
function outstandingTable(page: Page): Locator {
  return page.locator('main section').filter({ hasText: 'Outstanding Income' }).locator('table')
}

/**
 * One Outstanding row, addressed by the rendered fee.
 *
 * The rendered form of `formatFee` is written out rather than imported for the usual reason, and
 * the interpolation is over this file's own `FEES` constant, not over anything the app returned.
 * Fees are three digits and mutually non-substring, so no row's fee cell is a prefix of another's
 * and the date/name cells cannot contain the string either.
 */
function outstandingRow(page: Page, key: LessonKey): Locator {
  return outstandingTable(page)
    .locator('tbody tr')
    .filter({ hasText: `$${FEES[key]}.00` })
}

/** `$1,234.56` → 1234.56, `($25.00)` → -25, `—` → 0. */
function parseMoney(text: string): number {
  const trimmed = text.trim()
  if (!/\d/.test(trimmed)) return 0
  const magnitude = Number(trimmed.replace(/[^0-9.]/g, ''))
  return trimmed.startsWith('(') ? -magnitude : magnitude
}

/** Deltas of two 2-dp decimals, without the float noise a bare subtraction can leave behind. */
function round2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * The two numbers lines 334 and 335 compare, read off the By Tier tab.
 *
 * `Deleted Lesson` is the tier label `getLessonFeeRows` gives a collected transaction whose lesson
 * was deleted (its `lesson_id` is nulled by an `ON DELETE SET NULL` FK rather than removed), so it
 * is the only surface on which "this lesson's income survived its lesson" is visible at all — the
 * orphaned row has no lesson identity left to address it by.
 *
 * Both numbers are read **before and after** each delete and asserted as *deltas*. The bucket is
 * barn-wide and more than one test in this file leaves an orphan in it, so an absolute expectation
 * would couple these two checks to whichever ran first; a delta taken inside one test is true
 * whatever its siblings did. Each of the two assertions keeps a **non-zero half**, so a locator
 * that resolved to nothing reads `0/0` and fails rather than agreeing.
 *
 * The Total row's Gross cell is `td:nth-child(2)` of the last `<tfoot>` row (`ReconciliationFoot`
 * emits Subtotal / Unattributed / Outside this view / Total, and `labelColSpan` is 1 here). Reading
 * the total row through `settledTextContents` first is also the guard for the tbody read below:
 * both come from one server render, so a resolved footer means the rows exist too, and a
 * one-shot `count()` on an unrendered table can no longer report a false zero (#1243).
 */
async function readTierFinances(page: Page): Promise<{ totalGross: number; deletedLessonGross: number }> {
  await page.goto(`/barn/${barn.slug}/finances?tab=tier`)
  const totalCells = await settledTextContents(page.locator('main table tfoot tr').last().locator('td'))
  const deletedRow = page.locator('main table tbody tr:has(td:text-is("Deleted Lesson"))')
  const deletedCells = (await deletedRow.count()) === 0 ? null : await deletedRow.locator('td').allTextContents()
  return {
    totalGross: parseMoney(totalCells[1]),
    deletedLessonGross: deletedCells === null ? 0 : parseMoney(deletedCells[1]),
  }
}

/** How many `lessons` rows still exist for a seeded lesson — 0 after a delete, 1 after a cancel. */
async function lessonRowCount(key: LessonKey): Promise<number> {
  const { supabase, barn: seeded } = barn.data
  const rows = mustSucceed<{ id: string }[]>(
    await supabase.from('lessons').select('id').eq('barn_id', seeded.id).eq('id', ids[key]),
    'count lesson rows',
  )
  return rows.length
}

/**
 * Every notification addressed to this barn's instructor or rider, as sorted `type:title` strings.
 *
 * `type:title` rather than a bare count, because `upsertNotification` keys on
 * `(user_id, barn_id, type)`: a write that collided with the control's key would replace it in
 * place and leave any count-based check reading exactly what it read before.
 */
async function notificationFingerprints(): Promise<string[]> {
  const { supabase, barn: seeded } = barn.data
  const rows = mustSucceed<{ type: string; title: string }[]>(
    await supabase
      .from('notifications')
      .select('type, title')
      .eq('barn_id', seeded.id)
      .in('user_id', [instructorUserId, riderUserId]),
    'read notifications for the instructor and riders',
  )
  return rows.map((row) => `${row.type}:${row.title}`).sort()
}

/**
 * Blocks until the edit form has hydrated. Lifted from
 * `checklist-phase4-lessons-detail.spec.ts`, whose docstring works out why this particular signal
 * is the right one: an ExhaustionBar cannot exist before LessonForm's effects have run, because it
 * is rendered only once `exhaustionData` has arrived, and that state is set by an effect whose
 * input is itself produced by DateHourPicker's mount effect via a server-action round trip. So a
 * visible bar strictly post-dates hydration rather than merely correlating with it.
 *
 * The two tests that only *read* the edit form (321, 322) deliberately skip this: their claims are
 * about server-rendered markup, and waiting for hydration to assert a server-rendered absence would
 * be the SSR-default confusion running the other way.
 */
async function waitForEditFormHydrated(page: Page) {
  await page.getByRole('button', { name: /^Exhaustion: / }).first().waitFor()
}

/**
 * Keyboard activation rather than a pointer `.click()`. LessonForm's submit sits at the bottom of a
 * long scrollable form — the shape #501 (04c64505) diagnosed, where Chromium's scroll-into-view
 * animation races Playwright's actionability check. `checklist-timezone.spec.ts` and
 * `checklist-phase4-lessons-detail.spec.ts` both drive *this same component's* submit this way, and
 * in `edit` mode the form is longer still.
 */
async function saveLessonForm(page: Page) {
  // `exact: true` and scoped to `main`, unlike the merged sibling this helper is otherwise copied
  // from: `getByRole`'s name match is a case-insensitive **substring** by default, so a bare 'Save'
  // would also match any future 'Save and close'/'Save draft' control. Latent rather than live
  // today — no other button on the edit page contains 'Save' — and that is exactly when it is cheap
  // to close.
  const save = page.locator('main').getByRole('button', { name: 'Save', exact: true })
  await save.focus()
  await save.press('Enter')
}

/** The detail header's Delete control on the browser-prompt arm — a submit button, not a link. */
function deleteButton(page: Page): Locator {
  return page.locator('main').getByRole('button', { name: 'Delete', exact: true })
}

/** The detail header's Delete control on the paid arm — a link to `/delete`, not a button. */
function deleteLink(page: Page): Locator {
  return page.locator('main').getByRole('link', { name: 'Delete', exact: true })
}

/**
 * Delete a lesson through the browser-prompt arm, accepting the confirm, and land on the Lessons
 * list. Returns every dialog message raised, so a caller can pin *how many* confirms were shown as
 * well as what they said — a delete cannot pass by way of a dialog nobody looked at.
 */
async function deleteViaPrompt(page: Page, key: LessonKey): Promise<string[]> {
  const messages: string[] = []
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message())
    await dialog.accept()
  })
  await page.goto(detailPath(key))
  await deleteButton(page).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
  return messages
}

/**
 * Delete a lesson through the `/delete` confirmation page.
 *
 * The checkbox is a plain uncontrolled `<input type="checkbox" name="alsoDeleteTransactions">` with
 * no React state behind it, so `.check()` needs no hydration — unlike the prompt arm, whose confirm
 * lives in an `onClick`.
 */
async function deleteViaConfirmationPage(
  page: Page,
  key: LessonKey,
  opts: { alsoDeleteCollected: boolean },
) {
  await page.goto(deletePath(key))
  if (opts.alsoDeleteCollected) await page.locator('main form input[type="checkbox"]').check()
  await page.getByRole('button', { name: 'Confirm Delete', exact: true }).click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })
}

// ---------------------------------------------------------------------------
// The Cancellation Notes textarea on the edit form (321-324)
//
// Lines 321 and 322 are one claim in two halves and neither is sufficient alone. 321 on its own is
// satisfied by a form that rendered the textarea unconditionally — the fixture it is really about
// is `cancelled_at`, and nothing in 321 discriminates on it. 322 is what catches that form. Said
// out loud because a reader arriving at 321 has no way to see that its discriminating power lives
// in its neighbour.
// ---------------------------------------------------------------------------

test('edit_lesson_on_a_cancelled_lesson_shows_a_cancellation_notes_textarea @manager', async ({ page }) => {
  await page.goto(editPath('notesTextarea'))
  await horseNotesTextarea(page).waitFor()

  expect({
    cancellationNotesTextareas: await cancellationNotesTextarea(page).count(),
    horseNotesTextareas: await horseNotesTextarea(page).count(),
  }).toEqual({ cancellationNotesTextareas: 1, horseNotesTextareas: 1 })
})

// Same object shape as the check above with the first value flipped, which is what makes the pair
// legible as one claim. The horse-notes count is the same-document positive control: the Notes
// section renders whole or not at all, so a page that failed to render reads 0/0 and fails rather
// than reporting a satisfying absence.
test('edit_lesson_on_a_non_cancelled_lesson_shows_no_cancellation_notes_textarea @manager', async ({ page }) => {
  await page.goto(editPath('noNotesTextarea'))
  await horseNotesTextarea(page).waitFor()

  expect({
    cancellationNotesTextareas: await cancellationNotesTextarea(page).count(),
    horseNotesTextareas: await horseNotesTextarea(page).count(),
  }).toEqual({ cancellationNotesTextareas: 0, horseNotesTextareas: 1 })
})

// EDITED_NOTES differs from the seeded SEEDED_NOTES and both are non-empty, so this fails in both
// directions it could be wrong: a save that dropped the submitted value leaves SEEDED_NOTES on the
// page, and a form that ignored the stored value would have started from '' and still have to
// carry EDITED_NOTES here. Neither failure can pass as a coincidence.
test('saving_edited_cancellation_notes_shows_them_read_only_on_the_detail_page @manager', async ({ page }) => {
  await page.goto(editPath('notesEdit'))
  await waitForEditFormHydrated(page)
  await cancellationNotesTextarea(page).fill(EDITED_NOTES)
  await saveLessonForm(page)
  await page.waitForURL(new RegExp(`/lessons/${ids.notesEdit}$`), { waitUntil: 'commit' })

  expect((await settledTextContents(detailField(page, CANCELLATION_NOTES_LABEL)))[0].trim()).toBe(EDITED_NOTES)
})

// Measured across the save rather than asserted after it. `before: 1` is what proves the row was
// there to disappear, and it is also why an unhydrated fill cannot pass this quietly: the compound
// case the batch flagged — an *absence* claim reached *through* an interaction — needs both the
// before-state and a positive control, and `instructorLabelsAfter` supplies the second from the
// same rendered document.
test('clearing_cancellation_notes_and_saving_removes_the_row_from_the_detail_page @manager', async ({ page }) => {
  await page.goto(detailPath('notesClear'))
  await page.locator('main dl').waitFor()
  const before = await labelsOnDetailPage(page, CANCELLATION_NOTES_LABEL).count()

  await page.goto(editPath('notesClear'))
  await waitForEditFormHydrated(page)
  await cancellationNotesTextarea(page).fill('')
  await saveLessonForm(page)
  await page.waitForURL(new RegExp(`/lessons/${ids.notesClear}$`), { waitUntil: 'commit' })
  await page.locator('main dl').waitFor()

  expect({
    before,
    after: await labelsOnDetailPage(page, CANCELLATION_NOTES_LABEL).count(),
    instructorLabelsAfter: await labelsOnDetailPage(page, INSTRUCTOR_LABEL).count(),
  }).toEqual({ before: 1, after: 0, instructorLabelsAfter: 1 })
})

// ---------------------------------------------------------------------------
// Deleting an unpaid lesson through the browser prompt (325-329)
// ---------------------------------------------------------------------------

// `survivor` is seeded never to be deleted and is read here in the same rendered list as the
// absence: a Lessons list that rendered nothing at all would report `deleted: 0` on its own.
test('deleting_an_unpaid_lesson_via_the_browser_prompt_removes_it_from_the_lessons_list @manager', async ({ page }) => {
  const messages = await deleteViaPrompt(page, 'deleteFromList')
  await listCard(page, 'survivor').waitFor()

  expect({
    messages,
    deleted: await listCard(page, 'deleteFromList').count(),
    survivor: await listCard(page, 'survivor').count(),
  }).toEqual({ messages: [DELETE_CONFIRM], deleted: 0, survivor: 1 })
})

// Read before and after the delete, in the same table both times. `survivorBefore`/`survivorAfter`
// are the positive control — an Outstanding section that stopped rendering would take the target's
// row and the control's row down together, which the `1 → 1` half rejects.
test('deleting_an_unpaid_lesson_removes_it_from_outstanding_income_in_finances @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/finances`)
  await outstandingTable(page).locator('tbody tr').first().waitFor()
  const targetBefore = await outstandingRow(page, 'deleteFromFinances').count()
  const survivorBefore = await outstandingRow(page, 'survivor').count()

  await deleteViaPrompt(page, 'deleteFromFinances')

  await page.goto(`/barn/${barn.slug}/finances`)
  await outstandingTable(page).locator('tbody tr').first().waitFor()

  expect({
    targetBefore,
    targetAfter: await outstandingRow(page, 'deleteFromFinances').count(),
    survivorBefore,
    survivorAfter: await outstandingRow(page, 'survivor').count(),
  }).toEqual({ targetBefore: 1, targetAfter: 0, survivorBefore: 1, survivorAfter: 1 })
})

// "It's gone, not cancelled" is the one claim in this file that no DOM read can settle on its own:
// the deleted lesson has no card, and neither would a lesson that was never seeded. The direct
// `lessons` read is what separates the two outcomes — a delete removes the row, a cancel leaves it
// with `cancelled_at` set — and `cancelledControl` supplies the contrasting arm in both surfaces at
// once: a row that survives, a card that renders, and the Cancelled badge that a cancelled lesson
// is supposed to carry.
test('a_deleted_lesson_leaves_no_cancelled_badge_behind @manager', async ({ page }) => {
  await deleteViaPrompt(page, 'deleteNoBadge')
  await listCard(page, 'cancelledControl').waitFor()

  expect({
    deletedRowsInDb: await lessonRowCount('deleteNoBadge'),
    deletedCards: await listCard(page, 'deleteNoBadge').count(),
    cancelledRowsInDb: await lessonRowCount('cancelledControl'),
    cancelledCards: await listCard(page, 'cancelledControl').count(),
    cancelledBadges: await listCard(page, 'cancelledControl').getByText(CANCELLED_BADGE, { exact: true }).count(),
  }).toEqual({
    deletedRowsInDb: 0,
    deletedCards: 0,
    cancelledRowsInDb: 1,
    cancelledCards: 1,
    cancelledBadges: 1,
  })
})

// Asserted against the `notifications` table by service-role read, per the issue's own acceptance
// criterion — the absence of a UI badge would also be produced by a notification the badge simply
// failed to render. `lessonRowsAfter: 0` is what proves the delete actually happened, so a zero
// notification delta cannot come from a delete that silently no-opped.
test('deleting_a_lesson_sends_no_notification_to_its_instructor_or_riders @manager', async ({ page }) => {
  const before = await notificationFingerprints()

  await deleteViaPrompt(page, 'deleteNoNotification')

  expect({
    before,
    after: await notificationFingerprints(),
    lessonRowsAfter: await lessonRowCount('deleteNoNotification'),
  }).toEqual({
    before: [CONTROL_NOTIFICATION_FINGERPRINT],
    after: [CONTROL_NOTIFICATION_FINGERPRINT],
    lessonRowsAfter: 0,
  })
})

// The dialog is *dismissed*, not accepted, so the lesson survives — and `lessonRowsAfter: 1` is
// what turns that into a claim about the prompt being a real gate rather than decoration.
//
// **`click()` returning is itself the synchronisation point, and nothing further is needed.** A
// `window.confirm` blocks the page until it is answered, so the click cannot complete until the
// handler below has run; `messages` is therefore already populated when the await resolves. Do not
// "fix" this by adding a poll.
//
// The first version of this test used `page.waitForEvent('dialog')` awaited *after* the click, and
// it **deadlocked** — `waitForEvent` registers a listener, which suppresses Playwright's automatic
// dismissal, but it does not itself dismiss anything, so the click waited on a dialog that was
// waiting on the click. An `on('dialog')` handler installed *before* the click is the idiom that
// works, and it is the one the merged `checklist-phase4-lessons-detail.spec.ts` already uses.
test('delete_raises_the_same_browser_prompt_on_an_already_cancelled_lesson @manager', async ({ page }) => {
  const messages: string[] = []
  page.on('dialog', async (dialog) => {
    messages.push(dialog.message())
    await dialog.dismiss()
  })

  await page.goto(detailPath('cancelledDeletable'))
  await deleteButton(page).click()

  expect({
    messages,
    lessonRowsAfter: await lessonRowCount('cancelledDeletable'),
  }).toEqual({ messages: [DELETE_CONFIRM], lessonRowsAfter: 1 })
})

// ---------------------------------------------------------------------------
// Deleting a paid lesson through the confirmation page (330-335)
// ---------------------------------------------------------------------------

// Both arms run under one dialog listener, in one test, on purpose. The claim is that the paid
// lesson raises *no* browser prompt, and the listener is the mechanism that would report one — so
// proving the listener live needs a real dialog, which no other document can supply. That is a
// same-*mechanism* positive control, a stricter standard than same-document, and it is why
// `promptControl` exists as a dedicated throwaway rather than being borrowed from another test:
// an unhydrated click on its Delete button would submit the form instead of raising the confirm,
// and this check must be free to fail loudly on that without taking a sibling's fixture with it.
//
// The URL and the heading are both required and neither replaces the other: 'commit' resolves
// before the new document renders, so a 404 at the right path would satisfy the URL half alone,
// and a heading check alone could not say *which* lesson's delete page it landed on.
test('delete_on_a_paid_lesson_opens_the_delete_page_instead_of_a_browser_prompt @manager', async ({ page }) => {
  const dialogs: string[] = []
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.message())
    await dialog.dismiss()
  })

  // No extra wait after the click: a `window.confirm` blocks until answered, so the click cannot
  // resolve until the handler above has recorded and dismissed it. See the note on the
  // already-cancelled check for what happens if you reach for `waitForEvent` here instead.
  await page.goto(detailPath('promptControl'))
  await deleteButton(page).click()
  const afterPromptArm = dialogs.length

  await page.goto(detailPath('paidInspect'))
  await deleteLink(page).click()
  await page.waitForURL(new RegExp(`/lessons/${ids.paidInspect}/delete$`), { waitUntil: 'commit' })
  await page.getByRole('heading', { name: 'Delete Lesson', exact: true }).waitFor()

  expect({
    promptArmDialogs: afterPromptArm,
    paidArmDialogs: dialogs.length - afterPromptArm,
    landedOn: new URL(page.url()).pathname,
  }).toEqual({
    promptArmDialogs: 1,
    paidArmDialogs: 0,
    landedOn: deletePath('paidInspect'),
  })
})

// Anchored at the start and terminated after "collected.", so the fee is pinned rather than merely
// contained — Playwright's text matching is substring-based (#1202).
//
// **The boundary comes from the literal `" fee"` that follows the amount, not from an end anchor.**
// A page rendering `$3510` produces "…$3510 fee…", which cannot satisfy `\$351 fee`; one rendering
// `$35` cannot satisfy `\$351` at all. That is why this deliberately stops at "collected." instead
// of anchoring the whole paragraph: the line claims the amount is shown and claims nothing about
// the "Deleting the lesson cannot be undone." sentence after it, so pinning that second sentence
// would fail this test on a legitimate reword of prose it is not about.
//
// The expected value interpolates this file's own `FEES` constant, never anything the page returned.
test('the_lesson_delete_page_shows_the_amount_already_collected @manager', async ({ page }) => {
  await page.goto(deletePath('paidInspect'))

  await expect(page.locator('main > p')).toHaveText(
    new RegExp(`^This lesson's \\$${FEES.paidInspect} fee has already been collected\\.`),
  )
})

// A claim about the component's own hardcoded default, and worth stating plainly so a later reader
// does not mistake it for a stronger one: `[id]/delete/page.tsx` renders a bare
// `<input type="checkbox">` with no `defaultChecked` and no stored value behind it, so there is no
// fixture to seed away from and the seed-equals-default diagnostic has nothing to bite on here.
// What the pair of counts does prove is that the form rendered and that its one checkbox is
// unchecked — an unrendered form reads 0/0 and fails.
test('the_lesson_delete_pages_collected_record_checkbox_is_unchecked_by_default @manager', async ({ page }) => {
  await page.goto(deletePath('paidInspect'))
  const checkboxes = page.locator('main form input[type="checkbox"]')
  await checkboxes.first().waitFor()

  expect({
    checkboxes: await checkboxes.count(),
    checked: await page.locator('main form input[type="checkbox"]:checked').count(),
  }).toEqual({ checkboxes: 1, checked: 0 })
})

test('confirming_the_lesson_delete_page_removes_the_lesson_from_the_lessons_list @manager', async ({ page }) => {
  await deleteViaConfirmationPage(page, 'paidUnchecked', { alsoDeleteCollected: false })
  await listCard(page, 'survivor').waitFor()

  expect({
    deleted: await listCard(page, 'paidUnchecked').count(),
    survivor: await listCard(page, 'survivor').count(),
  }).toEqual({ deleted: 0, survivor: 1 })
})

// The two deltas are complementary and the pair is what pins the column. `totalGrossDelta: 0` says
// the barn's collected income did not move; `deletedLessonGrossDelta: +fee` says the income is now
// carried by the orphaned-transaction row instead of by the lesson's tier. Reading the Net column
// by mistake would give `fee - INSTRUCTOR_CUT` for the second value, so the non-zero half
// discriminates the column as well as proving the read is live.
test('deleting_a_paid_lesson_without_the_checkbox_keeps_its_income_in_finances @manager', async ({ page }) => {
  const before = await readTierFinances(page)
  await deleteViaConfirmationPage(page, 'paidIncomeKept', { alsoDeleteCollected: false })
  const after = await readTierFinances(page)

  expect({
    totalGrossDelta: round2(after.totalGross - before.totalGross),
    deletedLessonGrossDelta: round2(after.deletedLessonGross - before.deletedLessonGross),
  }).toEqual({ totalGrossDelta: 0, deletedLessonGrossDelta: FEES.paidIncomeKept })
})

// The mirror image, and the one the checkbox is for: with the collected record deleted too, there
// is no orphan to carry the income and the barn-wide total drops by exactly this lesson's fee.
// `totalGrossDelta` is the non-zero half here, so this check cannot pass against a dead locator
// reading 0/0 either.
test('deleting_a_paid_lesson_with_the_checkbox_removes_its_income_from_finances @manager', async ({ page }) => {
  const before = await readTierFinances(page)
  await deleteViaConfirmationPage(page, 'paidIncomeGone', { alsoDeleteCollected: true })
  const after = await readTierFinances(page)

  expect({
    totalGrossDelta: round2(after.totalGross - before.totalGross),
    deletedLessonGrossDelta: round2(after.deletedLessonGross - before.deletedLessonGross),
  }).toEqual({ totalGrossDelta: -FEES.paidIncomeGone, deletedLessonGrossDelta: 0 })
})
