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
    test(`${role}: no_error_on ${route}`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== role)
      await assertPageClean(page, route)
    })
  }

  test(`${role}: no_error_on lessons detail`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== role)
    await page.goto(`/barn/${barnSlug}/lessons`)
    const firstLesson = page.locator(`a[href*="/lessons/"]`).first()
    const href = await firstLesson.getAttribute('href')
    await assertPageClean(page, href!)
  })

  if (role === 'manager') {
    test(`${role}: no_error_on lessons edit`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== role)
      await page.goto(`/barn/${barnSlug}/lessons`)
      const firstLesson = page.locator(`a[href*="/lessons/"]`).first()
      const href = await firstLesson.getAttribute('href')
      await assertPageClean(page, `${href}/edit`)
    })
  }
}
