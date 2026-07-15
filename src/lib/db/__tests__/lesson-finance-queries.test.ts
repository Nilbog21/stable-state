import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../lesson-participants')
vi.mock('../barn-memberships')
// partial mock: getTransactionRows/getOutstandingTransactionRows are stubbed per-test,
// but positiveAmount is real business logic used inside lesson-finance-queries.ts and
// must not be auto-mocked away
vi.mock('../transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions')>()
  return { ...actual, getTransactionRows: vi.fn(), getOutstandingTransactionRows: vi.fn() }
})

import { createClient } from '@/lib/supabase/server'
import { getRiderEnrolledLessonIds } from '../lesson-participants'
import { getUserMembership } from '../barn-memberships'
import { getTransactionRows, getOutstandingTransactionRows } from '../transactions'
import type { TransactionRow } from '../transactions'
import {
  getLessonFeeRows,
  getTierPricesByNames,
  getOutstandingLessonRows,
  getOutstandingCancellationFeeRows,
  getLessonJunctionRows,
} from '../lesson-finance-queries'

describe('getLessonFeeRows', () => {
  const startDate = new Date('2026-05-01T00:00:00Z')
  const endDate = new Date('2026-06-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  function makeLessonsLookupChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn }
  }

  // Table-aware chain: `lesson_riders` and `lessons` follow-up queries need
  // independent canned responses within the same test.
  function makeMultiTableChain(responses: Record<string, { data: unknown[] | null; error?: Error | null }>) {
    const froms: Record<string, ReturnType<typeof vi.fn>> = {}
    const from = vi.fn((table: string) => {
      const resp = responses[table] ?? { data: [], error: null }
      const mockIn = vi.fn().mockResolvedValue({ data: resp.data, error: resp.error ?? null })
      const mockEq = vi.fn().mockReturnValue({ in: mockIn })
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
      froms[table] = mockIn
      return { select: mockSelect }
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, froms }
  }

  function txRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
    return {
      id: 'txn-1',
      lessonId: 'lesson-1',
      kind: 'lesson_fee',
      amount: 100,
      collected: true,
      membershipId: null,
      horseId: null,
      lessonRiderId: null,
      agreementChargeId: null,
      expenseId: null,
      paymentType: 'cash',
      occurredAt: '2026-05-10T10:00:00Z',
      ...overrides,
    }
  }

  it('should_delegate_to_getTransactionRows_with_lesson_kinds_and_date_range', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    await getLessonFeeRows('barn-1', startDate, endDate)
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lesson_fee', 'instructor_payout', 'rider_cancellation_fee'], { startDate, endDate }, undefined
    )
  })

  it('should_return_empty_array_when_getTransactionRows_resolves_empty', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('db error'))
    await expect(getLessonFeeRows('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_merge_a_lesson_fee_and_instructor_payout_row_into_one_LessonFeeRow', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ kind: 'lesson_fee', amount: 100 }),
      txRow({ kind: 'instructor_payout', amount: -30, membershipId: 'mem-1' }),
    ])
    makeLessonsLookupChain([{ id: 'lesson-1', tier_name: 'Standard' }])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([
      {
        lessonId: 'lesson-1',
        fee: 100,
        instructorCut: 30,
        collected: true,
        instructorId: 'mem-1',
        occurredAt: '2026-05-10T10:00:00Z',
        tierName: 'Standard',
      },
    ])
  })

  it('should_merge_an_uncollected_lesson_fee_and_payout_row_with_a_nonzero_cut', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ kind: 'lesson_fee', amount: 60, collected: false, paymentType: null }),
      txRow({ kind: 'instructor_payout', amount: -25, collected: false, paymentType: null, membershipId: 'mem-1' }),
    ])
    makeLessonsLookupChain([{ id: 'lesson-1', tier_name: 'Standard' }])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([
      {
        lessonId: 'lesson-1',
        fee: 60,
        instructorCut: 25,
        collected: false,
        instructorId: 'mem-1',
        occurredAt: '2026-05-10T10:00:00Z',
        tierName: 'Standard',
      },
    ])
  })

  it('should_default_instructor_cut_and_instructor_id_when_no_payout_row_exists', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ kind: 'lesson_fee', amount: 50, collected: false, paymentType: null })])
    makeLessonsLookupChain([{ id: 'lesson-1', tier_name: 'Standard' }])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([
      {
        lessonId: 'lesson-1',
        fee: 50,
        instructorCut: 0,
        collected: false,
        instructorId: null,
        occurredAt: '2026-05-10T10:00:00Z',
        tierName: 'Standard',
      },
    ])
  })

  it('should_keep_rows_for_different_lessons_separate', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ lessonId: 'lesson-1', kind: 'lesson_fee', amount: 50 }),
      txRow({ lessonId: 'lesson-2', kind: 'lesson_fee', amount: 75 }),
    ])
    makeLessonsLookupChain([{ id: 'lesson-1', tier_name: 'Standard' }, { id: 'lesson-2', tier_name: 'Standard' }])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result.map((r) => r.lessonId).sort()).toEqual(['lesson-1', 'lesson-2'])
  })

  it('should_include_an_orphaned_lesson_fee_row_whose_lesson_was_deleted', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ id: 'txn-1', lessonId: null, amount: 100 })])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([
      expect.objectContaining({ lessonId: null, fee: 100, collected: true }),
    ])
  })

  it('should_fall_back_to_a_placeholder_tier_name_for_an_orphaned_row', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ id: 'txn-1', lessonId: null })])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result[0].tierName).toBe('Deleted Lesson')
  })

  it('should_key_orphaned_rows_by_their_own_transaction_id_so_unrelated_deleted_lessons_are_not_merged', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ id: 'txn-1', lessonId: null, kind: 'lesson_fee', amount: 100 }),
      txRow({ id: 'txn-2', lessonId: null, kind: 'lesson_fee', amount: 40 }),
    ])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result.map((r) => r.fee).sort((a, b) => a - b)).toEqual([40, 100])
  })

  it('should_mark_a_standalone_orphaned_instructor_payout_row_as_collected', async () => {
    // once its paired lesson_fee row is also nulled, they land under different
    // keys (both keyed by lesson_id=null falls back to their own distinct id) —
    // this payout-only row must still read its own `collected` column rather
    // than default to false, or its cut silently drops out of every income sum.
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ id: 'txn-payout-1', lessonId: null, kind: 'instructor_payout', amount: -25, membershipId: 'mem-1', collected: true }),
    ])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result).toEqual([
      expect.objectContaining({ instructorCut: 25, collected: true, fee: 0 }),
    ])
  })

  it('should_skip_lessons_lookup_query_when_all_rows_are_orphaned', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ id: 'txn-1', lessonId: null, amount: 100 })])
    const fromFn = vi.fn()
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)
    await getLessonFeeRows('barn-1', startDate, endDate)
    expect(fromFn).not.toHaveBeenCalled()
  })

  it('should_dedupe_lesson_ids_before_the_lessons_lookup_query', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      txRow({ id: 'txn-1', lessonId: 'lesson-1', kind: 'lesson_fee', amount: 50 }),
      txRow({ id: 'txn-2', lessonId: 'lesson-1', kind: 'instructor_payout', amount: -10 }),
    ])
    const { mockIn } = makeLessonsLookupChain([{ id: 'lesson-1', tier_name: 'Standard' }])
    await getLessonFeeRows('barn-1', startDate, endDate)
    expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
  })

  it('should_fall_back_to_deleted_lesson_label_when_lessons_lookup_has_no_match_for_a_present_lesson_id', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ lessonId: 'lesson-missing' })])
    makeLessonsLookupChain([])
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result[0].tierName).toBe('Deleted Lesson')
  })

  it('should_treat_null_lessons_lookup_data_as_empty', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow({ lessonId: 'lesson-1' })])
    makeLessonsLookupChain(null)
    const result = await getLessonFeeRows('barn-1', startDate, endDate)
    expect(result[0].tierName).toBe('Deleted Lesson')
  })

  it('should_throw_when_lessons_lookup_query_errors', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([txRow()])
    makeLessonsLookupChain(null, new Error('lessons error'))
    await expect(getLessonFeeRows('barn-1', startDate, endDate)).rejects.toThrow('lessons error')
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const mockClient = { from: vi.fn() } as any

    await getLessonFeeRows('barn-1', startDate, endDate, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lesson_fee', 'instructor_payout', 'rider_cancellation_fee'], { startDate, endDate }, mockClient
    )
  })

  describe('rider_cancellation_fee handling', () => {
    it('should_resolve_a_rider_cancellation_fee_row_to_its_lesson_via_lesson_riders_and_merge_with_the_payout_row', async () => {
      vi.mocked(getTransactionRows).mockResolvedValue([
        txRow({
          id: 'txn-fee', kind: 'rider_cancellation_fee', amount: 80, collected: false,
          paymentType: null, lessonId: null, lessonRiderId: 'lr-1', occurredAt: '2026-05-10T10:00:00Z',
        }),
        txRow({
          id: 'txn-payout', kind: 'instructor_payout', amount: -20, collected: false,
          paymentType: null, lessonId: 'lesson-1', membershipId: 'mem-1',
        }),
      ])
      const { froms } = makeMultiTableChain({
        lesson_riders: { data: [{ id: 'lr-1', lesson_id: 'lesson-1' }] },
        lessons: { data: [{ id: 'lesson-1', tier_name: 'Standard' }] },
      })
      const result = await getLessonFeeRows('barn-1', startDate, endDate)
      expect(result).toEqual([
        {
          lessonId: 'lesson-1',
          fee: 80,
          instructorCut: 20,
          collected: false,
          instructorId: 'mem-1',
          occurredAt: '2026-05-10T10:00:00Z',
          tierName: 'Standard',
        },
      ])
      expect(froms.lesson_riders).toHaveBeenCalledWith('id', ['lr-1'])
    })

    it('should_skip_the_lesson_riders_lookup_when_no_rider_cancellation_fee_rows_are_present', async () => {
      vi.mocked(getTransactionRows).mockResolvedValue([txRow({ kind: 'lesson_fee', amount: 50 })])
      const { from } = makeMultiTableChain({ lessons: { data: [{ id: 'lesson-1', tier_name: 'Standard' }] } })
      await getLessonFeeRows('barn-1', startDate, endDate)
      expect(from).not.toHaveBeenCalledWith('lesson_riders')
    })

    it('should_treat_a_rider_cancellation_fee_row_as_orphaned_when_its_lesson_rider_id_has_no_match', async () => {
      vi.mocked(getTransactionRows).mockResolvedValue([
        txRow({ id: 'txn-fee', kind: 'rider_cancellation_fee', amount: 80, lessonId: null, lessonRiderId: 'lr-missing' }),
      ])
      makeMultiTableChain({ lesson_riders: { data: [] } })
      const result = await getLessonFeeRows('barn-1', startDate, endDate)
      expect(result).toEqual([
        expect.objectContaining({ lessonId: null, fee: 80, tierName: 'Deleted Lesson' }),
      ])
    })

    it('should_treat_null_lesson_riders_lookup_data_as_empty', async () => {
      vi.mocked(getTransactionRows).mockResolvedValue([
        txRow({ id: 'txn-fee', kind: 'rider_cancellation_fee', amount: 80, lessonId: null, lessonRiderId: 'lr-1' }),
      ])
      makeMultiTableChain({ lesson_riders: { data: null } })
      const result = await getLessonFeeRows('barn-1', startDate, endDate)
      expect(result).toEqual([
        expect.objectContaining({ lessonId: null, fee: 80 }),
      ])
    })

    it('should_treat_a_rider_cancellation_fee_row_with_no_lesson_rider_id_as_orphaned', async () => {
      // Defensive-only: sync_rider_cancellation_fee always sets lesson_rider_id, but the
      // column is nullable on the table, so this guards the same way lessonId does above.
      vi.mocked(getTransactionRows).mockResolvedValue([
        txRow({ id: 'txn-fee', kind: 'rider_cancellation_fee', amount: 80, lessonId: null, lessonRiderId: null }),
      ])
      const { from } = makeMultiTableChain({})
      const result = await getLessonFeeRows('barn-1', startDate, endDate)
      expect(result).toEqual([
        expect.objectContaining({ lessonId: null, fee: 80, tierName: 'Deleted Lesson' }),
      ])
      expect(from).not.toHaveBeenCalledWith('lesson_riders')
    })

    it('should_throw_when_lesson_riders_lookup_query_errors', async () => {
      vi.mocked(getTransactionRows).mockResolvedValue([
        txRow({ id: 'txn-fee', kind: 'rider_cancellation_fee', amount: 80, lessonId: null, lessonRiderId: 'lr-1' }),
      ])
      makeMultiTableChain({ lesson_riders: { data: null, error: new Error('lesson_riders error') } })
      await expect(getLessonFeeRows('barn-1', startDate, endDate)).rejects.toThrow('lesson_riders error')
    })
  })
})

describe('getTierPricesByNames', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEq, mockIn }
  }

  it('should_not_query_when_names_is_empty', async () => {
    const { from } = makeChain([])
    await getTierPricesByNames('barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_names_is_empty', async () => {
    makeChain([])
    const result = await getTierPricesByNames('barn-1', [])
    expect(result).toEqual([])
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getTierPricesByNames('barn-1', ['Standard'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_names', async () => {
    const { mockIn } = makeChain([])
    await getTierPricesByNames('barn-1', ['Standard', 'Basic'])
    expect(mockIn).toHaveBeenCalledWith('name', ['Standard', 'Basic'])
  })

  it('should_return_the_raw_rows', async () => {
    makeChain([{ name: 'Standard', price: 50 }])
    const result = await getTierPricesByNames('barn-1', ['Standard'])
    expect(result).toEqual([{ name: 'Standard', price: 50 }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getTierPricesByNames('barn-1', ['Standard'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('tiers error'))
    await expect(getTierPricesByNames('barn-1', ['Standard'])).rejects.toThrow('tiers error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getTierPricesByNames('barn-1', ['Standard'], mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lesson_tiers')
  })
})

describe('getOutstandingLessonRows', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getRiderEnrolledLessonIds).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getOutstandingTransactionRows).mockReset().mockResolvedValue([])
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // an "unpaid" row for a given lesson id, matching what get_outstanding_transactions
  // would relay for a lesson_fee transaction that hasn't been collected yet
  function unpaid(lessonId: string) {
    return [{ kind: 'lesson_fee' as const, entityId: lessonId, amount: 50, collected: false, paymentType: null }]
  }

  function makeDefaultChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEq, mockLt, mockOrder }
  }

  function makeTrainerChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEqInstructor = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ eq: mockEqInstructor })
    const mockEqBarn = vi.fn().mockReturnValue({ lt: mockLt })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockEqInstructor, mockOrder }
  }

  function makeRiderChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEqBarn = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIn = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockIn, mockEqBarn, mockLt, mockOrder }
  }

  describe('manager/default path', () => {
    it('should_filter_by_barn_id', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockEq } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockLt } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      const { mockOrder } = makeDefaultChain([])
      await getOutstandingLessonRows('barn-1')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      const lesson = createMockLesson({ fee: 0 })
      makeDefaultChain([lesson])
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(0)
    })

    it('should_not_call_the_outstanding_transactions_rpc_when_there_are_no_fee_bearing_candidates', async () => {
      const lesson = createMockLesson({ fee: 0 })
      makeDefaultChain([lesson])
      await getOutstandingLessonRows('barn-1')
      expect(getOutstandingTransactionRows).not.toHaveBeenCalled()
    })

    it('should_query_the_outstanding_transactions_rpc_with_candidate_lesson_ids', async () => {
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeDefaultChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaid('lesson-1'))
      await getOutstandingLessonRows('barn-1')
      expect(getOutstandingTransactionRows).toHaveBeenCalledWith('barn-1', { lessonIds: ['lesson-1'] }, expect.anything())
    })

    it('should_include_a_non_zero_fee_lesson_whose_ledger_transaction_is_uncollected', async () => {
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeDefaultChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaid('lesson-1'))
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(1)
    })

    it('should_exclude_a_non_zero_fee_lesson_whose_ledger_transaction_is_already_collected', async () => {
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeDefaultChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
        { kind: 'lesson_fee', entityId: 'lesson-1', amount: 50, collected: true, paymentType: 'venmo' },
      ])
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(0)
    })

    it('should_exclude_a_lesson_with_no_matching_ledger_transaction', async () => {
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeDefaultChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue([])
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toHaveLength(0)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      makeDefaultChain(null)
      const result = await getOutstandingLessonRows('barn-1')
      expect(result).toEqual([])
    })

    it('should_not_apply_instructor_filter_for_manager_role', async () => {
      makeDefaultChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-mgr', 'manager')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      makeDefaultChain(null, new Error('db error'))
      await expect(getOutstandingLessonRows('barn-1')).rejects.toThrow('db error')
    })

    it('should_throw_when_the_outstanding_transactions_rpc_errors', async () => {
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeDefaultChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockRejectedValue(new Error('rpc error'))
      await expect(getOutstandingLessonRows('barn-1')).rejects.toThrow('rpc error')
    })
  })

  describe('trainer path', () => {
    it('should_resolve_instructor_filter_to_the_callers_membership_id', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const { mockEqInstructor } = makeTrainerChain([])
      await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(mockEqInstructor).toHaveBeenCalledWith('instructor_id', 'mem-trainer-1')
    })

    it('should_return_empty_array_when_caller_has_no_membership', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      makeTrainerChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toEqual([])
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const lesson = createMockLesson({ fee: 0 })
      makeTrainerChain([lesson])
      const result = await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toHaveLength(0)
    })

    it('should_include_an_unpaid_non_zero_fee_lesson', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeTrainerChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaid('lesson-1'))
      const result = await getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toHaveLength(1)
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      makeTrainerChain(null, new Error('trainer error'))
      await expect(getOutstandingLessonRows('barn-1', 'user-trainer', 'trainer')).rejects.toThrow('trainer error')
    })
  })

  describe('rider path', () => {
    it('should_not_query_lessons_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      const { from } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(from).not.toHaveBeenCalled()
    })

    it('should_return_empty_array_when_rider_has_no_enrollments', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      makeRiderChain([])
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_query_lessons_by_enrolled_lesson_ids', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockIn } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
    })

    it('should_pass_the_resolved_client_through_to_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
      makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(getRiderEnrolledLessonIds).toHaveBeenCalledWith('barn-1', 'user-rider', expect.anything())
    })

    it('should_filter_by_barn_id', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockEqBarn } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
    })

    it('should_filter_lessons_before_now', async () => {
      vi.useFakeTimers()
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'))
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockLt } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockLt).toHaveBeenCalledWith('lesson_at', new Date('2026-06-15T12:00:00Z').toISOString())
    })

    it('should_sort_ascending_by_lesson_at', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const { mockOrder } = makeRiderChain([])
      await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
    })

    it('should_exclude_zero_fee_lessons', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 0 })
      makeRiderChain([lesson])
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(0)
    })

    it('should_include_an_unpaid_lesson_with_non_zero_fee', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      const lesson = createMockLesson({ id: 'lesson-1', fee: 50 })
      makeRiderChain([lesson])
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue(unpaid('lesson-1'))
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toHaveLength(1)
    })

    it('should_return_empty_array_when_data_is_null', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      makeRiderChain(null)
      const result = await getOutstandingLessonRows('barn-1', 'user-rider', 'rider')
      expect(result).toEqual([])
    })

    it('should_throw_when_supabase_returns_an_error', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue(['lesson-1'])
      makeRiderChain(null, new Error('rider lessons error'))
      await expect(getOutstandingLessonRows('barn-1', 'user-rider', 'rider')).rejects.toThrow('rider lessons error')
    })

    it('should_propagate_error_from_getRiderEnrolledLessonIds', async () => {
      vi.mocked(getRiderEnrolledLessonIds).mockRejectedValue(new Error('enrollment lookup error'))
      makeRiderChain([])
      await expect(getOutstandingLessonRows('barn-1', 'user-rider', 'rider')).rejects.toThrow('enrollment lookup error')
    })

    it('should_not_take_rider_path_when_userId_is_missing', async () => {
      makeDefaultChain([])
      await getOutstandingLessonRows('barn-1', undefined, 'rider')
      expect(getRiderEnrolledLessonIds).not.toHaveBeenCalled()
    })
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getRiderEnrolledLessonIds).mockResolvedValue([])
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockLt = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq = vi.fn().mockReturnValue({ lt: mockLt })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getOutstandingLessonRows('barn-1', undefined, undefined, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lessons')
  })
})

describe('getOutstandingCancellationFeeRows', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getOutstandingTransactionRows).mockReset().mockResolvedValue([])
  })

  function makeChain(cancelledRows: unknown[] | null, lessonRows: unknown[] | null = [], errors: { cancelled?: Error; lessons?: Error } = {}) {
    const cancelledNotIs = vi.fn().mockResolvedValue({ data: cancelledRows, error: errors.cancelled ?? null })
    const cancelledEq = vi.fn().mockReturnValue({ not: cancelledNotIs })
    const cancelledSelect = vi.fn().mockReturnValue({ eq: cancelledEq })

    const lessonsIn = vi.fn().mockResolvedValue({ data: lessonRows, error: errors.lessons ?? null })
    const lessonsEq = vi.fn().mockReturnValue({ in: lessonsIn })
    const lessonsSelect = vi.fn().mockReturnValue({ eq: lessonsEq })

    const from = vi.fn((table: string) => (table === 'lesson_riders' ? { select: cancelledSelect } : { select: lessonsSelect }))
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, cancelledSelect, cancelledEq, cancelledNotIs, lessonsSelect, lessonsEq, lessonsIn }
  }

  it('should_query_lesson_riders_for_cancelled_rows_in_the_barn', async () => {
    const { cancelledEq, cancelledNotIs } = makeChain([])
    await getOutstandingCancellationFeeRows('barn-1')
    expect(cancelledEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(cancelledNotIs).toHaveBeenCalledWith('cancelled_at', 'is', null)
  })

  it('should_return_empty_array_when_no_rows_are_cancelled', async () => {
    makeChain([])
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_cancelled_rows_is_null', async () => {
    makeChain(null)
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([])
  })

  it('should_throw_when_the_lesson_riders_query_errors', async () => {
    makeChain(null, [], { cancelled: new Error('lesson_riders error') })
    await expect(getOutstandingCancellationFeeRows('barn-1')).rejects.toThrow('lesson_riders error')
  })

  it('should_not_call_the_outstanding_transactions_rpc_when_nothing_is_cancelled', async () => {
    makeChain([])
    await getOutstandingCancellationFeeRows('barn-1')
    expect(getOutstandingTransactionRows).not.toHaveBeenCalled()
  })

  it('should_query_the_outstanding_transactions_rpc_with_cancelled_lesson_rider_ids', async () => {
    makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }])
    await getOutstandingCancellationFeeRows('barn-1')
    expect(getOutstandingTransactionRows).toHaveBeenCalledWith('barn-1', { lessonRiderIds: ['lr-1'] }, expect.anything())
  })

  it('should_return_empty_array_when_no_cancellation_fees_are_outstanding', async () => {
    makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([])
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([])
  })

  it('should_exclude_a_lesson_rider_whose_cancellation_fee_is_already_collected', async () => {
    makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }])
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
      { kind: 'rider_cancellation_fee', entityId: 'lr-1', amount: 50, collected: true, paymentType: 'venmo' },
    ])
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([])
  })

  it('should_resolve_lesson_at_and_instructor_id_for_an_uncollected_cancellation_fee', async () => {
    makeChain(
      [{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }],
      [{ id: 'lesson-1', lesson_at: '2026-06-01T10:00:00Z', instructor_id: 'mem-trainer-1' }]
    )
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
      { kind: 'rider_cancellation_fee', entityId: 'lr-1', amount: 75, collected: false, paymentType: null },
    ])
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([{
      id: 'lr-1',
      lessonId: 'lesson-1',
      lessonAt: '2026-06-01T10:00:00Z',
      instructorId: 'mem-trainer-1',
      riderId: 'rider-1',
      fee: 75,
    }])
  })

  it('should_throw_when_the_lessons_lookup_errors', async () => {
    makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }], null, { lessons: new Error('lessons error') })
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
      { kind: 'rider_cancellation_fee', entityId: 'lr-1', amount: 75, collected: false, paymentType: null },
    ])
    await expect(getOutstandingCancellationFeeRows('barn-1')).rejects.toThrow('lessons error')
  })

  it('should_treat_a_null_lessons_lookup_response_as_empty', async () => {
    makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }], null)
    vi.mocked(getOutstandingTransactionRows).mockResolvedValue([])
    const result = await getOutstandingCancellationFeeRows('barn-1')
    expect(result).toEqual([])
  })

  describe('trainer scoping', () => {
    it('should_resolve_the_callers_membership_id', async () => {
      makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }])
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      await getOutstandingCancellationFeeRows('barn-1', 'user-trainer', 'trainer')
      expect(getUserMembership).toHaveBeenCalledWith('user-trainer', 'barn-1')
    })

    it('should_return_empty_array_when_the_caller_has_no_membership', async () => {
      makeChain([{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }])
      vi.mocked(getUserMembership).mockResolvedValue(null)
      const result = await getOutstandingCancellationFeeRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toEqual([])
    })

    it('should_exclude_a_cancellation_fee_for_a_lesson_the_caller_does_not_instruct', async () => {
      makeChain(
        [{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }],
        [{ id: 'lesson-1', lesson_at: '2026-06-01T10:00:00Z', instructor_id: 'mem-other-trainer' }]
      )
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
        { kind: 'rider_cancellation_fee', entityId: 'lr-1', amount: 75, collected: false, paymentType: null },
      ])
      const result = await getOutstandingCancellationFeeRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toEqual([])
    })

    it('should_include_a_cancellation_fee_for_a_lesson_the_caller_instructs', async () => {
      makeChain(
        [{ id: 'lr-1', lesson_id: 'lesson-1', rider_id: 'rider-1' }],
        [{ id: 'lesson-1', lesson_at: '2026-06-01T10:00:00Z', instructor_id: 'mem-trainer-1' }]
      )
      vi.mocked(getUserMembership).mockResolvedValue({ id: 'mem-trainer-1' } as any)
      vi.mocked(getOutstandingTransactionRows).mockResolvedValue([
        { kind: 'rider_cancellation_fee', entityId: 'lr-1', amount: 75, collected: false, paymentType: null },
      ])
      const result = await getOutstandingCancellationFeeRows('barn-1', 'user-trainer', 'trainer')
      expect(result).toHaveLength(1)
    })
  })

  it('should_use_injected_client_when_provided', async () => {
    const notIs = vi.fn().mockResolvedValue({ data: [], error: null })
    const eq = vi.fn().mockReturnValue({ not: notIs })
    const select = vi.fn().mockReturnValue({ eq })
    const from = vi.fn().mockReturnValue({ select })
    const mockClient = { from } as any

    await getOutstandingCancellationFeeRows('barn-1', undefined, undefined, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lesson_riders')
  })
})

describe('getLessonJunctionRows', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn }
  }

  it('should_not_query_when_lesson_ids_is_empty', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', [])
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_lesson_ids_is_empty', async () => {
    makeChain([])
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', [])
    expect(result).toEqual([])
  })

  it('should_query_the_given_rider_table', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(from).toHaveBeenCalledWith('lesson_riders')
  })

  it('should_query_the_given_horse_table', async () => {
    const { from } = makeChain([])
    await getLessonJunctionRows('lesson_horses', 'horse_id', 'barn-1', ['lesson-1'])
    expect(from).toHaveBeenCalledWith('lesson_horses')
  })

  it('should_select_lesson_id_and_the_given_participant_column', async () => {
    const { mockSelect } = makeChain([])
    await getLessonJunctionRows('lesson_horses', 'horse_id', 'barn-1', ['lesson-1'])
    expect(mockSelect).toHaveBeenCalledWith('lesson_id, horse_id')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_lesson_ids', async () => {
    const { mockIn } = makeChain([])
    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1', 'lesson-2'])
    expect(mockIn).toHaveBeenCalledWith('lesson_id', ['lesson-1', 'lesson-2'])
  })

  it('should_return_the_raw_rows', async () => {
    makeChain([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(result).toEqual([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('junction error'))
    await expect(
      getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'])
    ).rejects.toThrow('junction error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getLessonJunctionRows('lesson_riders', 'rider_id', 'barn-1', ['lesson-1'], mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('lesson_riders')
  })
})
