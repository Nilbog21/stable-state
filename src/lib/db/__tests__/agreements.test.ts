import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockAgreement, createMockAgreementCharge } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('../barn-memberships')

import { createClient } from '@/lib/supabase/server'
import { resolveMemberNames } from '../barn-memberships'
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
  getChargesForSummary,
  getPaidCharges,
  getOutstandingCharges,
} from '../agreements'

const mockAgreement = createMockAgreement()
const mockCharge = createMockAgreementCharge()

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

  it('should_return_charges_for_agreement', async () => {
    const { select } = makeChain([mockCharge])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result).toEqual([mockCharge])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getChargesForAgreement('agreement-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getChargesForAgreement('agreement-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('updateCharge', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_the_update_agreement_charge_fee_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: { ...mockCharge, fee: 300 }, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateCharge('charge-1', 'barn-1', 300)

    expect(mockRpc).toHaveBeenCalledWith('update_agreement_charge_fee', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_fee: 300,
    })
  })

  it('should_return_rpc_data', async () => {
    const updated = { ...mockCharge, fee: 300 }
    const mockRpc = vi.fn().mockResolvedValue({ data: updated, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateCharge('charge-1', 'barn-1', 300)

    expect(result).toEqual(updated)
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
    const mockRpc = vi.fn().mockResolvedValue({ data: { ...mockCharge, payment_type: 'venmo' }, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    expect(mockRpc).toHaveBeenCalledWith('mark_agreement_charge_paid', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_payment_type: 'venmo',
    })
  })

  it('should_pass_null_payment_type_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: { ...mockCharge, payment_type: null }, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateChargePaymentType('charge-1', 'barn-1', null)

    expect(mockRpc).toHaveBeenCalledWith('mark_agreement_charge_paid', {
      p_charge_id: 'charge-1', p_barn_id: 'barn-1', p_payment_type: null,
    })
  })

  it('should_return_rpc_data', async () => {
    const updated = { ...mockCharge, payment_type: 'venmo' }
    const mockRpc = vi.fn().mockResolvedValue({ data: updated, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    expect(result).toEqual(updated)
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
    const mockRpc = vi.fn().mockResolvedValue({ data: mockCharge, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await generateChargeForMonth('agreement-1', 'barn-1', new Date('2026-07-15T00:00:00Z'))

    expect(mockRpc).toHaveBeenCalledWith('generate_agreement_charge', {
      p_agreement_id: 'agreement-1', p_barn_id: 'barn-1', p_period: '2026-07-01',
    })
  })

  it('should_return_rpc_data', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockCharge, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await generateChargeForMonth('agreement-1', 'barn-1', new Date('2026-07-15T00:00:00Z'))

    expect(result).toEqual(mockCharge)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      generateChargeForMonth('agreement-1', 'barn-1', new Date('2026-07-15T00:00:00Z'))
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockCharge, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await generateChargeForMonth('agreement-1', 'barn-1', new Date('2026-07-15T00:00:00Z'), mockClient)

    expect(result).toEqual(mockCharge)
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

describe('getChargesForSummary', () => {
  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIn = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn, mockGte, mockLt }
  }

  it('should_query_the_transactions_table', async () => {
    const { from } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(from).toHaveBeenCalledWith('transactions')
  })

  it('should_select_occurred_at_amount_and_payment_type', async () => {
    const { mockSelect } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(mockSelect).toHaveBeenCalledWith('occurred_at, amount, payment_type')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_to_charge_transaction_kinds', async () => {
    const { mockIn } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(mockIn).toHaveBeenCalledWith('kind', ['lease_charge', 'board_charge'])
  })

  it('should_filter_by_occurred_at_start', async () => {
    const { mockGte } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('occurred_at', '2026-07-01')
  })

  it('should_filter_by_occurred_at_end', async () => {
    const { mockLt } = makeChain([])
    await getChargesForSummary('barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('occurred_at', '2026-08-01')
  })

  it('should_map_rows_to_period_fee_and_payment_type', async () => {
    const row = { occurred_at: '2026-07-01T00:00:00+00:00', amount: 200, payment_type: 'venmo' }
    makeChain([row])
    const result = await getChargesForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([{ period: '2026-07-01', fee: 200, payment_type: 'venmo' }])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getChargesForSummary('barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    makeChain(null, new Error('db error'))
    await expect(getChargesForSummary('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockLt = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockIn = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    const mockClient = { from } as any

    await getChargesForSummary('barn-1', startDate, endDate, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(from).toHaveBeenCalledWith('transactions')
  })
})

describe('getPaidCharges', () => {
  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockCollected = vi.fn().mockReturnValue({ gte: mockGte })
    const mockIn = vi.fn().mockReturnValue({ eq: mockCollected })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    const from = vi.fn().mockReturnValue({ select: mockSelect })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, mockSelect, mockEq, mockIn, mockCollected, mockGte, mockLt }
  }

  it('should_query_the_transactions_table', async () => {
    const { from } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(from).toHaveBeenCalledWith('transactions')
  })

  it('should_select_with_the_agreement_charges_fk_hint_embed', async () => {
    const { mockSelect } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockSelect).toHaveBeenCalledWith(
      'agreement_charge_id, occurred_at, amount, kind, membership_id, horse_id, agreement_charges!transactions_barn_id_agreement_charge_id_fkey!inner(agreement_id)'
    )
  })

  it('should_filter_by_barn_id', async () => {
    const { mockEq } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_to_charge_transaction_kinds', async () => {
    const { mockIn } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockIn).toHaveBeenCalledWith('kind', ['lease_charge', 'board_charge'])
  })

  it('should_filter_to_collected_transactions', async () => {
    const { mockCollected } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockCollected).toHaveBeenCalledWith('collected', true)
  })

  it('should_filter_by_occurred_at_start', async () => {
    const { mockGte } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockGte).toHaveBeenCalledWith('occurred_at', '2026-07-01')
  })

  it('should_filter_by_occurred_at_end', async () => {
    const { mockLt } = makeChain([])
    await getPaidCharges('barn-1', startDate, endDate)
    expect(mockLt).toHaveBeenCalledWith('occurred_at', '2026-08-01')
  })

  it('should_map_each_transaction_row_with_its_nested_agreement_id', async () => {
    makeChain([{
      agreement_charge_id: 'charge-1', occurred_at: '2026-07-01T00:00:00+00:00', amount: 200, kind: 'lease_charge',
      membership_id: 'rider-1', horse_id: 'horse-1', agreement_charges: { agreement_id: 'agreement-1' },
    }])

    const result = await getPaidCharges('barn-1', startDate, endDate)

    expect(result).toEqual([{
      chargeId: 'charge-1', agreementId: 'agreement-1', period: '2026-07-01', fee: 200,
      kind: 'lease', riderId: 'rider-1', horseId: 'horse-1',
    }])
  })

  it('should_map_board_charge_kind_to_board', async () => {
    makeChain([{
      agreement_charge_id: 'charge-1', occurred_at: '2026-07-01T00:00:00+00:00', amount: 1000, kind: 'board_charge',
      membership_id: 'rider-1', horse_id: 'horse-1', agreement_charges: { agreement_id: 'agreement-1' },
    }])

    const result = await getPaidCharges('barn-1', startDate, endDate)

    expect(result[0].kind).toBe('board')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeChain(null)
    const result = await getPaidCharges('barn-1', startDate, endDate)
    expect(result).toEqual([])
  })

  it('should_throw_when_query_returns_an_error', async () => {
    makeChain(null, new Error('db error'))
    await expect(getPaidCharges('barn-1', startDate, endDate)).rejects.toThrow('db error')
  })
})

describe('getOutstandingCharges', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['rider-1', 'Alice Rider']]))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeChargesChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockIn = vi.fn().mockReturnValue({ order: mockOrder })
    const mockLt = vi.fn().mockReturnValue({ in: mockIn, order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockLt, mockIn, mockOrder }
  }

  function makeManagerChain(chargesData: unknown[] | null, chargesError: Error | null = null) {
    const charges = makeChargesChain(chargesData, chargesError)
    const from = vi.fn().mockReturnValue({ select: charges.select })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, charges }
  }

  function makeMembershipChain(data: unknown, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEqStatus = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqRole = vi.fn().mockReturnValue({ eq: mockEqStatus })
    const mockEqUser = vi.fn().mockReturnValue({ eq: mockEqRole })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqUser })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqUser, mockEqRole, mockEqStatus }
  }

  function makeRiderAgreementsChain(data: unknown[] | null, error: Error | null = null) {
    const mockEqRider = vi.fn().mockResolvedValue({ data, error })
    const mockEqBarn = vi.fn().mockReturnValue({ eq: mockEqRider })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarn })
    return { select: mockSelect, mockEqBarn, mockEqRider }
  }

  function makeRiderChain({
    membershipData,
    membershipError = null,
    riderAgreementsData = [],
    riderAgreementsError = null,
    chargesData = [],
    chargesError = null,
  }: {
    membershipData: unknown
    membershipError?: Error | null
    riderAgreementsData?: unknown[] | null
    riderAgreementsError?: Error | null
    chargesData?: unknown[] | null
    chargesError?: Error | null
  }) {
    const membership = makeMembershipChain(membershipData, membershipError)
    const riderAgreements = makeRiderAgreementsChain(riderAgreementsData, riderAgreementsError)
    const charges = makeChargesChain(chargesData, chargesError)

    const from = vi.fn((table: string) => {
      if (table === 'barn_memberships') return { select: membership.select }
      if (table === 'agreement_charges') return { select: charges.select }
      return { select: riderAgreements.select }
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    return { from, membership, riderAgreements, charges }
  }

  it('should_return_empty_array_without_querying_when_role_is_trainer', async () => {
    const result = await getOutstandingCharges('barn-1', 'user-trainer', 'trainer')
    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_select_with_the_agreements_fk_hint_embed', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.select).toHaveBeenCalledWith(
      'id, period, fee, agreements!agreement_charges_barn_id_agreement_id_fkey!inner(kind, rider_id)'
    )
  })

  it('should_filter_by_barn_id_for_manager_role', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_unpaid_charges', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.mockIs).toHaveBeenCalledWith('payment_type', null)
  })

  it('should_filter_by_period_before_first_of_current_month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T12:00:00Z'))
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.mockLt).toHaveBeenCalledWith('period', '2026-07-01')
  })

  it('should_not_filter_by_agreement_id_for_manager_role', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.mockIn).not.toHaveBeenCalled()
  })

  it('should_sort_ascending_by_period', async () => {
    const { charges } = makeManagerChain([])
    await getOutstandingCharges('barn-1')
    expect(charges.mockOrder).toHaveBeenCalledWith('period', { ascending: true })
  })

  it('should_map_and_resolve_rider_names_for_manager_role', async () => {
    makeManagerChain([{
      id: 'charge-1', period: '2026-06-01', fee: 200,
      agreements: { kind: 'lease', rider_id: 'rider-1' },
    }])
    const result = await getOutstandingCharges('barn-1')
    expect(result).toEqual([{ id: 'charge-1', period: '2026-06-01', kind: 'lease', riderName: 'Alice Rider', fee: 200 }])
  })

  it('should_fall_back_to_rider_id_when_name_not_resolved', async () => {
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    makeManagerChain([{
      id: 'charge-1', period: '2026-06-01', fee: 200,
      agreements: { kind: 'board', rider_id: 'rider-9' },
    }])
    const result = await getOutstandingCharges('barn-1')
    expect(result[0].riderName).toBe('rider-9')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    makeManagerChain(null)
    const result = await getOutstandingCharges('barn-1')
    expect(result).toEqual([])
  })

  it('should_throw_when_charges_query_returns_an_error', async () => {
    makeManagerChain(null, new Error('db error'))
    await expect(getOutstandingCharges('barn-1')).rejects.toThrow('db error')
  })

  it('should_return_empty_array_when_rider_has_no_active_membership', async () => {
    const { from } = makeRiderChain({ membershipData: null })
    const result = await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('should_throw_when_membership_lookup_errors', async () => {
    makeRiderChain({ membershipData: null, membershipError: new Error('membership error') })
    await expect(getOutstandingCharges('barn-1', 'user-rider', 'rider')).rejects.toThrow('membership error')
  })

  it('should_query_active_rider_membership_by_barn_and_user', async () => {
    const { membership } = makeRiderChain({ membershipData: { id: 'membership-1' } })
    await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(membership.mockEqUser).toHaveBeenCalledWith('user_id', 'user-rider')
    expect(membership.mockEqRole).toHaveBeenCalledWith('role', 'rider')
    expect(membership.mockEqStatus).toHaveBeenCalledWith('status', 'active')
  })

  it('should_return_empty_array_when_the_rider_has_no_agreements', async () => {
    const { from } = makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsData: [] })
    const result = await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalledWith('agreement_charges')
  })

  it('should_treat_a_null_rider_agreements_response_as_no_agreements', async () => {
    const { from } = makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsData: null })
    const result = await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(result).toEqual([])
    expect(from).not.toHaveBeenCalledWith('agreement_charges')
  })

  it('should_throw_when_the_riders_agreements_lookup_errors', async () => {
    makeRiderChain({ membershipData: { id: 'membership-1' }, riderAgreementsError: new Error('rider agreements error') })
    await expect(getOutstandingCharges('barn-1', 'user-rider', 'rider')).rejects.toThrow('rider agreements error')
  })

  it('should_filter_charges_by_the_riders_own_agreement_ids', async () => {
    const { charges } = makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }, { id: 'agreement-2' }],
    })
    await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(charges.mockIn).toHaveBeenCalledWith('agreement_id', ['agreement-1', 'agreement-2'])
  })

  it('should_return_charges_for_the_riders_own_agreements', async () => {
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['membership-1', 'Alice Rider']]))
    makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }],
      chargesData: [{
        id: 'charge-1', period: '2026-06-01', fee: 200,
        agreements: { kind: 'board', rider_id: 'membership-1' },
      }],
    })
    const result = await getOutstandingCharges('barn-1', 'user-rider', 'rider')
    expect(result).toEqual([{ id: 'charge-1', period: '2026-06-01', kind: 'board', riderName: 'Alice Rider', fee: 200 }])
  })

  it('should_throw_when_rider_charges_query_errors', async () => {
    makeRiderChain({
      membershipData: { id: 'membership-1' },
      riderAgreementsData: [{ id: 'agreement-1' }],
      chargesError: new Error('charges error'),
    })
    await expect(getOutstandingCharges('barn-1', 'user-rider', 'rider')).rejects.toThrow('charges error')
  })
})
