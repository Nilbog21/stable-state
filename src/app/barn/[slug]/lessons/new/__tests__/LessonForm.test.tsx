import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
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
  it('should_render_fee_input_with_empty_value_by_default', () => {
    render(<LessonForm {...baseProps} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
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

  it('should_render_error_message_when_action_returns_error', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'Something went wrong' })
    render(<LessonForm {...baseProps} action={errorAction} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  // relies on useTransition reporting isPending before the never-resolving promise settles — may be flaky under load
  it('should_display_submitting_text_while_form_action_is_pending', async () => {
    const pendingAction = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<LessonForm {...baseProps} action={pendingAction} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDefined()
    })
  })

  it('should_render_normal_and_group_toggle_buttons', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Normal' })).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'Group' })).not.toBeNull()
  })

  it('should_default_lesson_type_hidden_input_to_normal', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const hiddenInput = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.value).toBe('normal')
  })

  it('should_show_single_rider_select_in_normal_mode', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    expect(container.querySelector('select[name="rider_id"]')).not.toBeNull()
  })

  it('should_not_show_rider_checkboxes_in_normal_mode', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    expect(container.querySelector('input[type="checkbox"][name="rider_id"]')).toBeNull()
  })

  it('should_switch_to_group_mode_when_group_button_clicked', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const hiddenInput = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hiddenInput.value).toBe('group')
  })

  it('should_show_rider_checkboxes_in_group_mode', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    const { container } = render(<LessonForm {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]')
    expect(checkboxes).toHaveLength(2)
  })

  it('should_hide_single_rider_select_in_group_mode', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(container.querySelector('select[name="rider_id"]')).toBeNull()
  })

  it('should_show_error_and_not_submit_when_group_mode_has_fewer_than_two_riders', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('group lesson requires at least 2 riders')
    expect(baseProps.action).not.toHaveBeenCalled()
  })
})
