import { test, expect, withBarn } from './support/test'

const barn = withBarn('auth')

test('should_land_on_barn_dashboard_when_authenticated @manager @trainer @rider', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}`)
  await expect(page).toHaveURL(new RegExp('/barn/' + barn.slug + '$'))
})
