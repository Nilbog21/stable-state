// covers: src/app/barn/[slug]/(protected)/horses/**
// covers: src/app/barn/[slug]/(protected)/documents/new/**
// covers: src/components/documents/**
//
// The horse detail page's Documents table through a trainer's eye: a seeded document listed
// with a link that actually serves its bytes, an upload of scripts/data/test_1_kb.pdf carrying
// a Reminder Date, and the three things the page withholds from a non-manager — no Actions
// column header, no Exhaustion Thresholds section, and a Reminder Date column that is text
// rather than an input.
//
// The five Phase 5 horse-document lines in checklists/pre-release/phase-5-trainer.md, from
// "Horse detail page lists documents with working links" through "The Reminder Date column there
// is **read-only**". #1330 filed them under the pre-#1358 monolith's line numbers and every
// heading below carried one; #1366 replaced those with the quoted fragments, which stay true
// across the renumberings a line number cannot survive. The tags themselves are what pin the
// mapping.
//
// ## Why two horses
//
// Willow holds the seeded document and is the subject of every line but the upload one — three
// of which read a table that must stay unambiguous. Rowan starts empty and takes the upload
// upload, so the uploaded row can never join Willow's table and make "the row for this file
// name" resolve to two things. The two names are mutually non-substring, and neither contains
// nor is contained by the four seeded member names (Playwright's text matching is
// substring-based). They are horses, not personas, so support/fixtures.ts's collision rule and
// #1258's claimed-name rule are not in play — no builder file is touched here.
//
// The seeded document is filed under a file name that is *not* test_1_kb.pdf for the same
// reason: the two rows live on different horses today, and a distinct name keeps them
// distinguishable if a later edit ever puts them on one.
//
// ## No serial block
//
// Four independent reads plus one write, and the write is to Rowan, whose only test is that
// write. Nothing here reads state another test left behind, of a barn this file owns outright.
import { test, expect, withBarn, type Page } from './support/test'
import type { Locator } from '@playwright/test'
import { addHorse, addHorseDocument, assetPath } from './support/fixtures'
import { settledTextContents } from './support/read'
import { barnToday } from '@/lib/barn-timezone'
import { addDays } from '@/lib/local-day'

const WILLOW = 'Willow'
const ROWAN = 'Rowan'

/** The seeded document's file name, and the asset the upload line names by path. */
const SEEDED_FILE_NAME = 'coggins_record.pdf'
const UPLOAD_ASSET = 'test_1_kb.pdf'

/**
 * The seeded object's bytes, passed to `addHorseDocument` rather than left on its default, so
 * The "documents with working links" body comparison is against what this spec put in — an
 * expected value the builder
 * returned, never a string the app produced.
 */
const SEEDED_CONTENT = Buffer.from('trainer horse document')

/** What `addDocument` uploads the object as, and therefore what a working signed URL serves. */
const PDF_CONTENT_TYPE = 'application/pdf'

/** The four headers a trainer's documents table renders — the whole list, Actions absent. */
const DOCUMENT_HEADERS = ['Type', 'Notes', 'Link', 'Reminder Date']
const REMINDER_DATE_HEADER = 'Reminder Date'

// Both dates are in the *barn's* frame, which is the only frame the page compares in
// (ReminderDueBadge takes barnToday(barn.timezone), never the runner's or the browser's clock).
// Both are in the future by a wide margin, so no badge renders and the reminder cell's whole
// text is the date itself — which is what lets the read-only Reminder Date line assert that
// text exactly. +30 and +45 keep
// a run straddling barn-local midnight on the same side of "due" for each.
//
// They differ from each other on purpose: an upload that silently dropped its reminder_date
// could otherwise be read back against the seeded horse's value and pass. Willow's is never a
// legal answer for Rowan's row.
let seededReminderDate = ''
let uploadedReminderDate = ''

let willowId: string
let rowanId: string

const barn = withBarn('phase5-horses-documents', async ({ supabase, barn }) => {
  willowId = (await addHorse(supabase, barn.id, WILLOW)).id
  rowanId = (await addHorse(supabase, barn.id, ROWAN)).id

  const today = barnToday(barn.timezone)
  seededReminderDate = addDays(today, 30)
  uploadedReminderDate = addDays(today, 45)

  await addHorseDocument(supabase, barn, willowId, {
    recordType: 'coggins',
    fileName: SEEDED_FILE_NAME,
    reminderDate: seededReminderDate,
    content: SEEDED_CONTENT,
  })
})

// ---------------------------------------------------------------------------
// Locators and helpers
// ---------------------------------------------------------------------------

const horseUrl = (horseId: string) => `/barn/${barn.slug}/horses/${horseId}`

/**
 * Both destinations as RegExp rather than Playwright's URL glob — `?` is a wildcard there rather
 * than the query separator the upload URL needs it to be (the reason #1197/#1201 give). The
 * upload URL is anchored, so the `&type=photo` variant of the same route cannot match it.
 */
const atHorseDetail = (horseId: string) => new RegExp(`/horses/${horseId}$`)
const atDocumentUpload = (horseId: string) => new RegExp(`/documents/new\\?entity=horse&id=${horseId}$`)

/**
 * The <section> owning a given h2 — the horse detail page is h2-partitioned.
 *
 * Scoped to <main> rather than the whole page: an unscoped `page.locator('section')` is not
 * exploitable on this page today, but #1324 (PR #1345) ruled the same unscoped shape needless
 * latent fragility one slice over and narrowed it there.
 */
function section(page: Page, heading: string) {
  return page.locator('main section').filter({ has: page.getByRole('heading', { name: heading, exact: true }) })
}

const documentsSection = (page: Page) => section(page, 'Documents')

/** The upload form, scoped to <main> so a dev overlay or a future layout can never join it. */
const uploadForm = (page: Page) => page.locator('main form')

/**
 * The submit button, located structurally rather than by its accessible name: the label is
 * `{pending ? 'Uploading…' : 'Upload'}`, and a non-exact name match would treat "Upload" as a
 * prefix of "Uploading…" — the same substring-containment trap #1202 recorded for fee text, in a
 * second place. (#1202 is the agreements slice; #1323 corrected this same miscitation once
 * already, in a comment copied from checklist-phase4-horses-documents.spec.ts, which is also
 * where this locator's shape comes from — deliberately copied rather than reinvented.)
 */
const submitButton = (page: Page) => uploadForm(page).locator('button[type="submit"]')

/** A document's row, addressed by the file-name link it contains. */
const documentRow = (page: Page, fileName: string) =>
  documentsSection(page).locator('tr').filter({ has: page.getByRole('link', { name: fileName, exact: true }) })

/**
 * That row's Reminder Date cell, resolved from the table's own header row rather than by a
 * hardcoded column index.
 *
 * The manager's version of this cell is found by the `input[type="date"]` it contains — the
 * exact thing the trainer's version must not have, so that locator would be unusable here and a
 * literal `nth(3)` would silently follow a column reorder onto the wrong cell. Reading the
 * position out of the `<th>` list makes the mapping the page's own, and it throws rather than
 * guessing if the header is gone.
 *
 * `settledTextContents` rather than `settledInnerTexts` because `Th` uppercases in CSS only, so
 * innerText reads the laid-out casing and not the label (support/read.ts).
 */
async function reminderDateCell(page: Page, fileName: string): Promise<Locator> {
  const headers = await settledTextContents(documentsSection(page).locator('th'))
  const column = headers.indexOf(REMINDER_DATE_HEADER)
  if (column < 0) throw new Error(`no ${REMINDER_DATE_HEADER} column in the documents table: ${headers.join(', ')}`)
  return documentRow(page, fileName).locator('td').nth(column)
}

/**
 * Reach the Add Document screen by *clicking through* from the horse page, never by goto.
 *
 * DocumentUploadForm's file handling runs in React — the size check in the input's own onChange,
 * `pending` from useActionState — so an unhydrated form has no handlers attached and submits as
 * a plain native POST. Arriving by a client-side navigation means the destination is rendered by
 * an already-running React root, so its handlers are attached before the first line of the test
 * body runs (#1197, and the same reasoning as
 * checklist-phase4-horses-documents.spec.ts's openAddDocument).
 *
 * Waits on the submit button rather than the Choose File one: `input[type="file"]` also carries
 * the button role and resolves to "Choose File" by accessible name, so that locator is a
 * strict-mode violation rather than a guard (#1197, measured).
 *
 * That the submit button can serve as the barrier at all is a fact about *this* origin page, not
 * a general one. `waitUntil: 'commit'` resolves on the URL flip while the page being left is
 * still mounted, so a `main form button[type="submit"]` barrier is vacuous wherever the origin
 * also renders a form — the soft-nav vacuity #1319 found and #1323 fixed on the member detail
 * page, whose delete-document button is a submit inside a <form>. The horse detail page renders
 * that same delete form, and HorseManagerForm, and HorseAccessSection — but every one of them is
 * gated on `role === 'manager'`, and the photo-remove and notes forms on `isOwner`. A trainer
 * viewing a horse it does not own therefore sees *no* form here, which is what makes this
 * barrier destination-only. A future test in this file that seeds trainer ownership would break
 * that, and would need the field-based barrier #1323 switched to.
 */
async function openAddDocument(page: Page, horseId: string): Promise<void> {
  await page.goto(horseUrl(horseId))
  await documentsSection(page).getByRole('link', { name: 'Add Document', exact: true }).click()
  await page.waitForURL(atDocumentUpload(horseId), { waitUntil: 'commit' })
  await submitButton(page).waitFor()
}

// ---------------------------------------------------------------------------
// "Horse detail page lists documents with working links"
// ---------------------------------------------------------------------------

// Narrowed, and pre-ratified rather than a deviation: "working links" is a target=_blank handoff
// to Chromium's PDF viewer, which is browser chrome outside the page, so the testable invariant
// is that the href the page rendered actually serves this document. Ruled the same way for the
// Phase 4 documents slice — checklist-phase4-horses-documents.spec.ts's
// `the_horse_document_signed_url_serves_the_stored_pdf`, which this mirrors.
//
// The "lists documents" half needs no separate assertion: `getAttribute` on a link that isn't
// there returns null and the throw below names it, so the read is only reached from a rendered
// row. The body is compared against the seeded bytes rather than merely being non-empty — that
// is the same claim at full strength and carries its own negative half, since matching this
// content excludes every other object in the bucket.
test('trainer_horse_document_link_serves_the_stored_pdf @trainer', async ({ page }) => {
  await page.goto(horseUrl(willowId))
  const href = await documentsSection(page)
    .getByRole('link', { name: SEEDED_FILE_NAME, exact: true })
    .getAttribute('href')
  if (!href) throw new Error(`no href on the ${SEEDED_FILE_NAME} document link`)

  const response = await page.request.get(href)
  expect({
    status: response.status(),
    contentType: response.headers()['content-type'],
    body: (await response.body()).toString(),
  }).toEqual({
    status: 200,
    contentType: PDF_CONTENT_TYPE,
    body: SEEDED_CONTENT.toString(),
  })
})

// ---------------------------------------------------------------------------
// "Uploading `scripts/data/test_1_kb.pdf` there works, including setting a Reminder Date"
// ---------------------------------------------------------------------------

// One test for one checkbox: the line's claim is a single indivisible interaction, and its two
// halves — the upload landing and the Reminder Date going with it — are both read off the row
// the redirect lands on. Read together in one expectation because the claim is their
// conjunction: a dropped reminder_date renders the cell as '—' and fails here, and a failed
// upload leaves no row for either read.
//
// The record type is left on the form's default. This line is about the upload and the reminder
// date; the select is the Phase 4 slice's subject, and choosing an option here would assert
// nothing this line claims.
//
// test.slow() because the whole round trip — a file through the dev server and up to storage,
// then the redirect and a re-render — is paid inside this one test.
test('trainer_uploading_a_horse_document_with_a_reminder_date_lists_it @trainer', async ({ page }) => {
  test.slow()
  await openAddDocument(page, rowanId)
  await uploadForm(page).locator('input[name="reminder_date"]').fill(uploadedReminderDate)
  await page.setInputFiles('input[type="file"]', assetPath(UPLOAD_ASSET))
  await submitButton(page).click()
  await page.waitForURL(atHorseDetail(rowanId), { waitUntil: 'commit' })

  const cell = await reminderDateCell(page, UPLOAD_ASSET)
  await cell.waitFor()
  expect({
    links: await documentsSection(page).getByRole('link', { name: UPLOAD_ASSET, exact: true }).count(),
    reminderDate: (await cell.innerText()).trim(),
  }).toEqual({ links: 1, reminderDate: uploadedReminderDate })
})

// ---------------------------------------------------------------------------
// "That documents table has **no Actions column at all**"
// ---------------------------------------------------------------------------

// The claim is about the column *header*, not about its buttons, so the `<th>` list is the
// subject. Asserted as the whole list rather than as "Actions has count 0" for two reasons: an
// equality over all four headers is simultaneously the negative and its own positive control —
// a section locator gone wrong reads `[]` and fails rather than supplying a passing zero (which
// `settledTextContents`' wait already guarantees) — and it fails for a header appearing
// anywhere in the row, not only for one spelled "Actions".
test('trainer_documents_table_has_no_actions_column_header @trainer', async ({ page }) => {
  await page.goto(horseUrl(willowId))

  expect(await settledTextContents(documentsSection(page).locator('th'))).toEqual(DOCUMENT_HEADERS)
})

// ---------------------------------------------------------------------------
// "The horse detail page shows **no Exhaustion Thresholds section**"
// ---------------------------------------------------------------------------

// The absence is paired with a presence in the same read, and the pairing is what makes it
// falsifiable: `Exhaustion` (the section a trainer *does* get — resolveExhaustionThresholds
// never returns null, so it always renders for a non-rider) is found by the same locator
// machinery that reports zero for `Exhaustion Thresholds`. So a heading locator that had simply
// stopped working fails this test rather than satisfying it.
//
// `exact: true` on both is load-bearing rather than tidy: without it "Exhaustion" matches the
// thresholds heading too and the two counts stop distinguishing anything.
test('trainer_horse_detail_page_shows_no_exhaustion_thresholds_section @trainer', async ({ page }) => {
  await page.goto(horseUrl(willowId))
  const exhaustion = page.getByRole('heading', { name: 'Exhaustion', exact: true })
  await exhaustion.waitFor()

  expect({
    exhaustion: await exhaustion.count(),
    thresholds: await page.getByRole('heading', { name: 'Exhaustion Thresholds', exact: true }).count(),
  }).toEqual({ exhaustion: 1, thresholds: 0 })
})

// ---------------------------------------------------------------------------
// "The Reminder Date column there is **read-only**"
// ---------------------------------------------------------------------------

// "Read-only" is asserted as the absence of the control a manager gets: the manager branch
// renders ReminderDateCell, whose entire editable surface is one `input[type="date"]`, and the
// trainer branch renders the date as text. Scoped to the cell rather than the page, so an input
// elsewhere on the page neither creates nor hides a failure.
//
// The text half is the vacuity guard. A cell locator that resolved to nothing would report zero
// inputs just as happily, and `innerText` on it would throw rather than return a falsy default —
// but reading the seeded date back also pins that the column renders its *value*, not an empty
// read-only shell. Willow's reminder date is in the future, so ReminderDueBadge renders null and
// the cell's whole text is the date.
test('trainer_reminder_date_column_is_read_only_text @trainer', async ({ page }) => {
  await page.goto(horseUrl(willowId))
  const cell = await reminderDateCell(page, SEEDED_FILE_NAME)
  await cell.waitFor()

  expect({
    inputs: await cell.locator('input').count(),
    text: (await cell.innerText()).trim(),
  }).toEqual({ inputs: 0, text: seededReminderDate })
})
