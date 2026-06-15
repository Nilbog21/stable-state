import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

vi.mock('@/app/actions/lessons', () => ({
  updatePaymentTypeAction: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction } from '@/app/actions/lessons'
import { OutstandingTable } from '../OutstandingTable'

const lesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  lesson_at: '2026-06-10T10:00:00Z',
  instructor_name: 'Jane Doe',
  rider_names: ['Alice'],
  fee: 75,
}

const lessonNullFee = {
  id: 'lesson-2',
  barn_id: 'barn-1',
  lesson_at: '2026-06-11T10:00:00Z',
  instructor_name: null,
  rider_names: ['Bob'],
  fee: null,
}

beforeEach(() => {
  vi.mocked(updatePaymentTypeAction).mockReset()
  vi.mocked(updatePaymentTypeAction).mockResolvedValue({ error: null })
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('OutstandingTable', () => {
  it('should_render_outstanding_lessons_in_table', () => {
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    expect(screen.getByText('Alice')).toBeDefined()
  })

  it('should_render_instructor_name', () => {
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_fee_as_currency', () => {
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    expect(screen.getByText('$75.00')).toBeDefined()
  })

  it('should_show_dash_for_null_fee', () => {
    render(<OutstandingTable outstandingLessons={[lessonNullFee]} barnId="barn-1" />)
    expect(screen.getByText('—')).toBeDefined()
  })

  it('should_call_updatePaymentTypeAction_on_payment_type_change', async () => {
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'venmo' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).toHaveBeenCalledWith('lesson-1', 'barn-1', 'venmo')
  })

  it('should_pass_null_to_action_when_empty_option_selected', async () => {
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: '' } })
    })
    expect(vi.mocked(updatePaymentTypeAction)).toHaveBeenCalledWith('lesson-1', 'barn-1', null)
  })

  it('should_call_router_refresh_after_successful_update', async () => {
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<OutstandingTable outstandingLessons={[lesson]} barnId="barn-1" />)
    await act(async () => {
      fireEvent.change(screen.getByRole('combobox'), { target: { value: 'cash' } })
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_render_empty_state_when_no_outstanding_lessons', () => {
    render(<OutstandingTable outstandingLessons={[]} barnId="barn-1" />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})
