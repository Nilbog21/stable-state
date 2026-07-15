import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  updatePaymentTypeAction: vi.fn(),
  updateCancellationFeePaymentTypeAction: vi.fn(),
}))

vi.mock('../../agreements/actions', () => ({
  updateChargePaymentTypeAction: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction, updateCancellationFeePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../../agreements/actions'
import { OutstandingTable } from '../OutstandingTable'

const lessonItem = {
  id: 'lesson-1',
  itemType: 'lesson' as const,
  date: '2026-06-10T10:00:00Z',
  instructorName: 'Jane Doe',
  riderNames: ['Alice'],
  fee: 75,
}

const boardItem = {
  id: 'charge-1',
  itemType: 'board' as const,
  date: '2026-06-01',
  instructorName: null,
  riderNames: ['Carol Rider'],
  fee: 500,
}

const leaseItem = {
  id: 'charge-2',
  itemType: 'lease' as const,
  date: '2026-06-01',
  instructorName: null,
  riderNames: ['Dana Rider'],
  fee: 200,
}

const cancellationFeeItem = {
  id: 'lesson-rider-1',
  itemType: 'cancellation_fee' as const,
  date: '2026-06-05T10:00:00Z',
  instructorName: 'Jane Doe',
  riderNames: ['Erin Rider'],
  fee: 50,
  linkId: 'lesson-2',
}

beforeEach(() => {
  vi.mocked(updatePaymentTypeAction).mockReset()
  vi.mocked(updatePaymentTypeAction).mockResolvedValue({ error: null })
  vi.mocked(updateChargePaymentTypeAction).mockReset()
  vi.mocked(updateChargePaymentTypeAction).mockResolvedValue({ error: null })
  vi.mocked(updateCancellationFeePaymentTypeAction).mockReset()
  vi.mocked(updateCancellationFeePaymentTypeAction).mockResolvedValue({ error: null })
  vi.mocked(useRouter).mockReset()
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('OutstandingTable', () => {
  it('should_render_outstanding_items_in_table', () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_render_instructor_name', () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_fee_as_currency', () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    expect(screen.getByText('$75.00')).toBeDefined()
  })

  it('should_call_updatePaymentTypeAction_on_payment_type_change', async () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).toHaveBeenCalledWith('lesson-1', 'green-acres', 'venmo')
  })

  it('should_pass_null_to_action_when_empty_option_selected', async () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).toHaveBeenCalledWith('lesson-1', 'green-acres', null)
  })

  it('should_call_router_refresh_after_successful_update', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cash' } })
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_render_empty_state_when_no_outstanding_items', () => {
    render(<OutstandingTable items={[]} barnSlug="green-acres" />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('should_show_dash_when_rider_names_is_empty', () => {
    const lessonNoRiders = { ...lessonItem, riderNames: [] }
    render(<OutstandingTable items={[lessonNoRiders]} barnSlug="green-acres" />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_render_lesson_type_label', () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_render_boarding_type_label', () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Boarding')).toBeDefined()
  })

  it('should_render_lease_type_label', () => {
    render(<OutstandingTable items={[leaseItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Lease')).toBeDefined()
  })

  it('should_render_rider_name_for_a_charge_row', () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Carol Rider')).toBeDefined()
  })

  it('should_render_dash_for_instructor_on_a_charge_row', () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(1)
  })

  it('should_call_updateChargePaymentTypeAction_on_payment_type_change_for_a_charge_row', async () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updateChargePaymentTypeAction)).toHaveBeenCalledWith('green-acres', 'charge-1', 'venmo')
  })

  it('should_not_call_updatePaymentTypeAction_for_a_charge_row', async () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).not.toHaveBeenCalled()
  })

  it('should_pass_null_to_charge_action_when_empty_option_selected', async () => {
    render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    })
    expect(vi.mocked(updateChargePaymentTypeAction)).toHaveBeenCalledWith('green-acres', 'charge-1', null)
  })

  it('should_render_cancellation_fee_type_label', () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Cancellation Fee')).toBeDefined()
  })

  it('should_render_rider_name_for_a_cancellation_fee_row', () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Erin Rider')).toBeDefined()
  })

  it('should_render_instructor_name_for_a_cancellation_fee_row', () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_call_updateCancellationFeePaymentTypeAction_on_payment_type_change', async () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updateCancellationFeePaymentTypeAction)).toHaveBeenCalledWith('green-acres', 'lesson-rider-1', 'venmo')
  })

  it('should_pass_null_to_cancellation_fee_action_when_empty_option_selected', async () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    })
    expect(vi.mocked(updateCancellationFeePaymentTypeAction)).toHaveBeenCalledWith('green-acres', 'lesson-rider-1', null)
  })

  it('should_not_call_other_actions_for_a_cancellation_fee_row', async () => {
    render(<OutstandingTable items={[cancellationFeeItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).not.toHaveBeenCalled()
    expect(vi.mocked(updateChargePaymentTypeAction)).not.toHaveBeenCalled()
  })
})
