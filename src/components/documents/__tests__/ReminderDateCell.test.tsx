import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { ReminderDateCell } from '../ReminderDateCell'

beforeEach(() => {
  vi.mocked(useRouter).mockReset()
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('ReminderDateCell', () => {
  it('should_render_input_with_initial_value', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<ReminderDateCell docId="doc-1" initialValue="2027-01-01" action={action} />)
    expect(screen.getByDisplayValue('2027-01-01')).toBeDefined()
  })

  it('should_render_empty_input_when_initial_value_is_null', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<ReminderDateCell docId="doc-1" initialValue={null} action={action} />)
    expect(screen.getByDisplayValue('')).toBeDefined()
  })

  it('should_call_action_on_blur_when_changed', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<ReminderDateCell docId="doc-1" initialValue={null} action={action} />)
    const input = screen.getByDisplayValue('')
    fireEvent.change(input, { target: { value: '2027-01-01' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(action).toHaveBeenCalledWith('doc-1', '2027-01-01')
  })

  it('should_not_call_action_on_blur_when_unchanged', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<ReminderDateCell docId="doc-1" initialValue="2027-01-01" action={action} />)
    const input = screen.getByDisplayValue('2027-01-01')
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(action).not.toHaveBeenCalled()
  })

  it('should_pass_null_when_cleared', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<ReminderDateCell docId="doc-1" initialValue="2027-01-01" action={action} />)
    const input = screen.getByDisplayValue('2027-01-01')
    fireEvent.change(input, { target: { value: '' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(action).toHaveBeenCalledWith('doc-1', null)
  })

  it('should_call_router_refresh_on_success', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<ReminderDateCell docId="doc-1" initialValue={null} action={action} />)
    const input = screen.getByDisplayValue('')
    fireEvent.change(input, { target: { value: '2027-01-01' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(mockRefresh).toHaveBeenCalled()
  })

  it('should_show_error_and_revert_value_when_action_fails', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'update failed' })
    render(<ReminderDateCell docId="doc-1" initialValue="2027-01-01" action={action} />)
    const input = screen.getByDisplayValue('2027-01-01')
    fireEvent.change(input, { target: { value: '2027-02-01' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(screen.getByText('update failed')).toBeDefined()
    expect(screen.getByDisplayValue('2027-01-01')).toBeDefined()
  })

  it('should_revert_to_empty_value_when_action_fails_and_initial_value_was_null', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'update failed' })
    render(<ReminderDateCell docId="doc-1" initialValue={null} action={action} />)
    const input = screen.getByDisplayValue('')
    fireEvent.change(input, { target: { value: '2027-02-01' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(screen.getByDisplayValue('')).toBeDefined()
  })

  it('should_not_call_router_refresh_when_action_fails', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'update failed' })
    const mockRefresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh: mockRefresh } as any)
    render(<ReminderDateCell docId="doc-1" initialValue="2027-01-01" action={action} />)
    const input = screen.getByDisplayValue('2027-01-01')
    fireEvent.change(input, { target: { value: '2027-02-01' } })
    await act(async () => {
      fireEvent.blur(input)
    })
    expect(mockRefresh).not.toHaveBeenCalled()
  })
})
