import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getTransactionRows, positiveAmount } from '../transactions'

function calledWith(fn: ReturnType<typeof vi.fn>, ...args: unknown[]) {
  return fn.mock.calls.some((call) => JSON.stringify(call) === JSON.stringify(args))
}

describe('getTransactionRows', () => {
  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  // eq/in/gte/lt are independently optional (collected/startDate/endDate are each
  // optional), so the chain node must self-return and be thenable at every step,
  // rather than a fixed nested shape.
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const node: any = {}
    node.eq = vi.fn().mockReturnValue(node)
    node.in = vi.fn().mockReturnValue(node)
    node.gte = vi.fn().mockReturnValue(node)
    node.lt = vi.fn().mockReturnValue(node)
    node.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve)
    const mockSelect = vi.fn().mockReturnValue(node)
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, node }
  }

  const baseRow = {
    id: 'txn-1',
    kind: 'lesson_fee',
    amount: 200,
    collected: true,
    payment_type: 'venmo',
    membership_id: 'membership-1',
    horse_id: 'horse-1',
    lesson_id: 'lesson-1',
    lesson_rider_id: 'lesson-rider-1',
    agreement_charge_id: null,
    expense_id: null,
    occurred_at: '2026-07-10T10:00:00+00:00',
  }

  it('should_query_the_transactions_table', async () => {
    const { from } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(from).toHaveBeenCalledWith('transactions')
  })

  it('should_select_all_base_ledger_columns', async () => {
    const { mockSelect } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(mockSelect).toHaveBeenCalledWith(
      'id, kind, amount, collected, payment_type, membership_id, horse_id, lesson_id, lesson_rider_id, agreement_charge_id, expense_id, occurred_at'
    )
  })

  it('should_filter_by_barn_id', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(calledWith(node.eq, 'barn_id', 'barn-1')).toBe(true)
  })

  it('should_filter_by_kinds', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee', 'instructor_payout'])
    expect(node.in).toHaveBeenCalledWith('kind', ['lesson_fee', 'instructor_payout'])
  })

  it('should_filter_by_collected_when_option_is_true', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'], { collected: true })
    expect(calledWith(node.eq, 'collected', true)).toBe(true)
  })

  it('should_filter_by_collected_when_option_is_false', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'], { collected: false })
    expect(calledWith(node.eq, 'collected', false)).toBe(true)
  })

  it('should_not_filter_by_collected_when_option_omitted', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(calledWith(node.eq, 'collected', true)).toBe(false)
    expect(calledWith(node.eq, 'collected', false)).toBe(false)
  })

  it('should_filter_by_start_date_when_provided', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'], { startDate })
    expect(node.gte).toHaveBeenCalledWith('occurred_at', startDate.toISOString())
  })

  it('should_not_filter_by_start_date_when_omitted', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(node.gte).not.toHaveBeenCalled()
  })

  it('should_filter_by_end_date_when_provided', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'], { endDate })
    expect(node.lt).toHaveBeenCalledWith('occurred_at', endDate.toISOString())
  })

  it('should_not_filter_by_end_date_when_omitted', async () => {
    const { node } = makeChain([])
    await getTransactionRows('barn-1', ['lesson_fee'])
    expect(node.lt).not.toHaveBeenCalled()
  })

  it('should_map_snake_case_row_fields_to_camel_case', async () => {
    makeChain([baseRow])
    const result = await getTransactionRows('barn-1', ['lesson_fee'])
    expect(result).toEqual([{
      id: 'txn-1',
      kind: 'lesson_fee',
      amount: 200,
      collected: true,
      paymentType: 'venmo',
      membershipId: 'membership-1',
      horseId: 'horse-1',
      lessonId: 'lesson-1',
      lessonRiderId: 'lesson-rider-1',
      agreementChargeId: null,
      expenseId: null,
      occurredAt: '2026-07-10T10:00:00+00:00',
    }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getTransactionRows('barn-1', ['lesson_fee'])
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    makeChain(null, new Error('db error'))
    await expect(getTransactionRows('barn-1', ['lesson_fee'])).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const node: any = {}
    node.eq = vi.fn().mockReturnValue(node)
    node.in = vi.fn().mockReturnValue(node)
    node.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve)
    const from = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(node) })
    const mockClient = { from } as any

    await getTransactionRows('barn-1', ['lesson_fee'], {}, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('transactions')
  })
})

describe('positiveAmount', () => {
  it('should_flip_sign_for_instructor_payout', () => {
    expect(positiveAmount('instructor_payout', -50)).toBe(50)
  })

  it('should_flip_sign_for_expense', () => {
    expect(positiveAmount('expense', -75)).toBe(75)
  })

  it('should_leave_lesson_fee_unchanged', () => {
    expect(positiveAmount('lesson_fee', 200)).toBe(200)
  })

  it('should_leave_rider_cancellation_fee_unchanged', () => {
    expect(positiveAmount('rider_cancellation_fee', 200)).toBe(200)
  })

  it('should_leave_lease_charge_unchanged', () => {
    expect(positiveAmount('lease_charge', 500)).toBe(500)
  })

  it('should_leave_board_charge_unchanged', () => {
    expect(positiveAmount('board_charge', 1000)).toBe(1000)
  })
})
