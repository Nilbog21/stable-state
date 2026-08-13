import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'
import { createMockLessonTier, createMockHorse } from '@/test/fixtures'
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

  it('should_not_render_add_new_horse_input_for_manager', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} isManager={true} />)
    expect(screen.queryByPlaceholderText(/Add new horse/i)).toBeNull()
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

})
