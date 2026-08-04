import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { createMockLessonTier, createMockHorse, createMockScheduleItem } from '@/test/fixtures'
import { LessonForm, computeUnpaidWarn } from '../LessonForm'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

const sampleTier = createMockLessonTier({ is_default: true })

const baseProps = {
  mode: 'new' as const,
  horses: [],
  riders: [],
  isManager: false,
  action: vi.fn().mockResolvedValue({ error: null }),
  instructors: [],
  currentMembershipId: 'user-1',
  tiers: [sampleTier],
  todayStr: calendarDate('2026-06-01'),
}

describe('computeUnpaidWarn', () => {
  it('should_warn_when_past_due_and_unpaid_and_fee_nonzero', () => {
    expect(computeUnpaidWarn(true, '', '45')).toBe(true)
  })

  it('should_not_warn_when_fee_is_zeroed_out', () => {
    expect(computeUnpaidWarn(true, '', '0')).toBe(false)
  })

  it('should_not_warn_when_not_past_due', () => {
    expect(computeUnpaidWarn(false, '', '45')).toBe(false)
  })

  it('should_not_warn_when_payment_type_is_set', () => {
    expect(computeUnpaidWarn(true, 'cash', '45')).toBe(false)
  })
})

describe('LessonForm', () => {
  it('should_hide_exertion_input_when_horse_checkbox_is_unchecked', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    const checkbox = screen.getByRole('checkbox', { name: /Thunder/i }) as HTMLInputElement
    fireEvent.click(checkbox)
    expect(screen.queryByRole('spinbutton', { name: /Exertion level for Thunder/i })).not.toBeNull()
    fireEvent.click(checkbox)
    expect(screen.queryByRole('spinbutton', { name: /Exertion level for Thunder/i })).toBeNull()
  })

  it('should_label_horse_picker_as_singular_for_normal_lesson', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.getByText('Horse', { exact: true })).toBeDefined()
  })

  it('should_hide_select_at_least_one_hint_for_normal_lesson', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.queryByText(/select at least one/i)).toBeNull()
  })

  it('should_label_horse_picker_as_plural_for_group_lesson', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.getByText(/Horses/)).toBeDefined()
  })

  it('should_show_select_at_least_one_hint_for_group_lesson', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(screen.getByText(/select at least one/i)).toBeDefined()
  })

  it('should_not_render_instructor_select_when_isManager_is_false', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={false} />)
    expect(screen.queryByLabelText(/instructor/i)).toBeNull()
  })

  it('should_hide_instructor_name_entirely_when_is_manager_is_false', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={false} instructors={instructors} />)
    expect(screen.queryByText('Jane Doe')).toBeNull()
  })

  it('should_render_instructor_select_when_isManager_is_true', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} instructors={instructors} />)
    expect(screen.queryByLabelText(/instructor/i)).not.toBeNull()
  })

  it('should_default_instructor_select_to_currentMembershipId', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} instructors={instructors} currentMembershipId="user-1" />)
    const select = screen.getByLabelText(/instructor/i) as HTMLSelectElement
    expect(select.value).toBe('user-1')
  })

  it('should_render_instructor_options_from_instructors_prop', () => {
    const instructors = [
      { membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' },
      { membershipId: 'user-2', userId: 'user-2', name: 'John Smith' },
    ]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} instructors={instructors} />)
    expect(screen.queryByRole('option', { name: 'Jane Doe' })).not.toBeNull()
    expect(screen.queryByRole('option', { name: 'John Smith' })).not.toBeNull()
  })

  it('should_render_error_message_when_action_returns_error', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'Something went wrong' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} action={errorAction} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  // relies on useTransition reporting isPending before the never-resolving promise settles — may be flaky under load
  it('should_display_submitting_text_while_form_action_is_pending', async () => {
    const pendingAction = vi.fn().mockImplementation(() => new Promise(() => {}))
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} action={pendingAction} horses={[horse]} riders={[rider]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const riderSelect = container.querySelector('select[name="rider_id"]') as HTMLSelectElement
    fireEvent.change(riderSelect, { target: { value: 'r1' } })
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submitting/i })).toBeDefined()
    })
  })

  it('should_render_normal_toggle_button', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Normal' })).not.toBeNull()
  })

  it('should_render_group_toggle_button', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Group' })).not.toBeNull()
  })

  it('should_default_lesson_type_hidden_input_to_normal', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const hiddenInput = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hiddenInput).not.toBeNull()
    expect(hiddenInput.value).toBe('normal')
  })

  it('should_show_single_rider_select_in_normal_mode', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(container.querySelector('select[name="rider_id"]')).not.toBeNull()
  })

  it('should_not_show_rider_checkboxes_in_normal_mode', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(container.querySelector('input[type="checkbox"][name="rider_id"]')).toBeNull()
  })

  it('should_switch_to_group_mode_when_group_button_clicked', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const hiddenInput = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hiddenInput.value).toBe('group')
  })

  it('should_show_rider_checkboxes_in_group_mode', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]')
    expect(checkboxes).toHaveLength(2)
  })

  it('should_hide_single_rider_select_in_group_mode', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    expect(container.querySelector('select[name="rider_id"]')).toBeNull()
  })

  it('should_show_error_when_group_mode_submitted_with_fewer_than_two_riders', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('group lesson requires at least 2 riders')
  })

  it('should_not_call_action_when_group_mode_submitted_with_fewer_than_two_riders', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} action={action} horses={[horse]} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_restore_single_rider_select_when_normal_button_clicked_from_group_mode', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(container.querySelector('select[name="rider_id"]')).not.toBeNull()
  })

  it('should_set_lesson_type_to_normal_when_normal_button_clicked_from_group_mode', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    const hiddenInput = container.querySelector('input[name="lesson_type"]') as HTMLInputElement
    expect(hiddenInput.value).toBe('normal')
  })

  it('should_mark_rider_checkbox_checked_when_clicked_in_group_mode', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]') as NodeListOf<HTMLInputElement>
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0].checked).toBe(true)
  })

  it('should_unmark_rider_checkbox_when_clicked_again_in_group_mode', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]') as NodeListOf<HTMLInputElement>
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0].checked).toBe(false)
  })

  it('should_render_jumping_checkbox_unchecked_by_default', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const jumping = screen.getByRole('checkbox', { name: /jumping/i }) as HTMLInputElement
    expect(jumping.checked).toBe(false)
  })

  it('should_submit_jumping_as_false_by_default', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_submit_jumping_as_true_when_jumping_checkbox_is_checked', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_render_recurring_checkbox_unchecked_by_default', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const recurring = screen.getByRole('checkbox', { name: /recurring/i }) as HTMLInputElement
    expect(recurring.checked).toBe(false)
  })

  it('should_submit_is_recurring_as_false_by_default', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const isRecurringInput = container.querySelector('input[name="is_recurring"]') as HTMLInputElement
    expect(isRecurringInput.value).toBe('false')
  })

  it('should_submit_is_recurring_as_true_when_recurring_checkbox_is_checked', () => {
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /recurring/i }))
    const isRecurringInput = container.querySelector('input[name="is_recurring"]') as HTMLInputElement
    expect(isRecurringInput.value).toBe('true')
  })

  it('should_render_recurring_checkbox_before_date_field', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const recurringCheckbox = screen.getByRole('checkbox', { name: /recurring/i })
    const dateField = screen.getByLabelText('Date')
    expect(recurringCheckbox.compareDocumentPosition(dateField) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_show_Date_label_by_default', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.getByLabelText('Date')).toBeDefined()
  })

  it('should_show_Starting_Date_label_when_recurring_checked', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /recurring/i }))
    expect(screen.getByLabelText('Starting Date')).toBeDefined()
  })

  it('should_snap_exertion_to_4_when_jumping_toggled_on_with_single_horse_below_4', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_first_of_two_horses_exertion_to_4_when_jumping_toggled_on', () => {
    const horses = [
      createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }),
      createMockHorse({ id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={horses} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_second_of_two_horses_exertion_to_4_when_jumping_toggled_on', () => {
    const horses = [
      createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }),
      createMockHorse({ id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ]
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={horses} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Lightning/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_change_exertion_when_jumping_toggled_on_and_exertion_is_4', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_change_exertion_when_jumping_toggled_on_and_exertion_is_5', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    expect(exertionInput.value).toBe('5')
  })

  it('should_not_change_exertion_when_jumping_toggled_off', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_default_exertion_to_4_when_horse_added_while_jumping_is_on', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_default_new_horse_exertion_to_4_when_jumping_is_on_before_name_entered', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_new_horse_exertion_to_4_when_jumping_toggled_on_with_name_already_entered', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_update_new_horse_exertion_when_changed_by_user', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_show_exertion_label_when_existing_horse_is_checked', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_not_show_exertion_label_when_existing_horse_is_unchecked', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    expect(screen.queryByText('Exertion (1–5)')).toBeNull()
  })

  it('should_show_exertion_label_for_new_horse_when_name_is_entered', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_show_blocked_state_when_tiers_is_empty', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[]} />)
    expect(screen.getByRole('alert').textContent).toContain('No lesson tiers have been configured')
  })

  it('should_not_render_submit_button_when_tiers_is_empty', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[]} />)
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('should_show_tier_dropdown_with_tier_options', () => {
    const tier = createMockLessonTier({ name: 'Premium', price: 100, is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    expect(screen.getByRole('option', { name: 'Premium - $100' })).toBeDefined()
  })

  it('should_show_custom_option_in_tier_dropdown', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    expect(screen.getByRole('option', { name: 'Custom' })).toBeDefined()
  })

  it('should_pre_select_default_tier_in_dropdown', () => {
    const tier = createMockLessonTier({ name: 'Default Tier', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    expect(select.value).toBe(tier.id)
  })

  it('should_show_fee_input_when_named_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    expect(screen.queryByRole('spinbutton', { name: /fee/i })).not.toBeNull()
  })

  it('should_show_fee_input_when_custom_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    expect(screen.getByRole('spinbutton', { name: /fee/i })).toBeDefined()
  })

  it('should_show_payment_type_when_fee_is_nonzero', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '45' } })
    expect(screen.queryByLabelText(/payment type/i)).not.toBeNull()
  })

  it('should_hide_payment_type_when_fee_is_zero', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '0' } })
    expect(screen.queryByLabelText(/payment type/i)).toBeNull()
  })

  it('should_require_fee_input_when_custom_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.required).toBe(true)
  })

  it('should_require_fee_input_when_named_tier_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.required).toBe(true)
  })

  it('should_prefill_fee_input_with_tier_price_when_named_tier_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', price: 60, is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('60')
  })

  it('should_update_fee_value_when_switching_to_a_different_named_tier', () => {
    const tierA = createMockLessonTier({ id: 't-a', name: 'Standard', price: 60, is_default: true })
    const tierB = createMockLessonTier({ id: 't-b', name: 'Premium', price: 90 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tierA, tierB]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-b' } })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('90')
  })

  it('should_not_change_tier_name_when_fee_is_manually_edited', () => {
    const tier = createMockLessonTier({ name: 'Standard', price: 60, is_default: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[tier]} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '45' } })
    const tierNameInput = container.querySelector('input[name="tier_name"]') as HTMLInputElement
    expect(tierNameInput.value).toBe('Standard')
  })

  it('should_show_error_when_normal_mode_submitted_with_no_horse_selected', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('normal lesson requires exactly 1 horse')
  })

  it('should_not_call_action_when_normal_submitted_with_no_horse_selected', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} action={action} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_show_error_when_normal_mode_submitted_with_no_rider_selected', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('a rider is required')
  })

  it('should_not_show_horse_error_when_new_horse_name_entered_without_existing_horse_in_normal_mode', () => {
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} riders={[rider]} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.change(container.querySelector('select[name="rider_id"]') as HTMLSelectElement, { target: { value: 'r1' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(screen.queryByText(/normal lesson requires exactly 1 horse/i)).toBeNull()
  })

  it('should_show_conflict_error_when_new_horse_name_and_existing_horse_both_submitted_in_normal_mode', () => {
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} horses={[horse]} riders={[rider]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.change(container.querySelector('select[name="rider_id"]') as HTMLSelectElement, { target: { value: 'r1' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('select a horse or add a new one, not both')
  })

  it('should_not_call_action_when_new_horse_name_and_existing_horse_both_submitted_in_normal_mode', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} action={action} isManager={true} horses={[horse]} riders={[rider]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.change(container.querySelector('select[name="rider_id"]') as HTMLSelectElement, { target: { value: 'r1' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_not_show_horse_error_when_new_horse_name_entered_without_existing_horse_in_group_mode', () => {
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]') as NodeListOf<HTMLInputElement>
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[1])
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(screen.queryByText(/group lesson requires at least 1 horse/i)).toBeNull()
  })

})

describe('LessonForm tier cascade', () => {
  const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const horse2 = createMockHorse({ id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  afterEach(() => vi.useRealTimers())

  it('should_render_tier_selector_before_jumping_checkbox', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const tierSelect = screen.getByRole('combobox', { name: /tier/i })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(tierSelect.compareDocumentPosition(jumpingCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_cascade_default_jumping_true_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_cascade_default_jumping_false_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noJumpTier = createMockLessonTier({ id: 't-nojump', name: 'No Jump', default_jumping: false })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, noJumpTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-nojump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_cascade_default_exertion_into_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_first_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e1 = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(e1.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_second_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e2 = screen.getByRole('spinbutton', { name: /Exertion level for Lightning/i }) as HTMLInputElement
    expect(e2.value).toBe('2')
  })

  it('should_not_cascade_jumping_when_tier_default_jumping_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_jumping: null })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, nullTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_not_cascade_exertion_when_tier_default_exertion_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_exertion_level: null })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, nullTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_reset_jumping_to_off_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_jumping: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_reset_exertion_to_3_for_checked_horses_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_exertion_level: 5 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('3')
  })

  it('should_use_tier_default_exertion_when_horse_checked_after_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_use_jumping_fallback_when_tier_has_no_default_exertion_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noExTier = createMockLessonTier({ id: 't-noex', name: 'No Exertion', default_exertion_level: null })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, noExTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-noex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_crash_when_selected_tier_id_is_unknown', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'nonexistent-id' } })
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('should_bump_exertion_to_4_when_jumping_toggled_on_over_tier_default_below_4', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_flash_jumping_when_tier_cascades_default_jumping', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).toContain('ring-2')
  })

  it('should_clear_flash_after_600ms', async () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).not.toContain('ring-2')
  })

  it('should_not_flash_jumping_when_custom_selected_and_jumping_already_off', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).not.toContain('ring-2')
  })

  it('should_reset_fee_to_blank_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('')
  })

  it('should_flash_fee_when_tier_cascades_price', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).toContain('ring-2')
  })

  it('should_clear_fee_flash_after_600ms', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).not.toContain('ring-2')
  })

  it('should_not_flash_fee_when_custom_selected_and_fee_already_blank', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).not.toContain('ring-2')
  })

  it('should_floor_exertion_at_4_when_tier_default_below_4_and_jumping_on_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const lowTier = createMockLessonTier({ id: 't-low', name: 'Low Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, lowTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-low' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })
})

describe('LessonForm exhaustion bars', () => {
  const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const horse2 = createMockHorse({ id: 'h2', name: 'Shadow', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const thresholds = { high: 11, moderate: 5 }

  it('should_not_render_exhaustion_bar_before_getProjectedExhaustion_resolves', () => {
    const getProjectedExhaustion = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_render_exhaustion_bar_for_each_horse_after_fetch_resolves', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })

  it('should_render_solid_bars_for_both_horses_before_any_are_checked', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
      h2: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(2)
    })
  })

  it('should_render_ghost_bar_only_for_the_checked_horse', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
      h2: { existingRows: [], thresholds },
    })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(2)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    expect(document.querySelectorAll('[data-testid="exhaustion-bar-ghost"]')).toHaveLength(1)
  })

  it('should_refetch_when_date_changes', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(1))
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
  })

  it('should_call_getProjectedExhaustion_with_the_new_date_after_a_date_change', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(1))
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
    // The received value is a UTC instant now, not a raw '2026-06-15...' string —
    // decode it back to the local calendar date it represents instead of substring matching.
    const receivedIso = getProjectedExhaustion.mock.calls[1][0] as string
    const barnDate = instantToLocalWallClock(new Date(receivedIso), 'America/New_York').slice(0, 10)
    expect(barnDate).toBe('2026-06-15')
  })

  it('should_call_getProjectedExhaustion_with_the_ids_of_every_horse_passed_in_props', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalled())
    expect(getProjectedExhaustion.mock.calls[0][1]).toEqual(['h1', 'h2'])
  })

  it('should_not_show_stale_exhaustion_data_after_a_date_change_before_the_refetch_resolves', async () => {
    let resolveSecondFetch: (value: Record<string, unknown>) => void = () => {}
    const getProjectedExhaustion = vi.fn()
      .mockResolvedValueOnce({ h1: { existingRows: [], thresholds } })
      .mockImplementationOnce(() => new Promise((resolve) => { resolveSecondFetch = resolve }))
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))

    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()

    await act(async () => { resolveSecondFetch({ h1: { existingRows: [], thresholds } }) })
  })

  it('should_not_render_exhaustion_bar_when_getProjectedExhaustion_is_omitted', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_not_render_exhaustion_bar_when_date_changed_to_the_past', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
    })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2020-01-01' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
    })
  })
})

// #1019 — the date field becomes a month conflict calendar when the form is given a
// schedule reader; without one it stays the plain native date input (see DateHourPicker).
describe('LessonForm — month conflict calendar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T14:30:00Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const thunder = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })

  async function renderWithCalendar(items: ReturnType<typeof createMockScheduleItem>[] = [], props = {}) {
    const getScheduleRange = vi.fn().mockResolvedValue(items)
    const result = render(
      <LessonForm timezone={'America/New_York'} {...baseProps} horses={[thunder]} riders={[{ id: 'r1', name: 'Alice' }]} getScheduleRange={getScheduleRange} {...props} />
    )
    await act(async () => { await Promise.resolve() })
    return { ...result, getScheduleRange }
  }

  // #1149 -- todayStr is the barn's own day, computed server-side. A barn a day ahead of the
  // viewer greys out the viewer's own day, since it is already past in barn time.
  it('should_grey_out_the_viewers_own_day_when_the_barn_is_already_a_day_ahead', async () => {
    await renderWithCalendar([], { todayStr: calendarDate('2026-06-02') })

    expect(screen.getByRole('button', { name: '2026-06-01' }).getAttribute('data-past')).toBe('true')
  })

  it('should_replace_the_native_date_input_with_the_month_calendar', async () => {
    const { container } = await renderWithCalendar()

    expect(container.querySelector('input[type="date"]')).toBeNull()
  })

  it('should_widen_the_fetched_range_by_the_exertion_window_at_both_ends', async () => {
    const { getScheduleRange } = await renderWithCalendar()

    expect(getScheduleRange).toHaveBeenCalledWith('2026-05-28', '2026-07-15')
  })

  it('should_describe_a_lesson_by_the_names_its_participant_ids_resolve_to', async () => {
    await renderWithCalendar([createMockScheduleItem({ id: 'l1', start: '2026-06-10T14:00:00', horseIds: ['h1'], riderIds: ['r1'] })])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Lesson — Thunder, Alice')).toBeDefined()
  })

  it('should_fall_back_to_a_bare_lesson_label_when_no_participant_id_resolves', async () => {
    await renderWithCalendar([createMockScheduleItem({ id: 'l1', start: '2026-06-10T14:00:00', horseIds: ['gone'] })])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Lesson')).toBeDefined()
  })

  it('should_use_the_server_supplied_label_for_an_expense', async () => {
    await renderWithCalendar([
      createMockScheduleItem({ id: 'e1', itemType: 'expense', start: '2026-06-10T14:00:00', label: 'Veterinary — Dr. Smith' }),
    ])

    fireEvent.click(screen.getByRole('button', { name: '2026-06-10' }))

    expect(screen.getByText('Veterinary — Dr. Smith')).toBeDefined()
  })

  it('should_title_the_calendar_field_Date_for_a_one_off_lesson', async () => {
    await renderWithCalendar()

    expect(screen.getByText('Date')).toBeDefined()
  })

  it('should_title_the_calendar_field_Starting_Date_once_recurring_is_checked', async () => {
    await renderWithCalendar()

    fireEvent.click(screen.getByRole('checkbox', { name: 'Recurring (weekly)' }))

    expect(screen.getByText('Starting Date')).toBeDefined()
  })
})
