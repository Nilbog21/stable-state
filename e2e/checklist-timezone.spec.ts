import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const barnSlug = process.env.TEST_BARN_SLUG!
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Chosen to land well outside seed-test-barn.ts's seeded lessons (past(10)..future(5)
// days), so the direct-read query below can't collide with fixture data.
const target = new Date()
target.setDate(target.getDate() + 30)
const year = target.getFullYear()
const month = target.getMonth() + 1
const day = target.getDate()
const hour = 14 // 2:00 PM local
const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

test('lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock @manager', async ({ page }) => {
  await page.goto(`/barn/${barnSlug}/lessons/new`)

  await page.getByRole('checkbox', { name: 'Apollo' }).check()
  await page.locator('#rider_id').selectOption({ label: 'Test Rider' })
  await page.locator('#dh-date').fill(dateStr)
  await page.locator('#dh-hour').selectOption(String(hour))

  await page.getByRole('button', { name: 'Submit' }).click()
  await expect(page).toHaveURL(new RegExp(`/barn/${barnSlug}/lessons$`))

  // Mirrors DateHourPicker.tsx's own conversion — this checks the real
  // UI -> server action -> RPC -> storage pipeline against it, not a
  // re-derivation of the logic under test.
  const expectedIso = new Date(year, month - 1, day, hour).toISOString()

  const supabase = createClient(supabaseUrl, anonKey)
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: `manager@${barnSlug}.e2e`,
    password: 'TestPass123!',
  })
  if (authError) throw authError

  const { data: barn, error: barnError } = await supabase
    .from('barns')
    .select('id')
    .eq('slug', barnSlug)
    .single()
  if (barnError) throw barnError

  const { data: lessons, error: lessonsError } = await supabase
    .from('lessons')
    .select('lesson_at')
    .eq('barn_id', barn.id)
    .eq('lesson_at', expectedIso)
  if (lessonsError) throw lessonsError

  expect(lessons).toHaveLength(1)
})
