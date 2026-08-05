// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/components/calendar/**
// covers: src/components/EmptyState.tsx
//
// The Dashboard calendar through the two non-manager eyes: #1015/#1016's Day- and Week-view
// role scoping, #1019's appointment reaching a trainer's calendar, #1148's tappable
// appointment card, the rider seeing no appointments at all, events filtered by
// `visible_to_roles`, and #1148's renamed empty-state subtext in both views.
// checklists/pre-release/phase-5-trainer.md lines 28-29 / 37-38 / 98-99, and
// phase-6-rider.md lines 49-52.
//
// ## Why this file exists alongside checklist-phase6-dashboard.spec.ts
//
// That file stays, and the two cannot share one `withBarn` callback. Its single test asserts
// that a rider with **nothing outstanding of her own** sees no Reminders header even while the
// barn holds another rider's unpaid items — so its barn is deliberately seeded to leave the
// viewing rider empty-handed. This file needs the opposite in the same seat: a rider with
// enrolled lessons to see, an appointment she must *not* see, and an event her role is
// excluded from. One barn cannot be both, and `withBarn` seeds once per (spec file x project).
//
// ## A paired slice
//
// The file is greped by @trainer and @rider, so Playwright dispatches it twice and each run
// seeds its own barn (support/test.ts). withBarn's callback cannot see the project name —
// test.ts resolves it in beforeAll, after the callback signature is fixed — so "the acting
// member is the one who instructs/is enrolled" cannot be seeded conditionally. Both barns
// therefore get the whole 2x2 below and each role's tests target their own half.
//
// ## Why the busy day is a 2x2 rather than "mine and someone else's"
//
// The two role-scoping claims have *different* mechanisms — a trainer's is app-level
// (`scopeScheduleItemsForRole`, since `lessons_select_staff` grants a trainer barn-wide
// SELECT), a rider's is RLS (`lessons_select_rider`) — so a barn holding one "not mine" lesson
// makes each claim falsifiable by only one cause at a time. Crossing instructor against
// enrolment gives every filter its own witness: `trainerOnly` is withheld from the rider by
// enrolment alone, `riderOnly` is withheld from the trainer by the app-level filter alone, and
// `neither` is a control that must reach nobody. Drop either filter and a named lesson appears
// where it should not.
//
// ## Why fixed 2031 dates rather than daysFromNow offsets
//
// Same reasoning as checklist-phase4-dashboard.spec.ts's own Week-view block. A relative
// offset lands on a different weekday every day of the week, and the Week view is
// calendar-aligned (Sunday-to-Saturday, `getWeekDates`), so the seven-day window a relative
// anchor produces is not reproducible. Being far in the future also keeps every lesson out of
// `getOutstandingLessons`, which only counts *past* unpaid ones — so no Reminders section
// renders at all and the Calendar section is the whole page below the heading.

import { test, expect, withBarn, type Page } from './support/test'
import { wallClockToInstant } from '@/lib/barn-timezone'
import {
  addBarnEvent,
  addExpense,
  addHorse,
  addPaidLesson,
  addTier,
  type SeededAppointment,
} from './support/fixtures'
import type { Lesson } from '@/lib/db/types'

/** Wednesday. Its calendar week is Sunday 2031-03-02 .. Saturday 2031-03-08. */
const BUSY_DAY = '2031-03-05'
const MONDAY = '2031-03-03'
const FRIDAY = '2031-03-07'

/**
 * Wednesday, five weeks past the busy week. Nothing is seeded on this day, and nothing in
 * Sunday 2031-04-06 .. Saturday 2031-04-12 — which is what both empty-state tests need, and
 * they need it for a *trainer*: `scopeScheduleItemsForRole` filters lessons only, so an
 * appointment or an event parked here would keep the empty state from rendering at all.
 */
const EMPTY_DAY = '2031-04-09'

const APPOINTMENT_RECIPIENT = 'Meadowbrook Vet'
const OPEN_EVENT_TITLE = 'Barn Open House'
const STAFF_EVENT_TITLE = 'Staff Planning Session'

/**
 * The busy day's four lessons, plus the two off-day lessons that make "across all 7 days" a
 * real claim rather than a restatement of the Day view. Named by who may see them.
 */
let ownBoth: Lesson
let trainerOnly: Lesson
let riderOnly: Lesson
let mondayTrainer: Lesson
let fridayRider: Lesson
let appointment: SeededAppointment

const barn = withBarn('phase56-dashboard', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  const bella = await addHorse(supabase, barn.id, 'Bella')

  const barnNoon = (date: string) => wallClockToInstant(`${date}T12:00:00`, barn.timezone)

  // `members.manager` is the barn's other instructor: addMemberships sets can_instruct on
  // every non-rider, so the manager login is instructor-capable without a stub to name.
  const otherInstructor = members.manager.membershipId

  // Paid, not unpaid. These are future-dated, so getOutstandingLessons could not count them
  // either — but paid keeps the Reminders section absent under any clock at all, and the
  // empty-state tests below read the Calendar section's paragraphs.
  //
  // Times are pinned rather than left to a fixture default because the dashboard buckets and
  // sorts on barn-local wall clock (#1150/#1221); the hrefs below are compared as sorted sets,
  // so nothing here depends on the resulting order, but a 23:00-barn-local seed can slide onto
  // the neighbouring calendar day, which every assertion here does depend on.
  const lesson = (opts: { at: string; time: string; instructorId: string; riderId: string; horseId: string }) =>
    addPaidLesson(supabase, barn, {
      at: barnNoon(opts.at),
      time: opts.time,
      instructorId: opts.instructorId,
      horseIds: [opts.horseId],
      riderIds: [opts.riderId],
      fee: tier.price,
      tierName: tier.name,
    })

  ownBoth = await lesson({
    at: BUSY_DAY,
    time: '09:00',
    instructorId: members.trainer.membershipId,
    riderId: members.rider.membershipId,
    horseId: apollo.id,
  })
  trainerOnly = await lesson({
    at: BUSY_DAY,
    time: '10:00',
    instructorId: members.trainer.membershipId,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
  })
  riderOnly = await lesson({
    at: BUSY_DAY,
    time: '11:00',
    instructorId: otherInstructor,
    riderId: members.rider.membershipId,
    horseId: apollo.id,
  })
  // The 2x2's fourth cell — "neither" — instructed by the other instructor and enrolling the
  // stub rider, so it must reach no test in this file. Not captured in a variable precisely
  // because nothing may assert on it: it exists to be *absent* from both roles' expected sets,
  // and a name here would only invite someone to reach for it.
  await lesson({
    at: BUSY_DAY,
    time: '12:00',
    instructorId: otherInstructor,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
  })

  mondayTrainer = await lesson({
    at: MONDAY,
    time: '09:00',
    instructorId: members.trainer.membershipId,
    riderId: members.rider2.membershipId,
    horseId: apollo.id,
  })
  fridayRider = await lesson({
    at: FRIDAY,
    time: '09:00',
    instructorId: otherInstructor,
    riderId: members.rider.membershipId,
    horseId: bella.id,
  })

  // Seeded *with* a cost on purpose, matching the priced vet/farrier appointment the manual
  // Phase 3 walkthrough creates. #1148 moved the figure onto the manager-only
  // `appointment_costs` table, so a trainer reads `amount` as null and the dashboard's
  // "planned expenses only" filter (`amount === null`) lets the whole appointment schedule
  // through for them. A costless appointment would reach the trainer's calendar too, and
  // would therefore prove strictly less.
  appointment = await addExpense(supabase, barn, {
    at: barnNoon(BUSY_DAY),
    time: '13:00',
    recipient: APPOINTMENT_RECIPIENT,
    expenseType: 'Vet',
    amount: 212.5,
    horseIds: [apollo.id],
  })

  // The rider's `visible_to_roles` pair. The all-roles event is the control: without it, "the
  // staff event is absent" would pass just as happily against a calendar rendering no events
  // at all, or against a locator pointing nowhere.
  await addBarnEvent(supabase, barn, { at: barnNoon(BUSY_DAY), title: OPEN_EVENT_TITLE })
  await addBarnEvent(supabase, barn, {
    at: barnNoon(BUSY_DAY),
    title: STAFF_EVENT_TITLE,
    visibleToRoles: ['manager', 'trainer'],
  })
})

/**
 * The Calendar <section>.
 *
 * The dashboard's top-level sections are Reminders and Calendar, and in Week view seven more
 * nest inside this one — the filter picks the outer one unambiguously, since a day section's
 * heading is an <h3> carrying a date rather than "Calendar". Nothing here seeds a reminder, so
 * the Reminders section never renders at all in this barn; the filter is what keeps that an
 * incidental fact rather than something the assertions rely on.
 */
const calendarSection = (page: Page) =>
  page.locator('section').filter({ has: page.getByRole('heading', { name: 'Calendar' }) })

/** The Day/Week pill row — the Calendar section's first <div>. */
const pillRow = (page: Page) => calendarSection(page).locator('div').first()

/** The Week view's per-day date headings, and the only <h3>s the dashboard renders. */
const dayHeadings = (page: Page) => calendarSection(page).getByRole('heading', { level: 3 })

/**
 * Every lesson card's href.
 *
 * `[href*="/lessons/"]` cannot collide with the nav's Lessons link, whose href is
 * `/barn/<slug>/lessons` with no trailing slash.
 *
 * evaluateAll is a one-shot read with no auto-wait, and e2e/support/read.ts deliberately leaves
 * that call shape its inline guard rather than wrapping it — so the `waitFor` is what stops an
 * unrendered calendar from answering `[]` and satisfying an assertion vacuously. Every expected
 * value below is non-empty, so waiting on the first match is always the right barrier.
 */
async function lessonHrefs(page: Page): Promise<string[]> {
  const links = page.locator('a[href*="/lessons/"]')
  await links.first().waitFor()
  return (await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))).sort()
}

/**
 * Every *linked* card's href — one <a> per lesson and per appointment.
 *
 * Deliberately not "every card": CalendarEventCard renders a Card with no href, which Card.tsx
 * emits as a plain <div>, so a barn event contributes nothing here.
 */
async function linkedCardHrefs(page: Page): Promise<string[]> {
  const links = page.locator('a[href*="/lessons/"], a[href*="/expenses/"]')
  await links.first().waitFor()
  return (await links.evaluateAll((els) => els.map((el) => el.getAttribute('href') ?? ''))).sort()
}

/**
 * Expected hrefs, derived from the ids the builders returned rather than written out — and
 * sorted, because a calendar's row order is not what any of these lines claim (#1286). The
 * *set* is the claim: which lessons reached the page.
 */
function lessonPaths(...lessons: Lesson[]): string[] {
  return lessons.map((l) => `/barn/${barn.slug}/lessons/${l.id}`).sort()
}

/**
 * Clicks the Week pill rather than re-navigating with `?view=week`.
 *
 * Both checklist lines this serves begin "Switching to Week view", and the switcher is a
 * `<Pill href>` — a Next `<Link>` — so the user's switch costs no document load and a spec that
 * re-`goto`s is paying for one the UI never asks for (e2e/CLAUDE.md fact 11).
 *
 * The `toHaveCount(7)` is that fact's required settle barrier, not the calling test's
 * assertion: a soft nav's re-render races the one-shot reads above, and the per-day <h3>s are a
 * signal that *differs between the two views* — zero in Day view, seven in Week — so waiting on
 * them cannot be satisfied by the document the click was about to replace. It is an
 * auto-retrying matcher, which is what makes it safe to write with no timeout of its own.
 *
 * waitForURL carries no `timeout` either: navigationTimeout defaults to unbounded, so a number
 * here could only tighten it (#1211).
 */
async function switchToWeekView(page: Page) {
  await pillRow(page).getByRole('link', { name: 'Week', exact: true }).click()
  await page.waitForURL((url) => url.searchParams.get('view') === 'week', { waitUntil: 'commit' })
  await expect(dayHeadings(page)).toHaveCount(7)
}

// =============================================================================================
// Phase 5 — the trainer's eye
// =============================================================================================

// A whole-list assertion over the *set* of lesson cards, not a check that one unwanted name is
// absent. `riderOnly` and `neither` are both on this day and both readable by a trainer under
// `lessons_select_staff` — dropping scopeScheduleItemsForRole's filter yields four hrefs here,
// not a subtly different two. The two survivors being present is what keeps it non-vacuous.
test('trainer_dashboard_day_view_shows_only_lessons_they_instruct @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  expect(await lessonHrefs(page)).toEqual(lessonPaths(ownBoth, trainerOnly))
})

// The week-wide counterpart, and the reason the seed puts lessons on Monday and Friday too:
// scoping the *viewed* day correctly says nothing about the other six. `mondayTrainer` must
// appear (a day this trainer is not looking at, but does instruct on) and `fridayRider` must
// not (a day they are not looking at and do not instruct on), so a filter applied only to the
// anchor day fails in both directions at once.
test('trainer_dashboard_week_view_shows_only_lessons_they_instruct_across_the_week @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  await switchToWeekView(page)
  expect(await lessonHrefs(page)).toEqual(lessonPaths(ownBoth, trainerOnly, mondayTrainer))
})

// Text-based, not link-based, and deliberately so: "the calendar shows that appointment" stays
// true of a card rendered as plain text, which is the *next* line's claim rather than this
// one's. Asserting the href list here would make the two lines fail together and leave this one
// unable to distinguish "the appointment is missing" from "the appointment stopped linking".
//
// Both halves are one expectation because "alongside your own lessons" is one claim about a
// relationship: the appointment renders exactly once, on a day that is simultaneously showing
// this trainer's own two lessons rather than an empty calendar.
test('trainer_dashboard_calendar_shows_the_appointment_alongside_their_own_lessons @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  const calendar = calendarSection(page)
  const appointmentText = calendar.getByText(APPOINTMENT_RECIPIENT, { exact: true })
  const ownLessons = calendar.locator('a[href*="/lessons/"]')
  // count() is a one-shot read with no auto-wait; the appointment card settles the page.
  await appointmentText.waitFor()
  expect([await appointmentText.count(), await ownLessons.count()]).toEqual([1, 2])
})

// "A tappable link, not plain text" is exactly what getByRole('link') decides: a card rendered
// as a bare <div> matches nothing here and the assertion fails on the locator rather than on
// the href. The expected href is built from the id addExpense returned, not written out.
test('trainer_dashboard_appointment_card_is_a_link_to_its_detail_page @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  const card = calendarSection(page).getByRole('link').filter({ hasText: APPOINTMENT_RECIPIENT })
  await expect(card).toHaveAttribute('href', `/barn/${barn.slug}/expenses/${appointment.id}`)
})

/**
 * The empty state's two lines, as a whole list.
 *
 * On a day (or week) with nothing on it the Calendar section's only paragraphs are EmptyState's
 * heading and subtext — the pills, the date pager and the "Today"/"This Week" control are all
 * <a>s, and the date heading is an <h2>. So a two-element expectation pins the count as well as
 * both strings: a page that rendered no empty state at all yields zero and fails, where a bare
 * `getByText('…')` check for the wanted wording could not tell that apart from the wrong
 * wording.
 *
 * The subtext strings are written out rather than derived. The wording *is* the claim these two
 * lines make — "appointments", not "expenses" — so deriving it from the component under test is
 * precisely what must not happen.
 */
const emptyStateLines = (page: Page) => calendarSection(page).getByRole('paragraph')

test('trainer_dashboard_day_view_empty_state_names_appointments_not_expenses @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${EMPTY_DAY}`)
  await expect(emptyStateLines(page)).toHaveText([
    "You're all clear",
    'No lessons, appointments, or events scheduled for this day.',
  ])
})

// Reached by `?view=week` rather than by a pill click, unlike the two role-scoping tests above:
// this line's claim is the Week view's subtext, not the act of switching, and the expectation
// below is itself an auto-retrying matcher.
test('trainer_dashboard_week_view_empty_state_names_appointments_not_expenses @trainer', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?view=week&date=${EMPTY_DAY}`)
  await expect(emptyStateLines(page)).toHaveText([
    "You're all clear",
    'No lessons, appointments, or events scheduled this week.',
  ])
})

// =============================================================================================
// Phase 6 — the rider's eye
// =============================================================================================

// The mirror of the trainer's day-view test, against the other half of the 2x2: `trainerOnly`
// and `neither` are on this same day and enrol the stub rider instead, so a broken
// `lessons_select_rider` shows up as four hrefs rather than two.
test('rider_dashboard_day_view_shows_only_lessons_she_is_enrolled_in @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  expect(await lessonHrefs(page)).toEqual(lessonPaths(ownBoth, riderOnly))
})

// "No appointments" as a whole-list equality rather than a zero count. The day holds a real,
// timed appointment that a manager or trainer *does* see, so the claim has something to be
// false about — and requiring her two enrolled lessons in the same expectation means a page
// that never rendered fails here instead of satisfying an absence. An appointment reaching her
// would land a third `/expenses/` href in this array.
test('rider_dashboard_day_view_shows_no_appointment_cards @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  expect(await linkedCardHrefs(page)).toEqual(lessonPaths(ownBoth, riderOnly))
})

// One locator matching *either* event title, so the count is part of the claim: the staff-only
// event leaking gives two elements, and the all-roles control going missing gives zero. Both
// fail. A `toHaveCount(0)` on the staff title alone would have passed on either.
test('rider_dashboard_day_view_hides_an_event_outside_her_visible_to_roles @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  const eventTitles = calendarSection(page).getByText(
    new RegExp(`${OPEN_EVENT_TITLE}|${STAFF_EVENT_TITLE}`)
  )
  await expect(eventTitles).toHaveText([OPEN_EVENT_TITLE])
})

// Her week-wide counterpart. `fridayRider` must appear and `mondayTrainer` must not — the exact
// inverse of the trainer's week test against the same six lessons.
test('rider_dashboard_week_view_shows_only_her_enrolled_lessons_across_the_week @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}?date=${BUSY_DAY}`)
  await switchToWeekView(page)
  expect(await lessonHrefs(page)).toEqual(lessonPaths(ownBoth, riderOnly, fridayRider))
})
