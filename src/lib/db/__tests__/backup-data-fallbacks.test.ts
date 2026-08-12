import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  createMockAgreement,
  createMockHorse,
  createMockLesson,
  createMockMembership,
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
})
