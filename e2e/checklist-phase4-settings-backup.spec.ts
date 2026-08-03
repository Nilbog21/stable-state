// covers: src/app/barn/[slug]/(protected)/settings/**
//
// Manage Barn → Data Backup, both exports (PRE_RELEASE_TEST_CHECKLIST.md lines 721-734).
//
// Deliberately no `covers:` line for src/lib/db/backup.ts or document-backup.ts, the two
// modules that actually build these files: select-specs.sh lists the whole of src/lib/** in
// ALWAYS_FULL, so a change to either already selects every spec. A glob here would be dead
// weight duplicating that, and its own comment says per-spec declarations are route globs.
//
// The workbook is read back with exceljs and the archive with jszip — the two libraries the
// app itself builds them with (backup.ts moved off SheetJS in #1218), both already in
// package.json. No package is added.
//
// #1240 appends a second describe block of workbook-formatting assertions to this file. Two
// things here exist for it: downloadDataWorkbook() below is lazily memoized, so that block can
// call it and get this file's already-downloaded workbook without a second export — and still
// works standalone under --grep, where it downloads on demand; and sheetRows() is the reader
// most of those assertions want. Extend the withBarn seed below rather than seeding a second
// barn.
import { readFileSync } from 'fs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { test, expect, withBarn, type Page } from './support/test'
import {
  addHorse,
  addHorseDocument,
  addManagedMember,
  addPaidLesson,
  addStaffDocument,
  addTier,
  type SeededMember,
} from './support/fixtures'

// Seed inputs, not builder outputs — the archive's folder and file names are derived from
// these by the app, so naming them here is what keeps the assertions below free of loose
// literals.
const HORSE_NAME = 'Zephyr'
const HORSE_DOC = { fileName: 'coggins-record.pdf', recordType: 'coggins' } as const
const MANAGED_TRAINER = { firstName: 'Wren', lastName: 'Bexley' }
const STAFF_DOC = { fileName: 'instructor-contract.pdf', recordType: 'instructor_contract' } as const
const MANAGED_RIDER = { firstName: 'Sable', lastName: 'Quinn' }
const TIER = { name: 'Backup Slice', price: 60 }

const TRAINER_NAME = `${MANAGED_TRAINER.firstName} ${MANAGED_TRAINER.lastName}`
const RIDER_NAME = `${MANAGED_RIDER.firstName} ${MANAGED_RIDER.lastName}`

// The order buildBarnDataWorkbook adds them in, which is what "exactly 8 sheets" is claiming.
const EXPECTED_SHEETS = [
  'Horses',
  'Lessons',
  'Agreements',
  'Agreement Charges',
  'Horse Expenses',
  'Members',
  'Documents',
  'All Transactions',
]

const barn = withBarn('phase4-settings-backup', async ({ supabase, barn, members }) => {
  // One horse with one document — the horse/<name>/ folder in the archive, the Horses sheet
  // row, and (with the staff document below) what makes Download All Documents enabled at all.
  const horse = await addHorse(supabase, barn.id, HORSE_NAME)
  await addHorseDocument(supabase, barn, horse.id, HORSE_DOC)

  // A managed trainer stub of our own rather than the shared trainer login: the member/<name>/
  // folder is named from this profile, and the three e2e logins' profiles are global to the
  // Supabase project — shared with every slice running concurrently — so nothing barn-local
  // may be derived from them.
  const managedTrainer = await addManagedMember(supabase, barn.id, { ...MANAGED_TRAINER, role: 'trainer' })
  const trainerMember: SeededMember = {
    membershipId: managedTrainer.membershipId,
    profileId: managedTrainer.profileId,
    // addManagedMember never writes user_id, so the stub has none — which is the branch
    // addStaffDocument takes to key the storage path on the membership id instead.
    userId: null,
  }
  await addStaffDocument(supabase, barn, trainerMember, STAFF_DOC)

  // The lesson's rider, so the Lessons sheet's Riders cell names a member this barn owns.
  const managedRider = await addManagedMember(supabase, barn.id, { ...MANAGED_RIDER, role: 'rider' })

  // A tier whose name the lesson carries, so the Lessons sheet row has a stable identity that
  // isn't a date. Paid rather than unpaid so the All Transactions sheet has both a lesson_fee
  // and an instructor_payout row in it.
  const tier = await addTier(supabase, barn.id, { name: TIER.name, price: TIER.price })
  await addPaidLesson(supabase, barn, {
    monthsAgo: 0,
    instructorId: members.trainer.membershipId,
    horseIds: [horse.id],
    riderIds: [managedRider.membershipId],
    fee: tier.price,
    tierName: tier.name,
  })
})

// ---------------------------------------------------------------------------
// Page helpers
// ---------------------------------------------------------------------------

/** The Data Backup accordion. Its <h2> lives in the <summary>, so it is matchable while closed. */
function dataBackupSection(page: Page) {
  return page.locator('details').filter({ has: page.getByRole('heading', { name: 'Data Backup', exact: true }) })
}

/** Every section on this page renders as a closed <details>; the buttons are inside one. */
async function openDataBackup(page: Page) {
  await page.goto(`/barn/${barn.slug}/settings`)
  const section = dataBackupSection(page)
  await section.locator('summary').click()
  return section
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

/**
 * Clicks one of the two Data Backup buttons and returns the downloaded file's path.
 *
 * Both callers below parse that file immediately, inside the same test, and memoize the parsed
 * object rather than the path: Playwright deletes a download's temp file when its browser
 * context closes, and every test gets a fresh context — so a path captured in one test is
 * already gone by the next. Parsing eagerly is what lets the two memos outlive the test that
 * filled them.
 *
 * No explicit timeout on waitForEvent, for the same reason support/test.ts gives for waitForURL
 * (#1211). It is tempting to write one here, because 30s is documented as waitForEvent's
 * default and this is by far the heaviest click in the suite — the action fetches every
 * document out of Storage, builds the archive, and re-uploads it, on a possibly cold-compiled
 * route. But that 30s is the *library* default: @playwright/test's own `actionTimeout` fixture
 * defaults to 0, which it pushes into the context as its default timeout, so under the runner
 * the wait is already unbounded and governed solely by the test's budget. Any number written
 * here could therefore only *tighten* it — the same trap, one API over.
 *
 * The budget is raised where it is actually spent instead: test.slow() below triples the
 * enclosing test's timeout. Putting it in the helper rather than in the two tests that nominally
 * perform the downloads is deliberate — the memos mean *whichever* test runs first pays the
 * cost, and #1240's appended block (or any --grep of a single downstream test) makes that a
 * different test than it is today.
 */
async function performDownload(page: Page, buttonName: string): Promise<{ filename: string; path: string }> {
  test.slow()
  const section = await openDataBackup(page)
  const downloadPromise = page.waitForEvent('download')
  await section.getByRole('button', { name: buttonName }).click()
  const download = await downloadPromise
  const path = await download.path()
  if (!path) throw new Error(`the "${buttonName}" download produced no file on disk`)
  return { filename: download.suggestedFilename(), path }
}

let documentsArchive: { filename: string; zip: JSZip } | null = null

/** Memoized — see the file header. One export per run, whichever test asks for it first. */
async function downloadDocumentsZip(page: Page): Promise<{ filename: string; zip: JSZip }> {
  if (!documentsArchive) {
    const { filename, path } = await performDownload(page, 'Download All Documents')
    documentsArchive = { filename, zip: await JSZip.loadAsync(readFileSync(path)) }
  }
  return documentsArchive
}

let dataExport: { filename: string; workbook: ExcelJS.Workbook } | null = null

/**
 * The #1240 entry point. Memoized for the same reason as downloadDocumentsZip above.
 *
 * readFile rather than load(readFileSync(...)): exceljs's bundled type for `load` names a
 * `Buffer` from an older @types/node than this repo carries, so the buffer path only
 * typechecks behind a cast. Reading from the path is the same parse without one.
 */
async function downloadDataWorkbook(page: Page): Promise<{ filename: string; workbook: ExcelJS.Workbook }> {
  if (!dataExport) {
    const { filename, path } = await performDownload(page, 'Download Data')
    const workbook = await new ExcelJS.Workbook().xlsx.readFile(path)
    dataExport = { filename, workbook }
  }
  return dataExport
}

// ---------------------------------------------------------------------------
// Archive and workbook readers
// ---------------------------------------------------------------------------

/** Real entries only — JSZip synthesises a `dir` entry per folder segment. */
function zipFileNames(zip: JSZip): string[] {
  return Object.values(zip.files)
    .filter((entry) => !entry.dir)
    .map((entry) => entry.name)
    .sort()
}

function zipFileNamesUnder(zip: JSZip, folder: string): string[] {
  return zipFileNames(zip).filter((name) => name.startsWith(folder))
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * The `<original>-<type>-<date>.<ext>` naming, with the date matched as a *shape*.
 *
 * Deliberately not read back out of the document row's created_at: an expectation derived from
 * the code under test agrees with any bug in that code, and the spec's own conventions rule
 * direct DB reads in as precondition/storage-shape checks only, never as the expected answer.
 * Everything the app didn't invent — folder, original base name, record type, extension — comes
 * from the seed constants above.
 */
function backupFileNamePattern(folder: string, doc: { fileName: string; recordType: string }): RegExp {
  const dot = doc.fileName.lastIndexOf('.')
  const base = doc.fileName.slice(0, dot)
  const ext = doc.fileName.slice(dot + 1)
  return new RegExp(`^${escapeRegExp(`${folder}/${base}-${doc.recordType}-`)}\\d{4}-\\d{2}-\\d{2}\\.${escapeRegExp(ext)}$`)
}

/**
 * A loaded sheet's data rows, keyed by header text.
 *
 * By header rather than by column key: exceljs's `key` is a build-time convenience that the
 * xlsx format has nowhere to store, so it does not survive the round trip — the header row is
 * the only addressing a reader of the file actually has.
 */
function sheetRows(workbook: ExcelJS.Workbook, name: string): Record<string, ExcelJS.CellValue>[] {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) throw new Error(`the workbook has no "${name}" sheet`)
  // exceljs's row.values is 1-indexed with a hole at 0.
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((header) => String(header))
  const rows: Record<string, ExcelJS.CellValue>[] = []
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return
    const values = (row.values as ExcelJS.CellValue[]).slice(1)
    rows.push(Object.fromEntries(headers.map((header, i) => [header, values[i] ?? null])))
  })
  return rows
}

function columnValues(workbook: ExcelJS.Workbook, sheet: string, header: string): ExcelJS.CellValue[] {
  return sheetRows(workbook, sheet).map((row) => row[header])
}

// ---------------------------------------------------------------------------
// Documents archive
// ---------------------------------------------------------------------------

// Serial, so the four archive-content checks below report as skipped rather than as four
// separate failures when the download itself is what broke.
test.describe.serial('Data Backup — documents archive', () => {
  test('data_backup_section_shows_download_all_documents_button @manager', async ({ page }) => {
    const section = await openDataBackup(page)
    await expect(section.getByRole('button', { name: 'Download All Documents' })).toBeVisible()
  })

  // The barn was seeded with a horse document and a staff document, which is what flips the
  // page's hasDocuments and drops the button's disabled attribute.
  test('download_all_documents_button_is_enabled_when_the_barn_has_documents @manager', async ({ page }) => {
    const section = await openDataBackup(page)
    await expect(section.getByRole('button', { name: 'Download All Documents' })).toBeEnabled()
  })

  test('download_all_documents_downloads_a_zip_file @manager', async ({ page }) => {
    const { filename } = await downloadDocumentsZip(page)
    expect(filename).toMatch(/\.zip$/)
  })

  // Exact array equality, not containment: this barn's documents are the only two in the
  // archive and #1240 extends the workbook half of this file rather than this one, so nothing
  // is expected to appear here later.
  test('documents_zip_groups_horse_documents_under_a_folder_named_for_the_horse @manager', async ({ page }) => {
    const { zip } = await downloadDocumentsZip(page)
    expect(zipFileNamesUnder(zip, `horse/${HORSE_NAME}/`)).toEqual([
      expect.stringContaining(HORSE_DOC.fileName.replace('.pdf', '')),
    ])
  })

  test('documents_zip_groups_member_documents_under_a_folder_named_for_the_member @manager', async ({ page }) => {
    const { zip } = await downloadDocumentsZip(page)
    expect(zipFileNamesUnder(zip, `member/${TRAINER_NAME}/`)).toEqual([
      expect.stringContaining(STAFF_DOC.fileName.replace('.pdf', '')),
    ])
  })

  // "Each file inside" — both of them, in one assertion. zipFileNames sorts, and `horse/`
  // sorts before `member/`, so the order is fixed rather than incidental.
  test('documents_zip_names_each_file_original_type_and_date @manager', async ({ page }) => {
    const { zip } = await downloadDocumentsZip(page)
    expect(zipFileNames(zip)).toEqual([
      expect.stringMatching(backupFileNamePattern(`horse/${HORSE_NAME}`, HORSE_DOC)),
      expect.stringMatching(backupFileNamePattern(`member/${TRAINER_NAME}`, STAFF_DOC)),
    ])
  })
})

// ---------------------------------------------------------------------------
// Data workbook
// ---------------------------------------------------------------------------

test.describe.serial('Data Backup — data workbook', () => {
  test('data_backup_section_shows_download_data_button @manager', async ({ page }) => {
    const section = await openDataBackup(page)
    await expect(section.getByRole('button', { name: 'Download Data' })).toBeVisible()
  })

  // Unlike its documents counterpart, this button is passed disabled={false} unconditionally —
  // there is no empty-barn state that turns the data export off.
  test('download_data_button_is_enabled_with_no_nothing_to_export_state @manager', async ({ page }) => {
    const section = await openDataBackup(page)
    await expect(section.getByRole('button', { name: 'Download Data' })).toBeEnabled()
  })

  test('download_data_downloads_an_xlsx_file @manager', async ({ page }) => {
    const { filename } = await downloadDataWorkbook(page)
    expect(filename).toMatch(/\.xlsx$/)
  })

  // One assertion for both halves of the checkbox: the array's length is "exactly 8" and its
  // contents are the eight names.
  test('data_workbook_has_exactly_the_eight_expected_sheets @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(EXPECTED_SHEETS)
  })

  // The next four use containment rather than exact equality on purpose: #1240 appends to this
  // file and will extend the seed above with the rows its formatting assertions need. Naming
  // the value that must be present survives that; pinning the whole column would not. The
  // claim in each case is "by name, not a raw id", and every id in this schema is a UUID.
  test('horses_sheet_lists_the_seeded_horse_by_name @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(columnValues(workbook, 'Horses', 'Name')).toContain(HORSE_NAME)
  })

  test('lessons_sheet_lists_the_seeded_lesson @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(columnValues(workbook, 'Lessons', 'Tier')).toContain(TIER.name)
  })

  // Both cells in one assertion — the checkbox is the single claim "this row names its horse
  // and its rider", and splitting it would leave the checklist line naming two tests.
  test('lessons_sheet_row_names_its_horse_and_rider_not_ids @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const row = sheetRows(workbook, 'Lessons').find((candidate) => candidate.Tier === TIER.name)
    if (!row) throw new Error(`no "${TIER.name}" row on the Lessons sheet`)
    expect([row.Horses, row.Riders]).toEqual([HORSE_NAME, RIDER_NAME])
  })

  test('members_sheet_lists_the_seeded_member_by_name @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(columnValues(workbook, 'Members', 'Name')).toContain(TRAINER_NAME)
  })
})
