// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/DocumentRemindersSection.tsx
// covers: src/components/calendar/**
import { test, expect, withBarn } from './support/test'
import { addHorse, addLeaseCharge, addTier, addUnpaidLesson, daysFromNow } from './support/fixtures'

// Split out of checklist-phase4-dashboard.spec.ts (#1136): the checklist's phases are
// partitioned by the role doing the asserting, and this is the only rider-eye assertion in
// the dashboard set. Net barn count is unchanged by the move — withBarn seeds in beforeAll on
// the file's own suite, so the phase4 file no longer seeds a `rider` barn and this one does.
//
// Both unpaid fixtures enrol the stub rider (`rider2`), never the `rider` login this spec
// authenticates as. The barn therefore *does* hold unpaid items, which is the point: the
// assertion proves the reminders query is scoped to the viewing rider, not merely that an
// empty dashboard is empty. Do not reseed this against a barn with nothing outstanding.
//
// checklist-phase56-dashboard.spec.ts (#1326) asserts the rest of the rider's dashboard — Day
// and Week role scoping, no appointments, `visible_to_roles` event filtering — and seeds its
// own barn rather than joining this one. The two cannot merge: this file's whole claim needs
// the viewing rider to have **nothing** of her own outstanding, while that file needs her to
// have enrolled lessons to see and an appointment she must not. One `withBarn` callback cannot
// seed both, and it runs once per (spec file x project).
const barn = withBarn('phase6-dashboard', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const bella = await addHorse(supabase, barn.id, 'Bella')

  await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(-1, barn.timezone),
    instructorId: members.trainer.membershipId,
    horseIds: [bella.id],
    riderIds: [members.rider2.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
  await addLeaseCharge(supabase, barn, {
    monthsAgo: 2,
    riderId: members.rider2.membershipId,
    horseId: bella.id,
    fee: 150,
  })
})

test('dashboard_reminders_header_hidden_for_rider_with_no_reminders @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page.getByRole('heading', { name: 'Reminders' })).toHaveCount(0)
})
