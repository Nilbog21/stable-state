import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockAgreement, createMockUser } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/agreements', () => ({
  createAgreement: vi.fn(),
  updateAgreement: vi.fn(),
  endAgreement: vi.fn(),
  getAgreementById: vi.fn(),
  updateCharge: vi.fn(),
  updateChargePaymentType: vi.fn(),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireMembership } from '@/lib/auth/guard'
import {
  createAgreement,
  updateAgreement,
  endAgreement,
  getAgreementById,
  updateCharge,
  updateChargePaymentType,
} from '@/lib/db/agreements'
import {
  createAgreementAction,
  updateAgreementAction,
  endAgreementAction,
  updateChargeFeeAction,
  updateChargePaymentTypeAction,
} from '../actions'
import { calendarDate } from '@/lib/local-day'

const mockBarn = createMockBarn()
const mockUser = createMockUser()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })
const noError = { error: null }

describe('createAgreementAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createAgreement).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createAgreement).mockResolvedValue(createMockAgreement())
  })

  it('should_call_requireMembership_with_manager_role_for_create', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'lease',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', start_date: calendarDate('2026-07-01'), cadence: 'monthly' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_createAgreement_with_parsed_fields_for_lease', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'lease',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', start_date: calendarDate('2026-07-01'), cadence: 'one_time' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAgreement).toHaveBeenCalledWith({
      barnId: mockBarn.id,
      riderId: 'rider-1',
      horseId: 'horse-1',
      fee: 200,
      kind: 'lease',
      cadence: 'one_time',
      startDate: '2026-07-01',
    })
  })

  it('should_force_cadence_monthly_for_board_regardless_of_form_value', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'board',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', cadence: 'one_time' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAgreement).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'monthly' }))
  })

  it('should_use_form_cadence_when_kind_is_lease', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'lease',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', cadence: 'one_time' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAgreement).toHaveBeenCalledWith(expect.objectContaining({ cadence: 'one_time' }))
  })

  it('should_pass_start_date_when_provided', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'lease',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', start_date: calendarDate('2026-08-15') })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAgreement).toHaveBeenCalledWith(expect.objectContaining({ startDate: '2026-08-15' }))
  })

  it('should_omit_start_date_when_blank', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'lease',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200', start_date: '' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createAgreement).toHaveBeenCalledWith(expect.objectContaining({ startDate: undefined }))
  })

  it('should_redirect_to_kind_scoped_list_after_create', async () => {
    await expect(
      createAgreementAction(
        'green-acres',
        'board',
        noError,
        makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '200' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/agreements?kind=board')
  })

  it('should_return_early_when_rider_id_is_blank', async () => {
    await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: '', horse_id: 'horse-1', fee: '200' })
    )

    expect(createAgreement).not.toHaveBeenCalled()
  })

  it('should_return_rider_required_error_when_rider_id_is_blank', async () => {
    const result = await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: '', horse_id: 'horse-1', fee: '200' })
    )

    expect(result.error).toBe('rider required')
  })

  it('should_return_early_when_horse_id_is_blank', async () => {
    await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: 'rider-1', horse_id: '', fee: '200' })
    )

    expect(createAgreement).not.toHaveBeenCalled()
  })

  it('should_return_horse_required_error_when_horse_id_is_blank', async () => {
    const result = await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: 'rider-1', horse_id: '', fee: '200' })
    )

    expect(result.error).toBe('horse required')
  })

  it('should_return_early_when_fee_is_blank', async () => {
    await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '' })
    )

    expect(createAgreement).not.toHaveBeenCalled()
  })

  it('should_return_fee_error_when_fee_is_blank', async () => {
    const result = await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '' })
    )

    expect(result.error).toBe('a valid, non-negative fee is required')
  })

  it('should_return_early_when_fee_is_negative', async () => {
    await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: 'rider-1', horse_id: 'horse-1', fee: '-5' })
    )

    expect(createAgreement).not.toHaveBeenCalled()
  })

  it('should_not_call_createAgreement_when_rider_id_is_blank', async () => {
    await createAgreementAction(
      'green-acres',
      'lease',
      noError,
      makeFormData({ rider_id: '', horse_id: 'horse-1', fee: '200' })
    )

    expect(createAgreement).not.toHaveBeenCalled()
  })
})

describe('updateAgreementAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateAgreement).mockReset()
    vi.mocked(getAgreementById).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'lease' }))
    vi.mocked(updateAgreement).mockResolvedValue(createMockAgreement({ kind: 'lease' }))
  })

  it('should_call_requireMembership_with_manager_role_for_update', async () => {
    await expect(
      updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateAgreement_with_parsed_fee_only', async () => {
    await expect(
      updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateAgreement).toHaveBeenCalledWith('agreement-1', mockBarn.id, { fee: 250 })
  })

  it('should_redirect_using_kind_returned_by_updateAgreement', async () => {
    vi.mocked(updateAgreement).mockResolvedValue(createMockAgreement({ kind: 'board' }))

    await expect(
      updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/agreements?kind=board')
  })

  it('should_return_early_when_fee_is_blank_on_update', async () => {
    await updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '' }))

    expect(updateAgreement).not.toHaveBeenCalled()
  })

  it('should_return_fee_error_when_fee_is_blank_on_update', async () => {
    const result = await updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '' }))

    expect(result.error).toBe('a valid, non-negative fee is required')
  })

  it('should_call_getAgreementById_before_updating', async () => {
    await expect(
      updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(getAgreementById).toHaveBeenCalledWith('agreement-1', mockBarn.id)
  })

  it('should_return_not_found_error_when_agreement_missing_on_update', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(null)

    const result = await updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))

    expect(result.error).toBe('agreement not found')
  })

  it('should_not_call_updateAgreement_when_agreement_missing', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(null)

    await updateAgreementAction('green-acres', 'agreement-1', noError, makeFormData({ fee: '250' }))

    expect(updateAgreement).not.toHaveBeenCalled()
  })
})

describe('endAgreementAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getAgreementById).mockReset()
    vi.mocked(endAgreement).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'lease' }))
    vi.mocked(endAgreement).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_for_end', async () => {
    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_getAgreementById_before_ending', async () => {
    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(getAgreementById).toHaveBeenCalledWith('agreement-1', mockBarn.id)
  })

  it('should_call_endAgreement_when_agreement_found', async () => {
    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(endAgreement).toHaveBeenCalledWith('agreement-1', mockBarn.id)
  })

  it('should_redirect_using_agreement_kind_after_end', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(createMockAgreement({ kind: 'board' }))

    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/agreements?kind=board')
  })

  it('should_redirect_to_agreements_list_when_agreement_not_found', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(null)

    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/agreements?kind=lease')
  })

  it('should_not_call_endAgreement_when_agreement_not_found', async () => {
    vi.mocked(getAgreementById).mockResolvedValue(null)

    await expect(endAgreementAction('green-acres', 'agreement-1')).rejects.toThrow()
    expect(endAgreement).not.toHaveBeenCalled()
  })
})

describe('updateChargeFeeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateCharge).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateCharge).mockResolvedValue(createMockAgreement() as any)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateChargeFeeAction('green-acres', 'charge-1', '250')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateCharge_with_parsed_fee', async () => {
    await updateChargeFeeAction('green-acres', 'charge-1', '250')

    expect(updateCharge).toHaveBeenCalledWith('charge-1', mockBarn.id, 250)
  })

  it('should_return_no_error_on_success', async () => {
    const result = await updateChargeFeeAction('green-acres', 'charge-1', '250')

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_fee_is_blank', async () => {
    const result = await updateChargeFeeAction('green-acres', 'charge-1', '')

    expect(result.error).toBe('a valid, non-negative fee is required')
  })

  it('should_not_call_updateCharge_when_fee_is_blank', async () => {
    await updateChargeFeeAction('green-acres', 'charge-1', '')

    expect(updateCharge).not.toHaveBeenCalled()
  })

  it('should_return_error_when_fee_is_negative', async () => {
    const result = await updateChargeFeeAction('green-acres', 'charge-1', '-5')

    expect(result.error).toBe('a valid, non-negative fee is required')
  })

  it('should_return_error_when_updateCharge_throws', async () => {
    vi.mocked(updateCharge).mockRejectedValue(new Error('db error'))

    const result = await updateChargeFeeAction('green-acres', 'charge-1', '250')

    expect(result.error).toBe('Failed to update charge fee')
  })
})

describe('updateChargePaymentTypeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateChargePaymentType).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: mockUser as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateChargePaymentType).mockResolvedValue(createMockAgreement() as any)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateChargePaymentTypeAction('green-acres', 'charge-1', 'venmo')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateChargePaymentType_with_value', async () => {
    await updateChargePaymentTypeAction('green-acres', 'charge-1', 'venmo')

    expect(updateChargePaymentType).toHaveBeenCalledWith('charge-1', mockBarn.id, 'venmo')
  })

  it('should_call_updateChargePaymentType_with_null_when_cleared', async () => {
    await updateChargePaymentTypeAction('green-acres', 'charge-1', null)

    expect(updateChargePaymentType).toHaveBeenCalledWith('charge-1', mockBarn.id, null)
  })

  it('should_return_no_error_on_success', async () => {
    const result = await updateChargePaymentTypeAction('green-acres', 'charge-1', 'venmo')

    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_updateChargePaymentType_throws', async () => {
    vi.mocked(updateChargePaymentType).mockRejectedValue(new Error('db error'))

    const result = await updateChargePaymentTypeAction('green-acres', 'charge-1', 'venmo')

    expect(result.error).toBe('Failed to update payment type')
  })

  it('should_return_error_when_payment_type_is_invalid', async () => {
    const result = await updateChargePaymentTypeAction('green-acres', 'charge-1', 'bitcoin')

    expect(result.error).toBe('invalid payment type')
  })

  it('should_not_call_updateChargePaymentType_when_payment_type_is_invalid', async () => {
    await updateChargePaymentTypeAction('green-acres', 'charge-1', 'bitcoin')

    expect(updateChargePaymentType).not.toHaveBeenCalled()
  })
})
