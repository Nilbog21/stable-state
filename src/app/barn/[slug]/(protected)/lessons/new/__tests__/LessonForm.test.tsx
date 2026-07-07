import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor, act } from '@testing-library/react'
import { createMockLessonTier } from '@/test/fixtures'
import { LessonForm } from '../../LessonForm'

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
}

describe('LessonForm', () => {
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

  it('should_render_instructor_name_read_only_when_is_manager_is_false', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm {...baseProps} isManager={false} instructors={instructors} />)
    expect(screen.queryByText('Jane Doe')).not.toBeNull()
  })

  it('should_render_instructor_select_when_isManager_is_true', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm {...baseProps} isManager={true} instructors={instructors} />)
    expect(screen.queryByLabelText(/instructor/i)).not.toBeNull()
  })

  it('should_default_instructor_select_to_currentMembershipId', () => {
    const instructors = [{ membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' }]
    render(<LessonForm {...baseProps} isManager={true} instructors={instructors} currentMembershipId="user-1" />)
    const select = screen.getByLabelText(/instructor/i) as HTMLSelectElement
    expect(select.value).toBe('user-1')
  })

  it('should_render_instructor_options_from_instructors_prop', () => {
    const instructors = [
      { membershipId: 'user-1', userId: 'user-1', name: 'Jane Doe' },
      { membershipId: 'user-2', userId: 'user-2', name: 'John Smith' },
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
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm {...baseProps} action={pendingAction} horses={[horse]} riders={[rider]} />)
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
    render(<LessonForm {...baseProps} />)
    expect(screen.queryByRole('button', { name: 'Normal' })).not.toBeNull()
  })

  it('should_render_group_toggle_button', () => {
    render(<LessonForm {...baseProps} />)
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

  it('should_show_error_when_group_mode_submitted_with_fewer_than_two_riders', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm {...baseProps} horses={[horse]} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('group lesson requires at least 2 riders')
  })

  it('should_not_call_action_when_group_mode_submitted_with_fewer_than_two_riders', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    const riders = [
      { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'r2', name: 'Bob', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm {...baseProps} action={action} horses={[horse]} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_restore_single_rider_select_when_normal_button_clicked_from_group_mode', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    fireEvent.click(screen.getByRole('button', { name: 'Normal' }))
    expect(container.querySelector('select[name="rider_id"]')).not.toBeNull()
  })

  it('should_set_lesson_type_to_normal_when_normal_button_clicked_from_group_mode', () => {
    const { container } = render(<LessonForm {...baseProps} />)
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
    const { container } = render(<LessonForm {...baseProps} riders={riders} />)
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
    const { container } = render(<LessonForm {...baseProps} riders={riders} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group' }))
    const checkboxes = container.querySelectorAll('input[type="checkbox"][name="rider_id"]') as NodeListOf<HTMLInputElement>
    fireEvent.click(checkboxes[0])
    fireEvent.click(checkboxes[0])
    expect(checkboxes[0].checked).toBe(false)
  })

  it('should_render_jumping_checkbox_unchecked_by_default', () => {
    render(<LessonForm {...baseProps} />)
    const jumping = screen.getByRole('checkbox', { name: /jumping/i }) as HTMLInputElement
    expect(jumping.checked).toBe(false)
  })

  it('should_submit_jumping_as_false_by_default', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_submit_jumping_as_true_when_jumping_checkbox_is_checked', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_render_recurring_checkbox_unchecked_by_default', () => {
    render(<LessonForm {...baseProps} />)
    const recurring = screen.getByRole('checkbox', { name: /recurring/i }) as HTMLInputElement
    expect(recurring.checked).toBe(false)
  })

  it('should_submit_is_recurring_as_false_by_default', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    const isRecurringInput = container.querySelector('input[name="is_recurring"]') as HTMLInputElement
    expect(isRecurringInput.value).toBe('false')
  })

  it('should_submit_is_recurring_as_true_when_recurring_checkbox_is_checked', () => {
    const { container } = render(<LessonForm {...baseProps} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /recurring/i }))
    const isRecurringInput = container.querySelector('input[name="is_recurring"]') as HTMLInputElement
    expect(isRecurringInput.value).toBe('true')
  })

  it('should_snap_exertion_to_4_when_jumping_toggled_on_with_single_horse_below_4', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_first_of_two_horses_exertion_to_4_when_jumping_toggled_on', () => {
    const horses = [
      { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm {...baseProps} horses={horses} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_second_of_two_horses_exertion_to_4_when_jumping_toggled_on', () => {
    const horses = [
      { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ]
    render(<LessonForm {...baseProps} horses={horses} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Lightning/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_change_exertion_when_jumping_toggled_on_and_exertion_is_4', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '4' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_change_exertion_when_jumping_toggled_on_and_exertion_is_5', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    expect(exertionInput.value).toBe('5')
  })

  it('should_not_change_exertion_when_jumping_toggled_off', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_default_exertion_to_4_when_horse_added_while_jumping_is_on', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_default_new_horse_exertion_to_4_when_jumping_is_on_before_name_entered', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_snap_new_horse_exertion_to_4_when_jumping_toggled_on_with_name_already_entered', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_update_new_horse_exertion_when_changed_by_user', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for new horse/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_show_exertion_label_when_existing_horse_is_checked', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_not_show_exertion_label_when_existing_horse_is_unchecked', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    expect(screen.queryByText('Exertion (1–5)')).toBeNull()
  })

  it('should_show_exertion_label_for_new_horse_when_name_is_entered', () => {
    render(<LessonForm {...baseProps} isManager={true} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    expect(screen.queryByText('Exertion (1–5)')).not.toBeNull()
  })

  it('should_show_blocked_state_when_tiers_is_empty', () => {
    render(<LessonForm {...baseProps} tiers={[]} />)
    expect(screen.getByRole('alert').textContent).toContain('No lesson tiers have been configured')
  })

  it('should_not_render_submit_button_when_tiers_is_empty', () => {
    render(<LessonForm {...baseProps} tiers={[]} />)
    expect(screen.queryByRole('button', { name: /submit/i })).toBeNull()
  })

  it('should_show_tier_dropdown_with_tier_options', () => {
    const tier = createMockLessonTier({ name: 'Premium', price: 100, is_default: true })
    render(<LessonForm {...baseProps} tiers={[tier]} />)
    expect(screen.getByRole('option', { name: 'Premium - $100' })).toBeDefined()
  })

  it('should_show_custom_option_in_tier_dropdown', () => {
    render(<LessonForm {...baseProps} />)
    expect(screen.getByRole('option', { name: 'Custom' })).toBeDefined()
  })

  it('should_pre_select_default_tier_in_dropdown', () => {
    const tier = createMockLessonTier({ name: 'Default Tier', is_default: true })
    render(<LessonForm {...baseProps} tiers={[tier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    expect(select.value).toBe(tier.id)
  })

  it('should_hide_fee_input_when_non_custom_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm {...baseProps} tiers={[tier]} />)
    expect(screen.queryByRole('spinbutton', { name: /fee/i })).toBeNull()
  })

  it('should_show_fee_input_when_custom_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm {...baseProps} tiers={[tier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    expect(screen.getByRole('spinbutton', { name: /fee/i })).toBeDefined()
  })

  it('should_require_fee_input_when_custom_tier_is_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', is_default: true })
    render(<LessonForm {...baseProps} tiers={[tier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.required).toBe(true)
  })

  it('should_submit_tier_price_as_hidden_fee_when_named_tier_selected', () => {
    const tier = createMockLessonTier({ name: 'Standard', price: 60, is_default: true })
    const { container } = render(<LessonForm {...baseProps} tiers={[tier]} />)
    const hiddenFee = container.querySelector('input[name="fee"][type="hidden"]') as HTMLInputElement
    expect(hiddenFee.value).toBe('60')
  })

  it('should_show_error_when_normal_mode_submitted_with_no_horse_selected', () => {
    render(<LessonForm {...baseProps} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('normal lesson requires exactly 1 horse')
  })

  it('should_not_call_action_when_normal_submitted_with_no_horse_selected', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<LessonForm {...baseProps} action={action} />)
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(action).not.toHaveBeenCalled()
  })

  it('should_show_error_when_normal_mode_submitted_with_no_rider_selected', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    render(<LessonForm {...baseProps} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const form = screen.getByRole('button', { name: 'Submit' }).closest('form')!
    fireEvent.submit(form)
    expect(screen.getByRole('alert').textContent).toContain('a rider is required')
  })

  it('should_not_show_horse_error_when_new_horse_name_entered_without_existing_horse_in_normal_mode', () => {
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm {...baseProps} isManager={true} riders={[rider]} />)
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.change(container.querySelector('select[name="rider_id"]') as HTMLSelectElement, { target: { value: 'r1' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(screen.queryByText(/normal lesson requires exactly 1 horse/i)).toBeNull()
  })

  it('should_show_conflict_error_when_new_horse_name_and_existing_horse_both_submitted_in_normal_mode', () => {
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm {...baseProps} isManager={true} horses={[horse]} riders={[rider]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByPlaceholderText(/Add new horse/i), { target: { value: 'Blaze' } })
    fireEvent.change(container.querySelector('select[name="rider_id"]') as HTMLSelectElement, { target: { value: 'r1' } })
    fireEvent.submit(screen.getByRole('button', { name: 'Submit' }).closest('form')!)
    expect(screen.getByRole('alert').textContent).toContain('select a horse or add a new one, not both')
  })

  it('should_not_call_action_when_new_horse_name_and_existing_horse_both_submitted_in_normal_mode', () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
    const rider = { id: 'r1', name: 'Alice', barn_id: 'b1', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    const { container } = render(<LessonForm {...baseProps} action={action} isManager={true} horses={[horse]} riders={[rider]} />)
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
    const { container } = render(<LessonForm {...baseProps} isManager={true} riders={riders} />)
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
  const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
  const horse2 = { id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
  afterEach(() => vi.useRealTimers())

  it('should_render_tier_selector_before_jumping_checkbox', () => {
    render(<LessonForm {...baseProps} />)
    const tierSelect = screen.getByRole('combobox', { name: /tier/i })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(tierSelect.compareDocumentPosition(jumpingCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_cascade_default_jumping_true_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    const { container } = render(<LessonForm {...baseProps} tiers={[baseTier, jumpTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_cascade_default_jumping_false_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noJumpTier = createMockLessonTier({ id: 't-nojump', name: 'No Jump', default_jumping: false })
    const { container } = render(<LessonForm {...baseProps} tiers={[baseTier, noJumpTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-nojump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_cascade_default_exertion_into_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_first_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e1 = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(e1.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_second_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e2 = screen.getByRole('spinbutton', { name: /Exertion level for Lightning/i }) as HTMLInputElement
    expect(e2.value).toBe('2')
  })

  it('should_not_cascade_jumping_when_tier_default_jumping_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_jumping: null })
    const { container } = render(<LessonForm {...baseProps} tiers={[baseTier, nullTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_not_cascade_exertion_when_tier_default_exertion_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_exertion_level: null })
    render(<LessonForm {...baseProps} tiers={[baseTier, nullTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_reset_jumping_to_off_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_jumping: true })
    const { container } = render(<LessonForm {...baseProps} tiers={[baseTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_reset_exertion_to_3_for_checked_horses_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_exertion_level: 5 })
    render(<LessonForm {...baseProps} tiers={[baseTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('3')
  })

  it('should_use_tier_default_exertion_when_horse_checked_after_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_use_jumping_fallback_when_tier_has_no_default_exertion_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noExTier = createMockLessonTier({ id: 't-noex', name: 'No Exertion', default_exertion_level: null })
    render(<LessonForm {...baseProps} tiers={[baseTier, noExTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-noex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_crash_when_selected_tier_id_is_unknown', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const { container } = render(<LessonForm {...baseProps} tiers={[baseTier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'nonexistent-id' } })
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('should_bump_exertion_to_4_when_jumping_toggled_on_over_tier_default_below_4', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
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
    render(<LessonForm {...baseProps} tiers={[baseTier, jumpTier]} />)
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
    render(<LessonForm {...baseProps} tiers={[baseTier, jumpTier]} />)
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
    render(<LessonForm {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).not.toContain('ring-2')
  })

  it('should_floor_exertion_at_4_when_tier_default_below_4_and_jumping_on_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const lowTier = createMockLessonTier({ id: 't-low', name: 'Low Tier', default_exertion_level: 2 })
    render(<LessonForm {...baseProps} tiers={[baseTier, lowTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-low' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })
})

describe('LessonForm exhaustion bars', () => {
  const horse = { id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
  const horse2 = { id: 'h2', name: 'Shadow', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' }
  const thresholds = { high: 11, moderate: 5 }

  it('should_not_render_exhaustion_bar_before_getProjectedExhaustion_resolves', () => {
    const getProjectedExhaustion = vi.fn().mockImplementation(() => new Promise(() => {}))
    render(<LessonForm {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })

  it('should_render_exhaustion_bar_for_each_horse_after_fetch_resolves', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
    })
    render(<LessonForm {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).not.toBeNull()
    })
  })

  it('should_pass_ghost_value_from_selected_exertion_level_to_checked_horse_only', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({
      h1: { existingRows: [], thresholds },
      h2: { existingRows: [], thresholds },
    })
    render(<LessonForm {...baseProps} horses={[horse, horse2]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => {
      expect(document.querySelectorAll('[data-testid="exhaustion-bar-solid"]')).toHaveLength(2)
    })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    expect(document.querySelectorAll('[data-testid="exhaustion-bar-ghost"]')).toHaveLength(1)
  })

  it('should_refetch_when_date_changes', async () => {
    const getProjectedExhaustion = vi.fn().mockResolvedValue({})
    const { container } = render(<LessonForm {...baseProps} horses={[horse]} getProjectedExhaustion={getProjectedExhaustion} />)
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(1))
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    await waitFor(() => expect(getProjectedExhaustion).toHaveBeenCalledTimes(2))
    expect(getProjectedExhaustion.mock.calls[1][0]).toContain('2026-06-15')
  })

  it('should_not_render_exhaustion_bar_when_getProjectedExhaustion_is_omitted', () => {
    render(<LessonForm {...baseProps} horses={[horse]} />)
    expect(document.querySelector('[data-testid="exhaustion-bar-solid"]')).toBeNull()
  })
})
