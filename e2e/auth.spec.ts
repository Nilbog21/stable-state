import { test, expect } from '@playwright/test'

const barnSlug = process.env.TEST_BARN_SLUG!

test('should_land_on_barn_dashboard_when_authenticated @manager @trainer @rider', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}`)
  await expect(page).toHaveURL(new RegExp('/barn/' + barnSlug + '$'))
})
