// covers: src/app/barn/[slug]/(protected)/settings/**
//
// Manage Barn → Data Backup: both exports (checklists/pre-release/phase-4-manager-verification.md,
// from "**Data Backup** section shows a **Download All Documents** button" through "A member
// created earlier in this phase appears by name"), and the exported workbook's formatting and
// shape (from "**Date/Time Added** is the first column on the Horses sheet" through "Every column
// is wide enough to read its contents without manual resizing").
//
// Deliberately no `covers:` line for src/lib/db/backup.ts or document-backup.ts, the two
// modules that actually build these files: select-specs.sh lists the whole of src/lib/** in
// ALWAYS_FULL, so a change to either already selects every spec. A glob here would be dead
// weight duplicating that — and nothing more than that, since #1281 retired the rule that
// per-spec declarations stay pure route globs.
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
//
// #1240 took both invitations: its block (the workbook's formatting and shape, from "It is also
// the first column on the All Transactions sheet" onward)
// sits at the bottom of this file and reads the same memoized workbook, and its extra rows are
// appended to the one withBarn callback below.
import { readFileSync } from 'fs'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { mustSucceed } from '@/lib/db/service-role'
import { test, expect, withBarn, type Page } from './support/test'
import {
  addExpense,
  addHorse,
  addHorseDocument,
  addLeaseCharge,
  addManagedMember,
  addPaidLesson,
  addStaffDocument,
  addTier,
  type SeededAppointment,
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

// ---------------------------------------------------------------------------
// #1240's seed inputs
// ---------------------------------------------------------------------------
//
// The barn above leaves Agreements, Agreement Charges and Horse Expenses empty and Horses at a
// single row, so several of the formatting checkboxes — both newest-first orderings, the two
// expense date/time cells, the date-column alignment, the signed expense amounts, and the
// Horse Expenses entries in the zero-padding and column-width checks — have nothing to be true
// of. These rows exist only to give them something. Every one goes through a builder
// fixtures.ts already exports, bar the single created_at write below, which no builder offers.

const SECOND_HORSE = 'Marigold'
/**
 * Aged by an explicit created_at write rather than left to the insert's own default. Two
 * back-to-back inserts differ by milliseconds, and the export renders created_at through
 * instantToLocalWallClock, which truncates to whole seconds — so both horses can land on the
 * same exported cell value, and a newest-first assertion against a tie passes by luck rather
 * than because the sheet is sorted.
 *
 * The write is checked for having actually matched a row (see the seed), not merely for not
 * erroring: a zero-row UPDATE reports success, and it would silently reintroduce exactly the
 * tie this constant exists to rule out.
 */
const SECOND_HORSE_AGE_DAYS = 30

/**
 * Deliberately seeded oldest-first — the reverse of how they must come out.
 *
 * getTransactionRows issues no ORDER BY, so an All Transactions sheet that lost its sort would
 * fall back on insertion order. Seeding these in the order the sheet is supposed to produce
 * would make `all_transactions_sheet_rows_run_newest_first` pass against an unsorted export,
 * which is the one thing it exists to catch. Same reasoning for the two appointments.
 */
const TIMED_EXPENSE = { recipient: 'Vale Farrier', time: '14:30', amount: 120, daysAgo: 40 }
const UNTIMED_EXPENSE = { recipient: 'Ridge Vet', amount: 45, daysAgo: 50 }

/**
 * One lease per horse — two on the same horse would be a second live agreement against it —
 * placed far enough apart to give the Agreements sheet two distinct Start Dates.
 *
 * Seeded newest-first, the *opposite* of the appointments above, and for the same underlying
 * reason: an unsorted sheet must not come out in the right order by accident. Where the
 * ledger falls back on insertion order, getAgreementsByBarn falls back on `created_at DESC` —
 * so here it is oldest-first insertion that would hand the Agreements sheet the correct
 * ordering for free, and newest-first insertion that exposes a missing sort. Verified by
 * disabling sortByFirstColumn: with these two orders, all three ordering tests fail.
 *
 * The ledger stays exposed either way, because the two appointments already invert it.
 *
 * Their ledger rows can't overtake the appointments however the suite's own run date falls: a
 * one_time agreement's transaction is stamped at date_trunc('month', start_date)
 * (create_agreement_with_first_charge), which is never later than the start date itself, and
 * both start dates are older than both expense dates.
 */
const LEASES = [
  { daysAgo: 60, fee: 300 },
  { daysAgo: 70, fee: 200 },
]

/**
 * addTier's default instructorCut. A flat dollar amount taken off the lesson fee, not a
 * percentage of it — lesson_tiers.instructor_cut reaches sync_lesson_transactions as
 * `-p_instructor_cut`. It reads like a typo sitting next to TIER.price; it isn't.
 */
const INSTRUCTOR_CUT = 25

/** lesson_fee + instructor_payout from the paid lesson, one expense per appointment above, one
 *  lease_charge per agreement above. */
const TRANSACTION_ROWS = 6

/** The sheets whose first column is a real Date cell. Agreements and Agreement Charges lead
 *  with an ISO 'YYYY-MM-DD' string instead — a DATE column names a day, not an instant. */
const DATE_LED_SHEETS = ['Horses', 'Lessons', 'Horse Expenses', 'Members', 'Documents', 'All Transactions']

// backup.ts's own format strings, restated rather than imported: the claim is about what the
// downloaded file carries, and importing the constant under test would make every one of these
// assertions agree with any change to it.
const DATE_TIME_FMT = 'mm/dd/yyyy hh:mm AM/PM'
const DATE_ONLY_FMT = 'mm/dd/yyyy'
const MONEY_FMT = '"$"#,##0.00'

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000)
}

/**
 * The timed appointment's own row, captured from the builder rather than recomputed: its
 * expense_date is derived from the barn's timezone, which isn't knowable at module scope.
 *
 * Read through seededTimedExpense() below, which throws rather than handing back a null — an
 * assertion built on an unseeded value is the vacuous-pass shape this file is most exposed to.
 */
let timedExpense: SeededAppointment | null = null

function seededTimedExpense(): SeededAppointment {
  if (!timedExpense) throw new Error('the timed expense was not seeded')
  return timedExpense
}

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

  // --- #1240's rows ---

  // A second horse, explicitly aged, so the Horses sheet has two rows to order — see
  // SECOND_HORSE_AGE_DAYS for why the created_at is written rather than inherited.
  const secondHorse = await addHorse(supabase, barn.id, SECOND_HORSE)
  // .select().single() through mustSucceed, so an UPDATE that matched nothing throws here
  // rather than leaving the two horses tied a second apart — see SECOND_HORSE_AGE_DAYS.
  mustSucceed(
    await supabase
      .from('horses')
      .update({ created_at: daysAgo(SECOND_HORSE_AGE_DAYS).toISOString() })
      .eq('id', secondHorse.id)
      .select('id')
      .single(),
    'backdate the second horse'
  )

  // The Horse Expenses sheet's two shapes: an appointment booked at a time, and one booked
  // without one. Both priced, so each also lands an `expense` row on the ledger sheet. Older
  // first, so insertion order is the reverse of the export's — see UNTIMED_EXPENSE.
  await addExpense(supabase, barn, {
    at: daysAgo(UNTIMED_EXPENSE.daysAgo),
    recipient: UNTIMED_EXPENSE.recipient,
    amount: UNTIMED_EXPENSE.amount,
  })
  timedExpense = await addExpense(supabase, barn, {
    at: daysAgo(TIMED_EXPENSE.daysAgo),
    recipient: TIMED_EXPENSE.recipient,
    time: TIMED_EXPENSE.time,
    amount: TIMED_EXPENSE.amount,
  })

  // Two leases, one per horse — see LEASES.
  const leaseHorseIds = [horse.id, secondHorse.id]
  for (const [i, lease] of LEASES.entries()) {
    await addLeaseCharge(supabase, barn, {
      at: daysAgo(lease.daysAgo),
      riderId: managedRider.membershipId,
      horseId: leaseHorseIds[i],
      fee: lease.fee,
    })
  }
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
// #1240's workbook readers
// ---------------------------------------------------------------------------

/**
 * A sheet's header texts, refusing to return an empty list.
 *
 * That refusal is the point. Four of the assertions below are of the form "this sheet has no
 * `Lesson ID` column", and `expect([]).not.toContain(anything)` passes — so a lookup that
 * quietly found nothing would report as four green tests. Throwing here makes the vacuous case
 * structurally impossible once, rather than defending against it at each call site.
 *
 * Deliberately not folded into sheetRows above, which does its own extraction: that function's
 * callers all assert on *values*, and an empty header row already produces empty rows there,
 * which fails every one of them. Only the absence assertions need the guard.
 */
function sheetHeaders(workbook: ExcelJS.Workbook, name: string): string[] {
  const sheet = workbook.getWorksheet(name)
  if (!sheet) throw new Error(`the workbook has no "${name}" sheet`)
  const headers = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map((header) => String(header))
  if (!headers.length) throw new Error(`the "${name}" sheet has an empty header row`)
  return headers
}

/** ISO for a Date, the raw text for the 'YYYY-MM-DD' string columns — both order lexically the
 *  same way they order chronologically, so one comparison covers both kinds of date column. */
function sortKey(value: ExcelJS.CellValue): string {
  return value instanceof Date ? value.toISOString() : String(value)
}

/**
 * One flag per row: "no newer than the row above it".
 *
 * Returns a flag per row rather than a single boolean so the caller's expected array pins the
 * row count too. `expect(isDescending(…)).toBe(true)` is satisfied by an empty column; nothing
 * satisfies `toEqual([true, true])` except two rows in the right order.
 */
function newestFirstFlags(values: ExcelJS.CellValue[]): boolean[] {
  return values.map((value, i) => i === 0 || sortKey(value) <= sortKey(values[i - 1]))
}

function transactionAmounts(workbook: ExcelJS.Workbook, kind: string): ExcelJS.CellValue[] {
  return sheetRows(workbook, 'All Transactions')
    .filter((row) => row.Kind === kind)
    .map((row) => row.Amount)
}

/** The 1-based sheet row an expense landed on — row 1 is the header. Throws when it isn't
 *  there, so a per-row style assertion can't land on some other appointment's row. */
function expenseRowNumber(workbook: ExcelJS.Workbook, recipient: string): number {
  const index = sheetRows(workbook, 'Horse Expenses').findIndex((row) => row.Recipient === recipient)
  if (index < 0) throw new Error(`no "${recipient}" row on the Horse Expenses sheet`)
  return index + 2
}

/** The same, for the ledger sheet — and throwing for the same reason: a per-cell style read
 *  resolves from the column, so it would answer just as readily for a row that isn't there. */
function transactionRowNumber(workbook: ExcelJS.Workbook, kind: string): number {
  const index = sheetRows(workbook, 'All Transactions').findIndex((row) => row.Kind === kind)
  if (index < 0) throw new Error(`no "${kind}" row on the All Transactions sheet`)
  return index + 2
}

/** `"$"#,##0.00` as Excel renders it: sign, dollar sign, thousands grouping, two decimals. */
function moneyText(value: number): string {
  const [whole, fraction] = Math.abs(value).toFixed(2).split('.')
  return `${value < 0 ? '-' : ''}$${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${fraction}`
}

// A date renders at a fixed width under either of the two formats this export uses, whatever
// the date: "07/15/2026 02:30 PM" is 19 characters and "07/15/2026" is 10. Counted here rather
// than reused from backup.ts's own DATETIME_FMT.length estimate — a width check that borrows
// the estimate under test agrees with any error in it.
const DATE_TIME_WIDTH = 19
const DATE_ONLY_WIDTH = 10
// backup.ts caps auto-sizing here so one long Notes cell can't push a sheet off screen, so a
// column that needs more than this is legitimately narrower than its contents.
const MAX_COLUMN_WIDTH = 60
// What a column with no width of its own renders at — and reading one back as "unset" is the
// normal case, not a failure: exceljs treats a width of exactly 9 as the default and omits the
// <col> element entirely (Column#isCustomWidth, exceljs/lib/doc/column.js:36), so any column
// this export sizes to exactly 9 comes back undefined. Defaulting those to 0 would report them
// as unreadable when Excel in fact renders them at 9.
const DEFAULT_COLUMN_WIDTH = 9

function renderedWidth(value: ExcelJS.CellValue, numFmt: string | undefined): number {
  if (value instanceof Date) return numFmt === DATE_ONLY_FMT ? DATE_ONLY_WIDTH : DATE_TIME_WIDTH
  if (numFmt === MONEY_FMT && typeof value === 'number') return moneyText(value).length
  return String(value ?? '').length
}

/**
 * Per sheet, either the all-clear or the columns too narrow for their own widest cell.
 *
 * A report keyed by every sheet name rather than a flat list of violations: `toEqual([])` is
 * satisfied by a walk that visited nothing, whereas the eight keys have to be produced.
 */
function columnWidthReport(workbook: ExcelJS.Workbook): Record<string, string> {
  return Object.fromEntries(
    EXPECTED_SHEETS.map((name) => {
      const sheet = workbook.getWorksheet(name)
      if (!sheet) throw new Error(`the workbook has no "${name}" sheet`)
      const narrow = sheetHeaders(workbook, name).filter((header, i) => {
        let needed = header.length
        sheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return
          const cell = row.getCell(i + 1)
          needed = Math.max(needed, renderedWidth(cell.value, cell.numFmt))
        })
        return (sheet.getColumn(i + 1).width ?? DEFAULT_COLUMN_WIDTH) < Math.min(MAX_COLUMN_WIDTH, needed)
      })
      return [name, narrow.length ? `too narrow: ${narrow.join(', ')}` : 'every column fits']
    })
  )
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

// ---------------------------------------------------------------------------
// Data workbook — formatting and shape (#1240, the checklist block from "It is also the first
// column on the All Transactions sheet" through "Every column is wide enough")
// ---------------------------------------------------------------------------
//
// Everything here reads the same memoized workbook the block above downloads — no second
// export, and no second barn. Under a --grep of one of these tests alone, downloadDataWorkbook
// performs the export on demand and performDownload's own test.slow() covers whichever test
// paid for it.

test.describe.serial('Data Backup — workbook formatting', () => {
  // --- Every sheet leads with its own date column (#1218) ---

  test('horses_sheet_leads_with_the_date_time_added_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Horses')[0]).toBe('Date/Time Added')
  })

  test('lessons_sheet_leads_with_the_date_time_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Lessons')[0]).toBe('Date/Time')
  })

  test('horse_expenses_sheet_leads_with_the_date_time_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Horse Expenses')[0]).toBe('Date/Time')
  })

  test('all_transactions_sheet_leads_with_the_date_time_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'All Transactions')[0]).toBe('Date/Time')
  })

  test('members_sheet_leads_with_the_date_time_added_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Members')[0]).toBe('Date/Time Added')
  })

  test('documents_sheet_leads_with_the_date_time_added_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Documents')[0]).toBe('Date/Time Added')
  })

  test('agreements_sheet_leads_with_the_start_date_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Agreements')[0]).toBe('Start Date')
  })

  test('agreement_charges_sheet_leads_with_the_period_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'Agreement Charges')[0]).toBe('Period')
  })

  // --- Newest first, by that leading column ---

  // Two horses, seeded a month apart on purpose (SECOND_HORSE_AGE_DAYS). The two-element
  // expectation is what makes this bite: it fails on a single row as surely as on a mis-sorted
  // pair.
  test('horses_sheet_rows_run_newest_first @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(newestFirstFlags(columnValues(workbook, 'Horses', 'Date/Time Added'))).toEqual([true, true])
  })

  test('all_transactions_sheet_rows_run_newest_first @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(newestFirstFlags(columnValues(workbook, 'All Transactions', 'Date/Time'))).toEqual(
      Array(TRANSACTION_ROWS).fill(true)
    )
  })

  test('agreements_sheet_rows_run_newest_first_by_start_date @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(newestFirstFlags(columnValues(workbook, 'Agreements', 'Start Date'))).toEqual(
      Array(LEASES.length).fill(true)
    )
  })

  // --- The header row ---

  test('header_row_is_bold_on_every_sheet @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(EXPECTED_SHEETS.map((name) => workbook.getWorksheet(name)?.getRow(1).font?.bold)).toEqual(
      Array(EXPECTED_SHEETS.length).fill(true)
    )
  })

  // Both halves of one claim about one row, so one assertion over the pair. "Visibly taller"
  // is measured against the sheet's own default row height, which is what an unstyled data row
  // renders at — exceljs writes no explicit height for one.
  test('header_row_is_taller_than_a_data_row_and_vertically_centered @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const sheet = workbook.getWorksheet('Horses')
    if (!sheet) throw new Error('the workbook has no "Horses" sheet')
    const header = sheet.getRow(1)
    const dataRowHeight = sheet.getRow(2).height ?? sheet.properties.defaultRowHeight
    expect([header.height > dataRowHeight, header.alignment?.vertical]).toEqual([true, 'middle'])
  })

  // --- Expense dates ---

  // One claim, asserted over the pair it is made of: the sheet has exactly one date-or-time
  // column, and that column's cell carries both halves of what was booked. The expected date
  // and time are the appointment row addExpense handed back, not a re-derivation.
  test('expense_date_and_time_share_one_date_time_cell @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const expense = seededTimedExpense()
    const dateColumns = sheetHeaders(workbook, 'Horse Expenses').filter((header) => /date|time/i.test(header))
    const cell = workbook
      .getWorksheet('Horse Expenses')
      ?.getRow(expenseRowNumber(workbook, TIMED_EXPENSE.recipient))
      .getCell(1)
    expect([dateColumns, (cell?.value as Date | undefined)?.toISOString()]).toEqual([
      ['Date/Time'],
      `${expense.expense_date}T${expense.expense_time}.000Z`,
    ])
  })

  // The date-only format is a per-cell override on this sheet alone, so it is read off the
  // untimed appointment's own row rather than off the column.
  test('expense_without_a_time_renders_date_only @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const row = expenseRowNumber(workbook, UNTIMED_EXPENSE.recipient)
    expect(workbook.getWorksheet('Horse Expenses')?.getRow(row).getCell(1).numFmt).toBe(DATE_ONLY_FMT)
  })

  // "Format Cells reports category Date" and "switching the column to General turns it into a
  // serial number" are the same claim seen from two sides of Excel's UI: the cell holds a date,
  // not a string that looks like one. exceljs types the parsed cell, which is that claim
  // directly. That is the narrowing the issue pre-ratified: no library can drive the
  // "switch the column to General" half, and it is the same fact seen from the other side.
  test('date_cells_are_real_excel_dates_not_text @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(workbook.getWorksheet('Horses')?.getRow(2).getCell(1).type).toBe(ExcelJS.ValueType.Date)
  })

  // mm/dd against m/d is the whole of "zero-padded, so they are all the same width" — a cell's
  // stored value has no padding either way, only its format does.
  //
  // Guarded on the cell being a real date rather than reading numFmt straight off row 2: a
  // cell inherits its format from its column, so an *unwritten* row answers this question
  // just as confidently as a written one, and a sheet that had lost all its rows would pass.
  // The type is what distinguishes them (an unwritten cell is ValueType.Null).
  test('date_cells_render_zero_padded @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(
      DATE_LED_SHEETS.map((name) => {
        const cell = workbook.getWorksheet(name)?.getRow(2).getCell(1)
        return cell?.type === ExcelJS.ValueType.Date ? cell.numFmt : `no date cell on ${name}`
      })
    ).toEqual(Array(DATE_LED_SHEETS.length).fill(DATE_TIME_FMT))
  })

  // Excel right-aligns dates by default, which is what would knock a date-only row's date out
  // of line with a timed row's — so the two rows the checkbox is about are the two asserted.
  test('date_columns_are_left_justified @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const sheet = workbook.getWorksheet('Horse Expenses')
    if (!sheet) throw new Error('the workbook has no "Horse Expenses" sheet')
    expect(
      [TIMED_EXPENSE.recipient, UNTIMED_EXPENSE.recipient].map(
        (recipient) => sheet.getRow(expenseRowNumber(workbook, recipient)).getCell(1).alignment?.horizontal
      )
    ).toEqual(['left', 'left'])
  })

  // --- The raw id columns #1218 dropped ---
  //
  // Assertions of absence, so they lean on sheetHeaders throwing rather than returning an
  // empty list. In practice the header row is written unconditionally by sheet.columns, so
  // what these four are really protected by is its sibling guard: sheetHeaders throws when
  // the *sheet* is missing, which is the way this claim could actually go vacuous.

  test('all_transactions_sheet_has_no_lesson_id_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'All Transactions')).not.toContain('Lesson ID')
  })

  test('all_transactions_sheet_has_no_lesson_rider_id_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'All Transactions')).not.toContain('Lesson Rider ID')
  })

  test('all_transactions_sheet_has_no_agreement_charge_id_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'All Transactions')).not.toContain('Agreement Charge ID')
  })

  test('all_transactions_sheet_has_no_expense_id_column @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(sheetHeaders(workbook, 'All Transactions')).not.toContain('Expense ID')
  })

  // --- Signed, currency-formatted amounts ---
  //
  // Pinned to the seeded figures rather than to `toBeLessThan(0)`: the exact value fails on an
  // empty filter as well as on a wrong sign, and both expenses are named in newest-first order.

  test('expense_transactions_show_a_negative_amount @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(transactionAmounts(workbook, 'expense')).toEqual([-TIMED_EXPENSE.amount, -UNTIMED_EXPENSE.amount])
  })

  test('instructor_payout_transactions_show_a_negative_amount @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(transactionAmounts(workbook, 'instructor_payout')).toEqual([-INSTRUCTOR_CUT])
  })

  test('lesson_fee_transactions_show_a_positive_amount @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(transactionAmounts(workbook, 'lesson_fee')).toEqual([TIER.price])
  })

  // The number format, not the displayed text: "$" and two decimals are what the format
  // produces, and the cell's own value is a bare number either way.
  //
  // Read off a row located by kind rather than off row 2, for the same reason the zero-padding
  // check guards on cell type: a format is inherited from the column, so an empty sheet would
  // report the right one. transactionRowNumber throws when the row isn't there.
  test('transaction_amounts_render_as_currency @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    const amountColumn = sheetHeaders(workbook, 'All Transactions').indexOf('Amount') + 1
    const row = transactionRowNumber(workbook, 'lesson_fee')
    expect(workbook.getWorksheet('All Transactions')?.getRow(row).getCell(amountColumn).numFmt).toBe(MONEY_FMT)
  })

  // --- Column widths ---

  test('every_column_is_wide_enough_for_its_contents @manager', async ({ page }) => {
    const { workbook } = await downloadDataWorkbook(page)
    expect(columnWidthReport(workbook)).toEqual(
      Object.fromEntries(EXPECTED_SHEETS.map((name) => [name, 'every column fits']))
    )
  })
})
