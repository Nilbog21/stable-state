import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { LessonDetail, Horse, Rider } from '@/lib/db/types'
import { EditLessonForm } from '../EditLessonForm'

afterEach(cleanup)

const mockHorse: Horse = { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '', updated_at: '' }
const mockRider: Rider = { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '', updated_at: '' }
const mockRider2: Rider = { id: 'rider-2', barn_id: 'barn-1', name: 'Bob', user_id: null, created_at: '', updated_at: '' }

const normalLesson: LessonDetail = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-17T10:00:00Z',
  submitted_at: '2026-05-17T10:05:00Z',
  lesson_type: 'normal',
  jumping: false,
  payment_type: null,
  tier_name: 'Custom',
  profiles: { first_name: 'Jane', last_name: 'Smith' },
  lesson_horses: [{ exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } }],
  lesson_riders: [{ riders: { id: 'rider-1', name: 'Alice' } }],
}

const groupLesson: LessonDetail = {
  ...normalLesson,
  lesson_type: 'group',
  lesson_riders: [
    { riders: { id: 'rider-1', name: 'Alice' } },
    { riders: { id: 'rider-2', name: 'Bob' } },
  ],
}

const baseProps = {
  lesson: normalLesson,
  horses: [mockHorse],
  riders: [mockRider, mockRider2],
  instructors: [{ userId: 'user-1', name: 'Jane Smith' }],
  currentUserId: 'user-1',
  action: vi.fn().mockResolvedValue({ error: null }),
}

describe('EditLessonForm', () => {
  it('should_initialize_lesson_type_toggle_to_normal', () => {
    const { container } = render(<EditLessonForm {...baseProps} />)
    const hidden = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hidden.value).toBe('normal')
  })

  it('should_initialize_lesson_type_toggle_to_group', () => {
    const { container } = render(<EditLessonForm {...baseProps} lesson={groupLesson} />)
    const hidden = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hidden.value).toBe('group')
  })

  it('should_precheck_current_horses', () => {
    const { container } = render(<EditLessonForm {...baseProps} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should_prepopulate_exertion_level_for_current_horse', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 4, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
    render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_preselect_current_rider_in_dropdown_for_normal_lesson', () => {
    const { container } = render(<EditLessonForm {...baseProps} />)
    const select = container.querySelector('select[name="rider_id"]') as HTMLSelectElement
    expect(select).not.toBeNull()
    expect(select.value).toBe('rider-1')
  })

  it('should_precheck_current_riders_for_group_lesson', () => {
    const { container } = render(<EditLessonForm {...baseProps} lesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const r1 = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    const r2 = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-2"]') as HTMLInputElement
    expect(r1.checked).toBe(true)
    expect(r2.checked).toBe(true)
  })

  it('should_show_downgrade_warning_when_switching_group_to_normal', () => {
    render(<EditLessonForm {...baseProps} lesson={groupLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('should_hide_downgrade_warning_when_switching_back_to_group', () => {
    render(<EditLessonForm {...baseProps} lesson={groupLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_show_client_error_when_group_submitted_with_fewer_than_two_riders', () => {
    render(<EditLessonForm {...baseProps} lesson={groupLesson} riders={[mockRider, mockRider2]} />)
    // switch to normal then back to group so no riders are checked
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('group lesson requires at least 2 riders')
  })

  it('should_not_call_action_when_group_submitted_with_fewer_than_two_riders', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<EditLessonForm {...baseProps} lesson={groupLesson} riders={[mockRider, mockRider2]} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_show_error_from_action_state', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'Failed to save' })
    render(<EditLessonForm {...baseProps} action={errorAction} />)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('should_render_payment_type_options', () => {
    render(<EditLessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /venmo/i })).not.toBeNull()
    expect(screen.queryByRole('option', { name: /zelle/i })).not.toBeNull()
    expect(screen.queryByRole('option', { name: /cash/i })).not.toBeNull()
    expect(screen.queryByRole('option', { name: /check/i })).not.toBeNull()
    expect(screen.queryByRole('option', { name: /freshbooks/i })).not.toBeNull()
  })

  it('should_preselect_current_payment_type', () => {
    const lesson = { ...normalLesson, payment_type: 'venmo' as const }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    expect(select.value).toBe('venmo')
  })

  it('should_uncheck_horse_when_horse_checkbox_is_clicked_while_checked', () => {
    const { container } = render(<EditLessonForm {...baseProps} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('should_check_horse_when_unchecked_horse_checkbox_is_clicked', () => {
    const lesson = { ...normalLesson, lesson_horses: [] }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('should_update_exertion_level_when_changed', () => {
    render(<EditLessonForm {...baseProps} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_default_exertion_to_3_when_nan_is_entered', () => {
    render(<EditLessonForm {...baseProps} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '' } })
    expect(exertionInput.value).toBe('3')
  })

  it('should_check_rider_checkbox_when_clicked_in_group_mode', () => {
    const lesson = { ...groupLesson, lesson_riders: [] }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} riders={[mockRider, mockRider2]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('should_uncheck_rider_checkbox_when_clicked_again_in_group_mode', () => {
    const { container } = render(<EditLessonForm {...baseProps} lesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('should_render_jumping_hidden_input_as_true_when_lesson_jumping_is_true', () => {
    const lesson = { ...normalLesson, jumping: true }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const hiddenJumping = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(hiddenJumping.value).toBe('true')
  })

  it('should_default_instructor_to_currentUserId_when_instructor_id_is_null', () => {
    const lesson = { ...normalLesson, instructor_id: null }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const select = container.querySelector('select[name="instructor_id"]') as HTMLSelectElement
    expect(select).not.toBeNull()
  })

  it('should_render_fee_input_with_empty_value_when_fee_is_null', () => {
    const lesson = { ...normalLesson, fee: null }
    render(<EditLessonForm {...baseProps} lesson={lesson} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
  })

  it('should_handle_null_horses_relation_in_lesson_horses', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 3, horses: null }] }
    const { container } = render(<EditLessonForm {...baseProps} lesson={lesson} />)
    expect(container.querySelector('form')).not.toBeNull()
  })
})
