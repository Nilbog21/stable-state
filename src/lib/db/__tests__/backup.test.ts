import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockAgreement,
  createMockAgreementCharge,
  createMockExpenseWithHorses,
  createMockHorse,
  createMockLesson,
  createMockMembership,
  createMockProfile,
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
import { getBarnBackupData, buildBarnDataWorkbook, buildBarnDataBackupBuffer } from '../backup'

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

describe('getBarnBackupData', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    defaultMocks()
  })

  it('should_resolve_horse_owning_member_name', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ owning_member_id: 'mem-1' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Jane Owner']]))

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.horses[0].owningMember).toBe('Jane Owner')
  })

  it('should_leave_owning_member_null_when_horse_has_no_owner', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ owning_member_id: null })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.horses[0].owningMember).toBeNull()
  })

  it('should_fall_back_to_unknown_member_for_an_unresolved_owning_member', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ owning_member_id: 'mem-gone' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.horses[0].owningMember).toBe('Unknown Member')
  })

  it('should_throw_on_horses_query_error', async () => {
    setupFrom({
      horses: { data: null, error: new Error('boom') },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow('boom')
  })

  it('should_build_a_lesson_row_with_joined_horses_riders_instructor_and_ledger_data', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [createMockLesson({ id: 'lesson-1', instructor_id: 'mem-instructor', series_id: 'series-1' })] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getLessonJunctionRows).mockImplementation(async (table) =>
      table === 'lesson_horses'
        ? [{ lesson_id: 'lesson-1', horse_id: 'horse-1' }]
        : [{ lesson_id: 'lesson-1', rider_id: 'rider-1' }]
    )
    vi.mocked(getLessonFeeRows).mockResolvedValue([
      { lessonId: 'lesson-1', fee: 50, instructorCut: 12.5, collected: true, instructorId: 'mem-instructor', occurredAt: '2026-05-19T10:00:00Z', tierName: 'Custom' },
    ])
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice'], ['mem-instructor', 'Jane Trainer']]))

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons).toEqual([
      expect.objectContaining({
        instructor: 'Jane Trainer',
        horses: 'Thunderbolt',
        riders: 'Alice',
        recurring: true,
        collected: true,
        instructorPayout: 12.5,
        cancelled: false,
      }),
    ])
  })

  it('should_show_no_instructor_when_lesson_has_no_instructor_id', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [createMockLesson({ id: 'lesson-1', instructor_id: null })] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons[0].instructor).toBe('No Instructor')
  })

  it('should_leave_collected_and_instructor_payout_null_when_no_ledger_row_matches', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [createMockLesson({ id: 'lesson-1', cancelled_at: '2026-05-01T00:00:00Z', cancellation_notes: 'weather' })] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons[0]).toEqual(
      expect.objectContaining({ collected: null, instructorPayout: null, cancelled: true, cancellationNotes: 'weather' })
    )
  })

  it('should_return_empty_lessons_when_barn_has_no_lessons', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons).toEqual([])
    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_join_agreement_and_charge_rows_with_names_kind_and_payment_status', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [createMockAgreementCharge({ id: 'charge-1', agreement_id: 'agreement-1', period: '2026-07-01' })] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([
      createMockAgreement({ id: 'agreement-1', rider_id: 'rider-1', horse_id: 'horse-1', kind: 'board' }),
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice']]))
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(getTransactionRows).mockResolvedValue([
      {
        id: 'txn-1', kind: 'board_charge', amount: 200, collected: true, paymentType: 'venmo',
        membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
        agreementChargeId: 'charge-1', expenseId: null, occurredAt: '2026-07-01T00:00:00Z',
      },
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.agreements).toEqual([
      expect.objectContaining({ rider: 'Alice', horse: 'Thunderbolt', kind: 'board' }),
    ])
    expect(result.agreementCharges).toEqual([
      expect.objectContaining({ rider: 'Alice', horse: 'Thunderbolt', kind: 'board', period: '2026-07-01', collected: true, paymentType: 'venmo' }),
    ])
  })

  it('should_leave_charge_collected_and_payment_type_null_when_no_transaction_matches', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [createMockAgreementCharge({ id: 'charge-1', agreement_id: 'agreement-1' })] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement({ id: 'agreement-1' })])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.agreementCharges[0]).toEqual(expect.objectContaining({ collected: null, paymentType: null }))
  })

  it('should_skip_agreement_charges_query_when_barn_has_no_agreements', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.agreements).toEqual([])
    expect(result.agreementCharges).toEqual([])
  })

  it('should_map_expense_rows_showing_all_horses_when_applicable', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ applies_to_all_horses: true, horse_names: [] }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].horses).toBe('All Horses')
  })

  it('should_join_specific_horse_names_when_expense_does_not_apply_to_all_horses', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ applies_to_all_horses: false, horse_names: ['Thunderbolt', 'Star'] }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].horses).toBe('Thunderbolt, Star')
  })

  it('should_build_a_member_row_from_the_joined_membership_and_profile', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [createMockMembership({ profile_id: 'profile-1', role: 'trainer', status: 'active', can_instruct: true })] },
      profiles: { data: [createMockProfile({ id: 'profile-1', first_name: 'Jane', last_name: 'Trainer', email: 'jane@example.com' })] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.members).toEqual([
      expect.objectContaining({ name: 'Jane Trainer', role: 'trainer', status: 'active', canInstruct: true, email: 'jane@example.com' }),
    ])
  })

  it('should_skip_the_profiles_query_when_barn_has_no_members', async () => {
    const fromFn = setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    await getBarnBackupData('barn-1', TIMEZONE)

    expect(fromFn).not.toHaveBeenCalledWith('profiles')
  })

  it('should_flatten_documents_from_all_three_tables_with_owner_type', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAllBarnDocuments).mockResolvedValue({
      horse: [{ id: 'd1', barn_id: 'barn-1', horse_id: 'horse-1', record_type: 'coggins', storage_path: 's', file_name: 'coggins.pdf', file_size: 1, notes: null, reminder_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '' }],
      trainer: [],
      rider: [{ id: 'd2', barn_id: 'barn-1', rider_id: 'rider-1', record_type: 'liability_waiver', storage_path: 's', file_name: 'waiver.pdf', file_size: 1, notes: null, reminder_date: '2026-08-01', created_at: '2026-01-02T00:00:00Z', updated_at: '' }],
    })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice']]))

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.documents).toEqual([
      expect.objectContaining({ ownerType: 'Horse', owner: 'Thunderbolt', recordType: 'coggins' }),
      expect.objectContaining({ ownerType: 'Member', owner: 'Alice', recordType: 'liability_waiver', reminderDate: '2026-08-01' }),
    ])
  })

  it('should_resolve_all_transaction_rows_with_names_and_positive_amounts', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'instructor_payout', amount: -12.5, collected: true, paymentType: 'cash',
          membershipId: 'mem-1', horseId: 'horse-1', lessonId: 'lesson-1', lessonRiderId: null,
          agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Jane Trainer']]))
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions).toEqual([
      expect.objectContaining({ kind: 'instructor_payout', amount: 12.5, member: 'Jane Trainer', horse: 'Thunderbolt', lessonId: 'lesson-1' }),
    ])
  })

  it('should_leave_member_and_horse_null_on_a_transaction_row_with_neither', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'expense', amount: -100, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
          agreementChargeId: null, expenseId: 'expense-1', occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0]).toEqual(expect.objectContaining({ member: null, horse: null, amount: 100 }))
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const fromFn = vi.fn().mockImplementation(() => makeChain([]))
    const injectedClient = { from: fromFn } as any

    await getBarnBackupData('barn-1', TIMEZONE, injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

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

  it('should_write_a_horse_row_under_its_header', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      horses: [{
        name: 'Thunderbolt', registeredName: null, active: true, available: true,
        unavailabilityReason: null, feedNotes: null, medicationNotes: null,
        owningMember: 'Jane Owner', createdAt: '2026-01-01 09:00',
      }],
    })

    const sheet = workbook.getWorksheet('Horses')!
    expect(sheet.getRow(1).values).toEqual([undefined, 'Name', 'Registered Name', 'Active', 'Available', 'Unavailability Reason', 'Feed Notes', 'Medication Notes', 'Owning Member', 'Created At'])
    expect(sheet.getRow(2).getCell('name').value).toBe('Thunderbolt')
    expect(sheet.getRow(2).getCell('owningMember').value).toBe('Jane Owner')
  })

  it('should_write_a_transaction_row_under_its_header', () => {
    const workbook = buildBarnDataWorkbook({
      ...emptyData,
      transactions: [{
        kind: 'lesson_fee', amount: 50, collected: true, paymentType: 'cash', member: 'Alice', horse: 'Thunderbolt',
        lessonId: 'lesson-1', lessonRiderId: null, agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19 06:00',
      }],
    })

    const sheet = workbook.getWorksheet('All Transactions')!
    expect(sheet.getRow(2).getCell('amount').value).toBe(50)
    expect(sheet.getRow(2).getCell('lessonId').value).toBe('lesson-1')
  })
})

describe('buildBarnDataBackupBuffer', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    defaultMocks()
  })

  it('should_return_a_non_empty_xlsx_buffer', async () => {
    setupFrom({
      horses: { data: [createMockHorse()] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const buffer = await buildBarnDataBackupBuffer('barn-1', TIMEZONE)

    expect(Buffer.isBuffer(buffer)).toBe(true)
    expect(buffer.length).toBeGreaterThan(0)
  })
})
