import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import type { LessonDetail, Horse, Rider } from '@/lib/db/types'
import { createMockLessonTier } from '@/test/fixtures'
import { LessonForm } from '../../../LessonForm'

afterEach(cleanup)

const mockTier = createMockLessonTier({ is_default: true })

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
  instructor_name: 'Jane Smith',
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
  mode: 'edit' as const,
  initialLesson: normalLesson,
  horses: [mockHorse],
  riders: [mockRider, mockRider2],
  instructors: [{ userId: 'user-1', name: 'Jane Smith' }],
  currentUserId: 'user-1',
  isManager: true,
  tiers: [mockTier],
  action: vi.fn().mockResolvedValue({ error: null }),
}

describe('LessonForm (edit mode)', () => {
  it('should_initialize_lesson_type_toggle_to_normal', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const hidden = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hidden.value).toBe('normal')
  })

  it('should_initialize_lesson_type_toggle_to_group', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} />)
    const hidden = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hidden.value).toBe('group')
  })

  it('should_precheck_current_horses', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should_prepopulate_exertion_level_for_current_horse', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 4, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_preselect_current_rider_in_dropdown_for_normal_lesson', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const select = container.querySelector('select[name="rider_id"]') as HTMLSelectElement
    expect(select.value).toBe('rider-1')
  })

  it('should_render_rider_dropdown_for_normal_lesson', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    expect(container.querySelector('select[name="rider_id"]')).not.toBeNull()
  })

  it('should_precheck_rider_1_for_group_lesson', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const r1 = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    expect(r1.checked).toBe(true)
  })

  it('should_precheck_rider_2_for_group_lesson', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const r2 = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-2"]') as HTMLInputElement
    expect(r2.checked).toBe(true)
  })

  it('should_show_downgrade_warning_when_switching_group_to_normal', () => {
    render(<LessonForm {...baseProps} initialLesson={groupLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(screen.getByRole('alert')).toBeDefined()
  })

  it('should_hide_downgrade_warning_when_switching_back_to_group', () => {
    render(<LessonForm {...baseProps} initialLesson={groupLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_show_client_error_when_group_submitted_with_fewer_than_two_riders', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const horseCheckbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('group lesson requires at least 2 riders')
  })

  it('should_not_call_action_when_group_submitted_with_fewer_than_two_riders', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const horseCheckbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_show_error_from_action_state', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'Failed to save' })
    render(<LessonForm {...baseProps} action={errorAction} />)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('should_render_venmo_payment_type_option', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /venmo/i })).not.toBeNull()
  })

  it('should_render_zelle_payment_type_option', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /zelle/i })).not.toBeNull()
  })

  it('should_render_cash_payment_type_option', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /cash/i })).not.toBeNull()
  })

  it('should_render_check_payment_type_option', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /check/i })).not.toBeNull()
  })

  it('should_render_freshbooks_payment_type_option', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('option', { name: /freshbooks/i })).not.toBeNull()
  })

  it('should_preselect_current_payment_type', () => {
    const lesson = { ...normalLesson, payment_type: 'venmo' as const }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    expect(select.value).toBe('venmo')
  })

  it('should_uncheck_horse_when_horse_checkbox_is_clicked_while_checked', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('should_check_horse_when_unchecked_horse_checkbox_is_clicked', () => {
    const lesson = { ...normalLesson, lesson_horses: [] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('should_update_exertion_level_when_changed', () => {
    render(<LessonForm {...baseProps} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_default_exertion_to_3_when_nan_is_entered', () => {
    render(<LessonForm {...baseProps} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '' } })
    expect(exertionInput.value).toBe('3')
  })

  it('should_check_rider_checkbox_when_clicked_in_group_mode', () => {
    const lesson = { ...groupLesson, lesson_riders: [] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} riders={[mockRider, mockRider2]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(true)
  })

  it('should_uncheck_rider_checkbox_when_clicked_again_in_group_mode', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="rider_id"][value="rider-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)
  })

  it('should_render_jumping_hidden_input_as_true_when_lesson_jumping_is_true', () => {
    const lesson = { ...normalLesson, jumping: true }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const hiddenJumping = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(hiddenJumping.value).toBe('true')
  })

  it('should_default_instructor_to_currentUserId_when_instructor_id_is_null', () => {
    const lesson = { ...normalLesson, instructor_id: null }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const select = container.querySelector('select[name="instructor_id"]') as HTMLSelectElement
    expect(select).not.toBeNull()
  })

  it('should_render_fee_input_with_empty_value_when_fee_is_null', () => {
    const lesson = { ...normalLesson, fee: null }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
  })

  it('should_handle_null_horses_relation_in_lesson_horses', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 3, horses: null }] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('should_clear_horse_checkboxes_when_switching_from_group_to_normal', () => {
    const groupLessonTwoHorses: LessonDetail = {
      ...groupLesson,
      lesson_horses: [
        { exertion_level: 3, horses: { id: 'horse-1', name: 'Thunderbolt' } },
        { exertion_level: 3, horses: { id: 'horse-2', name: 'Storm' } },
      ],
    }
    const horse2: Horse = { id: 'horse-2', barn_id: 'barn-1', name: 'Storm', created_at: '', updated_at: '' }
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLessonTwoHorses} horses={[mockHorse, horse2]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    const checkbox1 = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    expect(checkbox1.checked).toBe(false)
  })

  it('should_show_downgrade_warning_mentioning_horses_when_switching_group_to_normal', () => {
    render(<LessonForm {...baseProps} initialLesson={groupLesson} />)
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(screen.getByRole('alert').textContent).toContain('horse')
  })

  it('should_show_client_error_when_normal_submitted_with_no_horses_selected', () => {
    const lesson = { ...normalLesson, lesson_horses: [] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('normal lesson requires exactly 1 horse')
  })

  it('should_not_call_action_when_normal_submitted_with_no_horses_selected', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const lesson = { ...normalLesson, lesson_horses: [] }
    render(<LessonForm {...baseProps} initialLesson={lesson} action={action} />)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_show_exertion_label_when_horse_is_pre_checked', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_not_show_exertion_label_when_no_horse_is_checked', () => {
    const lesson = { ...normalLesson, lesson_horses: [] }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    expect(screen.queryByText('Exertion (1–5)')).toBeNull()
  })

  it('should_show_exertion_label_when_unchecked_horse_is_checked', () => {
    const lesson = { ...normalLesson, lesson_horses: [] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_hide_exertion_label_when_horse_is_unchecked', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.queryByText('Exertion (1–5)')).toBeNull()
  })

  it('should_render_jumping_checkbox_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('checkbox', { name: /jumping/i })).not.toBeNull()
  })

  it('should_initialize_jumping_checkbox_to_true_when_lesson_jumping_is_true', () => {
    const lesson = { ...normalLesson, jumping: true }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const checkbox = screen.getByRole('checkbox', { name: /jumping/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should_initialize_jumping_checkbox_to_false_when_lesson_jumping_is_false', () => {
    render(<LessonForm {...baseProps} />)
    const checkbox = screen.getByRole('checkbox', { name: /jumping/i }) as HTMLInputElement
    expect(checkbox.checked).toBe(false)
  })

  it('should_snap_exertion_to_4_when_jumping_toggled_on_in_edit_mode', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 2, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_show_tier_dropdown_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('combobox', { name: /tier/i })).not.toBeNull()
  })

  it('should_preselect_tier_matching_initial_lesson_tier_name_in_edit_mode', () => {
    const tier = createMockLessonTier({ id: 'tier-abc', name: 'Premium', is_default: false })
    const lesson = { ...normalLesson, tier_name: 'Premium', fee: 75 }
    render(<LessonForm {...baseProps} initialLesson={lesson} tiers={[tier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    expect(select.value).toBe('tier-abc')
  })

  it('should_hide_fee_input_when_named_tier_selected_in_edit_mode', () => {
    const tier = createMockLessonTier({ id: 'tier-standard', name: 'Standard', is_default: true })
    const lesson = { ...normalLesson, tier_name: 'Standard', fee: 50 }
    render(<LessonForm {...baseProps} initialLesson={lesson} tiers={[tier]} />)
    expect(screen.queryByRole('spinbutton', { name: /fee/i })).toBeNull()
  })

  it('should_show_fee_input_when_custom_tier_selected_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('spinbutton', { name: /fee/i })).not.toBeNull()
  })

  it('should_render_add_new_horse_input_for_managers_in_edit_mode', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    expect(screen.queryByPlaceholderText(/add new horse/i)).not.toBeNull()
  })

  it('should_render_add_new_rider_input_for_managers_in_normal_edit_mode', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    expect(screen.queryByPlaceholderText(/add new rider/i)).not.toBeNull()
  })

  it('should_show_save_button_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Save' })).not.toBeNull()
  })

  it('should_show_saving_text_while_pending_in_edit_mode', async () => {
    const pendingAction = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<LessonForm {...baseProps} action={pendingAction} />)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /saving/i })).toBeDefined()
    })
  })

  it('should_show_error_when_group_submitted_with_no_horses_in_edit_mode', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} />)
    const horseCheckbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('group lesson requires at least 1 horse')
  })

  it('should_not_call_action_when_group_submitted_with_no_horses_in_edit_mode', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const { container } = render(<LessonForm {...baseProps} initialLesson={groupLesson} riders={[mockRider, mockRider2]} action={action} />)
    const horseCheckbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-1"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    const form = screen.getByRole('button', { name: 'Save' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_render_unavailable_horse_as_disabled_checkbox', () => {
    const unavailableHorse = { id: 'horse-2', barn_id: 'barn-1', name: 'Blaze', is_active: true, is_available: false, unavailability_reason: null, created_at: '', updated_at: '' } as unknown as Horse
    const { container } = render(<LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-2"]') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('should_render_available_horses_before_unavailable_horses', () => {
    const unavailableHorse = { id: 'horse-unavail', barn_id: 'barn-1', name: 'AAA Unavailable', is_active: true, is_available: false, unavailability_reason: null, created_at: '', updated_at: '' } as unknown as Horse
    const availableHorse = { id: 'horse-avail', barn_id: 'barn-1', name: 'ZZZ Available', is_active: true, is_available: true, unavailability_reason: null, created_at: '', updated_at: '' } as unknown as Horse
    const { container } = render(<LessonForm {...baseProps} horses={[unavailableHorse, availableHorse]} />)
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
    expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-avail')
    expect((checkboxes[1] as HTMLInputElement).value).toBe('horse-unavail')
  })

  it('should_show_unavailability_reason_next_to_horse_name', () => {
    const unavailableHorse = { id: 'horse-2', barn_id: 'barn-1', name: 'Blaze', is_active: true, is_available: false, unavailability_reason: 'on stall rest', created_at: '', updated_at: '' } as unknown as Horse
    render(<LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} />)
    expect(screen.getByText(/on stall rest/i)).toBeDefined()
  })

  it('should_keep_pre_assigned_unavailable_horse_checked_and_disabled_in_edit_mode', () => {
    const unavailableHorse = { id: 'horse-2', barn_id: 'barn-1', name: 'Blaze', is_active: true, is_available: false, unavailability_reason: null, created_at: '', updated_at: '' } as unknown as Horse
    const lessonWithUnavailableHorse: LessonDetail = {
      ...normalLesson,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Blaze' } }],
    }
    const { container } = render(
      <LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} initialLesson={lessonWithUnavailableHorse} />
    )
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-2"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
    expect(checkbox.disabled).toBe(true)
  })
})
