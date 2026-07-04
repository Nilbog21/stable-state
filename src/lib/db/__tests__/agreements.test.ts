import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockAgreement, createMockAgreementCharge } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createAgreement,
  getAgreementsByBarn,
  getAgreementById,
  updateAgreement,
  endAgreement,
  getChargesForAgreement,
  updateCharge,
  updateChargePaymentType,
  generateChargeForMonth,
  getBarnDefaultBoardFee,
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

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { update: mockUpdate, mockUpdate }
  }

  it('should_update_fee', async () => {
    const { update, mockUpdate } = makeChain({ ...mockCharge, fee: 300 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateCharge('charge-1', 'barn-1', 300)

    expect(mockUpdate).toHaveBeenCalledWith({ fee: 300 })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateCharge('charge-1', 'barn-1', 300)).rejects.toThrow('db error')
  })
})

describe('updateChargePaymentType', () => {
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

  it('should_update_payment_type', async () => {
    const { update, mockUpdate } = makeChain({ ...mockCharge, payment_type: 'venmo' })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateChargePaymentType('charge-1', 'barn-1', 'venmo')

    expect(mockUpdate).toHaveBeenCalledWith({ payment_type: 'venmo' })
  })

  it('should_clear_payment_type_when_null', async () => {
    const { update, mockUpdate } = makeChain({ ...mockCharge, payment_type: null })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateChargePaymentType('charge-1', 'barn-1', null)

    expect(mockUpdate).toHaveBeenCalledWith({ payment_type: null })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

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
