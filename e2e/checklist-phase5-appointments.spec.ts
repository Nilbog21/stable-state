// covers: src/app/barn/[slug]/(protected)/expenses/**

import { test, expect, withBarn, type Page } from './support/test'
import { addExpense, addHorse, daysFromNow } from './support/fixtures'
import type { Appointment } from '@/lib/db/types'

// #1148 split the appointment (barn-visible: date, time, recipient, type, horses, notes)
// from its cost (manager-only `appointment_costs`). The claim is a role-partitioned RLS
// claim, so it can only be made against a real session — a mocked DAL test cannot see a
// policy. Both projects seed their own barn (see support/test.ts), so the same fixture
// serves the trainer and manager runs.
const APPOINTMENT_AMOUNT = 137.5
const RECIPIENT = 'Valley Farrier'
const NOTES = 'Front shoes only'

let appointment: Appointment

const barn = withBarn('phase5-appointments', async ({ supabase, barn }) => {
  const apollo = await addHorse(supabase, barn.id, 'Apollo')
  appointment = await addExpense(supabase, barn, {
    at: daysFromNow(2, barn.timezone),
    time: '14:00',
    recipient: RECIPIENT,
    expenseType: 'Farrier',
    amount: APPOINTMENT_AMOUNT,
    horseIds: [apollo.id],
    notes: NOTES,
  })
})

function appointmentPath(): string {
  return `/barn/${barn.slug}/expenses/${appointment.id}`
}

test('trainer_can_open_the_appointment_detail_page @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByRole('heading', { name: /^appointment$/i })).toBeVisible()
})

test('trainer_appointment_page_shows_the_recipient @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByText(RECIPIENT)).toBeVisible()
})

test('trainer_appointment_page_shows_the_assigned_horse @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByText('Apollo')).toBeVisible()
})

test('trainer_appointment_page_shows_the_notes @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByText(NOTES)).toBeVisible()
})

// The amount is asserted absent as a bare digit string, not as a formatted currency
// label — a trainer must not receive the figure in any rendering.
test('trainer_appointment_page_never_shows_the_amount @trainer', async ({ page }) => {
  await page.goto(appointmentPath())

  await expect(page.getByText(RECIPIENT)).toBeVisible()
  await expect(page.getByText(String(APPOINTMENT_AMOUNT), { exact: false })).toHaveCount(0)
})

// =============================================================================================
// #1326 — the two read-only claims about this same page: no Save Changes, no Delete.
//
// They live here rather than in checklist-phase56-dashboard.spec.ts (which owns the rest of
// that slice) because this file already seeds exactly the appointment they assert on and
// already owns the five lines above them. Appended, so every pre-existing test keeps its
// declaration position; nothing here mutates a row.
//
// Both are absence claims, so both are written as one expectation over a pair rather than as a
// bare toHaveCount(0): a page that 404'd, redirected, or never compiled renders no Save button
// either, and a zero count cannot tell that apart from the read-only view working. Pairing the
// count with the Appointment heading makes the assertion require the right page to have
// rendered before it can be satisfied.
//
// Scoped to <main> — AppointmentDetail renders its own, and so does the manager's edit form,
// which is where both controls live. That keeps the claim about the page's own body rather
// than about the surrounding nav chrome.
// =============================================================================================

const appointmentHeading = (page: Page) => page.getByRole('heading', { name: /^appointment$/i })

test('trainer_appointment_page_shows_no_save_changes_button @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  const saveButton = page.getByRole('main').getByRole('button', { name: /save changes/i })
  // count() is a one-shot read with no auto-wait; the heading settles the page first.
  await appointmentHeading(page).waitFor()
  expect([await appointmentHeading(page).count(), await saveButton.count()]).toEqual([1, 0])
})

// `.or()` covers both renderings deliberately. The manager's Delete is a `<Button href>`, which
// Button.tsx emits as a Next <Link> rather than a <button> — so a button-only locator would
// report zero against a page that had grown exactly the control this line forbids.
test('trainer_appointment_page_shows_no_delete_button @trainer', async ({ page }) => {
  await page.goto(appointmentPath())
  const main = page.getByRole('main')
  const deleteControl = main
    .getByRole('button', { name: /^delete$/i })
    .or(main.getByRole('link', { name: /^delete$/i }))
  await appointmentHeading(page).waitFor()
  expect([await appointmentHeading(page).count(), await deleteControl.count()]).toEqual([1, 0])
})

// Still not asserted here: that the dashboard card is a link, and that the appointment reaches
// a trainer's calendar at all. Reaching a specific day from this barn would mean re-deriving
// the barn-local date the dashboard buckets by, the exact UTC-vs-barn-calendar trap #1151
// fixed elsewhere. #1326 covers both from a barn seeded on fixed calendar anchors instead —
// see checklist-phase56-dashboard.spec.ts's
// trainer_dashboard_appointment_card_is_a_link_to_its_detail_page and
// trainer_dashboard_calendar_shows_the_appointment_alongside_their_own_lessons. The
// unconditional href itself is still covered directly by CalendarAppointmentCard.test.tsx.

// The manager half of the same claim: the cost is not merely hidden in the UI, it is
// readable by exactly one role. Without this, "the trainer sees no amount" would pass
// against a build that lost the amount for everyone.
test('manager_appointment_page_shows_the_amount @manager', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByLabel(/amount/i)).toHaveValue(String(APPOINTMENT_AMOUNT))
})
