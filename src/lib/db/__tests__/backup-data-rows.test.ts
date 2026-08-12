import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockAgreement,
  createMockAgreementCharge,
  createMockExpenseWithHorses,
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
import { getBarnBackupData } from '../backup'
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

describe('getBarnBackupData', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    defaultMocks()
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

  it('should_join_agreement_rows_with_rider_horse_and_kind_names', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [createMockAgreementCharge({ id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-07-01') })] },
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
  })

  it('should_join_charge_rows_with_rider_horse_kind_and_payment_status', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [createMockAgreementCharge({ id: 'charge-1', agreement_id: 'agreement-1', period: calendarDate('2026-07-01') })] },
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

    expect(result.agreementCharges).toEqual([
      expect.objectContaining({ rider: 'Alice', horse: 'Thunderbolt', kind: 'board', period: calendarDate('2026-07-01'), collected: true, paymentType: 'venmo' }),
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

  it('should_collapse_an_expense_date_and_time_into_one_value', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: calendarDate('2026-07-15'), expense_time: '07:30:00' }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].dateTime.toISOString()).toBe('2026-07-15T07:30:00.000Z')
  })

  it('should_use_midnight_when_an_expense_has_no_time', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: calendarDate('2026-07-15'), expense_time: null }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].dateTime.toISOString()).toBe('2026-07-15T00:00:00.000Z')
  })

  it('should_mark_an_expense_with_no_time_as_date_only', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_time: null }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].dateOnly).toBe(true)
  })

  it('should_not_mark_a_timed_expense_as_date_only', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_time: '07:30:00' }),
    ])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.expenses[0].dateOnly).toBe(false)
  })

  it('should_build_a_member_row_from_the_joined_membership_and_profile', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [createMockMembership({ profile_id: 'profile-1', role: 'trainer', status: 'active', can_instruct: true, created_at: '2026-01-01T00:00:00Z' })] },
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
      rider: [{ id: 'd2', barn_id: 'barn-1', rider_id: 'rider-1', record_type: 'liability_waiver', storage_path: 's', file_name: 'waiver.pdf', file_size: 1, notes: null, reminder_date: calendarDate('2026-08-01'), created_at: '2026-01-02T00:00:00Z', updated_at: '' }],
    })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice']]))

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.documents).toEqual([
      expect.objectContaining({ ownerType: 'Horse', owner: 'Thunderbolt', recordType: 'coggins' }),
      expect.objectContaining({ ownerType: 'Member', owner: 'Alice', recordType: 'liability_waiver', reminderDate: calendarDate('2026-08-01') }),
    ])
  })

  it('should_resolve_all_transaction_rows_with_names', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (!kinds.includes('lesson_fee')) return []
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
      expect.objectContaining({ kind: 'instructor_payout', member: 'Jane Trainer', horse: 'Thunderbolt' }),
    ])
  })

  it('should_render_an_instructor_payout_as_a_negative_amount', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (!kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'instructor_payout', amount: -12.5, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: 'lesson-1', lessonRiderId: null,
          agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0].amount).toBe(-12.5)
  })

  it('should_render_an_expense_as_a_negative_amount', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (!kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'expense', amount: -100, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
          agreementChargeId: null, expenseId: 'expense-1', occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0].amount).toBe(-100)
  })

  it('should_render_a_lesson_fee_as_a_positive_amount', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (!kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'lesson_fee', amount: 50, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: 'lesson-1', lessonRiderId: null,
          agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0].amount).toBe(50)
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
      if (!kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'expense', amount: -100, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
          agreementChargeId: null, expenseId: 'expense-1', occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0]).toEqual(expect.objectContaining({ member: null, horse: null }))
  })

  it('should_anchor_a_transaction_date_time_to_the_barns_wall_clock', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getTransactionRows).mockImplementation(async (_barnId, kinds) => {
      if (!kinds.includes('lesson_fee')) return []
      return [
        {
          id: 'txn-1', kind: 'lesson_fee', amount: 50, collected: true, paymentType: 'cash',
          membershipId: null, horseId: null, lessonId: null, lessonRiderId: null,
          agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0].dateTime.toISOString()).toBe('2026-05-19T06:00:00.000Z')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const fromFn = vi.fn().mockImplementation(() => makeChain([]))
    const injectedClient = { from: fromFn } as any

    await getBarnBackupData('barn-1', TIMEZONE, injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})
