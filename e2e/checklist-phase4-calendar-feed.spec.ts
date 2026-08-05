// covers: src/app/profile/**
// covers: src/app/calendar.ics/**
//
// The #1018 calendar feed end to end, as a manager: the Calendar Feed section on the
// barn-scoped profile page, minting a link, copying it, what the resulting `/calendar.ics`
// URL serves to an unauthenticated subscriber, and rotation invalidating the old URL
// (checklists/pre-release/phase-4-manager-verification.md 607-615).
//
// `src/lib/ics.ts` and `src/lib/db/calendar-feed.ts` are deliberately NOT declared above:
// `select-specs.sh`'s ALWAYS_FULL already carries the whole of `src/lib/**` (and, since #1281,
// `src/components/**`, which is where Button lives), so a change to either already selects every
// spec and a glob here would be dead weight duplicating that. Note #1281 also retired the rule
// that per-spec declarations stay pure `src/app/` route globs — a glob under an always-full
// prefix is now kept where it states something true about what the spec drives.
//
// ---------------------------------------------------------------------------
// Three things about this file that are load-bearing rather than stylistic
// ---------------------------------------------------------------------------
//
// 1. THE `.ics` PAYLOAD IS UTC AND THE BARN IS NOT, AND THAT IS CORRECT.
//    ARCHITECTURE.md's Timezone convention names `/calendar.ics` as the single sanctioned
//    exception to "times are barn times" — RFC 5545 UTC `DTSTART`/`DTEND` is right for the
//    format, because the subscriber's calendar client converts. Nothing here should be
//    "fixed" toward barn-local rendering.
//
//    So both lessons are seeded at barn-local 21:00. The barn's zone is the schema default
//    `America/New_York`, where 21:00 is 01:00Z the NEXT calendar day under EDT and 02:00Z the
//    next day under EST. The two frames therefore disagree on the DATE component, not merely
//    the hour, in every season — a `DTSTART` that rendered barn-local would differ from the
//    expectation below by a whole day, and the assertion cannot pass because two zones
//    happened to coincide on the day it was written.
//
// 2. THE FEED'S EVENT ORDER IS NOT STABLE. `get_calendar_feed` aggregates with `jsonb_agg`
//    over a `UNION ALL` and no `ORDER BY` anywhere, so the VEVENT order in the payload is
//    whatever the planner produced. Every read below locates a block by UID or compares a
//    sorted set; nothing indexes into the payload.
//
// 3. THE FETCHES ARE GENUINELY UNAUTHENTICATED, AND GETTING THERE TAKES MORE THAN IT LOOKS.
//    Checklist line 799 is "open that URL directly (or `curl` it)", and `/calendar.ics` has
//    no auth check at all — the token IS the credential — so "a subscriber with no session
//    can read this" is the item's whole claim rather than a detail of how it is fetched.
//
//    Measured, because two of the three obvious ways to do it are wrong:
//      - the `request` FIXTURE carries `sb-<ref>-auth-token` (global-setup.ts writes the
//        project's storageState as a cookie, and the fixture inherits it);
//      - `playwright.request.newContext()` with NO options carries it TOO — the test runner
//        pushes `use.storageState` into it, so "a fresh context" is not a fresh session;
//      - only `newContext({ storageState: { cookies: [], origins: [] } })` is empty, and its
//        GET of `/profile` lands on `/login` where the other two land on `/profile`.
//    `unauthenticatedRequest` below is that third form, and throws if it ever stops being it.
import type { APIRequestContext, PlaywrightWorkerArgs } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { addTier, addHorse, addPaidLesson, addUnpaidLesson, daysFromNow, E2E_USERS } from './support/fixtures'
import type { Lesson } from '@/lib/db/types'

// One horse per lesson, and the horse name is the only term that differs between the two ICS
// SUMMARY lines asserted below — both lessons carry the same rider, so if these two were equal
// the summary half of that assertion would stop distinguishing the lessons at all.
const COMET = 'Comet'
const ZEPHYR = 'Zephyr'

/**
 * Barn-local 21:00 — see note 1 in the file header. Never change this to a daytime hour
 * without re-deriving the expectations: at 14:00 barn-local the UTC instant lands on the same
 * calendar day and the date axis stops discriminating.
 */
const LESSON_TIME = '21:00'

/**
 * `get_calendar_feed` titles a normal lesson `Lesson - <rider initials>, <horses>`, where the
 * initials are `first_name || ' ' || left(last_name, 1) || '.'`. Rebuilt from `E2E_USERS`
 * rather than written out as `Test R.`: the rider's name belongs to the fixture, and the
 * convention is that nothing a fixture owns gets hardcoded into an expectation.
 *
 * `escapeIcsText` escapes the literal comma to `\,` (RFC 5545 §3.3.11), so the RAW payload line
 * carries the backslash — that escaping is part of what this expectation checks.
 */
const RIDER = E2E_USERS.rider
const summaryFor = (horse: string) => `Lesson - ${RIDER.firstName} ${RIDER.lastName[0]}.\\, ${horse}`

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}'

/** The manager's own lesson — instructor is the manager membership, so this one IS "your own". */
let managerLesson: Lesson
/**
 * Instructed by the trainer, on the other horse. The calling manager is neither its instructor
 * nor one of its riders, so `get_calendar_feed`'s `r.role = 'manager'` branch is the ONLY term
 * that admits it — which is what makes line 801's "not just your own" a real claim rather than
 * a restatement of line 800.
 */
let trainerLesson: Lesson

const barn = withBarn('calendar-feed', async ({ supabase, barn, members }) => {
  const tier = await addTier(supabase, barn.id, { name: 'Feed Tier', price: 60, isDefault: true })
  const comet = await addHorse(supabase, barn.id, COMET)
  const zephyr = await addHorse(supabase, barn.id, ZEPHYR)

  managerLesson = await addPaidLesson(supabase, barn, {
    at: daysFromNow(3, barn.timezone),
    time: LESSON_TIME,
    instructorId: members.manager.membershipId,
    horseIds: [comet.id],
    riderIds: [members.rider.membershipId],
    fee: 60,
    tierName: tier.name,
  })

  trainerLesson = await addUnpaidLesson(supabase, barn, {
    at: daysFromNow(4, barn.timezone),
    time: LESSON_TIME,
    instructorId: members.trainer.membershipId,
    horseIds: [zephyr.id],
    riderIds: [members.rider.membershipId],
    fee: 60,
    tierName: tier.name,
  })
})

function profileUrl(): string {
  return `/profile?barn=${barn.slug}`
}

function uidFor(lesson: Lesson): string {
  return `lesson-${lesson.id}@stablestate.app`
}

// ---------------------------------------------------------------------------
// The copied URLs, and the guard that keeps a stale one from failing quietly
// ---------------------------------------------------------------------------

type CopiedLink = { url: string; barnId: string }

let firstCopy: CopiedLink | null = null
let secondCopy: CopiedLink | null = null

/**
 * A failing test restarts the Playwright worker, which re-runs `beforeAll` and seeds a BRAND
 * NEW barn — same slug (the run prefix is stable), different barn id, and the old membership
 * row carrying the copied token is gone. A URL captured before that restart then 404s, and
 * every downstream test fails for that reason rather than for its own claim: #1190's fifth
 * blind spot, arriving from the fixture side.
 *
 * Comparing the barn ID rather than the slug is what detects it — `barnSlugFor` reproduces the
 * same slug on the new run, so a slug comparison would see nothing.
 */
function liveCopy(copy: CopiedLink | null, which: string): string {
  if (!copy) throw new Error(`no ${which} calendar URL was captured — the lifecycle chain above must run first`)
  if (copy.barnId !== barn.data.barn.id) {
    throw new Error(
      `the ${which} calendar URL belongs to a torn-down barn (${copy.barnId} != ${barn.data.barn.id}) — ` +
        'a worker restart re-seeded underneath it; re-run the whole spec file'
    )
  }
  return copy.url
}

// ---------------------------------------------------------------------------
// Reading the clipboard
// ---------------------------------------------------------------------------

/**
 * Chromium needs `clipboard-read` granted on the context before `navigator.clipboard.readText`
 * resolves; `clipboard-write` is granted alongside so the component's own `writeText` can
 * never be the thing that fails. The acceptance criteria ask for exactly this rather than an
 * assertion on the "Copied!" toast — the toast is the app agreeing with itself.
 *
 * "Copied!" is still the guard, because it is set only after `writeText` RESOLVES, so it is
 * the app's own signal that the clipboard is populated. Its 2000 ms revert window is ~50x the
 * settle latency #1199 measured for comparable state flips (37-46 ms), so the poll cannot miss
 * it in practice.
 */
async function copyCalendarLink(page: Page): Promise<string> {
  await page.getByRole('button', { name: 'Copy Link', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Copied!', exact: true })).toBeVisible()
  return page.evaluate(() => navigator.clipboard.readText())
}

/**
 * A copied feed URL, obtained from scratch — this is what makes the payload block below
 * independent of the lifecycle chain rather than a silent downstream of it.
 *
 * The `Get my calendar link` branch is a resilience path, not the normal one: the lifecycle
 * chain mints the token first, so on a clean run the button is already `Copy Link`. It fires
 * only when a worker restart has re-seeded the barn underneath this file, which is exactly the
 * case that used to turn three payload tests into guard failures.
 */
async function copyFreshCalendarLink(page: Page, context: { grantPermissions: (p: string[]) => Promise<void> }) {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto(profileUrl())
  // Guard on the SECTION, not on either button — `count()` does not retry, and a read landing
  // before render returns 0, silently skipping the click and leaving `copyCalendarLink` to time
  // out on a `Copy Link` that will never appear. That is precisely the re-seeded case this
  // branch exists for, so the branch would fail in the shape it was written to prevent. The
  // heading renders whichever button is showing, so the guard stays branch-agnostic.
  await expect(page.getByRole('heading', { name: 'Calendar Feed', exact: true })).toBeVisible()
  const getLink = page.getByRole('button', { name: 'Get my calendar link', exact: true })
  if (await getLink.count()) await getLink.click()
  return copyCalendarLink(page)
}

/** Anchored on the page's own origin, so the assertion covers the host as well as the path. */
function calendarUrlPattern(page: Page): RegExp {
  const origin = new URL(page.url()).origin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${origin}/calendar\\.ics\\?token=${UUID}$`)
}

// ---------------------------------------------------------------------------
// The unauthenticated subscriber
// ---------------------------------------------------------------------------

// Playwright's own type, not a hand-rolled shape: an options bag typed as bare `object` would
// let a typo'd `storageState` key type-check, and that key is the one thing note 3 says must
// never silently regress. The throw below is then belt-and-braces rather than the only defence.
type PlaywrightFixture = PlaywrightWorkerArgs['playwright']

async function unauthenticatedRequest(playwright: PlaywrightFixture): Promise<APIRequestContext> {
  // The explicit empty storageState is the whole point — see note 3. Dropping it silently
  // re-authenticates every fetch below.
  const context = await playwright.request.newContext({ storageState: { cookies: [], origins: [] } })
  // A precondition on the test's validity, not one of this file's nine assertions: if this
  // context ever started carrying a session, every 404/200 below would be measuring something
  // other than what line 799 claims. Throws rather than asserts, for that reason.
  const cookies = (await context.storageState()).cookies
  if (cookies.length > 0) {
    throw new Error(
      `the subscriber request context must carry no session; it has ${cookies.length} cookie(s): ` +
        cookies.map((c) => c.name).join(', ')
    )
  }
  return context
}

async function fetchFeed(playwright: PlaywrightFixture, url: string) {
  const context = await unauthenticatedRequest(playwright)
  try {
    const response = await context.get(url)
    return { status: response.status(), headers: response.headers(), body: await response.text() }
  } finally {
    await context.dispose()
  }
}

// ---------------------------------------------------------------------------
// Reading the RFC 5545 payload
// ---------------------------------------------------------------------------

/**
 * `buildIcsFeed` folds any content line over 75 octets onto a continuation line beginning with
 * a single space (RFC 5545 §3.1). Nothing this spec reads folds — the longest is `UID:` at 63
 * octets, and the DESCRIPTION lines reach only 66-68 — so the only line that actually folds in
 * this fixture is `X-WR-CALNAME`, whose barn name carries the long run-prefixed slug. None of
 * them is read, and a folded continuation could not be mistaken for a property line anyway,
 * because it always starts with that space.
 */
function payloadLines(body: string): string[] {
  return body.split('\r\n')
}

function veventBlocks(body: string): string[][] {
  const blocks: string[][] = []
  let current: string[] | null = null
  for (const line of payloadLines(body)) {
    if (line === 'BEGIN:VEVENT') current = []
    else if (line === 'END:VEVENT') {
      if (current) blocks.push(current)
      current = null
    } else if (current) current.push(line)
  }
  return blocks
}

function property(block: string[], name: string): string {
  const line = block.find((l) => l.startsWith(`${name}:`))
  // Throws rather than returning undefined: a block that lost the property must fail loudly
  // here, not compare `undefined` against a string somewhere downstream.
  if (line === undefined) throw new Error(`no ${name} in VEVENT block:\n${block.join('\n')}`)
  return line.slice(name.length + 1)
}

function allUids(body: string): string[] {
  return veventBlocks(body).map((block) => property(block, 'UID'))
}

/** Located by UID, never by index — see note 2 in the file header. */
function veventFor(body: string, uid: string): { uid: string; dtstart: string; dtend: string; summary: string } {
  const block = veventBlocks(body).find((b) => property(b, 'UID') === uid)
  if (!block) throw new Error(`no VEVENT with UID ${uid} among [${allUids(body).join(', ')}]`)
  return {
    uid: property(block, 'UID'),
    dtstart: property(block, 'DTSTART'),
    dtend: property(block, 'DTEND'),
    summary: property(block, 'SUMMARY'),
  }
}

/**
 * The UTC form RFC 5545 wants: `20260808T010000Z`. Built by string surgery on `toISOString()`
 * rather than by reading calendar fields, so it is zone-free by construction — and it is the
 * conversion under test, done explicitly, not inherited from anything the app computes.
 *
 * Worked example, EDT: a lesson seeded at 21:00 barn-local on 2026-08-07 is stored as
 * 2026-08-08T01:00:00+00:00, so DTSTART is `20260808T010000Z` — the NEXT calendar day.
 */
function icsUtc(instant: string): string {
  return new Date(instant).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** `buildEventLines` sets DTEND = DTSTART + `durationMinutes`; the RPC hardcodes 60 for a lesson. */
function plusMinutes(instant: string, minutes: number): string {
  return new Date(new Date(instant).getTime() + minutes * 60_000).toISOString()
}

// ---------------------------------------------------------------------------
// 795 — the section itself. Independent of the token lifecycle below, so it is deliberately
// outside the serial chain: it needs nothing from it and can prove nothing for it.
// ---------------------------------------------------------------------------

/**
 * Counts the Calendar Feed section on `url`, after waiting on the ProfileForm heading that
 * both URLs render — so the zero half is read from a settled document rather than from a page
 * that had not rendered yet.
 */
async function calendarSectionCount(page: Page, url: string): Promise<number> {
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'Edit Profile', exact: true })).toBeVisible()
  return page.getByRole('heading', { name: 'Calendar Feed', exact: true }).count()
}

test('the_barn_scoped_profile_page_shows_a_calendar_feed_section @manager', async ({ page }) => {
  // Both halves in one assertion. The section is gated on `activeMembershipForBarn`, which is
  // resolved from the `?barn=` param — so a page that rendered the section unconditionally
  // (the superset render) satisfies the positive half alone and is caught only by the zero.
  const scoped = await calendarSectionCount(page, profileUrl())
  const unscoped = await calendarSectionCount(page, '/profile')

  expect({ scoped, unscoped }).toEqual({ scoped: 1, unscoped: 0 })
})

// ---------------------------------------------------------------------------
// 796-798, 802-803 — the link lifecycle. Genuinely sequential: the token has to not exist,
// then exist, then be copied, then be rotated, and each step is the next one's precondition.
// ---------------------------------------------------------------------------

test.describe.serial('the calendar feed link', () => {
  test('getting_the_calendar_link_reveals_a_copy_link_button @manager', async ({ page }) => {
    await page.goto(profileUrl())
    const getLink = page.getByRole('button', { name: 'Get my calendar link', exact: true })
    const copyLink = page.getByRole('button', { name: 'Copy Link', exact: true })
    // The seeded membership's `calendar_feed_token` is NULL, so this button is the state under
    // test rather than a fixture: nothing below is seeded into the "has a link" state, and the
    // reveal is paid for with the real interaction.
    await expect(getLink).toBeVisible()

    const before = await copyLink.count()
    await getLink.click()
    await expect(copyLink).toBeVisible()
    const after = await copyLink.count()

    expect({ before, after }).toEqual({ before: 0, after: 1 })
  })

  test('a_regenerate_button_sits_alongside_copy_link @manager', async ({ page }) => {
    await page.goto(profileUrl())
    const section = page
      .locator('section')
      .filter({ has: page.getByRole('heading', { name: 'Calendar Feed', exact: true }) })
    // Full-set equality rather than two containment checks: "alongside" is a claim about what
    // the section holds, and a third button appearing is as much a regression as a missing one.
    // Asserting the order is safe here and only here — these two are fixed JSX siblings, not
    // rows out of a query.
    //
    // `toHaveText` on the array, never a bare `allInnerTexts()` (CLAUDE.md, #1243): the one-shot
    // read does not retry, so an unrendered section yields `[]` and an assertion that accepts it
    // passes on nothing. This matcher auto-retries, so it is its own settle guard as well as the
    // assertion — which is why there is no separate `toBeVisible()` above it.
    await expect(section.getByRole('button')).toHaveText(['Copy Link', 'Regenerate'])
  })

  test('copying_the_calendar_link_yields_a_calendar_ics_token_url @manager', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(profileUrl())

    const url = await copyCalendarLink(page)
    firstCopy = { url, barnId: barn.data.barn.id }

    // Anchored full-string, not a substring: `toContain('/calendar.ics?token=')` is satisfied
    // by a URL with a trailing anything, an empty token, or the wrong host.
    expect(url).toMatch(calendarUrlPattern(page))
  })

  test('regenerating_the_calendar_link_issues_a_different_token @manager', async ({ page, context }) => {
    const before = liveCopy(firstCopy, 'first')
    await context.grantPermissions(['clipboard-read', 'clipboard-write'])
    await page.goto(profileUrl())

    const regenerate = page.getByRole('button', { name: 'Regenerate', exact: true })
    const action = page.waitForResponse(
      (response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/profile'
    )
    await regenerate.click()
    await action
    // `handleRegenerate` sets the new token and clears `pending` in the same continuation, so
    // React commits both in one render: the button being interactive again means the token
    // state has already advanced. Purely a synchronisation point.
    await expect(regenerate).toBeEnabled()

    const after = await copyCalendarLink(page)
    secondCopy = { url: after, barnId: barn.data.barn.id }

    // Inequality alone is the fourth vacuity shape wearing a disguise: an empty clipboard, a
    // truncated URL and a dropped token all satisfy "different". The shape half closes it.
    expect({ matchesShape: calendarUrlPattern(page).test(after), sameAsBefore: after === before }).toEqual({
      matchesShape: true,
      sameAsBefore: false,
    })
  })

  test('the_pre_regenerate_calendar_url_stops_working @manager', async ({ playwright }) => {
    const stale = liveCopy(firstCopy, 'first')
    const current = liveCopy(secondCopy, 'second')

    const staleResponse = await fetchFeed(playwright, stale)
    const currentResponse = await fetchFeed(playwright, current)

    // The 200 is the 404's positive control, in the same test: it proves the route compiled,
    // the server is up and this fetch path reaches it, so the 404 is the token being dead
    // rather than anything else about the request being wrong.
    expect({ stale: staleResponse.status, current: currentResponse.status }).toEqual({ stale: 404, current: 200 })
  })
})

// ---------------------------------------------------------------------------
// 799-801 — what the subscriber actually receives. Not serial, and each test copies its OWN
// link rather than reading one the chain above left behind.
//
// The first draft did share that state, and the mutation sweep is what condemned it: mutating
// a single test in the lifecycle chain skipped the rest of that chain, so the URL these three
// read was never captured and all three failed on the staleness guard — three ✘ marks that
// had not reached their assertions at all (#1203's confounding, from the fixture side). Three
// mutations were reported as unproven and re-run against this shape instead.
//
// Copying per test is also closer to what lines 799-801 say: "that URL" is the one you get by
// tapping Copy Link, which is exactly what `copyFreshCalendarLink` does.
// ---------------------------------------------------------------------------

test.describe('the calendar feed payload', () => {
  test('the_calendar_feed_url_serves_a_text_calendar_response @manager', async ({ page, context, playwright }) => {
    const response = await fetchFeed(playwright, await copyFreshCalendarLink(page, context))

    // Full-string on the header, and the status alongside it — a 404 body would otherwise be
    // free to carry any content type it liked.
    expect({ status: response.status, contentType: response.headers['content-type'] }).toEqual({
      status: 200,
      contentType: 'text/calendar; charset=utf-8',
    })
  })

  test('the_calendar_feed_body_carries_a_vevent_for_a_barn_lesson @manager', async ({ page, context, playwright }) => {
    const response = await fetchFeed(playwright, await copyFreshCalendarLink(page, context))

    // BOTH entries, because line 800 says "entries" — asserting one lesson would have been a
    // silent narrowing of the line rather than a ratified one. Each block is located by UID and
    // then placed in this array by the test, so the comparison order is the test's own and does
    // not depend on the payload's (see note 2).
    //
    // Every expected value is derived from the seeded lesson's own row, and the four DTs are the
    // barn-local-to-UTC conversion done explicitly — see note 1. The two lessons sit on
    // different days, so this is two independent conversions rather than one repeated.
    expect([
      veventFor(response.body, uidFor(managerLesson)),
      veventFor(response.body, uidFor(trainerLesson)),
    ]).toEqual([
      {
        // The lookup key, so this field is documentation rather than a second check — the three
        // below it are what carry the claim.
        uid: uidFor(managerLesson),
        dtstart: icsUtc(managerLesson.lesson_at),
        dtend: icsUtc(plusMinutes(managerLesson.lesson_at, 60)),
        summary: summaryFor(COMET),
      },
      {
        uid: uidFor(trainerLesson),
        dtstart: icsUtc(trainerLesson.lesson_at),
        dtend: icsUtc(plusMinutes(trainerLesson.lesson_at, 60)),
        summary: summaryFor(ZEPHYR),
      },
    ])
  })

  test('the_calendar_feed_covers_lessons_from_every_instructor_in_the_barn @manager', async ({ page, context, playwright }) => {
    const response = await fetchFeed(playwright, await copyFreshCalendarLink(page, context))

    // Set equality over EVERY VEVENT, sorted — not containment, and not indexed. It
    // discriminates two distinct regressions with one assertion: collapse the manager branch
    // to the trainer's and the trainer-instructed lesson vanishes while the manager's own
    // survives; collapse it to the rider's and both vanish.
    expect(allUids(response.body).sort()).toEqual([uidFor(managerLesson), uidFor(trainerLesson)].sort())
  })
})
