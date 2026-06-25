import { test, expect, type Page } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

const STATIC_ROUTES: Record<string, string[]> = {
  manager: [
    `/barn/${barnSlug}`,
    `/barn/${barnSlug}/lessons`,
    `/barn/${barnSlug}/lessons/new`,
    `/barn/${barnSlug}/horses`,
    `/barn/${barnSlug}/riders`,
    `/barn/${barnSlug}/finances`,
    `/barn/${barnSlug}/settings`,
    `/profile`,
  ],
  trainer: [
    `/barn/${barnSlug}`,
    `/barn/${barnSlug}/lessons`,
    `/barn/${barnSlug}/lessons/new`,
    `/barn/${barnSlug}/horses`,
    `/barn/${barnSlug}/riders`,
    `/profile`,
  ],
  rider: [
    `/barn/${barnSlug}`,
    `/barn/${barnSlug}/lessons`,
    `/barn/${barnSlug}/horses`,
    `/profile`,
  ],
}

async function assertPageClean(page: Page, url: string) {
  const fivexx: string[] = []
  page.on('response', res => {
    if (res.status() >= 500) fivexx.push(`${res.url()} → ${res.status()}`)
  })
  await page.goto(url)
  await expect(page.getByText('Something went wrong')).not.toBeVisible()
  expect(fivexx, `5xx on ${url}: ${fivexx.join(', ')}`).toHaveLength(0)
}

for (const [role, routes] of Object.entries(STATIC_ROUTES)) {
  for (const route of routes) {
    const name = `${role}_no_error_on_${route.replace(/^\//, '').replace(/[\/-]/g, '_')}`
    test(name, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== role && !(testInfo.project.name === 'mobile' && role === 'manager'))
      await assertPageClean(page, route)
    })
  }

  test(`${role}_no_error_on_lesson_detail`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== role && !(testInfo.project.name === 'mobile' && role === 'manager'))
    await page.goto(`/barn/${barnSlug}/lessons`)
    const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
    const href = await firstLesson.getAttribute('href')
    if (!href) throw new Error(`no lesson link found on /barn/${barnSlug}/lessons — is seed data present?`)
    await assertPageClean(page, href)
  })

  if (role === 'manager') {
    test(`${role}_no_error_on_lesson_edit`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== role && !(testInfo.project.name === 'mobile' && role === 'manager'))
      await page.goto(`/barn/${barnSlug}/lessons`)
      const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
      const href = await firstLesson.getAttribute('href')
      if (!href) throw new Error(`no lesson link found on /barn/${barnSlug}/lessons — is seed data present?`)
      await assertPageClean(page, `${href}/edit`)
    })
  }
}
