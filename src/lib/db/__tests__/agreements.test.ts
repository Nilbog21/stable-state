import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockAgreement, createMockAgreementCharge } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../transactions')

import { createClient } from '@/lib/supabase/server'
import { getTransactionRows } from '../transactions'
import type { TransactionRow } from '../transactions'
import {
  createAgreement,
  getAgreementsByBarn,
  getAgreementById,
  getActiveAgreementsForRider,
  updateAgreement,
  endAgreement,
  getChargesForAgreement,
  updateCharge,
  updateChargePaymentType,
  generateChargeForMonth,
  getBarnDefaultBoardFee,
  getUnpaidAgreementIds,
} from '../agreements'

const mockAgreement = createMockAgreement()
const mockCharge = createMockAgreementCharge()
// #1441: what the three charge-writing RPCs actually return — `agreement_charges` has had no
// `payment_type` column since #831. `getChargesForAgreement` keeps `mockCharge`, since that
// reader really does overlay the field back on from `transactions`.
const { payment_type: _payment_type, ...mockChargeRow } = mockCharge

describe('createAgreement', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_start_date_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockAgreement, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createAgreement({
      barnId: 'barn-1', riderId: 'rider-1', horseId: 'horse-1', fee: 200,
      kind: 'lease', cadence: 'monthly', startDate: '2026-07-01',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_agreement_with_first_charge', {
      p_barn_id: 'barn-1', p_rider_id: 'rider-1', p_horse_id: 'horse-1', p_fee: 200,
      p_kind: 'lease', p_cadence: 'monthly', p_start_date: '2026-07-01',
    })
  })

  it('should_omit_start_date_param_when_not_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockAgreement, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createAgreement({
      barnId: 'barn-1', riderId: 'rider-1', horseId: 'horse-1', fee: 200,
      kind: 'lease', cadence: 'monthly',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_agreement_with_first_charge', {
      p_barn_id: 'barn-1', p_rider_id: 'rider-1', p_horse_id: 'horse-1', p_fee: 200,
      p_kind: 'lease', p_cadence: 'monthly',
    })
  })

  it('should_return_rpc_data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockAgreement, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await createAgreement({
      barnId: 'barn-1', riderId: 'rider-1', horseId: 'horse-1', fee: 200,
      kind: 'board', cadence: 'monthly',
    })

    expect(result).toEqual(mockAgreement)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      createAgreement({ barnId: 'barn-1', riderId: 'rider-1', horseId: 'horse-1', fee: 200, kind: 'lease', cadence: 'monthly' })
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockAgreement, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await createAgreement(
      { barnId: 'barn-1', riderId: 'rider-1', horseId: 'horse-1', fee: 200, kind: 'lease', cadence: 'monthly' },
      mockClient
    )

    expect(result).toEqual(mockAgreement)
  })
})

describe('getAgreementsByBarn', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const barnEqResult = { eq: vi.fn().mockReturnValue({ order: mockOrder }), order: mockOrder }
    const mockEq = vi.fn().mockReturnValue(barnEqResult)
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, barnEqResult, mockOrder }
  }

  it('should_filter_by_barn_id_only_when_kind_omitted', async () => {
    const { select, mockEq } = makeChain([mockAgreement])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getAgreementsByBarn('barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_kind_when_provided', async () => {
    const { select, barnEqResult } = makeChain([mockAgreement])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getAgreementsByBarn('barn-1', 'board')

    expect(barnEqResult.eq).toHaveBeenCalledWith('kind', 'board')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getAgreementsByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getAgreementsByBarn('barn-1')).rejects.toThrow('db error')
  })
})

describe('getAgreementById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  it('should_return_agreement_when_found', async () => {
    const { select } = makeChain(mockAgreement)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getAgreementById('agreement-1', 'barn-1')

    expect(result).toEqual(mockAgreement)
  })

  it('should_return_null_when_not_found', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getAgreementById('agreement-1', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getAgreementById('agreement-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('getActiveAgreementsForRider', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockEq0 = vi.fn().mockReturnValue({ eq: mockEq1 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq0 })
    return { select: mockSelect, mockEq0 }
  }

  it('should_filter_by_barn_rider_and_is_active', async () => {
    const { select, mockEq0 } = makeChain([mockAgreement])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getActiveAgreementsForRider('barn-1', 'rider-1')

    expect(mockEq0).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_return_all_active_agreements_of_any_kind', async () => {
    const boardAgreement = createMockAgreement({ id: 'agreement-board', kind: 'board' })
    const leaseAgreement = createMockAgreement({ id: 'agreement-lease', kind: 'lease' })
    const { select } = makeChain([boardAgreement, leaseAgreement])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getActiveAgreementsForRider('barn-1', 'rider-1')

    expect(result).toEqual([boardAgreement, leaseAgreement])
  })

  it('should_return_empty_array_when_no_active_agreements', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getActiveAgreementsForRider('barn-1', 'rider-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_supabase_returns_null_data', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getActiveAgreementsForRider('barn-1', 'rider-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getActiveAgreementsForRider('barn-1', 'rider-1')).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const { select } = makeChain([mockAgreement])
    const mockClient = { from: vi.fn().mockReturnValue({ select }) } as any

    const result = await getActiveAgreementsForRider('barn-1', 'rider-1', mockClient)

    expect(result).toEqual([mockAgreement])
  })
})

describe('updateAgreement', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { update: mockUpdate, mockUpdate }
  }

  it('should_update_fee', async () => {
    const { update, mockUpdate } = makeChain({ ...mockAgreement, fee: 250 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateAgreement('agreement-1', 'barn-1', { fee: 250 })

    expect(mockUpdate).toHaveBeenCalledWith({ fee: 250 })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateAgreement('agreement-1', 'barn-1', { fee: 250 })).rejects.toThrow('db error')
  })
})

describe('endAgreement', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(error: Error | null = null) {
    const mockEq2 = vi.fn().mockResolvedValue({ error })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { update: mockUpdate, mockUpdate }
  }

  it('should_set_is_active_false', async () => {
    const { update, mockUpdate } = makeChain()
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await endAgreement('agreement-1', 'barn-1')

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(endAgreement('agreement-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('getChargesForAgreement', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  function makeTxnChain(data: unknown[] | null, error: Error | null = null) {
    const mockInCharge = vi.fn().mockResolvedValue({ data, error })
    const mockInKind = vi.fn().mockReturnValue({ in: mockInCharge })
    const mockEq = vi.fn().mockReturnValue({ in: mockInKind })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function mockFrom(
    chargesData: unknown[] | null,
    chargesError: Error | null = null,
    txnRows: unknown[] | null = [],
    txnError: Error | null = null
  ) {
    const { select: chargesSelect } = makeChain(chargesData, chargesError)
    const { select: txnSelect } = makeTxnChain(txnRows, txnError)
    const from = vi.fn().mockImplementation((table: string) =>
      table === 'transactions' ? { select: txnSelect } : { select: chargesSelect }
    )
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from }
  }

  it('should_return_charges_for_agreement', async () => {
    mockFrom([mockCharge])

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result).toEqual([mockCharge])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    mockFrom(null)

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    mockFrom(null, new Error('db error'))

    await expect(getChargesForAgreement('agreement-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_overlay_payment_type_from_transactions_not_agreement_charges', async () => {
    const staleCharge = { ...mockCharge, id: 'charge-1', payment_type: null }
    mockFrom([staleCharge], null, [{ agreement_charge_id: 'charge-1', payment_type: 'venmo' }])

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result[0].payment_type).toBe('venmo')
  })

  it('should_default_payment_type_to_null_when_no_matching_transaction', async () => {
    const staleCharge = { ...mockCharge, id: 'charge-1', payment_type: 'zelle' }
    mockFrom([staleCharge], null, [])

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_default_payment_type_to_null_when_transactions_data_is_null', async () => {
    const staleCharge = { ...mockCharge, id: 'charge-1', payment_type: 'zelle' }
    mockFrom([staleCharge], null, null)

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result[0].payment_type).toBeNull()
  })

  it('should_throw_when_transactions_query_returns_error', async () => {
    mockFrom([mockCharge], null, null, new Error('transactions error'))

    await expect(getChargesForAgreement('agreement-1', 'barn-1')).rejects.toThrow('transactions error')
  })

  it('should_not_query_transactions_when_there_are_no_charges', async () => {
    const { from } = mockFrom([])

    await getChargesForAgreement('agreement-1', 'barn-1')

    expect(from).not.toHaveBeenCalledWith('transactions')
  })
})

describe('updateCharge', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_the_update_agreement_charge_fee_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: { ...mockChargeRow, fee: 300 }, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateCharge('charge-1', 'barn-1', 300)

    expect(mockRpc).toHaveBeenCalledWith('update_agreement_charge_fee', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_fee: 300,
    })
  })

  it('should_return_rpc_data', async () => {
    const updated = { ...mockChargeRow, fee: 300 }
    const mockRpc = vi.fn().mockResolvedValue({ data: updated, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateCharge('charge-1', 'barn-1', 300)

    expect(result).toEqual(updated)
  })

  it('should_not_expose_payment_type_on_the_returned_row', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: { ...mockChargeRow, fee: 300 }, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateCharge('charge-1', 'barn-1', 300)

    // @ts-expect-error #1441: agreement_charges has had no payment_type column since #831
    expect(result.payment_type).toBeUndefined()
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(updateCharge('charge-1', 'barn-1', 300)).rejects.toThrow('db error')
  })
})

describe('updateChargePaymentType', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_the_mark_agreement_charge_paid_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    expect(mockRpc).toHaveBeenCalledWith('mark_agreement_charge_paid', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_payment_type: 'venmo',
    })
  })

  it('should_pass_null_payment_type_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateChargePaymentType('charge-1', 'barn-1', null)

    expect(mockRpc).toHaveBeenCalledWith('mark_agreement_charge_paid', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_payment_type: null,
    })
  })

  it('should_return_rpc_data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    expect(result).toEqual(mockChargeRow)
  })

  it('should_not_expose_payment_type_on_the_returned_row', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    // @ts-expect-error #1441: agreement_charges has had no payment_type column since #831
    expect(result.payment_type).toBeUndefined()
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(updateChargePaymentType('charge-1', 'barn-1', 'venmo')).rejects.toThrow('db error')
  })
})

describe('generateChargeForMonth', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_barn_id_agreement_id_and_normalized_period', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-07-15T12:00:00Z'))

    expect(mockRpc).toHaveBeenCalledWith('generate_agreement_charge', {
      p_agreement_id: 'agreement-1', p_barn_id: 'barn-1', p_period: '2026-07-01',
    })
  })

  // #1361: the two boundary cases the UTC truncation got wrong — an instant that has already
  // rolled into the next month in UTC but is still last month at the barn. Two zones, six
  // hours apart, so the fix can't be a constant offset.
  it('should_truncate_to_the_barn_month_when_utc_has_already_rolled_into_the_next_month', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    // 2026-08-01 03:00 UTC is 2026-07-31 23:00 in New York (UTC-4 in August)
    await generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-08-01T03:00:00Z'))

    expect(mockRpc).toHaveBeenCalledWith('generate_agreement_charge', {
      p_agreement_id: 'agreement-1', p_barn_id: 'barn-1', p_period: '2026-07-01',
    })
  })

  it('should_truncate_to_the_barn_month_at_a_honolulu_boundary', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    // 2026-08-01 09:00 UTC is 2026-07-31 23:00 in Honolulu (UTC-10, no DST)
    await generateChargeForMonth('agreement-1', 'barn-1', 'Pacific/Honolulu', new Date('2026-08-01T09:00:00Z'))

    expect(mockRpc).toHaveBeenCalledWith('generate_agreement_charge', {
      p_agreement_id: 'agreement-1', p_barn_id: 'barn-1', p_period: '2026-07-01',
    })
  })

  it('should_return_rpc_data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-07-15T12:00:00Z'))

    expect(result).toEqual(mockChargeRow)
  })

  it('should_not_expose_payment_type_on_the_returned_row', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-07-15T12:00:00Z'))

    // @ts-expect-error #1441: agreement_charges has had no payment_type column since #831
    expect(result.payment_type).toBeUndefined()
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-07-15T12:00:00Z'))
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockChargeRow, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await generateChargeForMonth('agreement-1', 'barn-1', 'America/New_York', new Date('2026-07-15T12:00:00Z'), mockClient)

    expect(result).toEqual(mockChargeRow)
  })
})

describe('getBarnDefaultBoardFee', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ single: mockSingle })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_default_board_fee', async () => {
    const { select } = makeChain({ default_board_fee: 1000 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getBarnDefaultBoardFee('barn-1')

    expect(result).toBe(1000)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getBarnDefaultBoardFee('barn-1')).rejects.toThrow('db error')
  })
})

describe('getUnpaidAgreementIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function unpaidChargeRow(overrides: Partial<TransactionRow> = {}): TransactionRow {
    return {
      id: 'txn-1', kind: 'lease_charge', amount: 200, collected: false, paymentType: null,
      membershipId: 'rider-1', horseId: 'horse-1', lessonId: null, lessonRiderId: null,
      agreementChargeId: 'charge-1', expenseId: null, occurredAt: '2026-06-01T00:00:00+00:00',
      ...overrides,
    }
  }

  function makeChargesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, select: mockSelect, mockEq, mockIn }
  }

  it('should_delegate_to_getTransactionRows_with_charge_kinds_and_collected_false', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const mockClient = { from: vi.fn() } as any
    vi.mocked(createClient).mockResolvedValue(mockClient)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lease_charge', 'board_charge'],
      { endDate: new Date(Date.UTC(2026, 6, 1)), collected: false },
      mockClient
    )
  })

  it('should_bound_on_the_barn_month_when_utc_has_already_rolled_over', async () => {
    // 2026-08-01T02:00Z is still 2026-07-31 21:00 in New York, so July's charge is
    // current-month and must stay out of the unpaid set.
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const mockClient = { from: vi.fn() } as any
    vi.mocked(createClient).mockResolvedValue(mockClient)
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T02:00:00Z'))
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(getTransactionRows).toHaveBeenCalledWith(
      'barn-1', ['lease_charge', 'board_charge'],
      { endDate: new Date('2026-07-01T00:00:00Z'), collected: false },
      mockClient
    )
  })

  it('should_return_empty_set_when_no_unpaid_transactions', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const result = await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(result).toEqual(new Set())
  })

  it('should_query_agreement_charges_for_the_returned_charge_ids', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([unpaidChargeRow()])
    const { mockEq, mockIn } = makeChargesChain([{ id: 'charge-1', agreement_id: 'agreement-1' }])
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-1'])
  })

  it('should_dedupe_duplicate_agreement_ids_into_a_set', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      unpaidChargeRow({ id: 'txn-1', agreementChargeId: 'charge-1' }),
      unpaidChargeRow({ id: 'txn-2', agreementChargeId: 'charge-2' }),
    ])
    makeChargesChain([
      { id: 'charge-1', agreement_id: 'agreement-1' },
      { id: 'charge-2', agreement_id: 'agreement-1' },
    ])
    const result = await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(result).toEqual(new Set(['agreement-1']))
  })

  it('should_filter_null_charge_ids_before_the_followup_query', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([
      unpaidChargeRow({ id: 'txn-1', agreementChargeId: null }),
      unpaidChargeRow({ id: 'txn-2', agreementChargeId: 'charge-2' }),
    ])
    const { mockIn } = makeChargesChain([{ id: 'charge-2', agreement_id: 'agreement-2' }])
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(mockIn).toHaveBeenCalledWith('id', ['charge-2'])
  })

  it('should_skip_followup_query_when_there_are_no_unpaid_rows', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const { from } = makeChargesChain([])
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(from).not.toHaveBeenCalled()
  })

  it('should_skip_followup_query_when_every_charge_id_is_null', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([unpaidChargeRow({ agreementChargeId: null })])
    const { from } = makeChargesChain([])
    await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(from).not.toHaveBeenCalled()
  })

  it('should_return_empty_set_when_followup_data_is_null', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([unpaidChargeRow()])
    makeChargesChain(null)
    const result = await getUnpaidAgreementIds('barn-1', 'America/New_York')
    expect(result).toEqual(new Set())
  })

  it('should_throw_when_followup_query_errors', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([unpaidChargeRow()])
    makeChargesChain(null, new Error('db error'))
    await expect(getUnpaidAgreementIds('barn-1', 'America/New_York')).rejects.toThrow('db error')
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('transactions error'))
    await expect(getUnpaidAgreementIds('barn-1', 'America/New_York')).rejects.toThrow('transactions error')
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([unpaidChargeRow()])
    const mockIn = vi.fn().mockResolvedValue({ data: [{ id: 'charge-1', agreement_id: 'agreement-1' }], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    const result = await getUnpaidAgreementIds('barn-1', 'America/New_York', mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(result).toEqual(new Set(['agreement-1']))
  })
})
