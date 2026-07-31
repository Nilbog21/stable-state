// covers: src/app/barn/[slug]/(protected)/expenses/**

import { test, expect, withBarn } from './support/test'
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
    at: daysFromNow(2),
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
  await expect(page.getByText(String(APPOINTMENT_AMOUNT), { exact: false })).toHaveCount(0)
})

// Not re-asserted here: that the dashboard card is now a link for every role. It has no
// role-partitioned RLS in it — CalendarAppointmentCard.test.tsx covers the unconditional
// href directly, and the live trainer dashboard is walked in PRE_RELEASE_TEST_CHECKLIST.md.
// Reaching a specific day here would mean re-deriving the barn-local date the dashboard
// buckets by, the exact UTC-vs-barn-calendar trap #1151 fixed elsewhere.

// The manager half of the same claim: the cost is not merely hidden in the UI, it is
// readable by exactly one role. Without this, "the trainer sees no amount" would pass
// against a build that lost the amount for everyone.
test('manager_appointment_page_shows_the_amount @manager', async ({ page }) => {
  await page.goto(appointmentPath())
  await expect(page.getByLabel(/amount/i)).toHaveValue(String(APPOINTMENT_AMOUNT))
})
