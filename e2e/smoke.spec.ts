// covers: src/app/barn/[slug]/(protected)/**
// covers: src/app/profile/**
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addPaidLesson, addTier, daysFromNow } from './support/fixtures'

// One recent lesson enrolling the rider login — every role's lesson-detail assertion below
// reads the first link on /lessons, and a rider only sees lessons they're enrolled in.
const barn = withBarn('smoke', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  const horse = await addHorse(supabase, barn.id, 'Apollo')
  await addPaidLesson(supabase, barn, {
    at: daysFromNow(-2, barn.timezone),
    instructorId: members.trainer.membershipId,
    horseIds: [horse.id],
    riderIds: [members.rider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

// Suffixes onto /barn/<slug>, not absolute paths: the slug isn't resolved until beforeAll
// runs (it carries the Playwright project name — see support/test.ts), so it can't be baked
// into a module-scope table. `''` is the barn dashboard itself.
const BARN_ROUTES: Record<string, string[]> = {
  manager: ['', '/lessons', '/lessons/new', '/horses', '/members', '/finances', '/settings'],
  trainer: ['', '/lessons', '/lessons/new', '/horses', '/members'],
  rider: ['', '/lessons', '/horses'],
}

async function assertPageClean(page: Page, url: string) {
  const fivexx: string[] = []
  page.on('response', res => {
    if (res.status() >= 500) fivexx.push(`${res.url()} → ${res.status()}`)
  })
  await page.goto(url)
  // One site serving every route below, so it is the one worth stating in full. `not.toBeVisible`
  // is satisfied on its first poll (framework fact 18), and the poll right after a goto can land
  // before anything has rendered — a page that never drew would read as clean. Every route here
  // renders exactly one <h1>, and so does app/error.tsx ("Something went wrong"), which is what
  // makes this a *render* proof rather than a second copy of the claim: it settles either page,
  // and the assertion below is left to say which one arrived (spec-maintenance rule 4).
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByText('Something went wrong')).not.toBeVisible()
  expect(fivexx, `5xx on ${url}: ${fivexx.join(', ')}`).toHaveLength(0)
}

for (const [role, suffixes] of Object.entries(BARN_ROUTES)) {
  for (const suffix of suffixes) {
    // Named off the suffix, so the run-scoped slug never reaches a test name — otherwise every
    // run reports differently-named tests and --grep can't target one.
    const label = ('barn' + suffix).replace(/[\/-]/g, '_')
    test(`${role}_no_error_on_${label} @${role}`, async ({ page }) => {
      await assertPageClean(page, `/barn/${barn.slug}${suffix}`)
    })
  }

  test(`${role}_no_error_on_profile @${role}`, async ({ page }) => {
    await assertPageClean(page, '/profile')
  })

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
