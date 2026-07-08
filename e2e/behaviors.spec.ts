import { test, expect } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

test('rider_redirected_from_new_lesson_page @rider', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/lessons/new`)
  await expect(page).toHaveURL(new RegExp(`/barn/${barnSlug}/lessons$`))
})

test('manager_by_instructor_pill_sets_filter_param @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/lessons`)
  await page.getByRole('link', { name: 'By Instructor' }).click()
  await expect(page).toHaveURL(/filter=trainer/)
})

test('older_lessons_hidden_until_toggle_clicked @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/lessons`)
  const lessonLinks = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`)
  const visibleBefore = await lessonLinks.count()
  if (visibleBefore === 0) throw new Error(`no lesson links found on /barn/${barnSlug}/lessons — is seed data present?`)
  const toggle = page.getByRole('button', { name: 'Show older lessons' })
  await toggle.focus()
  await toggle.press('Enter')
  await expect.poll(() => lessonLinks.count()).toBeGreaterThan(visibleBefore)
})

test('rider_lesson_detail_has_no_private_notes_section @rider', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/lessons`)
  const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
  const href = await firstLesson.getAttribute('href')
  if (!href) throw new Error(`no lesson link found on /barn/${barnSlug}/lessons — is seed data present?`)
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
    await page.goto(`/barn/${barnSlug}/finances`)
    await page.getByRole('link', { name: `By ${label}` }).click()
    await expect(page).toHaveURL(new RegExp(`tab=${param}`))
  })
}
