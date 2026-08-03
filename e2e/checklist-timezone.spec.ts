// covers: src/app/barn/[slug]/(protected)/lessons/new/**
// covers: src/app/barn/[slug]/(protected)/lessons/LessonForm.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/DateHourPicker.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/page.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/LessonListItem.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/[id]/page.tsx
import { test, expect, withBarn } from './support/test'
import { createClient } from '@supabase/supabase-js'
import { addHorse, addTier, daysFromNow, E2E_USERS, E2E_PASSWORD } from './support/fixtures'
import { BROWSER_TIMEZONE } from './support/timezone'
import { instantToLocalWallClock, wallClockToInstant } from '@/lib/barn-timezone'

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

// The wall clock this file's first test enters into the form, hoisted to module scope so the
// two display assertions after it can name the same values instead of re-deriving them.
//
// LESSON_DATE only has to name a day cell the calendar actually renders, so it is derived in
// the *browser's* zone — the grid the form test pages through runs there, and
// playwright.config.ts pins that zone while leaving the runner on the developer's own (#1221).
// Which instant the picked day+hour then becomes is a separate question, answered barn-locally
// by the form itself (#1222).
const LESSON_HOUR = 14
const LESSON_DATE = instantToLocalWallClock(daysFromNow(30, BROWSER_TIMEZONE), BROWSER_TIMEZONE).slice(0, 10)

// What the barn-local wall clock above must *render* as. Written out rather than run back
// through formatBarnDateTime deliberately: an expectation derived from the code under test
// agrees with any bug in it. The date half is formatted UTC-forced from LESSON_DATE — that
// string names a calendar day, not an instant — using the same Intl idiom the month-heading
// lookup below already uses.
const LESSON_HOUR_DISPLAY = '2:00 PM'
const LESSON_DISPLAY = `${new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${LESSON_DATE}T00:00:00Z`))}, ${LESSON_HOUR_DISPLAY}`

test('lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock @manager', async ({ page }) => {
  // The barn is seeded with no lessons at all, so the direct-read query below can only match
  // the one this test creates. See LESSON_HOUR/LESSON_DATE above for how the entered wall
  // clock is framed.
  const hour = LESSON_HOUR // 2:00 PM, entered as barn-local wall clock
  const dateStr = LESSON_DATE

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
  // re-derivation of the logic under test. #1222 moved that conversion off the
  // browser's zone and onto the *barn's*, so the mirror names the barn's zone.
  // The two genuinely differ here (barn Eastern by schema default vs. browser
  // Asia/Kolkata), which is what makes this assertion load-bearing.
  const expectedIso = wallClockToInstant(`${dateStr}T${String(hour).padStart(2, '0')}:00:00`, barn.data.barn.timezone).toISOString()

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

// The two display checks below depend on the lesson the test above creates, and are declared
// after it for that reason: Playwright keeps a file's tests in declaration order in one worker
// (fullyParallel: false), the same order-dependence checklist-phase4-members-list.spec.ts
// relies on. This barn is seeded with no lessons, so that one is the only card on the list.
//
// What makes them load-bearing rather than tautological is the zone spread: the browser
// context is pinned to Asia/Kolkata (#1221) while the barn is Eastern by schema default, and
// the runner host is on neither. A page still rendering in the device's zone — or the server
// host's — cannot produce the barn's wall clock by accident from any of the three.
test('lesson_list_shows_the_barn_local_wall_clock_time_entered_on_the_form @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await expect(page.locator('main ul li > a > span').first()).toHaveText(LESSON_DISPLAY)
})

test('lesson_detail_shows_the_same_barn_local_wall_clock_time @manager', async ({ page }) => {
  await page.goto(`/barn/${barn.slug}/lessons`)
  await page.locator('main ul li > a').first().click()
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons/[0-9a-f-]+$`), { waitUntil: 'commit' })
  const dateTimeRow = page.locator('dl > div').filter({ has: page.getByText('Date & Time', { exact: true }) })
  await expect(dateTimeRow.locator('dd')).toHaveText(LESSON_DISPLAY)
})
