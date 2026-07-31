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
import type {
  AgreementBackupRow,
  AgreementChargeBackupRow,
  ExpenseBackupRow,
  HorseBackupRow,
  LessonBackupRow,
  TransactionBackupRow,
} from '../backup'

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
      horses: { data: [createMockHorse({ owning_member_id: 'mem-1', created_at: '2026-01-01T00:00:00Z' })] },
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
      horses: { data: [createMockHorse({ owning_member_id: null, created_at: '2026-01-01T00:00:00Z' })] },
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
      horses: { data: [createMockHorse({ owning_member_id: 'mem-gone', created_at: '2026-01-01T00:00:00Z' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.horses[0].owningMember).toBe('Unknown Member')
  })

  it('should_anchor_a_horse_date_time_to_the_barns_wall_clock', async () => {
    setupFrom({
      horses: { data: [createMockHorse({ created_at: '2026-01-15T13:30:00Z' })] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    // 13:30 UTC is 08:30 in New York; the cell's UTC digits are the barn's wall clock, so
    // Excel renders 8:30 AM on any recipient's machine (see backup.ts:barnLocalCell).
    expect(result.horses[0].dateTime.toISOString()).toBe('2026-01-15T08:30:00.000Z')
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

  it('should_throw_on_lessons_query_error', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: null, error: new Error('boom') },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow('boom')
  })

  it('should_throw_on_agreement_charges_query_error', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: null, error: new Error('boom') },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement()])

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow('boom')
  })

  it('should_throw_on_barn_memberships_query_error', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: null, error: new Error('boom') },
      profiles: { data: [] },
    })

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow('boom')
  })

  it('should_throw_on_profiles_query_error', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [createMockMembership({ created_at: '2026-01-01T00:00:00Z' })] },
      profiles: { data: null, error: new Error('boom') },
    })

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow('boom')
  })

  it('should_treat_null_horses_query_data_as_empty_list', async () => {
    setupFrom({
      horses: { data: null },
      lessons: { data: null },
      agreement_charges: { data: null },
      barn_memberships: { data: null },
      profiles: { data: null },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.horses).toEqual([])
  })

  it('should_treat_null_lessons_query_data_as_empty_list', async () => {
    setupFrom({
      horses: { data: null },
      lessons: { data: null },
      agreement_charges: { data: null },
      barn_memberships: { data: null },
      profiles: { data: null },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons).toEqual([])
  })

  it('should_treat_null_barn_memberships_query_data_as_empty_members_list', async () => {
    setupFrom({
      horses: { data: null },
      lessons: { data: null },
      agreement_charges: { data: null },
      barn_memberships: { data: null },
      profiles: { data: null },
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.members).toEqual([])
  })

  it('should_treat_null_profiles_data_as_empty', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [createMockMembership({ profile_id: 'profile-gone', created_at: '2026-01-01T00:00:00Z' })] },
      profiles: { data: null },
    })

    await expect(getBarnBackupData('barn-1', TIMEZONE)).rejects.toThrow()
  })

  it('should_leave_charges_empty_when_an_agreement_has_no_charges_yet', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement()])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.agreements).toHaveLength(1)
    expect(result.agreementCharges).toEqual([])
  })

  it('should_treat_null_agreement_charges_data_as_empty', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: null },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAgreementsByBarn).mockResolvedValue([createMockAgreement()])

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.agreementCharges).toEqual([])
  })

  it('should_fall_back_to_unknown_names_for_unresolved_lesson_horse_and_rider', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [createMockLesson({ id: 'lesson-1', instructor_id: null })] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getLessonJunctionRows).mockImplementation(async (table) =>
      table === 'lesson_horses'
        ? [{ lesson_id: 'lesson-1', horse_id: 'horse-gone' }]
        : [{ lesson_id: 'lesson-1', rider_id: 'rider-gone' }]
    )

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.lessons[0]).toEqual(expect.objectContaining({ horses: 'Unknown Horse', riders: 'Unknown Member' }))
  })

  it('should_fall_back_to_unknown_names_for_unresolved_document_owners', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getAllBarnDocuments).mockResolvedValue({
      horse: [{ id: 'd1', barn_id: 'barn-1', horse_id: 'horse-gone', record_type: 'coggins', storage_path: 's', file_name: 'coggins.pdf', file_size: 1, notes: null, reminder_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '' }],
      trainer: [{ id: 'd2', barn_id: 'barn-1', trainer_id: 'mem-gone', record_type: 'other', storage_path: 's', file_name: 'contract.pdf', file_size: 1, notes: null, reminder_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '' }],
      rider: [{ id: 'd3', barn_id: 'barn-1', rider_id: 'mem-gone-2', record_type: 'other', storage_path: 's', file_name: 'waiver.pdf', file_size: 1, notes: null, reminder_date: null, created_at: '2026-01-01T00:00:00Z', updated_at: '' }],
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.documents).toEqual([
      expect.objectContaining({ owner: 'Unknown Horse' }),
      expect.objectContaining({ owner: 'Unknown Member' }),
      expect.objectContaining({ owner: 'Unknown Member' }),
    ])
  })

  it('should_fall_back_to_unknown_names_for_an_unresolved_transaction_member_and_horse', async () => {
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
          id: 'txn-1', kind: 'lesson_fee', amount: 50, collected: false, paymentType: null,
          membershipId: 'mem-gone', horseId: 'horse-gone', lessonId: 'lesson-1', lessonRiderId: null,
          agreementChargeId: null, expenseId: null, occurredAt: '2026-05-19T10:00:00Z',
        },
      ]
    })

    const result = await getBarnBackupData('barn-1', TIMEZONE)

    expect(result.transactions[0]).toEqual(expect.objectContaining({ member: 'Unknown Member', horse: 'Unknown Horse' }))
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
  })

  it('should_join_charge_rows_with_rider_horse_kind_and_payment_status', async () => {
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

  it('should_collapse_an_expense_date_and_time_into_one_value', async () => {
    setupFrom({
      horses: { data: [] },
      lessons: { data: [] },
      agreement_charges: { data: [] },
      barn_memberships: { data: [] },
      profiles: { data: [] },
    })
    vi.mocked(getExpensesByBarn).mockResolvedValue([
      createMockExpenseWithHorses({ expense_date: '2026-07-15', expense_time: '07:30:00' }),
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
      createMockExpenseWithHorses({ expense_date: '2026-07-15', expense_time: null }),
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
    rider: 'Alice', horse: 'Thunderbolt', kind: 'board', period: '2026-03-01',
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
