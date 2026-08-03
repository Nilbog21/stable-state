import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { instant } from '@/test/fixtures'
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
  date: instant('2026-06-10T10:00:00Z'),
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
  date: instant('2026-06-05T10:00:00Z'),
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

  it('should_show_error_message_when_action_returns_error', async () => {
    vi.mocked(updatePaymentTypeAction).mockResolvedValue({ error: 'Failed to update payment type' })
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(screen.getByText('Failed to update payment type')).toBeDefined()
  })

  it('should_reset_select_to_unpaid_when_action_returns_error', async () => {
    vi.mocked(updatePaymentTypeAction).mockResolvedValue({ error: 'Failed to update payment type' })
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
  })

  it('should_not_call_router_refresh_when_action_returns_error', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    vi.mocked(updatePaymentTypeAction).mockResolvedValue({ error: 'Failed to update payment type' })
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })

  it('should_disable_select_while_write_is_in_flight', async () => {
    vi.mocked(updatePaymentTypeAction).mockReturnValue(new Promise(() => {}))
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(true)
  })

  it('should_re_enable_select_after_write_completes', async () => {
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false)
  })

  it('should_reset_select_to_unpaid_when_action_rejects', async () => {
    vi.mocked(updatePaymentTypeAction).mockRejectedValue(new Error('network down'))
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect((screen.getByRole('combobox') as HTMLSelectElement).value).toBe('')
  })

  it('should_re_enable_select_after_action_rejects', async () => {
    vi.mocked(updatePaymentTypeAction).mockRejectedValue(new Error('network down'))
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect((screen.getByRole('combobox') as HTMLSelectElement).disabled).toBe(false)
  })

  it('should_show_a_generic_error_when_action_rejects', async () => {
    vi.mocked(updatePaymentTypeAction).mockRejectedValue(new Error('network down'))
    render(<OutstandingTable items={[lessonItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(screen.getByText('Could not save. Please try again.')).toBeDefined()
  })

  // The per-row-state claim: saving state lives in each row, so an in-flight write on one
  // row must not lock the manager out of every other row in the table.
  it('should_leave_other_rows_enabled_while_one_rows_write_is_in_flight', async () => {
    vi.mocked(updatePaymentTypeAction).mockReturnValue(new Promise(() => {}))
    render(<OutstandingTable items={[lessonItem, boardItem]} barnSlug="green-acres" />)
    await act(async () => {
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'venmo' } })
    })
    expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).disabled).toBe(false)
  })

  describe('timezone-aware date display', () => {
    let originalTz: string | undefined

    beforeEach(() => {
      originalTz = process.env.TZ
      process.env.TZ = 'America/New_York'
    })

    afterEach(() => {
      process.env.TZ = originalTz
    })

    // 2026-06-10T02:00:00Z is 10:00 PM EDT on June 9 — a naive UTC-anchored formatter
    // would show June 10 instead.
    const earlyUtcLessonItem = { ...lessonItem, date: instant('2026-06-10T02:00:00Z') }
    const earlyUtcCancellationFeeItem = { ...cancellationFeeItem, date: instant('2026-06-10T02:00:00Z') }

    it('should_display_a_lesson_rows_date_in_the_viewers_local_timezone_not_utc', () => {
      render(<OutstandingTable items={[earlyUtcLessonItem]} barnSlug="green-acres" />)
      expect(screen.getByText('Jun 9, 2026')).toBeDefined()
    })

    it('should_display_a_cancellation_fee_rows_date_in_the_viewers_local_timezone_not_utc', () => {
      render(<OutstandingTable items={[earlyUtcCancellationFeeItem]} barnSlug="green-acres" />)
      expect(screen.getByText('Jun 9, 2026')).toBeDefined()
    })

    it('should_keep_a_charge_rows_date_utc_anchored_regardless_of_viewer_timezone', () => {
      render(<OutstandingTable items={[boardItem]} barnSlug="green-acres" />)
      expect(screen.getByText('Jun 1, 2026')).toBeDefined()
    })
  })
})
