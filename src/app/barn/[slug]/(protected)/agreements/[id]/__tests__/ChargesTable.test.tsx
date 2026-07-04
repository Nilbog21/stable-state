import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('../../actions', () => ({
  updateChargeFeeAction: vi.fn(),
  updateChargePaymentTypeAction: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { updateChargeFeeAction, updateChargePaymentTypeAction } from '../../actions'
import { ChargesTable } from '../ChargesTable'
import { createMockAgreementCharge } from '@/test/fixtures'

const charge = createMockAgreementCharge({ id: 'charge-1', period: '2026-07-01', fee: 200, payment_type: null })

beforeEach(() => {
  vi.mocked(updateChargeFeeAction).mockReset()
  vi.mocked(updateChargeFeeAction).mockResolvedValue({ error: null })
  vi.mocked(updateChargePaymentTypeAction).mockReset()
  vi.mocked(updateChargePaymentTypeAction).mockResolvedValue({ error: null })
  vi.mocked(useRouter).mockReset()
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('ChargesTable', () => {
  it('should_render_formatted_period', () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    expect(screen.getByText('Jul 2026')).toBeDefined()
  })

  it('should_render_fee_input_with_initial_value', () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    expect(screen.getByDisplayValue('200')).toBeDefined()
  })

  it('should_call_updateChargePaymentTypeAction_on_payment_type_change', async () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(updateChargePaymentTypeAction).toHaveBeenCalledWith('green-acres', 'charge-1', 'venmo')
  })

  it('should_pass_null_to_action_when_empty_option_selected', async () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    })
    expect(updateChargePaymentTypeAction).toHaveBeenCalledWith('green-acres', 'charge-1', null)
  })

  it('should_call_router_refresh_after_payment_type_change', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cash' } })
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_call_updateChargeFeeAction_on_fee_blur_when_changed', async () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    const input = screen.getByDisplayValue('200')
    fireEvent.change(input, { target: { value: '150' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(updateChargeFeeAction).toHaveBeenCalledWith('green-acres', 'charge-1', '150')
  })

  it('should_not_call_updateChargeFeeAction_on_fee_blur_when_unchanged', async () => {
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    const input = screen.getByDisplayValue('200')
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(updateChargeFeeAction).not.toHaveBeenCalled()
  })

  it('should_call_router_refresh_after_fee_change', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<ChargesTable charges={[charge]} barnSlug="green-acres" />)
    const input = screen.getByDisplayValue('200')
    fireEvent.change(input, { target: { value: '150' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_show_paid_option_selected_when_payment_type_set', () => {
    render(<ChargesTable charges={[{ ...charge, payment_type: 'zelle' }]} barnSlug="green-acres" />)
    expect(screen.getByRole('combobox')).toHaveProperty('value', 'zelle')
  })
})
