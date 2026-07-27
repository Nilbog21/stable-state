import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addPaidLesson, addTier, daysFromNow } from './support/fixtures'

// One recent lesson enrolling the rider login — every role's lesson-detail assertion below
// reads the first link on /lessons, and a rider only sees lessons they're enrolled in.
const barn = withBarn('smoke', async ({ supabase, barn, members }) => {
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
})

const STATIC_ROUTES: Record<string, string[]> = {
  manager: [
    `/barn/${barn.slug}`,
    `/barn/${barn.slug}/lessons`,
    `/barn/${barn.slug}/lessons/new`,
    `/barn/${barn.slug}/horses`,
    `/barn/${barn.slug}/members`,
    `/barn/${barn.slug}/finances`,
    `/barn/${barn.slug}/settings`,
    `/profile`,
  ],
  trainer: [
    `/barn/${barn.slug}`,
    `/barn/${barn.slug}/lessons`,
    `/barn/${barn.slug}/lessons/new`,
    `/barn/${barn.slug}/horses`,
    `/barn/${barn.slug}/members`,
    `/profile`,
  ],
  rider: [
    `/barn/${barn.slug}`,
    `/barn/${barn.slug}/lessons`,
    `/barn/${barn.slug}/horses`,
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
    // The slug is run-scoped, so it's stripped out of the test name — otherwise every run
    // reports differently-named tests and --grep can't target one.
    const label = route.replace(barn.slug, 'barn').replace(/^\//, '').replace(/[\/-]/g, '_')
    const name = `${role}_no_error_on_${label} @${role}`
    test(name, async ({ page }) => {
      await assertPageClean(page, route)
    })
  }

  test(`${role}_no_error_on_lesson_detail @${role}`, async ({ page }) => {
    await page.goto(`/barn/${barn.slug}/lessons`)
    const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
    const href = await firstLesson.getAttribute('href')
    if (!href) throw new Error(`no lesson link found on /barn/${barn.slug}/lessons — is seed data present?`)
    await assertPageClean(page, href)
  })

  if (role === 'manager') {
    test(`${role}_no_error_on_lesson_edit @${role}`, async ({ page }) => {
      await page.goto(`/barn/${barn.slug}/lessons`)
      const firstLesson = page.locator(`a[href*="/lessons/"]:not([href$="/new"])`).first()
      const href = await firstLesson.getAttribute('href')
      if (!href) throw new Error(`no lesson link found on /barn/${barn.slug}/lessons — is seed data present?`)
      await assertPageClean(page, `${href}/edit`)
    })
  }
}
