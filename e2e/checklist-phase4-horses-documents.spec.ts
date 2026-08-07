// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/app/barn/[slug]/(protected)/page.tsx
// covers: src/app/barn/[slug]/(protected)/DocumentRemindersSection.tsx
// covers: src/components/documents/**
// covers: src/components/EmptyState.tsx
//
// The horse Documents section end to end: upload and redirect, the row appearing, the signed
// link and the bytes it serves, delete, the over-limit rejection and the two pending-upload
// affordances, and then the expiration reminder lifecycle — set on upload, edited inline,
// edited without a reload, driven past due, and surfacing as a Dashboard Reminders card that
// links back to the horse (checklists/pre-release/phase-4-manager-verification.md, the block from
// "Documents section: tap **Add Document**" through "That card links back to this horse").
//
// Four horses, because each block needs a starting state the others would destroy. Willow
// carries the upload → list → open → delete chain and must end empty. Rowan takes the two
// 4.4 MB pending-state uploads and the 4.6 MB rejection, so those large rows never crowd the
// others. Juniper must hold *exactly one* document for its whole chain — the reminder cell
// and the dashboard card are both located without a per-row disambiguator, and a second
// document on that horse would make either ambiguous or, worse, silently pick the wrong row.
// Marigold (#1283) holds the reminder-due boundary pair and nothing else, for the same reason
// in reverse: its two rows must be the only ones on that page whose dates sit on the cutoff.
//
// Four mutually non-substring names, deliberately: Playwright's text and accessible-name
// matching is substring-based, so an overlapping pair makes a filter for one silently match
// both.
import { createHash } from 'crypto'
import { readFileSync } from 'fs'
import type { Locator } from '@playwright/test'
import { test, expect, withBarn, type Page } from './support/test'
import { addHorse, addHorseDocument, assetPath, updateBarnSettings } from './support/fixtures'
import { waitForBarnPageHydrated } from './support/hydration'
import { accordionSection, openSection } from './support/accordion'
import { mustSucceed } from '@/lib/db/service-role'
import { BARN_TIMEZONES, barnToday, instantToLocalWallClock } from '@/lib/barn-timezone'
import { addDays } from '@/lib/local-day'
import type { SupabaseClient } from '@supabase/supabase-js'

// Seed inputs, not builder outputs — these are what the spec puts in, and what the horse
// detail page's own h1 and the dashboard card's owner name are read back as below.
const WILLOW = 'Willow'
const ROWAN = 'Rowan'
const JUNIPER = 'Juniper'
/** The fourth horse, added by #1283 — it owns the reminder-due boundary pair and nothing else. */
const MARIGOLD = 'Marigold'

// Every asset the checklist lines name, verbatim. The two large ones exist for exactly this
// slice: 4,600,000 bytes is over DocumentUploadForm's 4,500,000 limit and 4,400,000 is the
// largest accepted size (docs/scripts.md's asset table).
const TEST_PDF = 'test_1_kb.pdf'
const LARGEST_ACCEPTED_PDF = 'test_4_4_mb.pdf'
const OVER_LIMIT_PDF = 'test_4_6_mb.pdf'

/**
 * Juniper's document is filed as Coggins rather than left on the form's default.
 *
 * RECORD_TYPE_OPTIONS.horse[0] is `insurance_binder`, so a regression that ignored the
 * <select> entirely — or lost the hidden `record_type` input the controlled select feeds —
 * would still produce "Insurance Binder" and leave a test expecting the default green. Picking
 * the third option makes the dashboard card's middle segment a real reading of what was
 * chosen (#1196's design-time defence, applied to a select rather than to an ordering).
 */
const JUNIPER_RECORD_TYPE = { value: 'coggins', label: 'Coggins' }

/** The client-side over-limit message, from DocumentUploadForm's own file onChange. */
const OVER_LIMIT_MESSAGE = 'File exceeds 4.5 MB limit'

// en-US "MMM D, YYYY", which is what DocumentRemindersSection renders through formatShortDate.
// Restated here from a literal table rather than by importing that formatter: an expected value
// derived from the code under test agrees with any bug in it, and Intl is fenced off outside
// the date modules anyway (eslint.config.mjs).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function shortDate(day: string): string {
  const [year, month, date] = day.split('-')
  return `${MONTHS[Number(month) - 1]} ${Number(date)}, ${year}`
}

const digestOf = (bytes: Buffer | Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

// ---------------------------------------------------------------------------
// The barn-zone pin (#1283)
// ---------------------------------------------------------------------------

/**
 * The barn's own timezone, pinned to whichever `BARN_TIMEZONES` member currently sits furthest
 * from its *own* midnight.
 *
 * **Why the barn's zone and not `page.clock`.** #1252's idiom pins the browser's clock, and that
 * reaches only values the browser computes (e2e/CLAUDE.md fact 7). Every "today" this file
 * depends on is computed on the **server**: `ReminderDueBadge` takes `today` as a required prop
 * (#1149/#1223 — it is explicitly *not* defaulted to the viewer's clock), and `getDueDocuments`
 * takes the barn's day as its `lte` cutoff. A browser pin would therefore change nothing here
 * and would be green while doing nothing, which is precisely the #1204 failure mode the idiom
 * exists to prevent. The barn's `timezone` column is the one lever that does reach the server's
 * answer, and this spec owns its barn.
 *
 * **What the pin buys.** The boundary fixtures below are seeded relative to `barnToday` in
 * `beforeAll`, and the assertions read a page that recomputes `barnToday` per request. Those two
 * agree unless the run straddles barn-local midnight — and the boundary pair sits *exactly on*
 * that day, which is the only place `>` can be told from `>=` and `lte` from `lt`, and also the
 * only place a straddle flips an answer. Choosing the zone furthest from its own midnight turns
 * that from a race into a margin the guard below states in minutes.
 */
const PIN_NOW = new Date()

/** Minutes between `at` and the nearest midnight in `zone`, so 12:00 local reads 720 and 00:00 reads 0. */
function minutesFromBarnMidnight(zone: string, at: Date): number {
  const wall = instantToLocalWallClock(at, zone)
  const sinceMidnight = Number(wall.slice(11, 13)) * 60 + Number(wall.slice(14, 16))
  return Math.min(sinceMidnight, 24 * 60 - sinceMidnight)
}

const PINNED_ZONE = BARN_TIMEZONES.reduce<string>(
  (best, candidate) =>
    minutesFromBarnMidnight(candidate.value, PIN_NOW) > minutesFromBarnMidnight(best, PIN_NOW)
      ? candidate.value
      : best,
  BARN_TIMEZONES[0].value
)

/**
 * The floor the pin has to clear, and it is not arbitrary.
 *
 * `BARN_TIMEZONES` spans UTC−4 (EDT) to UTC−10, so at any instant the seven zones offer six
 * distinct local hours, and the worst UTC hour to be standing at is 07:xx — Eastern reads 03:xx
 * and Honolulu 21:xx, leaving a best available distance of about three hours. Two is therefore
 * under the worst case by a full hour and cannot fire spuriously today, while a future edit that
 * narrowed the zone list far enough to matter fails at collection instead of flaking one run in
 * a hundred.
 */
const MIN_MIDNIGHT_MARGIN_MINUTES = 120

/**
 * The pin's arithmetic, executable rather than written in a comment (#1252's `assertPinArithmetic`
 * shape, adopted here by #1283 — the throwing guard is the load-bearing half of that idiom, not
 * the pin: #1204's pin sat one axis away from the regression it existed to catch and only review
 * noticed).
 *
 * The second check looks redundant beside the first and is not the same claim. A margin of ≥120
 * minutes *implies* that ±120 minutes stays on one calendar day — as arithmetic. The check
 * asserts that `barnToday` and `minutesFromBarnMidnight` actually agree about it, which is the
 * part a helper change could break silently: they are two different readings of the same zone,
 * and only one of them is the one the app uses.
 */
function assertZonePinArithmetic(): void {
  const problems: string[] = []
  const margin = minutesFromBarnMidnight(PINNED_ZONE, PIN_NOW)
  if (margin < MIN_MIDNIGHT_MARGIN_MINUTES) {
    problems.push(
      `barn-local now in ${PINNED_ZONE} is ${margin} minutes from its own midnight, under the ` +
        `${MIN_MIDNIGHT_MARGIN_MINUTES}-minute floor — no BARN_TIMEZONES member is far enough from midnight.`
    )
  }
  const spanMs = MIN_MIDNIGHT_MARGIN_MINUTES * 60 * 1000
  const days = {
    behind: barnToday(PINNED_ZONE, new Date(PIN_NOW.getTime() - spanMs)),
    at: barnToday(PINNED_ZONE, PIN_NOW),
    ahead: barnToday(PINNED_ZONE, new Date(PIN_NOW.getTime() + spanMs)),
  }
  if (days.behind !== days.at || days.ahead !== days.at) {
    problems.push(
      `the barn day in ${PINNED_ZONE} is ${days.behind}/${days.at}/${days.ahead} at ` +
        `−${MIN_MIDNIGHT_MARGIN_MINUTES}min/now/+${MIN_MIDNIGHT_MARGIN_MINUTES}min. All three are ` +
        'expected to be equal: barnToday and minutesFromBarnMidnight disagree about this zone.'
    )
  }
  if (problems.length > 0) {
    throw new Error(`the barn-zone pin ${PINNED_ZONE} is misaimed:\n  ${problems.join('\n  ')}`)
  }
}
assertZonePinArithmetic()

let willowId: string
let rowanId: string
let juniperId: string
let marigoldId: string
/** Captured in the seed so the storage sweep and the storage-path read can't depend on `barn.data`. */
let seedClient: SupabaseClient | null = null
let seedBarnId = ''

// Four days on Juniper's one document, all in the *barn's* frame — ReminderDueBadge and
// getDueDocuments both compare against barnToday(barn.timezone), never the runner's or the
// browser's clock. ±30/45/60/3 keeps every one of them clear of a midnight boundary, so a run
// straddling barn-local midnight still sees the same side of "due" for each.
//
// `barnToday` is deliberately *not* an independent oracle here: it is the same call the horse
// detail page and getDueDocuments make, so a barnToday that resolved the wrong calendar day
// would shift the seed and the app together and these tests would still pass. That is the
// house frame rather than a gap in this slice — `fixtures.ts`'s own `daysFromNow` is built on
// the same function, and `src/lib/**` is in select-specs.sh's ALWAYS_FULL list, so a change to
// it runs the entire suite rather than this spec alone. The margins above bound what such a
// bug could hide to a misresolution of more than three days.
let uploadedReminderDate = ''
let editedReminderDate = ''
let softSavedReminderDate = ''
let pastReminderDate = ''

/**
 * Marigold's pair, and the only two dates in this file that sit *on* a boundary rather than
 * three-plus days clear of one.
 *
 * `ReminderDueBadge` renders unless `reminderDate > today`, and `getDueDocuments` filters
 * `lte('reminder_date', today)`. Both boundaries are inclusive, and both are invisible to every
 * other fixture here: at ±30/45/60/3 a `>=`-for-`>` or an `lt`-for-`lte` regression answers
 * exactly the same on all four. Only a document dated **today** can tell them apart, and only a
 * document dated **today + 1** proves the filter is a boundary rather than an unconditional
 * yes — which is why they are seeded as a pair rather than singly.
 *
 * These are what the zone pin above is for. Every other date in this file has three days of
 * slack against a midnight straddle; these have none by construction.
 */
let boundaryDueDate = ''
let boundaryNotDueDate = ''

/** Marigold's two rows. Free-form names — `addHorseDocument` uploads a small Buffer, not an asset
 *  off disk — and mutually non-substring, plus non-substring with the three real assets above. */
const BOUNDARY_DUE_PDF = 'boundary_due.pdf'
const BOUNDARY_NOT_DUE_PDF = 'boundary_clear.pdf'
/** Distinct from each other and from Juniper's Coggins, so a dashboard card names which row it is. */
const BOUNDARY_DUE_RECORD_TYPE = { value: 'shot_record', label: 'Shot Record' } as const
const BOUNDARY_NOT_DUE_RECORD_TYPE = { value: 'contract', label: 'Contract' } as const

const barn = withBarn('phase4-horses-documents', async ({ supabase, barn }) => {
  seedClient = supabase
  seedBarnId = barn.id

  // Before anything is seeded, so every date below — and every date the *pages* compute — is in
  // the pinned zone rather than the barn's default. `barn` is the object every builder reads its
  // timezone from, so the local copy is moved with the row (#1283).
  await updateBarnSettings(supabase, barn.id, { timezone: PINNED_ZONE })
  barn.timezone = PINNED_ZONE

  willowId = (await addHorse(supabase, barn.id, WILLOW)).id
  rowanId = (await addHorse(supabase, barn.id, ROWAN)).id
  juniperId = (await addHorse(supabase, barn.id, JUNIPER)).id
  marigoldId = (await addHorse(supabase, barn.id, MARIGOLD)).id

  const today = barnToday(barn.timezone)
  uploadedReminderDate = addDays(today, 30)
  editedReminderDate = addDays(today, 45)
  softSavedReminderDate = addDays(today, 60)
  pastReminderDate = addDays(today, -3)
  boundaryDueDate = today
  boundaryNotDueDate = addDays(today, 1)

  await addHorseDocument(supabase, barn, marigoldId, {
    recordType: BOUNDARY_DUE_RECORD_TYPE.value,
    fileName: BOUNDARY_DUE_PDF,
    reminderDate: boundaryDueDate,
  })
  await addHorseDocument(supabase, barn, marigoldId, {
    recordType: BOUNDARY_NOT_DUE_RECORD_TYPE.value,
    fileName: BOUNDARY_NOT_DUE_PDF,
    reminderDate: boundaryNotDueDate,
  })

  assertBoundaryPinArithmetic()
})

/**
 * The boundary pair's own arithmetic, run once the barn's zone has fixed what "today" means.
 *
 * Separate from `assertZonePinArithmetic` because it asserts a different thing: that one is
 * about the *margin* the pin buys, this one about the **separation the two tests below actually
 * discriminate**. A pair that drifted onto the same side of the cutoff — or a `boundaryDueDate`
 * that stopped being today exactly — would leave both of them green and asserting nothing about
 * `>` vs `>=` at all, which is the whole reason those two lines were uncovered before #1283.
 */
function assertBoundaryPinArithmetic(): void {
  const today = barnToday(PINNED_ZONE)
  const problems: string[] = []
  if (boundaryDueDate !== today) {
    problems.push(
      `the due side is ${boundaryDueDate}, expected the barn's own today (${today}). ` +
        'Off the boundary it no longer separates ReminderDueBadge\'s `>` from `>=`.'
    )
  }
  if (boundaryNotDueDate !== addDays(today, 1)) {
    problems.push(`the not-due side is ${boundaryNotDueDate}, expected ${addDays(today, 1)} — today + 1 exactly`)
  }
  if (!(boundaryDueDate <= today && boundaryNotDueDate > today)) {
    problems.push(
      `${boundaryDueDate}/${boundaryNotDueDate} do not straddle ${today}: the pair has to land on ` +
        'opposite sides of the cutoff, or the absence half is satisfied by a filter that returns nothing.'
    )
  }
  if (problems.length > 0) {
    throw new Error(`the reminder-due boundary pair is misaimed:\n  ${problems.join('\n  ')}`)
  }
}

// ---------------------------------------------------------------------------
// Locators and helpers
// ---------------------------------------------------------------------------

const horseUrl = (horseId: string) => `/barn/${barn.slug}/horses/${horseId}`

/**
 * Both destinations, as RegExp rather than Playwright's URL glob — `?` is a wildcard there
 * rather than the query separator the upload URL needs it to be (same reason #1197/#1201 give).
 * The upload URL is anchored, so the `&type=photo` variant of the same route cannot match it.
 */
const atHorseDetail = (horseId: string) => new RegExp(`/horses/${horseId}$`)
const atDocumentUpload = (horseId: string) => new RegExp(`/documents/new\\?entity=horse&id=${horseId}$`)

/** The <section> owning a given h2 — the dashboard is h2-partitioned. */
function section(page: Page, heading: string) {
  return page.locator('section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

/**
 * The horse detail page's Documents section, which is an `AccordionSection` since #1390 rather
 * than a `<section>` — see `support/accordion.ts`. Reaching it always means opening it first:
 * every read below goes through `gotoHorseDocuments`.
 */
const documentsSection = (page: Page) => accordionSection(page, 'Documents')
const remindersSection = (page: Page) => section(page, 'Reminders')

/** Land on a horse's page with Documents expanded. */
async function gotoHorseDocuments(page: Page, horseId: string) {
  await page.goto(horseUrl(horseId))
  await openSection(page, 'Documents')
}

/** The upload form, scoped to <main> so a dev overlay or a future layout can never join it. */
const uploadForm = (page: Page) => page.locator('main form')

/**
 * The submit button, located structurally rather than by its accessible name.
 *
 * Not decoration: the label is `{pending ? 'Uploading…' : 'Upload'}`, so a name locator stops
 * matching at exactly the moment the "Upload button disables while the upload is pending" and
 * "indeterminate progress bar shows while that upload is pending" lines need it — and a
 * *non-exact* name match would
 * match "Uploading…" as a substring of nothing and "Upload" as a prefix of it, which is the
 * containment hazard #1202 found, live in this form.
 */
const submitButton = (page: Page) => uploadForm(page).locator('button[type="submit"]')

/**
 * The form's File field — its own child div, located by the file input it contains.
 *
 * The over-limit message is a bare <p> with no role, so it can only be reached structurally.
 * Located by the field rather than by the message's own text: a locator built from the string
 * it then asserts proves nothing.
 */
const fileField = (page: Page) =>
  uploadForm(page).locator('> div').filter({ has: page.locator('input[type="file"]') })

/** A document's row, addressed by the file-name link it contains. */
const documentRow = (page: Page, fileName: string) =>
  documentsSection(page).locator('tr').filter({ has: page.getByRole('link', { name: fileName, exact: true }) })

/** That row's Reminder Date cell — the <td> holding the date input, which is what "next to the date" means. */
const reminderDateCell = (page: Page, fileName: string) =>
  documentRow(page, fileName).locator('td').filter({ has: page.locator('input[type="date"]') })

const reminderDateInput = (page: Page, fileName: string) =>
  reminderDateCell(page, fileName).locator('input[type="date"]')

/**
 * Reach the Add Document screen by *clicking through* from the horse page, never by goto.
 *
 * Three of this file's assertions are about client state — the over-limit rejection, the
 * disabled submit button and the progress bar — and every one of them needs a hydrated form.
 * DocumentUploadForm's size check runs in the file input's React onChange, and `pending` comes
 * from useActionState; an unhydrated form has no onChange attached and submits as a native
 * POST with no pending state at all, so a goto would race hydration and fail in the *quiet*
 * direction on the rejection test (no error rendered, no crash either). Arriving by a
 * client-side navigation means the destination is rendered by an already-running React root,
 * so its handlers are attached before the first line of the test body runs (#1197).
 *
 * Waits on the submit button rather than the Choose File one: `input[type="file"]` also carries
 * the button role and resolves to "Choose File" by accessible name, so that locator is a
 * strict-mode violation rather than a guard (#1197, measured).
 */
async function openAddDocument(page: Page, horseId: string): Promise<void> {
  // Add Document is the accordion's headerExtra, which sits inside the `<details>` and so is
  // genuinely hidden until it opens (#1390) — the same measured behaviour
  // checklist-phase4-barn-timezone.spec.ts's openBarnEventsSection relies on.
  await gotoHorseDocuments(page, horseId)
  await documentsSection(page).getByRole('link', { name: 'Add Document', exact: true }).click()
  await page.waitForURL(atDocumentUpload(horseId), { waitUntil: 'commit' })
  await submitButton(page).waitFor()
}

/**
 * Choose a file and submit, returning the submit button so a caller can assert on it mid-flight.
 *
 * test.slow() lives here rather than on the individual tests so whichever test actually pays
 * for an upload gets the raised budget, including under a standalone `--grep` of one of them
 * (#1206 — moving it back onto the tests reintroduces a failure that only appears when a
 * downstream test is run alone). No explicit timeout anywhere below: every waitFor* defaults to
 * unbounded under actionTimeout: 0, so a number could only tighten it (#1211).
 */
async function chooseFileAndSubmit(page: Page, asset: string): Promise<Locator> {
  test.slow()
  const submit = submitButton(page)
  await page.setInputFiles('input[type="file"]', assetPath(asset))
  await submit.click()
  return submit
}

/** Choose, submit, and land back on the horse. */
async function uploadDocument(
  page: Page,
  horseId: string,
  opts: { asset: string; recordType?: string; reminderDate?: string }
): Promise<void> {
  if (opts.recordType) await uploadForm(page).locator('select').selectOption(opts.recordType)
  if (opts.reminderDate) await uploadForm(page).locator('input[name="reminder_date"]').fill(opts.reminderDate)
  await chooseFileAndSubmit(page, opts.asset)
  await page.waitForURL(atHorseDetail(horseId), { waitUntil: 'commit' })
}

/**
 * Type a new reminder date into the inline cell and blur it, waiting for the save to land.
 *
 * The wait is on the server action's own POST rather than on anything rendered, because
 * nothing rendered changes for a future date: ReminderDateCell holds `value` in React state,
 * so the cell shows the new date the instant it is typed whether or not it ever saved. Without
 * this the reload in the caller would race — and win — against an action still in flight.
 * Registered before the blur, since the response can arrive first.
 *
 * The hydration gate leads, because everything below it is a no-op until React is listening.
 * It lives here rather than at each `goto` so no caller can forget it.
 */
async function setReminderDate(page: Page, fileName: string, horseId: string, day: string): Promise<void> {
  // Measured, and it cost this slice a debugging round: immediately after `page.goto` the
  // reminder cell's `<input>` is present and fully actionable, yet the element carries no React
  // props at all — its `onBlur` appears about three seconds later. Inside that window `fill()`
  // moves the DOM value and `blur()` reaches no handler, so the save never runs and no request
  // is ever made. That is the quiet direction: every read the test can take is identical to a
  // correct pass, and the only trace is the POST that never arrives.
  //
  // The signal used to be this page's own ExhaustionBar, until #1390 removed it — and what
  // replaced it offers none: the accordions are native `<details>` (open before hydration), and
  // every field inside them is `useState`-seeded from a server prop, which is e2e/CLAUDE.md fact
  // 13's byte-identical case. `waitForBarnPageHydrated` drives the nav bar's avatar popover
  // instead: same React root, so the same proof one level out, and a control this file never
  // asserts on, so the retry writes nothing.
  await waitForBarnPageHydrated(page)
  const input = reminderDateInput(page, fileName)
  await input.fill(day)
  const saved = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith(`/horses/${horseId}`)
  )
  await input.blur()
  await saved
}

/** A horse's single document's storage path, read service-role — storage shape, never an expected UI value. */
async function storedDocumentPath(horseId: string): Promise<string> {
  if (!seedClient) throw new Error('no seeded service client')
  const row = mustSucceed<{ storage_path: string }>(
    await seedClient.from('horse_documents').select('storage_path').eq('horse_id', horseId).single(),
    'read horse document storage path'
  )
  return row.storage_path
}

// ---------------------------------------------------------------------------
// Willow: upload -> listed -> opened by signed URL -> deleted
// ---------------------------------------------------------------------------

// Serial: every step starts from the state its predecessor left behind, which is the
// checklist's own framing ("That document is listed…", "Delete it →…"). Safe because this file
// owns its barn.
test.describe.serial('a horse document', () => {
  // This chain ends with the document *deleted*, and that is the one state teardown cannot
  // reach: teardownBarnData removes storage by reading `storage_path` off the rows, and the
  // Delete has just removed the row. The object's only deletion is deleteHorseDocumentAction's
  // own best-effort `removeFile(...).catch(() => {})`, so if that ever regressed the bucket
  // would accumulate one orphan per run, per Playwright project, with every test still green —
  // the spec would be relying on the behaviour under test to clean up after itself (#1197).
  //
  // Swept by prefix rather than by a captured path, so it holds however the chain ended: a
  // mid-chain failure that leaves the document in place is covered by the same call. A
  // describe-scoped afterAll runs before the file-scoped one withBarn registers, so this
  // happens while the barn still exists.
  test.afterAll(async () => {
    if (!seedClient || !seedBarnId || !willowId) return
    const prefix = `${seedBarnId}/horses/${willowId}`
    const { data, error } = await seedClient.storage.from('documents').list(prefix)
    if (error) throw new Error(`list Willow document objects: ${error.message}`)
    const paths = (data ?? []).map((object) => `${prefix}/${object.name}`)
    if (paths.length === 0) return
    const { error: removeError } = await seedClient.storage.from('documents').remove(paths)
    if (removeError) throw new Error(`remove orphaned Willow document objects: ${removeError.message}`)
  })

  // Asserted on content that exists only on the destination rather than on the URL: the App
  // Router commits pushState only after the RSC payload lands, so a URL read can pass before
  // the landing (fleet ruling, #1196). The upload screen's own h1 is "Add Document — Willow",
  // so an `exact` "Willow" heading is false there and true here — which makes it a render proof
  // rather than a heading that happens to exist on both pages. uploadDocument's waitForURL
  // supplies the identity half; this supplies liveness.
  test('uploading_a_horse_document_redirects_back_to_the_horse_page @manager', async ({ page }) => {
    await openAddDocument(page, willowId)
    await uploadDocument(page, willowId, { asset: TEST_PDF })

    await expect(page.getByRole('heading', { name: WILLOW, exact: true })).toBeVisible()
  })

  test('the_uploaded_horse_document_is_listed_in_the_documents_section @manager', async ({ page }) => {
    await gotoHorseDocuments(page, willowId)
    await expect(documentsSection(page).getByRole('link', { name: TEST_PDF, exact: true })).toBeVisible()
  })

  // Narrowed (standing ruling 1): "open the document via its link" is a target=_blank handoff to
  // Chromium's PDF viewer, which is browser chrome outside the page. The invariant underneath is
  // that the href the page rendered is a *signed URL over this document's own stored object* —
  // identity, which the test below pairs with liveness. Both halves are asserted together
  // because a signed URL for the wrong object is exactly as broken as an unsigned one.
  //
  // The storage path is read service-role: it is storage shape, and the expected *rendered*
  // value is still the page's own href. Read through `.single()`, which throws unless Willow has
  // exactly one document, so a chain that uploaded twice can't quietly compare the wrong row.
  test('the_horse_document_link_is_a_signed_url_for_its_stored_object @manager', async ({ page }) => {
    const storagePath = await storedDocumentPath(willowId)

    await gotoHorseDocuments(page, willowId)
    const href = await documentsSection(page)
      .getByRole('link', { name: TEST_PDF, exact: true })
      .getAttribute('href')
    if (!href) throw new Error(`no href on the ${TEST_PDF} document link`)
    const url = new URL(href)

    expect({ path: url.pathname, signed: url.searchParams.has('token') }).toEqual({
      path: `/storage/v1/object/sign/documents/${storagePath}`,
      signed: true,
    })
  })

  // Narrowed to the shape this batch pre-ratified (#1201, and this issue's own acceptance
  // criteria): Chromium's PDF viewer is outside the page, so "renders with no failed-to-load
  // error" becomes the signed URL actually serving the file. Asserted by SHA-256 of the response
  // body rather than by "non-zero bytes" — that is the same claim at full strength, and it
  // carries its own negative half, since matching this asset's digest excludes every other.
  // The expected digest comes from the committed file, never from the app.
  test('the_horse_document_signed_url_serves_the_stored_pdf @manager', async ({ page }) => {
    await gotoHorseDocuments(page, willowId)
    const href = await documentsSection(page)
      .getByRole('link', { name: TEST_PDF, exact: true })
      .getAttribute('href')
    if (!href) throw new Error(`no href on the ${TEST_PDF} document link`)

    const response = await page.request.get(href)
    expect({
      status: response.status(),
      contentType: response.headers()['content-type'],
      digest: digestOf(await response.body()),
    }).toEqual({
      status: 200,
      contentType: 'application/pdf',
      digest: digestOf(readFileSync(assetPath(TEST_PDF))),
    })
  })

  // The empty-state wait is this test's vacuity guard, and it is chosen because it is satisfiable
  // only *after* the deletion — a guard that could be satisfied by pre-existing content would let
  // the count read fire before the revalidate landed (#1194). It also sits inside the Documents
  // section, so a section locator gone wrong fails here rather than supplying a passing zero.
  //
  // The row assertion itself is left as a count of zero rather than folded into the guard: this
  // line's claim is the row's disappearance, and a mutation of it must go to a count the DOM can
  // never reach (2), never to 1 — 1 is transiently true between the click and the revalidate,
  // which is exactly the mutation that survived on #1201.
  test('deleting_a_horse_document_removes_its_row @manager', async ({ page }) => {
    await gotoHorseDocuments(page, willowId)
    await documentsSection(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await documentsSection(page).getByText('No documents yet', { exact: true }).waitFor()

    await expect(documentsSection(page).getByRole('link', { name: TEST_PDF, exact: true })).toHaveCount(0)
  })
})

// ---------------------------------------------------------------------------
// Rowan: the Add Document screen's size limit and its two pending affordances
// ---------------------------------------------------------------------------

// Not serial and not chained — each of the three reaches the upload screen for itself, and the
// two large uploads leave rows on Rowan that nothing here reads. Rowan rather than Willow so
// those rows can't disturb the `.single()` read above, and rather than Juniper so they can't
// make its reminder row ambiguous.
test.describe('the horse document upload screen', () => {
  // The client-side accept="" filter is a file-picker hint that setInputFiles bypasses, so this
  // exercises the size check in the input's own onChange — the path a determined user reaches.
  // The message renders *inside the live form*, so its presence is simultaneously the "inline
  // error" half of the line and the "not a crash" half.
  test('an_over_limit_horse_document_is_rejected_inline @manager', async ({ page }) => {
    await openAddDocument(page, rowanId)
    await page.setInputFiles('input[type="file"]', assetPath(OVER_LIMIT_PDF))

    await expect(fileField(page).locator('p')).toHaveText(OVER_LIMIT_MESSAGE)
  })

  // 4.4 MB, the largest accepted size, is what the line names — and it is also what makes this
  // assertion and the progress-bar one below observable rather than races: the pending window is
  // the whole round trip of a 4.4 MB body through the dev server and up to storage.
  //
  // Measured rather than assumed, three consecutive runs: the window stays open for
  // **4358 / 4550 / 4393 ms**, while `toBeDisabled` resolves **38 / 42 / 37 ms** after the click
  // and the progress bar appears at **41 / 46 / 41 ms**. That is roughly a hundredfold margin, so
  // neither test is living near the edge of its window. Both matchers auto-retry, so a closed
  // window would fail rather than pass falsely — but a flaky failure is still a flake, and this
  // is the number that says it is not one. Recording it rather than the assumption, so a later
  // slice inheriting this shape can compare against a measurement instead of re-deriving it.
  //
  // The redirect is waited out rather than left in flight: uploadFile runs before createDocument,
  // so abandoning the request between them is how an object with no row is created.
  test('the_upload_button_disables_while_a_horse_document_uploads @manager', async ({ page }) => {
    await openAddDocument(page, rowanId)
    const submit = await chooseFileAndSubmit(page, LARGEST_ACCEPTED_PDF)

    await expect(submit).toBeDisabled()
    await page.waitForURL(atHorseDetail(rowanId), { waitUntil: 'commit' })
  })

  // `valueNow` is where this assertion's force is: an indeterminate progressbar is precisely one
  // carrying no aria-valuenow, and a determinate one would satisfy a bare existence check. The
  // waitFor is satisfiable only once the submit is in flight, so it is also the proof the form
  // resolved at all.
  //
  // `bars` is the weaker half and is kept only as an explicit record that one bar is expected —
  // it can never read 2, because `bar.waitFor()` above is strict and would have thrown first.
  test('an_indeterminate_progress_bar_shows_while_a_horse_document_uploads @manager', async ({ page }) => {
    await openAddDocument(page, rowanId)
    await chooseFileAndSubmit(page, LARGEST_ACCEPTED_PDF)

    const bar = uploadForm(page).locator('[role="progressbar"]')
    await bar.waitFor()
    const observed = { bars: await bar.count(), valueNow: await bar.getAttribute('aria-valuenow') }
    await page.waitForURL(atHorseDetail(rowanId), { waitUntil: 'commit' })

    expect(observed).toEqual({ bars: 1, valueNow: null })
  })
})

// ---------------------------------------------------------------------------
// Juniper: the reminder date, from upload through the dashboard card
// ---------------------------------------------------------------------------

// Serial, and it stays one block through the dashboard: the card exists only because the step
// four tests above it drove this document's reminder date into the past, which is the
// checklist's own framing ("A card for it shows up…").
test.describe.serial('a horse document reminder date', () => {
  test('an_uploaded_reminder_date_persists_in_the_reminder_date_column @manager', async ({ page }) => {
    await openAddDocument(page, juniperId)
    await uploadDocument(page, juniperId, {
      asset: TEST_PDF,
      recordType: JUNIPER_RECORD_TYPE.value,
      reminderDate: uploadedReminderDate,
    })

    await expect(reminderDateInput(page, TEST_PDF)).toHaveValue(uploadedReminderDate)
  })

  // The reload is the assertion, not scaffolding. ReminderDateCell keeps `value` in React state,
  // so the cell displays whatever was typed whether or not the action ever ran; only a fresh
  // server render can distinguish "saved" from "typed".
  test('editing_the_reminder_date_inline_saves_the_new_date @manager', async ({ page }) => {
    await gotoHorseDocuments(page, juniperId)
    await setReminderDate(page, TEST_PDF, juniperId, editedReminderDate)
    await page.reload()

    await expect(reminderDateInput(page, TEST_PDF)).toHaveValue(editedReminderDate)
  })

  // "Without a page reload" is asserted the only way that cannot be faked by a URL read: a value
  // planted on `window` survives ReminderDateCell's router.refresh() (an RSC fetch and a
  // re-render) and cannot survive a document load. The document-load count is the second,
  // independent half — the listener is attached after the goto has settled, so the page's own
  // initial load is not among the events it can see.
  //
  // `load` rather than `framenavigated`, and this was measured rather than assumed: the App
  // Router fires `framenavigated` for `router.refresh()` as well, so counting it reads exactly 1
  // on a perfectly soft save and fails this test for the single behaviour it exists to permit.
  // #1196 established `framenavigated` as the right instrument for proving a navigation *did*
  // happen; it is the wrong one for proving a document did *not* reload, because it does not
  // distinguish an RSC refresh from a document load. `load` fires only for the latter, which is
  // precisely the line's claim.
  //
  // `persisted` is read after a deliberate reload, and it is what stops the other two from being
  // a pair of true statements about nothing: a save that silently did nothing would leave the
  // marker intact and the load count at zero just as happily. All three are compared in one
  // expectation because the claim is their conjunction — no reload *and* it still saved.
  test('the_inline_reminder_date_edit_saves_without_a_page_reload @manager', async ({ page }) => {
    await gotoHorseDocuments(page, juniperId)
    await reminderDateInput(page, TEST_PDF).waitFor()

    const documentLoads: string[] = []
    const recordLoad = () => documentLoads.push(page.url())
    page.on('load', recordLoad)
    await page.evaluate(() => {
      ;(window as unknown as Record<string, string>).__noReloadMarker = 'planted'
    })

    await setReminderDate(page, TEST_PDF, juniperId, softSavedReminderDate)
    const observed = {
      marker: await page.evaluate(
        () => (window as unknown as Record<string, string | undefined>).__noReloadMarker ?? null
      ),
      documentLoads: documentLoads.length,
    }
    page.off('load', recordLoad)

    await page.reload()
    await reminderDateInput(page, TEST_PDF).waitFor()

    expect({ ...observed, persisted: await reminderDateInput(page, TEST_PDF).inputValue() }).toEqual({
      marker: 'planted',
      documentLoads: 0,
      persisted: softSavedReminderDate,
    })
  })

  // "Next to the date" is read as *inside the same cell*, which is what the page renders — the
  // badge and the date input are siblings in one <td>. Asserting the date alongside the badge is
  // what makes that structural claim rather than a page-wide "a badge exists somewhere", and
  // inputValue() throws rather than returning a falsy default if the cell failed to resolve, so
  // neither half can go vacuous.
  //
  // `badgesWhileFuture` is the negative half, and without it this test is vacuous in the way that
  // no mutation can reach: a ReminderDueBadge that ignored `reminderDate` entirely and always
  // rendered would satisfy every other assertion here, and nothing else in this file ever asserts
  // the badge's *absence* — the three tests above it all leave a future date and never look. So
  // the same locator is read on both sides of the boundary, in the same document: 0 while the
  // date is still `softSavedReminderDate` (today + 60), 1 once it is `pastReminderDate`. That
  // also makes it its own positive control (#1191) — an absence proven by a locator that is shown
  // to find the thing seconds later, rather than one that might simply be broken.
  //
  // The date input is waited for before the "before" read, so that read is an absence *in a
  // rendered cell* rather than the absence of a page that has not painted yet.
  //
  // Deliberately today − 3 rather than today exactly. Sitting on the boundary is the only way to
  // separate `reminderDate > today` from `>=` (and `getDueDocuments`' `lte` from `lt`), but it
  // reintroduces the midnight-straddle flake the seed comment above avoids, and pinning the clock
  // is #1252's ratified idiom rather than this slice's to invent (#1187 accepted the same
  // trade-off). Logged as a follow-up instead.
  test('a_past_reminder_date_shows_a_reminder_due_badge @manager', async ({ page }) => {
    await gotoHorseDocuments(page, juniperId)
    const cell = reminderDateCell(page, TEST_PDF)
    const badge = cell.getByText('Reminder Due', { exact: true })
    await cell.locator('input[type="date"]').waitFor()
    const badgesWhileFuture = await badge.count()

    await setReminderDate(page, TEST_PDF, juniperId, pastReminderDate)
    await badge.waitFor()

    expect({
      badgesWhileFuture,
      badges: await badge.count(),
      dateValue: await cell.locator('input[type="date"]').inputValue(),
    }).toEqual({ badgesWhileFuture: 0, badges: 1, dateValue: pastReminderDate })
  })

  // `count` is a real claim, not a formality: getDueDocuments is barn-wide across horse, trainer
  // and rider documents, and the only rows in this barn carrying a reminder date at all are
  // Juniper's (driven past due by the test above) and Marigold's boundary pair. Rowan's two 4.4 MB
  // uploads carry none. So the exact count is the whole filter asserted — including the half that
  // is an absence, since the not-due side of Marigold's pair is a row this section must *not*
  // reach (#1283).
  //
  // Two, therefore, and not one: #1283 added the pair, and `getDueDocuments` sorts ascending by
  // reminder date, so Juniper's today − 3 still leads and `.first()` still names it.
  //
  // The text is compared as a full string rather than by containment (#1202: Playwright's text
  // matching is substring-based), which pins the owner name, the record type and the date
  // together in the order the card renders them. Coggins rather than the form's default is what
  // makes the middle segment a reading of what was chosen; see JUNIPER_RECORD_TYPE.
  test('a_due_horse_document_shows_a_card_in_the_dashboard_reminders_section @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    const cards = remindersSection(page).getByRole('link')
    await cards.first().waitFor()

    expect({ count: await cards.count(), text: await cards.first().innerText() }).toEqual({
      count: 2,
      text: `${JUNIPER} — ${JUNIPER_RECORD_TYPE.label} — ${shortDate(pastReminderDate)}`,
    })
  })

  // The whole href list rather than one card's, which is what keeps the original claim's strength
  // now that #1283's boundary pair puts a second card in this section. The unqualified locator it
  // used to carry leant on Playwright's strict mode to fail if a second card ever appeared;
  // `.first()` would have been the weak repair, since it can no longer tell "links to Juniper"
  // from "links to Juniper and to something arbitrary". An exact array pins the count, the order
  // and both destinations as full strings, so it still says *which* horse each card points at.
  //
  // evaluateAll is one-shot, so the wait ahead of it is what stops it sampling an unpainted
  // section and reading `[]` — an empty array would otherwise satisfy nothing and pass nothing
  // (e2e/CLAUDE.md's rule; here the following toEqual would fail on it, but the wait is what
  // makes that a real read rather than a lucky one).
  test('the_dashboard_reminder_card_links_back_to_the_horse @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    const cards = remindersSection(page).getByRole('link')
    await cards.first().waitFor()

    const hrefs = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('href')))
    expect(hrefs).toEqual([horseUrl(juniperId), horseUrl(marigoldId)])
  })
})

// ---------------------------------------------------------------------------
// Marigold: the reminder-due boundary, on both sides (#1283)
// ---------------------------------------------------------------------------

// Not serial and not chained: both tests read a pair seeded at the boundary and neither mutates
// anything. They are the two halves of one cutoff — the badge's `reminderDate > today` and
// getDueDocuments' `lte('reminder_date', today)` — and each is asserted with its own absence
// beside it, in the same document, so neither can go vacuous the way a presence-only check can.
test.describe('the reminder-due boundary', () => {
  // Both sides in one comparison, because "the cutoff includes today" is a single claim and its
  // halves are only meaningful together: the presence alone is satisfied by a badge that ignores
  // `reminderDate` entirely, and the absence alone by a badge that never renders. Read in one
  // document off two rows of the same table, so the two readings cannot be of different states.
  //
  // The dates are asserted alongside, for the reason the past-date test above gives: inputValue()
  // throws rather than returning a falsy default if a cell fails to resolve, so a mislocated row
  // fails here instead of quietly contributing a zero to the absence half.
  test('a_reminder_date_of_today_is_due_and_the_next_day_is_not @manager', async ({ page }) => {
    await gotoHorseDocuments(page, marigoldId)
    const dueCell = reminderDateCell(page, BOUNDARY_DUE_PDF)
    const notDueCell = reminderDateCell(page, BOUNDARY_NOT_DUE_PDF)
    const badge = (cell: Locator) => cell.getByText('Reminder Due', { exact: true })
    await notDueCell.locator('input[type="date"]').waitFor()
    await badge(dueCell).waitFor()

    expect({
      dueBadges: await badge(dueCell).count(),
      notDueBadges: await badge(notDueCell).count(),
      dueDate: await dueCell.locator('input[type="date"]').inputValue(),
      notDueDate: await notDueCell.locator('input[type="date"]').inputValue(),
    }).toEqual({
      dueBadges: 1,
      notDueBadges: 0,
      dueDate: boundaryDueDate,
      notDueDate: boundaryNotDueDate,
    })
  })

  // The dashboard half of the same cutoff, and a different filter: the badge is a client-side
  // comparison in ReminderDueBadge, this is `lte('reminder_date', today)` inside getDueDocuments.
  // An `lt` there would drop the today-dated card while leaving Juniper's past-dated one — which
  // is exactly why the assertion is the *set* of card texts rather than a hasText on one.
  //
  // Full strings rather than containment, so `Marigold — Shot Record — <today>` cannot be
  // satisfied by the Contract row that must not be here.
  //
  // Narrowed to Marigold's own cards rather than asserting the whole section, deliberately: the
  // only other card there is Juniper's, and it exists only because a test in the serial block
  // above drove that document's date into the past. Asserting the full list would make this test
  // fail under `--grep` for a reason that has nothing to do with the boundary. Filtering a list
  // already read is not the conditional this file's helpers avoid — an empty result still fails
  // the comparison, which is the case the narrowing has to stay honest about.
  test('the_dashboard_reminders_section_includes_a_document_due_today_and_excludes_tomorrows @manager', async ({ page }) => {
    await page.goto(`/barn/${barn.slug}`)
    const cards = remindersSection(page).getByRole('link')
    await cards.first().waitFor()

    const texts = await cards.evaluateAll((els) => els.map((el) => el.textContent ?? ''))
    expect(texts.filter((text) => text.startsWith(MARIGOLD))).toEqual([
      `${MARIGOLD} — ${BOUNDARY_DUE_RECORD_TYPE.label} — ${shortDate(boundaryDueDate)}`,
    ])
  })
})
