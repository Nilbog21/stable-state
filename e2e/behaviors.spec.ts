import { test, expect } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

// Runs a test only in the project matching its role (plus mobile for manager,
// mirroring smoke.spec.ts).
function skipUnless(role: string) {
  return (projectName: string) =>
    projectName !== role && !(projectName === 'mobile' && role === 'manager')
}

test('rider_redirected_from_new_lesson_page', async ({ page }, testInfo) => {
  test.skip(skipUnless('rider')(testInfo.project.name))
  await page.goto(`/barn/${barnSlug}/lessons/new`)
  await expect(page).toHaveURL(new RegExp(`/barn/${barnSlug}/lessons$`))
})

test('manager_by_trainer_pill_sets_filter_param', async ({ page }, testInfo) => {
  test.skip(skipUnless('manager')(testInfo.project.name))
  await page.goto(`/barn/${barnSlug}/lessons`)
  await page.getByRole('link', { name: 'By Trainer' }).click()
  await expect(page).toHaveURL(/filter=trainer/)
})

test('older_lessons_hidden_until_toggle_clicked', async ({ page }, testInfo) => {
  test.skip(skipUnless('manager')(testInfo.project.name))
  await page.goto(`/barn/${barnSlug}/lessons`)
  const lessonLinks = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`)
  const visibleBefore = await lessonLinks.count()
  await page.getByRole('button', { name: 'Show older lessons' }).click()
  await expect.poll(() => lessonLinks.count()).toBeGreaterThan(visibleBefore)
})

test('rider_lesson_detail_has_no_private_notes_section', async ({ page }, testInfo) => {
  test.skip(skipUnless('rider')(testInfo.project.name))
  await page.goto(`/barn/${barnSlug}/lessons`)
  const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
  const href = await firstLesson.getAttribute('href')
  if (!href) throw new Error(`no lesson link found on /barn/${barnSlug}/lessons — is seed data present?`)
  await page.goto(href)
  await expect(page.getByText('Private', { exact: true })).toHaveCount(0)
})

test('manager_finance_tabs_update_tab_param', async ({ page }, testInfo) => {
  test.skip(skipUnless('manager')(testInfo.project.name))
  await page.goto(`/barn/${barnSlug}/finances`)
  for (const tab of ['Horse', 'Rider', 'Trainer']) {
    await page.getByRole('link', { name: `By ${tab}` }).click()
    await expect(page).toHaveURL(new RegExp(`tab=${tab.toLowerCase()}`))
  }
})
