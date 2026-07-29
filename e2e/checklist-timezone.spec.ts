// covers: src/app/barn/[slug]/(protected)/lessons/new/**
// covers: src/app/barn/[slug]/(protected)/lessons/LessonForm.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/DateHourPicker.tsx
import { test, expect, withBarn } from './support/test'
import { createClient } from '@supabase/supabase-js'
import { addHorse, addTier, E2E_USERS, E2E_PASSWORD } from './support/fixtures'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
if (!supabaseUrl) throw new Error('NEXT_PUBLIC_SUPABASE_URL is required')
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
if (!anonKey) throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is required')

// The lesson form needs a horse to check and a default tier to price against; the rider it
// selects is the `rider` login, whose profile name is fixed by E2E_USERS.
const barn = withBarn('timezone', async ({ supabase, barn }) => {
  await addTier(supabase, barn.id, { name: 'Standard', price: 80, isDefault: true })
  await addHorse(supabase, barn.id, 'Apollo')
})

test('lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock @manager', async ({ page }) => {
  // The barn is seeded with no lessons at all, so the direct-read query below can only match
  // the one this test creates.
  const target = new Date()
  target.setDate(target.getDate() + 30)
  const year = target.getFullYear()
  const month = target.getMonth() + 1
  const day = target.getDate()
  const hour = 14 // 2:00 PM local
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  await page.goto(`/barn/${barn.slug}/lessons/new`)

  await page.getByRole('checkbox', { name: 'Apollo' }).check()
  await page.locator('#rider_id').selectOption({ label: `${E2E_USERS.rider.firstName} ${E2E_USERS.rider.lastName}` })

  // #1019 replaced this form's native date input with a month conflict calendar. The grid
  // opens on the current month and today+30 can fall past its last spill-over cell, so page
  // forward until the target month's heading is showing, then tap the day. Each day cell's
  // accessible name is its own "YYYY-MM-DD".
  const monthHeading = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${dateStr}T00:00:00Z`))
  // Bounded: today+30 is at most two months ahead, so this never needs more than two taps.
  for (let i = 0; i < 3 && !(await page.getByText(monthHeading, { exact: true }).isVisible()); i++) {
    await page.getByRole('button', { name: 'Next month' }).click()
  }
  await expect(page.getByText(monthHeading, { exact: true })).toBeVisible()
  await page.getByRole('button', { name: dateStr }).click()
  // Tapping a day also pops up that day's schedule; dismiss it so it can't overlay the form.
  await page.getByRole('button', { name: 'Close' }).click()

  await page.locator('#dh-hour').selectOption(String(hour))

  // Keyboard activation instead of a raw pointer .click(): Submit sits at the
  // bottom of a long scrollable form, the same shape that raced Chromium's
  // mobile scroll-into-view animation against Playwright's actionability
  // check in #501 (04c64505).
  const submit = page.getByRole('button', { name: 'Submit' })
  await submit.focus()
  await submit.press('Enter')
  // waitUntil: 'commit' (URL changed) rather than the default 'load' — under
  // Next dev-mode compile pressure the full load event can lag well past the
  // redirect itself actually completing.
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons$`), { waitUntil: 'commit' })

  // Mirrors DateHourPicker.tsx's own conversion — this checks the real
  // UI -> server action -> RPC -> storage pipeline against it, not a
  // re-derivation of the logic under test. Assumes the Playwright-launched
  // browser shares this Node process's local timezone — true here since
  // Chromium runs as a local subprocess, not a remote/differently-configured
  // browser, and no project pins a timezoneId.
  const expectedIso = new Date(year, month - 1, day, hour).toISOString()

  const supabase = createClient(supabaseUrl, anonKey)
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: E2E_USERS.manager.email,
    password: E2E_PASSWORD,
  })
  if (authError) throw authError

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('lesson_at')
    .eq('barn_id', barn.data.barn.id)
    .eq('lesson_at', expectedIso)
  if (lessonsError) throw lessonsError

  expect(lessons.length).toBe(1)
})
