// covers: src/app/barn/[slug]/(protected)/lessons/new/**
// covers: src/app/barn/[slug]/(protected)/lessons/LessonForm.tsx
// covers: src/app/barn/[slug]/(protected)/lessons/LessonStartTime.tsx
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
// Which instant the picked day+time then becomes is a separate question, answered barn-locally
// by the form itself (#1222).
//
// "HH:MM", not an hour: #1021 made start times minute-granular, and :30 is what makes this
// file's pipeline assertion prove it. An hour-truncating picker — the pre-#1021 control, or any
// re-introduction of its `.slice(11, 13)` seed — stores :00 here and fails on the stored instant
// rather than only on the rendered string.
const LESSON_TIME = '14:30'
const LESSON_DATE = instantToLocalWallClock(daysFromNow(30, BROWSER_TIMEZONE), BROWSER_TIMEZONE).slice(0, 10)

// What the barn-local wall clock above must *render* as. Written out rather than run back
// through formatBarnDateTime deliberately: an expectation derived from the code under test
// agrees with any bug in it. The date half is formatted UTC-forced from LESSON_DATE — that
// string names a calendar day, not an instant — using the same Intl idiom the month-heading
// lookup below already uses.
const LESSON_TIME_DISPLAY = '2:30 PM'
const LESSON_DISPLAY = `${new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
}).format(new Date(`${LESSON_DATE}T00:00:00Z`))}, ${LESSON_TIME_DISPLAY}`

test('lesson_creation_stores_correct_utc_lesson_at_for_known_local_wall_clock @manager', async ({ page }) => {
  // The barn is seeded with no lessons at all, so the direct-read query below can only match
  // the one this test creates. See LESSON_TIME/LESSON_DATE above for how the entered wall
  // clock is framed.
  const time = LESSON_TIME // 2:30 PM, entered as barn-local wall clock
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

  // #1021 — the day panel now hosts the Start Time field, so it is always open and has no Close
  // button to dismiss. Filling the field is itself the proof the panel is showing: a `fill` on a
  // control inside a closed panel would fail rather than pass quietly.
  await page.locator('#lesson-start-time').fill(time)

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

  // Mirrors LessonStartTime.tsx's own conversion — this checks the real
  // UI -> server action -> RPC -> storage pipeline against it, not a
  // re-derivation of the logic under test. #1222 moved that conversion off the
  // browser's zone and onto the *barn's*, so the mirror names the barn's zone.
  // The two genuinely differ here (barn Eastern by schema default vs. browser
  // Asia/Kolkata), which is what makes this assertion load-bearing.
  const expectedIso = wallClockToInstant(`${dateStr}T${time}:00`, barn.data.barn.timezone).toISOString()

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

/**
 * #1021's own regression, at the edge the unit tests cannot reach: the whole UI -> action -> RPC
 * -> storage round trip on an EDIT that changes nothing.
 *
 * The pre-#1021 form seeded its hour from `lesson_at`'s hour alone and recombined at `:00`, so
 * this exact sequence — open Edit, touch nothing, Save — silently moved a 2:30 PM lesson to
 * 2:00 PM. The `:30` in LESSON_TIME is what gives the assertion teeth; against a whole-hour
 * fixture a truncating form passes it.
 *
 * Declared after the two reads above and dependent on the same created lesson (see their
 * comment on declaration order). It asserts on the STORED value rather than on rendered text:
 * a decode/re-encode that truncates is a data bug, and the rendered string is a weaker witness.
 */
test('resaving_the_edit_form_unchanged_preserves_the_lessons_minutes @manager', async ({ page }) => {
  const supabase = createClient(supabaseUrl, anonKey)
  const { error: authError } = await supabase.auth.signInWithPassword({
    email: E2E_USERS.manager.email,
    password: E2E_PASSWORD,
  })
  if (authError) throw authError

  const readLessons = async () => {
    const { data, error } = await supabase
      .from('lessons')
      .select('id, lesson_at')
      .eq('barn_id', barn.data.barn.id)
    if (error) throw error
    return data as { id: string; lesson_at: string }[]
  }

  // A precondition that throws, not an assertion: "unchanged" only means anything if the stored
  // value was the minute-granular one to begin with.
  const before = await readLessons()
  const expectedIso = wallClockToInstant(`${LESSON_DATE}T${LESSON_TIME}:00`, barn.data.barn.timezone).toISOString()
  if (before.length !== 1 || new Date(before[0].lesson_at).toISOString() !== expectedIso) {
    throw new Error(`precondition: expected exactly one lesson stored at ${expectedIso}, got ${JSON.stringify(before)}`)
  }

  // Straight to the edit URL rather than list -> detail -> Edit. Two fewer `waitUntil: 'commit'`
  // soft navigations is two fewer chances to read the page just left, and the id is already in
  // hand from the precondition above.
  await page.goto(`/barn/${barn.slug}/lessons/${before[0].id}/edit`)

  // Destination-only markup, and the value under test in one: `#lesson-start-time` exists only
  // on this form, so this doubles as the proof the page arrived and that the prefill survived
  // the decode without losing its minutes.
  await expect(page.locator('#lesson-start-time')).toHaveValue(LESSON_TIME)

  const submit = page.getByRole('button', { name: 'Save' })
  await submit.focus()
  await submit.press('Enter')
  await page.waitForURL(new RegExp(`/barn/${barn.slug}/lessons/[0-9a-f-]+$`), { waitUntil: 'commit' })

  // The redirect above is what keeps this from being a tautology: it proves the action ran and
  // succeeded, so "unchanged" cannot be satisfied by "the save never happened".
  expect(await readLessons()).toEqual(before)
})
