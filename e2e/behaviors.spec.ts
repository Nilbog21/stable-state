// covers: src/app/barn/[slug]/(protected)/lessons/**
// covers: src/app/barn/[slug]/(protected)/finances/**
import { test, expect, withBarn } from './support/test'
import { addHorse, addPaidLesson, addTier, daysFromNow } from './support/fixtures'

// Two lessons either side of the lessons page's 7-day "older" cutoff, so the toggle has
// something on both sides of it; the recent one enrols the rider login, which is what makes
// it visible to the rider's own lesson-detail assertion below.
const barn = withBarn('behaviors', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const horse = await addHorse(supabase, barn.id, 'Apollo')

  await addPaidLesson(supabase, barn, {
    at: daysFromNow(-2),
    instructorId: members.trainer.membershipId,
    horseIds: [horse.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })

  await addPaidLesson(supabase, barn, {
    monthsAgo: 1,
    instructorId: members.trainer.membershipId,
    horseIds: [horse.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

test('rider_redirected_from_new_lesson_page @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons/new`)
  await expect(page).toHaveURL(new RegExp(`/barn/${barn.slug}/lessons$`))
})

test('manager_by_instructor_pill_sets_filter_param @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await page.getByRole('link', { name: 'By Instructor' }).click()
  await page.waitForURL(/filter=trainer/, { waitUntil: 'commit' })
})

test('older_lessons_hidden_until_toggle_clicked @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  const lessonLinks = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`)
  const visibleBefore = await lessonLinks.count()
  if (visibleBefore === 0) throw new Error(`no lesson links found on /barn/${barn.slug}/lessons — is seed data present?`)
  const toggle = page.getByRole('button', { name: 'Show older lessons' })
  await toggle.focus()
  await toggle.press('Enter')
  await expect.poll(() => lessonLinks.count()).toBeGreaterThan(visibleBefore)
})

test('rider_lesson_detail_has_no_private_notes_section @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
  const href = await firstLesson.getAttribute('href')
  if (!href) throw new Error(`no lesson link found on /barn/${barn.slug}/lessons — is seed data present?`)
  await page.goto(href)
  await expect(page.getByText('Private', { exact: true })).toHaveCount(0)
})

const financeTabs = [
  { label: 'Horse', param: 'horse' },
  { label: 'Rider', param: 'rider' },
  { label: 'Instructor', param: 'trainer' },
]

for (const { label, param } of financeTabs) {
  test(`manager_finance_${param}_tab_updates_tab_param @manager`, async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/finances`)
    await page.getByRole('link', { name: `By ${label}` }).click()
    await page.waitForURL(new RegExp(`tab=${param}`), { waitUntil: 'commit' })
  })
}
