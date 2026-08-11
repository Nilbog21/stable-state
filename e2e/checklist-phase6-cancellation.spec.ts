// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/actions/lesson-cancellation.ts
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/components/calendar/**

import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addManagedMember, addUnpaidLesson, cancelLesson, daysFromNow, E2E_STUB_RIDER, E2E_USERS } from './support/fixtures'
import { settledInnerTexts, settledTextContents } from './support/read'
import {
  CANCELLED_BADGE,
  detailField,
  detailHeader,
  headerCancelLink,
  landOnDetail,
} from './support/lesson-pages'
import { goToDaysAhead } from './support/dashboard'
import { mustSucceed } from '@/lib/db/service-role'
import type { Lesson } from '@/lib/db/types'

// A rider cancelling her own spot, and the read-only Cancellation Notes row she gets on a lesson
// the manager cancelled (checklists/pre-release/phase-6-rider.md — the "record cancellation
// notes" Setup and its read-only-row line, then the block from "An enrolled lesson's detail-page
// header carries a **Cancel** button" onward; nine checkboxes across two hunks, because slice 14's
// already-tagged co-rider-names and unenrolled-404 lines sit between them).
//
// ## Three lessons, one page state each, and no ordering between them
//
//   seededCancelled  normal, the rider alone. Cancelled at seed time *with notes* — the lesson
//                    the "record cancellation notes" Setup plants and the "read-only
//                    **Cancellation Notes** row" line reads.
//   headerCancel     normal, the rider alone, never cancelled. The positive control for the
//                    header **Cancel** button and its two absent surfaces.
//   liveCancel       group, the rider + two co-riders, never cancelled at seed time. The lesson
//                    the UI cancels, for everything from "Cancelling your own spot from that
//                    header" onward.
//
// The issue requires the seeded and the live-cancelled lessons to be different rows, so the
// read-only-row line cannot be perturbed by the cancel tests' ordering. `headerCancel` is a third
// row for the same class of reason one step further out: the "detail-page header carries a
// **Cancel** button" claim is that an *eligible* lesson offers the header
// Cancel button, and `canCancelOwn` goes false the moment that spot is cancelled — reading it off
// `liveCancel` would make the test order-dependent, which is the failure mode
// checklist-phase5-lessons-cancel.spec.ts avoids by seeding extra rows rather than by sequencing.
//
// ## Why the live cancellation is a three-rider group lesson
//
// Two independent reasons, and both are load-bearing:
//
//   - **It must not cascade.** cancel_rider_participation flips `lessons.cancelled_at` once no
//     active rider is left, and the detail page's own-row badge is gated on
//     `lesson.cancelled_at === null` (OwnRiderNotesBlock's `showOwnRiderBadge`). On a normal
//     lesson — always exactly one rider — the rider's own cancellation cascades and the
//     detail-page **Cancelled** badge is replaced by the whole-lesson one, which is a different
//     claim. Two co-riders leave two active rows, so the cascade branch stays unreached.
//   - **"The rest of the lesson — other riders in a group lesson included" says "other riders",
//     plural.** With a single co-rider, a page or an RPC that touched "the first other row" would
//     satisfy the line by accident.
//
// ## Dates, and why the fee is assertable
//
// Every lesson is future-dated, so the rider's list never engages lessons/page.tsx's 7-day
// recent/older split and all three cards land in the first <ul>. `liveCancel` in particular sits
// at least 34 hours out, which puts it clear of the 24-hour late-cancellation window: the RPC
// recomputes lateness itself for a self-cancelling rider (it does not trust `p_is_late`), so the
// distance is the only thing deciding it. Non-late plus non-cascading is what makes the
// rest-of-the-lesson line's fee
// reading meaningful — since #1278, `UPDATE lessons SET fee = 0` and the ledger PERFORM both fire
// only when `lesson_type = 'normal' OR cascaded`, so an unchanged fee here is the gate holding,
// and before #1278 this same reading would have found $0 on a lesson two riders still ride.
//
// `headerCancel` and `liveCancel` share day +2 deliberately: the dashboard renders one day at a
// time, so putting both there gives the "No Cancel button appears on the Lessons list or the
// Dashboard" and Dashboard-badge lines an un-cancelled sibling card in the same frame as the
// cancelled one, rather than an absence asserted against an empty view.
//
// ## Two service-client reads that verify the expected answer
//
// The suite's convention is that direct service-role reads verify preconditions and storage shape,
// never the answer under test. The rest-of-the-lesson and instructor-notification lines are the
// sanctioned exception, and the issue's own
// text mandates both by name ("assert their status directly", "verify the `notifications` row
// directly ... an e2e run reads the row with its own service client"). Neither answer is renderable
// to this persona: a co-rider's Cancelled badge is gated on `canManageLesson` (a manager or the
// instructing trainer, never a rider), and the notification belongs to someone else — a rider's own
// cancellation notifies the instructor *and* every active manager
// (`resolveCancellationRecipients`), of whom the notification line names the instructor. Each
// read carries its own in-assertion control — the actor's own row for the first, the row count for
// the second — so a query pointed at the wrong barn or key fails rather than reading as a clean pass.

const COMET = 'Comet' // seededCancelled
const JUNIPER = 'Juniper' // headerCancel
const WILLOW = 'Willow' // liveCancel

// The app's own strings, quoted rather than imported: an expected value derived from the code
// under test agrees with any bug in it.
const CANCELLATION_NOTES_LABEL = 'Cancellation Notes'
const PARTICIPATION_NOTIFICATION_TITLE = 'Lesson participation cancelled'

/** Planted on `seededCancelled` at seed time and read back off its detail page by the
*  "read-only **Cancellation Notes** row" line. */
const SEEDED_CANCELLATION_NOTE = 'Arena flooded — this lesson will be rescheduled next week.'

/**
 * One distinct fee per lesson, none of them 0. Only `liveCancel`'s is asserted (the
 * rest-of-the-lesson line's "unaffected"), but the three stay distinct because it is free at seed
 * time and it is what makes a *failure* legible: a test that landed on the wrong lesson reports a
 * page whose fee names which one it actually reached.
 */
const FEES = { seededCancelled: 501, headerCancel: 502, liveCancel: 503 } as const

// The third co-rider, added inline via addManagedMember — e2e/support/fixtures.ts is off limits to
// this batch's parallel slices. The name is #1332's, reused rather than re-coined: this barn's
// other four members are the identical seeded set (Test Manager/Trainer/Rider/Sutton), so that
// slice's collision verdict transfers exactly — `Robin Fielding` contains none of them and none
// contains it, and its first-initial-derived form (`Robin F.`, which get_calendar_feed would
// render) collides with no other (`Test M.`/`Test T.`/`Test R.`/`Test S.`).
const THIRD_RIDER = { firstName: 'Robin', lastName: 'Fielding' } as const

const RIDER_NAME = `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}`
const TRAINER_NAME = `${E2E_USERS.trainer.firstName} ${E2E_USERS.trainer.lastName}`
const STUB_RIDER_NAME = `${E2E_STUB_RIDER.firstName} ${E2E_STUB_RIDER.lastName}`
const THIRD_RIDER_NAME = `${THIRD_RIDER.firstName} ${THIRD_RIDER.lastName}`

// Whole rows rather than bare ids, so every expected value below comes out of the builder that
// created it rather than being restated.
let seededCancelled: Lesson
let headerCancel: Lesson
let liveCancel: Lesson

/** The three group-lesson riders, name → membership id, for the rest-of-the-lesson per-row read. */
let groupRiderIds: Record<string, string>

const barn = withBarn('phase6-cancellation', async ({ supabase, barn, members }) => {
  const comet = await addHorse(supabase, barn.id, COMET)
  const juniper = await addHorse(supabase, barn.id, JUNIPER)
  const willow = await addHorse(supabase, barn.id, WILLOW)

  const thirdRider = await addManagedMember(supabase, barn.id, { ...THIRD_RIDER, role: 'rider' })

  seededCancelled = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(1, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [comet.id],
    riderIds: [members.rider.membershipId],
    fee: FEES.seededCancelled,
  })
  // The manager's whole-lesson cancellation, planted rather than driven: this spec runs as the
  // rider, who cannot perform one. `isLate` is left at its default false, matching a manager
  // cancelling a lesson still days out — that line reads the notes, not the fee.
  await cancelLesson(supabase, barn, { lessonId: seededCancelled.id, notes: SEEDED_CANCELLATION_NOTE })

  headerCancel = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '10:00',
    instructorId: members.trainer.membershipId,
    horseIds: [juniper.id],
    riderIds: [members.rider.membershipId],
    fee: FEES.headerCancel,
  })

  liveCancel = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '11:00',
    instructorId: members.trainer.membershipId,
    horseIds: [willow.id],
    riderIds: [members.rider.membershipId, members.rider2.membershipId, thirdRider.membershipId],
    lessonType: 'group',
    fee: FEES.liveCancel,
  })

  groupRiderIds = {
    [RIDER_NAME]: members.rider.membershipId,
    [STUB_RIDER_NAME]: members.rider2.membershipId,
    [THIRD_RIDER_NAME]: thirdRider.membershipId,
  }
})

// ---------------------------------------------------------------------------
// Paths and locators
// ---------------------------------------------------------------------------

function lessonsPath(): string {
  return `/barn/${barn.slug}/lessons`
}

function lessonPath(lesson: Lesson): string {
  return `/barn/${barn.slug}/lessons/${lesson.id}`
}

/**
 * The Rider(s) row of the detail page's `<dl>`, scoped by its own label — the Horse(s) row holds a
 * structurally identical `<ul>`, and an unscoped locator would read horse names into a rider-name
 * assertion.
 */
function ridersSection(page: Page): Locator {
  return page.locator('dl > div').filter({ hasText: 'Rider(s)' })
}

/** A lesson's card, on either the Lessons list or the dashboard's day view. */
function lessonCard(page: Page, lesson: Lesson): Locator {
  return page.locator(`main a[href$="/lessons/${lesson.id}"]`)
}

function cancelledBadges(scope: Locator): Locator {
  return scope.getByText(CANCELLED_BADGE, { exact: true })
}

/**
 * Every Cancel *control* on the page, whatever element it is. The "No Cancel button appears on
 * the Lessons list or the Dashboard" claim is that the surface
 * offers no way to cancel, so both shapes the app uses for one are counted: the detail header's
 * `<Button href>` renders a link, while a `<Button>` without one renders a button.
 *
 * `exact: true` matters twice over here. getByRole's name match is a case-insensitive substring by
 * default, so a bare 'Cancel' would also match a future 'Cancel Lesson' — and, more to the point,
 * the "Cancelled" badge this same page carries is a `<span>` with no role, so it cannot be counted
 * as a control by either locator regardless.
 */
function cancelControls(page: Page): Locator {
  return page.getByRole('link', { name: 'Cancel', exact: true }).or(page.getByRole('button', { name: 'Cancel', exact: true }))
}

// On `landOnDetail` (imported from `./support/lesson-pages`) as this spec uses it:
// it is a real sync point here rather than the no-op e2e/CLAUDE.md's
// fact 3 warns about: the submit is dispatched from `/lessons/<id>/cancel-rider/<riderId>`, which
// this pattern's `$` anchor does not match.

/**
 * Drives the whole cancellation the way the checklist describes it — from the detail page's own
 * header — and returns once the resulting detail page has rendered.
 *
 * No hydration barrier, and that is deliberate rather than an omission. The rider's cancel-rider
 * page renders no client-state-gated control at all: its Type radio group is behind
 * `role !== 'rider'`, so unlike the trainer flow (checklist-phase5-lessons-cancel.spec.ts, which
 * needs hydrateByDriving to reach the rider picker) there is nothing here that only React can
 * produce. The confirm control is a plain submit inside `<form action={serverAction}>`, so a click
 * landing before React is listening is not lost the way e2e/CLAUDE.md's fact 10 button is — the
 * browser submits the form natively and the action runs regardless.
 */
async function cancelOwnSpotFromHeader(page: Page, lesson: Lesson) {
  await page.goto(lessonPath(lesson))
  await headerCancelLink(page).click()
  await page.waitForURL(new RegExp(`/lessons/${lesson.id}/cancel-rider/`), { waitUntil: 'commit' })

  await page.getByRole('button', { name: 'Confirm Cancellation', exact: true }).click()
  await landOnDetail(page, lesson.id)
}

// ---------------------------------------------------------------------------
// The lesson the manager cancelled — the "record cancellation notes" Setup and the read-only
// **Cancellation Notes** row it plants for
// ---------------------------------------------------------------------------

// One test for two checkboxes: the setup line's whole content is "An e2e run seeds the
// cancelled lesson and its notes in the rider's own barn instead", and this is the test that seed
// exists for. That pairing is the same shape every other converted Setup line in Phases 5 and 6
// carries, each tagged with the name of the test its seed serves.
//
// Both readings belong to one page state and neither means anything alone: notes rendered into an
// editable field are not read-only, and zero textboxes on a page showing no notes is vacuous.
// Read-only is asserted as the absence of a *textbox* specifically rather than of controls
// generally — the rider's own header carries a Cancel link on an eligible lesson, so a
// blanket no-controls assertion would be asserting something false about the app.
test('rider_manager_cancelled_lesson_shows_read_only_cancellation_notes @rider', async ({ page }) => {
  await page.goto(lessonPath(seededCancelled))
  const notes = (await settledTextContents(detailField(page, CANCELLATION_NOTES_LABEL)))[0].trim()

  expect({ notes, textboxes: await page.locator('main').getByRole('textbox').count() }).toEqual({
    notes: SEEDED_CANCELLATION_NOTE,
    textboxes: 0,
  })
})

// ---------------------------------------------------------------------------
// The Cancel button, and the two surfaces that carry none — "An enrolled lesson's detail-page
// header carries a **Cancel** button" and "No Cancel button appears on the Lessons list or the Dashboard"
// ---------------------------------------------------------------------------

// The instructor half is not decoration: it is what distinguishes "this eligible lesson offers a
// Cancel button" from "this page did not render", which a bare `cancel: 1` cannot. It comes off
// the `<dl>` while the count comes off `headerActions`, so the two also cross-check each other's
// locator root.
test('rider_enrolled_lesson_header_carries_a_cancel_button @rider', async ({ page }) => {
  await page.goto(lessonPath(headerCancel))
  const instructor = (await settledTextContents(detailField(page, 'Instructor')))[0].trim()

  expect({ instructor, cancel: await headerCancelLink(page).count() }).toEqual({
    instructor: TRAINER_NAME,
    cancel: 1,
  })
})

// Both surfaces the line names, plus the detail page, in one assertion. The detail reading is what
// makes the two zeros falsifiable: it is taken with the same page-wide locator, on the same
// persona, against a lesson whose header does carry the control — so a locator that had stopped
// matching anything at all fails here rather than reporting the absence the line claims.
//
// The card counts are the second control. A list or a day view that rendered nothing would report
// zero Cancel controls just as happily, and these pin the surfaces as populated: two of the
// rider's own lessons sit on day +2, which is why both are seeded there.
test('rider_sees_no_cancel_button_on_the_lessons_list_or_the_dashboard @rider', async ({ page }) => {
  test.slow()
  await page.goto(lessonPath(headerCancel))
  const detail = await cancelControls(page).count()

  await page.goto(lessonsPath())
  await lessonCard(page, headerCancel).waitFor()
  const list = { cards: await lessonCard(page, headerCancel).count(), cancels: await cancelControls(page).count() }

  await goToDaysAhead(page, barn.slug, 2)
  await lessonCard(page, headerCancel).waitFor()
  const dashboard = { cards: await lessonCard(page, headerCancel).count(), cancels: await cancelControls(page).count() }

  expect({ detail, list, dashboard }).toEqual({
    detail: 1,
    list: { cards: 1, cancels: 0 },
    dashboard: { cards: 1, cancels: 0 },
  })
})

// ---------------------------------------------------------------------------
// Cancelling her own spot — "Cancelling your own spot from that header" through the instructor
// notification line
// ---------------------------------------------------------------------------

// One cancellation, read five ways. Serial because the mutation happens once and the four tests
// after it read its result; the issue sanctions exactly this, and `fullyParallel` stays false so
// the ordering inside the block is the ordering that runs. The failure mode is contained rather
// than merely unlikely: `describe.serial` skips the remaining tests once one fails, so a worker
// restart cannot re-run beforeAll and re-seed the barn underneath a test still expecting the
// cancelled state.
test.describe.serial('rider cancels her own spot on a group lesson', () => {
  // The mutation lives in this test rather than in a hook because it *is* the "Cancelling your
  // own spot from that header" subject:
  // "cancelling your own spot from that header" names the interaction, and the list badge is what
  // the line claims follows from it.
  //
  // The sibling card is the control, and it is why the badge count means something: `headerCancel`
  // is a lesson of the same persona on the same list that must *not* pick up a badge, so a card
  // template that had started rendering "Cancelled" unconditionally fails here.
  test('rider_cancelling_own_spot_marks_the_row_cancelled_on_the_lessons_list @rider', async ({ page }) => {
    test.slow()
    await cancelOwnSpotFromHeader(page, liveCancel)

    await page.goto(lessonsPath())
    await lessonCard(page, liveCancel).waitFor()
    expect({
      cancelled: await cancelledBadges(lessonCard(page, liveCancel)).count(),
      stillActive: await cancelledBadges(lessonCard(page, headerCancel)).count(),
    }).toEqual({ cancelled: 1, stillActive: 0 })
  })

  // The same claim on the dashboard's day view, which renders a different component
  // (CalendarLessonCard, not LessonListItem) from the same rider_cancelled_ats array — so this is
  // a second surface rather than a restatement. Both lessons sit on day +2, so the un-cancelled
  // sibling is the in-frame control again, and the card counts keep an empty day view from
  // reading as a pass.
  test('rider_cancelled_spot_shows_the_cancelled_badge_on_the_dashboard @rider', async ({ page }) => {
    test.slow()
    await goToDaysAhead(page, barn.slug, 2)
    await lessonCard(page, liveCancel).waitFor()

    expect({
      cancelledCard: await lessonCard(page, liveCancel).count(),
      cancelled: await cancelledBadges(lessonCard(page, liveCancel)).count(),
      activeCard: await lessonCard(page, headerCancel).count(),
      stillActive: await cancelledBadges(lessonCard(page, headerCancel)).count(),
    }).toEqual({ cancelledCard: 1, cancelled: 1, activeCard: 1, stillActive: 0 })
  })

  // On the detail page the badge is the rider's *own row's*, rendered by OwnRiderNotesBlock below
  // the rider list — not the whole-lesson badge that sits beside the `<h1>`. Reading both is what
  // distinguishes them: a cancellation that had cascaded, or a page that had started showing the
  // lesson-level badge for a cancelled participation, would put a badge in the header and fail the
  // second reading rather than passing the first.
  //
  // One badge inside the Rider(s) section is hers by construction: the per-row RiderStatusBadge on
  // every other `<li>` is gated on `showManagerRiderActions` (canManageLesson — a manager or the
  // instructing trainer), so no co-rider's badge can render for this persona at all.
  test('rider_cancelled_spot_shows_the_cancelled_badge_on_the_lesson_detail_page @rider', async ({ page }) => {
    await page.goto(lessonPath(liveCancel))
    await ridersSection(page).waitFor()

    expect({
      ownRow: await cancelledBadges(ridersSection(page)).count(),
      header: await cancelledBadges(detailHeader(page)).count(),
    }).toEqual({ ownRow: 1, header: 0 })
  })

  // The "other riders in a group lesson included — is unaffected" claim is about rows this
  // persona's UI structurally cannot show, so the co-riders'
  // status is read with the spec's own service client (see the header note on that exception). The
  // actor's own `true` is the control living inside the same assertion: a read pointed at the
  // wrong barn, the wrong lesson or a stale membership map reports three falses and fails there,
  // rather than reading as a clean pass on two untouched co-riders.
  //
  // The lesson's own two columns are the other half of "the rest of the lesson". `cancelled_at`
  // proves the cascade branch stayed unreached, and the fee proves #1278's gate held: before it,
  // cancel_rider_participation zeroed the whole lesson's fee for any non-late rider cancellation,
  // group lessons included — a lesson two riders still ride reading $0. The names come off the
  // page so the claim also covers what she sees: all three rows still listed.
  test('rider_cancelling_own_spot_leaves_the_co_riders_and_the_lesson_unaffected @rider', async ({ page }) => {
    const { supabase } = barn.data
    const riders = mustSucceed<{ rider_id: string; cancelled_at: string | null }[]>(
      await supabase.from('lesson_riders').select('rider_id, cancelled_at').eq('lesson_id', liveCancel.id).eq('barn_id', barn.data.barn.id),
      "read back the group lesson's rider rows"
    )
    const lesson = mustSucceed<{ cancelled_at: string | null; fee: number }>(
      await supabase.from('lessons').select('cancelled_at, fee').eq('id', liveCancel.id).eq('barn_id', barn.data.barn.id).single(),
      'read back the group lesson'
    )
    const cancelledByName = Object.fromEntries(
      Object.entries(groupRiderIds).map(([name, id]) => [name, riders.find((r) => r.rider_id === id)?.cancelled_at !== null])
    )

    await page.goto(lessonPath(liveCancel))
    const names = await settledInnerTexts(ridersSection(page).locator('ul > li'))

    expect({
      cancelledByName,
      lessonCancelled: lesson.cancelled_at !== null,
      fee: lesson.fee,
      names: names.map((n) => n.trim()).sort(),
    }).toEqual({
      cancelledByName: { [RIDER_NAME]: true, [STUB_RIDER_NAME]: false, [THIRD_RIDER_NAME]: false },
      lessonCancelled: false,
      fee: FEES.liveCancel,
      names: [RIDER_NAME, STUB_RIDER_NAME, THIRD_RIDER_NAME].sort(),
    })
  })

  // The recipients are other people, so the row is read with the service client rather than through
  // a UI this persona will never see — the issue mandates that directly, and seeding the row with
  // addNotification instead would make the assertion vacuous, which is why that builder is not
  // imported by this file.
  //
  // A rider's own cancellation notifies the instructor *and* every active manager
  // (resolveCancellationRecipients' `rider_participation` + `actorRole === 'rider'` branch), so this
  // barn ends up with two rows of this type. The "The instructor receives a \"Lesson participation
  // cancelled\" notification" line is about the instructor's, and the query is
  // keyed on his user id — which is why the equality below can still be an exact one-row match
  // rather than a membership check over an open-ended recipient list.
  //
  // No poll: cancelRiderParticipationAction awaits the notification write *before* its redirect,
  // and the test above already waited for the redirected detail page to render, so the row is
  // committed by the time this runs.
  //
  // The row count is the control against a query that matched nothing, and the link is what ties
  // the notification to this lesson rather than to any cancellation anywhere in the barn — its
  // expected value is built from the seeded barn slug and the builder's own lesson id.
  test('rider_cancelling_own_spot_notifies_the_instructor @rider', async () => {
    const { supabase, barn: seeded, members } = barn.data
    const rows = mustSucceed<{ title: string; link: string }[]>(
      await supabase
        .from('notifications')
        .select('title, link')
        .eq('user_id', members.trainer.userId!)
        .eq('barn_id', seeded.id)
        .eq('type', 'rider_participation_cancelled'),
      "read back the instructor's participation-cancelled notification"
    )

    expect(rows).toEqual([
      { title: PARTICIPATION_NOTIFICATION_TITLE, link: `/barn/${barn.slug}/lessons/${liveCancel.id}` },
    ])
  })
})
