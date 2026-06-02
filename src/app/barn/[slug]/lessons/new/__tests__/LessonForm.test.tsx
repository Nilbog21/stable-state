import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { LessonForm } from '../LessonForm'

afterEach(cleanup)

const baseProps = {
  horses: [],
  riders: [],
  isManager: false,
  action: vi.fn().mockResolvedValue({ error: null }),
  instructors: [],
  currentUserId: 'user-1',
}

describe('LessonForm', () => {
  it('should_render_fee_input_with_default_value_when_defaultFee_prop_provided', () => {
    render(<LessonForm {...baseProps} defaultFee={75} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('75')
  })

  it('should_render_fee_input_with_empty_value_when_defaultFee_prop_is_null', () => {
    render(<LessonForm {...baseProps} defaultFee={null} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
  })

  it('should_render_fee_input_with_empty_value_when_defaultFee_prop_is_omitted', () => {
    render(<LessonForm {...baseProps} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
  })

  it('should_allow_user_to_override_default_fee_value', () => {
    render(<LessonForm {...baseProps} defaultFee={75} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '100' } })
    expect(feeInput.value).toBe('100')
  })

  it('should_hide_exertion_input_when_horse_checkbox_is_unchecked', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    const checkbox = screen.getByRole('checkbox', { name: /Thunder/i }) as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.queryByRole('spinbutton', { name: /Exertion level for Thunder/i })).not.toBeNull()
    fireEvent.click(checkbox)
    expect(screen.queryByRole('spinbutton', { name: /Exertion level for Thunder/i })).toBeNull()
  })

  it('should_not_render_instructor_select_when_isManager_is_false', () => {
    render(<LessonForm {...baseProps} isManager={false} />)
    expect(screen.queryByLabelText(/instructor/i)).toBeNull()
  })

  it('should_render_instructor_select_when_isManager_is_true', () => {
    const instructors = [{ userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm {...baseProps} isManager={true} instructors={instructors} />)
    expect(screen.queryByLabelText(/instructor/i)).not.toBeNull()
  })

  it('should_default_instructor_select_to_currentUserId', () => {
    const instructors = [{ userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm {...baseProps} isManager={true} instructors={instructors} currentUserId="user-1" />)
    const select = screen.getByLabelText(/instructor/i) as HTMLSelectElement
    expect(select.value).toBe('user-1')
  })

  it('should_render_instructor_options_from_instructors_prop', () => {
    const instructors = [
      { userId: 'user-1', name: 'Jane Doe' },
      { userId: 'user-2', name: 'John Smith' },
    ]
    render(<LessonForm {...baseProps} isManager={true} instructors={instructors} />)
    expect(screen.queryByRole('option', { name: 'Jane Doe' })).not.toBeNull()
    expect(screen.queryByRole('option', { name: 'John Smith' })).not.toBeNull()
  })
})
