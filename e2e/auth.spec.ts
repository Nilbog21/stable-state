import { test, expect } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

test('lands on barn dashboard when authenticated', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  await expect(page).not.toHaveURL(/\/login/)
})
