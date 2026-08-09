import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockHorse,
} from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../horses', () => ({ resolveHorseNames: vi.fn() }))
vi.mock('../member-names', () => ({ resolveMemberNames: vi.fn() }))
vi.mock('../agreements', () => ({ getAgreementsByBarn: vi.fn() }))
vi.mock('../expenses', () => ({ getExpensesByBarn: vi.fn() }))
vi.mock('../document-backup', () => ({ getAllBarnDocuments: vi.fn() }))
vi.mock('../lesson-finance-queries', () => ({
  getLessonJunctionRows: vi.fn(),
  getLessonFeeRows: vi.fn(),
}))
vi.mock('../transactions', async () => {
  const actual = await vi.importActual<typeof import('../transactions')>('../transactions')
  return { ...actual, getTransactionRows: vi.fn() }
})

import { createClient } from '@/lib/supabase/server'
import { resolveHorseNames } from '../horses'
import { resolveMemberNames } from '../member-names'
import { getAgreementsByBarn } from '../agreements'
import { getExpensesByBarn } from '../expenses'
import { getAllBarnDocuments } from '../document-backup'
import { getLessonJunctionRows, getLessonFeeRows } from '../lesson-finance-queries'
import { getTransactionRows } from '../transactions'
import { buildBarnDataWorkbook, buildBarnDataBackupBuffer } from '../backup'
import type {
  AgreementBackupRow,
  AgreementChargeBackupRow,
  ExpenseBackupRow,
  HorseBackupRow,
  LessonBackupRow,
  TransactionBackupRow,
} from '../backup'
import { calendarDate } from '@/lib/local-day'

const TIMEZONE = 'America/New_York'

function makeChain(data: unknown[] | null, error: Error | null = null) {
  // Chainable + thenable stand-in for the supabase query builder — every method
  // returns the same chain object so `.eq().order()`/`.in()`/any combination all
  // resolve to { data, error } regardless of the exact call shape a query uses.
  const chain: any = {
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    then: (resolve: (v: { data: unknown[] | null; error: Error | null }) => void) => resolve({ data, error }),
  }
  return { select: vi.fn(() => chain) }
}

function setupFrom(tables: Record<string, { data: unknown[] | null; error?: Error | null }>) {
  const fromFn = vi.fn().mockImplementation((table: string) => {
    const entry = tables[table]
    if (!entry) throw new Error(`unexpected table ${table}`)
    return makeChain(entry.data, entry.error ?? null)
  })
  vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)
  return fromFn
}

function defaultMocks() {
  vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
  vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
  vi.mocked(getAgreementsByBarn).mockResolvedValue([])
  vi.mocked(getExpensesByBarn).mockResolvedValue([])
  vi.mocked(getAllBarnDocuments).mockResolvedValue({ horse: [], trainer: [], rider: [] })
  vi.mocked(getLessonJunctionRows).mockResolvedValue([])
  vi.mocked(getLessonFeeRows).mockResolvedValue([])
  vi.mocked(getTransactionRows).mockResolvedValue([])
}

describe('buildBarnDataWorkbook', () => {
  const emptyData = {
    horses: [], lessons: [], agreements: [], agreementCharges: [],
    expenses: [], members: [], documents: [], transactions: [],
  }

  it('should_create_all_eight_sheets', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.worksheets.map((s) => s.name)).toEqual([
      'Horses', 'Lessons', 'Agreements', 'Agreement Charges', 'Horse Expenses', 'Members', 'Documents', 'All Transactions',
    ])
  })

  const horseRow = (overrides: Partial<HorseBackupRow> = {}): HorseBackupRow => ({
    dateTime: new Date('2026-01-01T09:00:00Z'), name: 'Thunderbolt', registeredName: null,
    active: true, available: true, unavailabilityReason: null, feedNotes: null,
    medicationNotes: null, owningMember: 'Jane Owner', ...overrides,
  })

  const lessonRow = (overrides: Partial<LessonBackupRow> = {}): LessonBackupRow => ({
    dateTime: new Date('2026-05-19T06:00:00Z'), type: 'normal', tierName: 'Beginner',
    jumping: false, fee: 45, instructor: 'Jane Trainer', horses: 'Thunderbolt',
    riders: 'Alice', recurring: false, collected: true, instructorPayout: 12.5,
    cancelled: false, cancellationNotes: null, ...overrides,
  })

  const transactionRow = (overrides: Partial<TransactionBackupRow> = {}): TransactionBackupRow => ({
    dateTime: new Date('2026-05-19T06:00:00Z'), kind: 'lesson_fee', amount: 50, collected: true,
    paymentType: 'cash', member: 'Alice', horse: 'Thunderbolt', ...overrides,
  })

  const expenseRow = (overrides: Partial<ExpenseBackupRow> = {}): ExpenseBackupRow => ({
    dateTime: new Date('2026-07-15T07:30:00Z'), dateOnly: false, recipient: 'Dr. Smith',
    type: 'Veterinary', amount: 100, horses: 'Thunderbolt', paymentType: null, notes: null,
    ...overrides,
  })

  it('should_write_the_horses_sheet_header_row', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow()] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getRow(1).values).toEqual([undefined, 'Date/Time Added', 'Name', 'Registered Name', 'Active', 'Available', 'Unavailability Reason', 'Feed Notes', 'Medication Notes', 'Owning Member'])
  })

  it('should_write_a_horse_row_name_cell', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow()] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getRow(2).getCell('name').value).toBe('Thunderbolt')
  })

  it('should_write_a_horse_row_owning_member_cell', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow()] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getRow(2).getCell('owningMember').value).toBe('Jane Owner')
  })

  it('should_write_a_transaction_row_amount_cell', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getRow(2).getCell('amount').value).toBe(50)
  })

  it('should_omit_the_raw_id_columns_from_the_transactions_sheet', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getRow(1).values).toEqual([undefined, 'Date/Time', 'Kind', 'Amount', 'Collected', 'Payment Type', 'Member', 'Horse'])
  })

  it('should_put_the_date_time_column_first_on_every_sheet_that_has_one', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    const firstHeaders = ['Lessons', 'Horse Expenses', 'All Transactions']
      .map((name) => workbook.getWorksheet(name)!.getRow(1).getCell(1).value)
    expect(firstHeaders).toEqual(Array(3).fill('Date/Time'))
  })

  it('should_name_every_created_at_column_date_time_added', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    const firstHeaders = ['Horses', 'Members', 'Documents']
      .map((name) => workbook.getWorksheet(name)!.getRow(1).getCell(1).value)
    expect(firstHeaders).toEqual(Array(3).fill('Date/Time Added'))
  })

  it('should_left_justify_a_date_column', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    expect(workbook.getWorksheet('All Transactions')!.getColumn('dateTime').alignment!.horizontal).toBe('left')
  })

  it('should_not_force_alignment_on_a_non_date_column', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    expect(workbook.getWorksheet('All Transactions')!.getColumn('amount').alignment).toBeUndefined()
  })

  it('should_format_the_transaction_amount_column_as_currency', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getColumn('amount').numFmt).toBe('"$"#,##0.00')
  })

  it('should_format_the_date_time_column_as_a_date_and_time', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getColumn('dateTime').numFmt).toBe('mm/dd/yyyy hh:mm AM/PM')
  })

  it('should_leave_a_non_money_column_unformatted', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, transactions: [transactionRow()] })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getColumn('kind').numFmt).toBeUndefined()
  })

  it('should_format_a_timeless_expense_date_time_cell_as_date_only', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      expenses: [expenseRow({ dateTime: new Date('2026-07-15T00:00:00Z'), dateOnly: true })],
    })

    const sheet = workbook.getWorksheet('Horse Expenses')!
    expect(sheet.getRow(2).getCell('dateTime').numFmt).toBe('mm/dd/yyyy')
  })

  it('should_leave_a_timed_expense_date_time_cell_on_the_column_format', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, expenses: [expenseRow()] })

    const sheet = workbook.getWorksheet('Horse Expenses')!
    expect(sheet.getRow(2).getCell('dateTime').numFmt).toBe('mm/dd/yyyy hh:mm AM/PM')
  })

  const agreementRow = (overrides: Partial<AgreementBackupRow> = {}): AgreementBackupRow => ({
    rider: 'Alice', horse: 'Thunderbolt', kind: 'board', cadence: 'monthly',
    fee: 500, startDate: '2026-03-01', active: true, ...overrides,
  })

  const chargeRow = (overrides: Partial<AgreementChargeBackupRow> = {}): AgreementChargeBackupRow => ({
    rider: 'Alice', horse: 'Thunderbolt', kind: 'board', period: calendarDate('2026-03-01'),
    fee: 500, collected: true, paymentType: 'cash', ...overrides,
  })

  it('should_put_start_date_first_on_the_agreements_sheet', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Agreements')!.getRow(1).getCell(1).value).toBe('Start Date')
  })

  it('should_put_period_first_on_the_agreement_charges_sheet', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Agreement Charges')!.getRow(1).getCell(1).value).toBe('Period')
  })

  it('should_sort_rows_by_the_first_column_descending', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      horses: [
        horseRow({ name: 'Older', dateTime: new Date('2026-01-01T09:00:00Z') }),
        horseRow({ name: 'Newer', dateTime: new Date('2026-06-01T09:00:00Z') }),
      ],
    })

    expect(workbook.getWorksheet('Horses')!.getRow(2).getCell('name').value).toBe('Newer')
  })

  it('should_sort_a_string_keyed_first_column_descending', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      agreements: [agreementRow({ startDate: '2026-03-01' }), agreementRow({ startDate: '2026-09-01' })],
    })

    expect(workbook.getWorksheet('Agreements')!.getRow(2).getCell('startDate').value).toBe('2026-09-01')
  })

  it('should_keep_the_original_order_of_rows_tied_on_the_first_column', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      agreementCharges: [chargeRow({ rider: 'First' }), chargeRow({ rider: 'Second' })],
    })

    expect(workbook.getWorksheet('Agreement Charges')!.getRow(2).getCell('rider').value).toBe('First')
  })

  it('should_apply_the_date_only_format_at_the_sorted_row_position', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      expenses: [
        expenseRow({ dateTime: new Date('2026-07-15T07:30:00Z'), dateOnly: false }),
        expenseRow({ dateTime: new Date('2026-08-20T00:00:00Z'), dateOnly: true }),
      ],
    })

    expect(workbook.getWorksheet('Horse Expenses')!.getRow(2).getCell('dateTime').numFmt).toBe('mm/dd/yyyy')
  })

  it('should_bold_the_header_row', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Horses')!.getRow(1).font.bold).toBe(true)
  })

  it('should_leave_the_header_row_font_at_the_default_size', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Horses')!.getRow(1).font.size).toBeUndefined()
  })

  it('should_double_the_header_row_height', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Horses')!.getRow(1).height).toBe(30)
  })

  it('should_vertically_center_the_header_row', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    expect(workbook.getWorksheet('Horses')!.getRow(1).alignment.vertical).toBe('middle')
  })

  it('should_size_a_column_to_its_widest_value', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow()] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getColumn('name').width).toBe('Thunderbolt'.length + 2)
  })

  it('should_size_a_column_to_its_header_when_the_sheet_has_no_rows', () => {
    const workbook = buildBarnDataWorkbook(emptyData)

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getColumn('name').width).toBe('Name'.length + 2)
  })

  it('should_size_a_date_time_column_to_its_rendered_format', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow()] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getColumn('dateTime').width).toBe('mm/dd/yyyy hh:mm AM/PM'.length + 2)
  })

  it('should_treat_a_null_value_as_empty_when_sizing', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow({ registeredName: null })] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getColumn('registeredName').width).toBe('Registered Name'.length + 2)
  })

  it('should_cap_the_width_of_a_very_long_column', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, horses: [horseRow({ feedNotes: 'x'.repeat(200) })] })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getColumn('feedNotes').width).toBe(60)
  })

  it('should_size_a_money_column_to_its_rendered_currency_text', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, lessons: [lessonRow({ fee: 45 })] })

    // "$45.00" is six characters where String(45) is two — and the header is only three,
    // so measuring the raw number would leave Excel rendering the cell as "####".
    const sheet = workbook.getWorksheet('Lessons')!
    expect(sheet.getColumn('fee').width).toBe('$45.00'.length + 2)
  })

  it('should_size_a_money_column_to_its_thousands_separated_text', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, lessons: [lessonRow({ fee: 1234 })] })

    const sheet = workbook.getWorksheet('Lessons')!
    expect(sheet.getColumn('fee').width).toBe('$1,234.00'.length + 2)
  })

  it('should_size_a_money_column_to_its_header_when_the_amount_is_null', () => {
    const workbook = buildBarnDataWorkbook({ ...emptyData, expenses: [expenseRow({ amount: null })] })

    const sheet = workbook.getWorksheet('Horse Expenses')!
    expect(sheet.getColumn('amount').width).toBe('Amount'.length + 2)
  })
})

describe('buildBarnDataBackupBuffer', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    defaultMocks()
  })

  it('should_return_a_buffer', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ created_at: '2026-01-01T00:00:00Z' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const buffer = await buildBarnDataBackupBuffer('barn-1', TIMEZONE)

    expect(Buffer.isBuffer(buffer)).toBe(true)
  })

  it('should_return_a_non_empty_buffer', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ created_at: '2026-01-01T00:00:00Z' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const buffer = await buildBarnDataBackupBuffer('barn-1', TIMEZONE)

    expect(buffer.length).toBeGreaterThan(0)
  })
})
