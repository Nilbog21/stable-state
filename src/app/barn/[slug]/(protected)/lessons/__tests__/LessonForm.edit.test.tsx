import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import type { LessonDetail, Horse } from '@/lib/db/types'
import { createMockHorse, createMockLessonDetail, createMockLessonTier } from '@/test/fixtures'
import { LessonForm } from '../LessonForm'
import { NavigationBlockerProvider, useNavigationBlocker } from '../../NavigationBlocker'

afterEach(cleanup)

const mockTier = createMockLessonTier({ is_default: true })

const mockHorse: Horse = createMockHorse()
const mockRider = { id: 'rider-1', name: 'Alice' }
const mockRider2 = { id: 'rider-2', name: 'Bob' }

// 10:30Z is 16:00 in the pinned test zone (Asia/Kolkata, +5:30) — a whole viewer-local hour,
// which is what the edit form's date/hour picker can represent. It seeds the hour from
// `new Date(lesson_at).getHours()` and drops the minutes, so an instant landing on a
// half-hour viewer-local (10:00Z → 15:30) does not survive the round trip. That lossiness is
// a real app bug for any viewer at a non-whole-hour offset, not a property of these tests.
//
// Two queued changes each close it independently, and this fixture can go back to a round
// number once either lands: #1222 deletes the viewer frame, and #1021's replacement picker
// gains minute granularity (the client asked for it after that issue was written), which
// stops the truncation at its source.
const normalLesson: LessonDetail = createMockLessonDetail({
  instructor_id: 'user-1',
  fee: 75,
  lesson_at: '2026-05-17T10:30:00Z',
  submitted_at: '2026-05-17T10:35:00Z',
  lesson_riders: [{ rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: null } }],
})

const groupLesson: LessonDetail = {
  ...normalLesson,
  lesson_type: 'group',
  lesson_riders: [
    { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-1', name: 'Alice', user_id: null } },
    { rider_notes: null, private_notes: null, cancellation_notes: null, cancelled_at: null, barn_membership: { id: 'rider-2', name: 'Bob', user_id: null } },
  ],
}

const baseProps = {
  mode: 'edit' as const,
  initialLesson: normalLesson,
  horses: [mockHorse],
  riders: [mockRider, mockRider2],
  instructors: [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Smith' }],
  currentMembershipId: 'user-1',
  isManager: true,
  tiers: [mockTier],
  action: vi.fn().mockResolvedValue({ error: null }),
  todayStr: '2026-06-01',
}

describe('LessonForm (edit mode)', () => {
  it('should_not_render_recurring_checkbox', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('checkbox', { name: /recurring/i })).toBeNull()
  })

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
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 4, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_default_exertion_level_to_3_when_absent_from_initial_lesson', () => {
    // exertion_level is only absent for a rider-role LessonDetail read, which this
    // manager/trainer-only form never receives in practice — this covers the fallback branch.
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: undefined, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const exertionInput = screen.getByRole('spinbutton', { name: /exertion level for Thunderbolt/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('3')
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

  it('should_default_instructor_to_currentMembershipId_when_instructor_id_is_null', () => {
    const lesson = { ...normalLesson, instructor_id: null }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    const select = container.querySelector('select[name="instructor_id"]') as HTMLSelectElement
    expect(select).not.toBeNull()
  })

  it('should_handle_null_horses_relation_in_lesson_horses', () => {
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: null }] }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} />)
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('should_clear_horse_checkboxes_when_switching_from_group_to_normal', () => {
    const groupLessonTwoHorses: LessonDetail = {
      ...groupLesson,
      lesson_horses: [
        { exertion_level: 3, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } },
        { exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Storm' } },
      ],
    }
    const horse2: Horse = createMockHorse({ id: 'horse-2', name: 'Storm' })
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
    render(<LessonForm {...baseProps} initialLesson={lesson} />)
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
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 2, horse_notes: null, horses: { id: 'horse-1', name: 'Thunderbolt' } }] }
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

  it('should_show_fee_input_when_named_tier_selected_in_edit_mode', () => {
    const tier = createMockLessonTier({ id: 'tier-standard', name: 'Standard', price: 50, is_default: true })
    const lesson = { ...normalLesson, tier_name: 'Standard', fee: 50 }
    render(<LessonForm {...baseProps} initialLesson={lesson} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('50')
  })

  it('should_prefill_fee_with_lessons_saved_fee_not_tier_price_on_initial_load', () => {
    const tier = createMockLessonTier({ id: 'tier-standard', name: 'Standard', price: 50, is_default: true })
    const lesson = { ...normalLesson, tier_name: 'Standard', fee: 65 }
    render(<LessonForm {...baseProps} initialLesson={lesson} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('65')
  })

  it('should_not_change_tier_name_when_fee_is_manually_edited_in_edit_mode', () => {
    const tier = createMockLessonTier({ id: 'tier-standard', name: 'Standard', price: 50, is_default: true })
    const lesson = { ...normalLesson, tier_name: 'Standard', fee: 50 }
    const { container } = render(<LessonForm {...baseProps} initialLesson={lesson} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '40' } })
    const tierNameInput = container.querySelector('input[name="tier_name"]') as HTMLInputElement
    expect(tierNameInput.value).toBe('Standard')
  })

  it('should_show_fee_input_when_custom_tier_selected_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('spinbutton', { name: /fee/i })).not.toBeNull()
  })

  it('should_mark_fee_input_as_required_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    expect((screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement).required).toBe(true)
  })

  it('should_render_add_new_horse_input_for_managers_in_edit_mode', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    expect(screen.queryByPlaceholderText(/add new horse/i)).not.toBeNull()
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
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const { container } = render(<LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} />)
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-2"]') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('should_sort_available_horse_before_unavailable_horse', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-unavail', name: 'AAA Unavailable', is_available: false })
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'ZZZ Available' })
    const { container } = render(<LessonForm {...baseProps} horses={[unavailableHorse, availableHorse]} />)
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
    expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-avail')
  })

  it('should_sort_unavailable_horse_after_available_horse', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-unavail', name: 'AAA Unavailable', is_available: false })
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'ZZZ Available' })
    const { container } = render(<LessonForm {...baseProps} horses={[unavailableHorse, availableHorse]} />)
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
    expect((checkboxes[1] as HTMLInputElement).value).toBe('horse-unavail')
  })

  it('should_show_unavailability_reason_next_to_horse_name', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false, unavailability_reason: 'on stall rest' })
    render(<LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} />)
    expect(screen.getByText(/on stall rest/i)).toBeDefined()
  })

  it('should_keep_pre_assigned_unavailable_horse_checked_in_edit_mode', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const lessonWithUnavailableHorse: LessonDetail = {
      ...normalLesson,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Blaze' } }],
    }
    const { container } = render(
      <LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} initialLesson={lessonWithUnavailableHorse} />
    )
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-2"]') as HTMLInputElement
    expect(checkbox.checked).toBe(true)
  })

  it('should_render_tier_selector_before_jumping_checkbox_in_edit_mode', () => {
    render(<LessonForm {...baseProps} />)
    const tierSelect = screen.getByRole('combobox', { name: /tier/i })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(tierSelect.compareDocumentPosition(jumpingCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_keep_pre_assigned_unavailable_horse_disabled_in_edit_mode', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const lessonWithUnavailableHorse: LessonDetail = {
      ...normalLesson,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Blaze' } }],
    }
    const { container } = render(
      <LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} initialLesson={lessonWithUnavailableHorse} />
    )
    const checkbox = container.querySelector('input[type="checkbox"][name="horse_id"][value="horse-2"]') as HTMLInputElement
    expect(checkbox.disabled).toBe(true)
  })

  it('should_include_pre_assigned_unavailable_horse_id_in_form_via_hidden_input', () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const lessonWithUnavailableHorse: LessonDetail = {
      ...normalLesson,
      lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Blaze' } }],
    }
    const { container } = render(
      <LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} initialLesson={lessonWithUnavailableHorse} />
    )
    const hidden = container.querySelector('input[type="hidden"][name="horse_id"][value="horse-2"]')
    expect(hidden).not.toBeNull()
  })
})

function DirtyDisplay() {
  const { dirty } = useNavigationBlocker()
  return <div data-testid="dirty">{dirty ? 'dirty' : 'clean'}</div>
}

const pastLesson: LessonDetail = {
  ...normalLesson,
  lesson_at: '2020-01-01T10:00:00Z',
  payment_type: null,
  fee: 75,
}

describe('LessonForm (edit mode — navigation dirty state)', () => {
  let addEventSpy: ReturnType<typeof vi.spyOn>
  let removeEventSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    addEventSpy = vi.spyOn(window, 'addEventListener')
    removeEventSpy = vi.spyOn(window, 'removeEventListener')
  })

  afterEach(() => {
    addEventSpy.mockRestore()
    removeEventSpy.mockRestore()
  })

  it('should_not_set_dirty_when_lesson_is_future', async () => {
    const futureLesson: LessonDetail = { ...pastLesson, lesson_at: '2099-01-01T10:00:00Z' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_not_set_dirty_when_fee_is_zero', async () => {
    const zeroFeeLesson: LessonDetail = { ...pastLesson, fee: 0 }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={zeroFeeLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_not_set_dirty_when_payment_type_is_already_set', async () => {
    const paidLesson: LessonDetail = { ...pastLesson, payment_type: 'venmo' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={paidLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_past_due_unpaid_with_positive_fee', async () => {
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_false_when_payment_type_selected', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'venmo' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_true_when_payment_type_cleared_back_to_unpaid', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'venmo' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    fireEvent.change(select, { target: { value: '' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_register_beforeunload_when_dirty', async () => {
    render(
      <NavigationBlockerProvider>
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => {
      const calls = addEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
      expect(calls.length).toBeGreaterThan(0)
    })
  })

  it('should_remove_beforeunload_when_payment_type_selected', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => {
      const calls = addEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
      expect(calls.length).toBeGreaterThan(0)
    })
    const select = container.querySelector('select[name="payment_type"]') as HTMLSelectElement
    await act(async () => { fireEvent.change(select, { target: { value: 'venmo' } }) })
    const removeCalls = removeEventSpy.mock.calls.filter(([event]: [string]) => event === 'beforeunload')
    expect(removeCalls.length).toBeGreaterThan(0)
  })

  it('should_prevent_default_on_beforeunload_event_when_dirty', async () => {
    render(
      <NavigationBlockerProvider>
        <LessonForm {...baseProps} initialLesson={pastLesson} />
      </NavigationBlockerProvider>
    )
    let handler: ((e: BeforeUnloadEvent) => void) | undefined
    await waitFor(() => {
      const call = addEventSpy.mock.calls.find(([event]: [string]) => event === 'beforeunload')
      expect(call).toBeDefined()
      handler = call![1] as (e: BeforeUnloadEvent) => void
    })
    const mockEvent = { preventDefault: vi.fn() } as unknown as BeforeUnloadEvent
    handler!(mockEvent)
    expect(mockEvent.preventDefault).toHaveBeenCalled()
  })

  const futureNormalLesson: LessonDetail = { ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }
  const futureGroupLesson: LessonDetail = { ...groupLesson, lesson_at: '2099-01-01T10:00:00Z' }

  it('should_set_dirty_when_fee_changed', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const feeInput = container.querySelector('input[name="fee"]') as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '99' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_false_when_fee_reverted_to_original', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const feeInput = container.querySelector('input[name="fee"]') as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '99' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    fireEvent.change(feeInput, { target: { value: String(futureNormalLesson.fee) } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_horse_checkbox_toggled', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const horseCheckbox = container.querySelector('input[name="horse_id"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_new_horse_name_entered', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const newHorseInput = container.querySelector('input[name="new_horse_name"]') as HTMLInputElement
    fireEvent.change(newHorseInput, { target: { value: 'Star' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_in_new_mode_when_horse_checked', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} mode="new" initialLesson={undefined} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const horseCheckbox = container.querySelector('input[name="horse_id"]') as HTMLInputElement
    fireEvent.click(horseCheckbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_set_dirty_when_normal_rider_changed', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureNormalLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const select = container.querySelector('select[name="rider_id"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'rider-2' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_group_rider_checkbox_toggled', async () => {
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureGroupLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const riderCheckboxes = container.querySelectorAll('input[name="rider_id"]')
    fireEvent.click(riderCheckboxes[0])
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_group_riders_swapped_keeping_same_count', async () => {
    const mockRider3 = { id: 'rider-3', name: 'Cara' }
    const { container } = render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} riders={[mockRider, mockRider2, mockRider3]} initialLesson={futureGroupLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    const [, rider2Checkbox, rider3Checkbox] = container.querySelectorAll('input[name="rider_id"]')
    fireEvent.click(rider2Checkbox)
    fireEvent.click(rider3Checkbox)
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_set_dirty_when_lesson_has_unresolved_horse_issue', async () => {
    const cleanFutureLesson: LessonDetail = { ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={cleanFutureLesson} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_when_hasHorseIssue_is_false_and_nothing_else_dirty', async () => {
    const cleanFutureLesson: LessonDetail = { ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={cleanFutureLesson} hasHorseIssue={false} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })

  it('should_stay_dirty_when_hasHorseIssue_true_and_fee_also_changed', async () => {
    const futureLesson: LessonDetail = { ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} initialLesson={futureLesson} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
    fireEvent.change(screen.getByLabelText('Fee'), { target: { value: '999' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })

  it('should_not_set_dirty_in_new_mode_when_hasHorseIssue_is_true', async () => {
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...baseProps} mode="new" initialLesson={undefined} hasHorseIssue />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
  })
})

describe('LessonForm notes fields', () => {
  const notesProps = {
    ...baseProps,
    initialNotes: {
      horses: [{ id: 'horse-1', name: 'Thunderbolt', horse_notes: 'watch left lead' }],
      riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: 'good position', private_notes: 'private info' }],
    },
  }

  it('should_render_horse_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm {...notesProps} />)
    expect(screen.getByDisplayValue('watch left lead')).toBeDefined()
  })

  it('should_render_rider_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm {...notesProps} />)
    expect(screen.getByDisplayValue('good position')).toBeDefined()
  })

  it('should_render_private_notes_textarea_when_initialNotes_provided', () => {
    render(<LessonForm {...notesProps} />)
    expect(screen.getByDisplayValue('private info')).toBeDefined()
  })

  it('should_render_empty_textarea_when_horse_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, horses: [{ id: 'horse-1', name: 'Thunderbolt', horse_notes: null }] } }
    render(<LessonForm {...props} />)
    expect(screen.getByLabelText('Thunderbolt', { selector: 'textarea' })).toBeDefined()
  })

  it('should_render_empty_textarea_when_rider_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: null, private_notes: 'private info' }] } }
    render(<LessonForm {...props} />)
    expect(screen.getByText('Rider Notes')).toBeDefined()
  })

  it('should_render_empty_textarea_when_private_notes_is_null', () => {
    const props = { ...notesProps, initialNotes: { ...notesProps.initialNotes, riders: [{ membershipId: 'rider-1', name: 'Alice', rider_notes: 'good position', private_notes: null }] } }
    render(<LessonForm {...props} />)
    expect(screen.getByText('Private')).toBeDefined()
  })

  it('should_render_cancellation_notes_textarea_when_lesson_is_cancelled', () => {
    const props = {
      ...notesProps,
      initialLesson: { ...normalLesson, cancelled_at: '2026-05-18T00:00:00Z', cancellation_notes: 'weather' },
    }
    render(<LessonForm {...props} />)
    expect(screen.getByDisplayValue('weather')).toBeDefined()
  })

  it('should_not_render_cancellation_notes_textarea_when_lesson_is_not_cancelled', () => {
    render(<LessonForm {...notesProps} />)
    expect(screen.queryByText('Cancellation Notes')).toBeNull()
  })

  it('should_render_empty_cancellation_notes_textarea_when_notes_is_null', () => {
    const props = {
      ...notesProps,
      initialLesson: { ...normalLesson, cancelled_at: '2026-05-18T00:00:00Z', cancellation_notes: null },
    }
    render(<LessonForm {...props} />)
    expect(screen.getByLabelText('Cancellation Notes')).toBeDefined()
  })

  it('should_not_render_notes_section_when_initialNotes_not_provided', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByText('Notes')).toBeNull()
  })

  it('should_set_dirty_when_notes_changed', async () => {
    const futureLesson: LessonDetail = { ...normalLesson, lesson_at: '2099-01-01T10:00:00Z' }
    render(
      <NavigationBlockerProvider>
        <DirtyDisplay />
        <LessonForm {...notesProps} initialLesson={futureLesson} />
      </NavigationBlockerProvider>
    )
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('clean'))
    fireEvent.change(screen.getByDisplayValue('watch left lead'), { target: { value: 'changed' } })
    await waitFor(() => expect(screen.getByTestId('dirty').textContent).toBe('dirty'))
  })
})

describe('LessonForm (edit mode) exhaustion bars', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_fetch_projected_exhaustion_using_the_prefilled_lesson_date_on_mount', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm {...baseProps} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledWith('2026-05-17T10:30:00.000Z', ['horse-1']))
  })

  it('should_render_exhaustion_bar_for_the_pre_checked_horse', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm {...baseProps} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })

  it('should_call_getProjectedExhaustion_with_the_id_of_an_inactive_assigned_horse_too', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm {...baseProps} horses={[mockHorse, inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    // Round-tripping initialLesson.lesson_at through the (local-aware) date/hour
    // picker and back into a UTC instant reproduces the same instant exactly.
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledWith('2026-05-17T10:30:00.000Z', ['horse-1', 'horse-2']))
  })

  it('should_not_render_an_exhaustion_bar_for_an_inactive_assigned_horse', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm {...baseProps} horses={[mockHorse, inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(1)
    })
  })

  it('should_not_render_an_exhaustion_bar_for_an_unavailable_horse', async () => {
    const unavailableHorse = createMockHorse({ id: 'horse-2', name: 'Blaze', is_available: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm {...baseProps} horses={[mockHorse, unavailableHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(1)
    })
  })

  it('should_not_render_exhaustion_bar_when_lesson_date_is_in_the_past', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm {...baseProps} initialLesson={pastLesson} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_sort_checked_horse_before_available_horse_regardless_of_exhaustion', async () => {
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'Zeal' })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-1': { existingRows: [{ lessonAt: 'x', exertionLevel: 5 }], thresholds: { high: 11, moderate: 5 } },
      'horse-avail': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    const { container } = render(<LessonForm {...baseProps} horses={[availableHorse, mockHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-1')
    })
  })

  it('should_sort_available_horses_least_to_most_exhausted', async () => {
    const lessExhausted = createMockHorse({ id: 'horse-low', name: 'Low' })
    const moreExhausted = createMockHorse({ id: 'horse-high', name: 'High' })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-high': { existingRows: [{ lessonAt: 'x', exertionLevel: 5 }], thresholds: { high: 11, moderate: 5 } },
      'horse-low': { existingRows: [{ lessonAt: 'x', exertionLevel: 1 }], thresholds: { high: 11, moderate: 5 } },
    })
    const { container } = render(<LessonForm {...baseProps} horses={[moreExhausted, lessExhausted]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[0] as HTMLInputElement).value).toBe('horse-low')
    })
  })

  it('should_sort_an_unchecked_inactive_horse_after_an_available_horse', async () => {
    const availableHorse = createMockHorse({ id: 'horse-avail', name: 'Zeal' })
    const inactiveHorse = createMockHorse({ id: 'horse-inactive', name: 'Retired', is_active: false })
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm {...baseProps} horses={[inactiveHorse, availableHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    await waitFor(() => {
      const checkboxes = container.querySelectorAll('input[type="checkbox"][name="horse_id"]')
      expect((checkboxes[checkboxes.length - 1] as HTMLInputElement).value).toBe('horse-inactive')
    })
  })

  it('should_render_an_exhaustion_bar_for_an_inactive_horse_still_checked_on_this_lesson', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-2', name: 'Retired (inactive)', is_active: false })
    const lesson = { ...normalLesson, lesson_horses: [{ exertion_level: 3, horse_notes: null, horses: { id: 'horse-2', name: 'Retired (inactive)' } }] }
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      'horse-2': { existingRows: [], thresholds: { high: 11, moderate: 5 } },
    })
    render(<LessonForm {...baseProps} initialLesson={lesson} horses={[inactiveHorse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })
})

describe('LessonForm (edit mode) — timezone-aware date/hour prefill', () => {
  let originalTz: string | undefined

  beforeEach(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
  })

  afterEach(() => {
    process.env.TZ = originalTz
  })

  // 02:00 UTC on 2026-05-17 is 22:00 EDT (UTC-4) on the *previous* local day —
  // the case naive string-slicing gets wrong.
  const lessonNearUtcMidnight: LessonDetail = { ...normalLesson, lesson_at: '2026-05-17T02:00:00Z' }

  it('should_prefill_the_date_picker_with_the_local_calendar_date_not_the_utc_date', () => {
    const { container } = render(<LessonForm {...baseProps} initialLesson={lessonNearUtcMidnight} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-05-16')
  })

  it('should_prefill_the_hour_selector_with_the_local_hour_not_the_utc_hour', () => {
    render(<LessonForm {...baseProps} initialLesson={lessonNearUtcMidnight} />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.value).toBe('22')
  })
})
