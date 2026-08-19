// The dashboard day-view navigation helpers.
import type { Page } from '@playwright/test'

// Each click re-derives the "Next day" locator and waits for the URL's `date` param to
// actually advance before clicking again — it's a client-side transition on a server-rendered
// Link, so its href (and the page underneath it) don't update synchronously with the click.
// Firing clicks back-to-back races the same stale link and nets zero navigation.
export async function goToDaysAhead(page: Page, slug: string, days: number): Promise<void> {
  await page.goto(`/barn/${slug}`)
  for (let i = 0; i < days; i++) {
    const next = page.getByRole('link', { name: 'Next day' })
    const targetDate = new URL((await next.getAttribute('href'))!, page.url()).searchParams.get('date')
    await next.click()
    await page.waitForURL((url) => url.searchParams.get('date') === targetDate, { waitUntil: 'commit' })
  }
}
