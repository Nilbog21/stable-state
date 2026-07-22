import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockBarn, createMockHorse } from '@/test/fixtures'
import { HorseManagerForm } from '../HorseManagerForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mockBarn = createMockBarn({ exhaustion_threshold_moderate: 5, exhaustion_threshold_high: 11 })

const activeHorse = createMockHorse({
  is_active: true,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_moderate: null,
  exhaustion_threshold_high: null,
})
const unavailableHorse = createMockHorse({
  is_active: true,
  is_available: false,
  unavailability_reason: 'on stall rest',
  exhaustion_threshold_moderate: null,
  exhaustion_threshold_high: null,
})
const inactiveHorse = createMockHorse({
  is_active: false,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_moderate: null,
  exhaustion_threshold_high: null,
})
const customThresholdsHorse = createMockHorse({
  is_active: true,
  is_available: true,
  unavailability_reason: null,
  exhaustion_threshold_moderate: 2,
  exhaustion_threshold_high: 6,
})
const horseWithNotes = createMockHorse({
  feed_notes: '2 flakes hay AM/PM',
  medication_notes: 'Bute 1g daily',
})

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('HorseManagerForm', () => {
  it('should_render_name_input_prefilled_with_horse_name', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /^name$/i }) as HTMLInputElement).value).toBe('Thunderbolt')
  })

  it('should_render_active_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^active$/i })).toBeDefined()
  })

  it('should_render_unavailable_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i })).toBeDefined()
  })

  it('should_render_inactive_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^inactive$/i })).toBeDefined()
  })

  it('should_select_active_pill_when_horse_is_active_and_available', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^active$/i, pressed: true })).toBeDefined()
  })

  it('should_not_select_unavailable_pill_when_horse_is_active_and_available', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i, pressed: false })).toBeDefined()
  })

  it('should_select_unavailable_pill_when_horse_is_active_and_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i, pressed: true })).toBeDefined()
  })

  it('should_select_inactive_pill_when_horse_is_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^inactive$/i, pressed: true })).toBeDefined()
  })

  it('should_not_render_reason_textarea_when_active_is_selected', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_render_reason_textarea_when_unavailable_is_selected', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /reason/i })).toBeDefined()
  })

  it('should_not_render_reason_textarea_when_inactive_is_selected', () => {
    render(<HorseManagerForm horse={inactiveHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_prefill_reason_textarea_with_unavailability_reason_when_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /reason/i }) as HTMLTextAreaElement).value).toBe('on stall rest')
  })

  it('should_not_render_inactive_warning_when_active_is_selected', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_not_render_inactive_warning_when_unavailable_is_selected', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_not_render_inactive_warning_when_horse_is_already_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_retain_typed_reason_after_switching_away_from_unavailable_and_back', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /reason/i }), { target: { value: 'injured leg' } })
    fireEvent.click(screen.getByRole('button', { name: /^active$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect((screen.getByRole('textbox', { name: /reason/i }) as HTMLTextAreaElement).value).toBe('injured leg')
  })

  it('should_set_hidden_status_input_to_active_when_horse_is_active', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('active')
  })

  it('should_set_hidden_status_input_to_unavailable_when_horse_is_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('unavailable')
  })

  it('should_set_hidden_status_input_to_inactive_when_horse_is_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} barn={mockBarn} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('inactive')
  })

  it('should_update_hidden_status_input_to_unavailable_after_clicking_unavailable_pill', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('unavailable')
  })

  it('should_update_hidden_status_input_to_inactive_after_clicking_inactive_pill', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('inactive')
  })

  it('should_show_reason_textarea_after_clicking_unavailable_pill', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect(screen.getByRole('textbox', { name: /reason/i })).toBeDefined()
  })

  it('should_hide_reason_textarea_after_clicking_active_pill_from_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^active$/i }))
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_show_inactive_warning_after_clicking_inactive_pill', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    expect(screen.getByText(/remove it from the roster/i)).toBeDefined()
  })

  it('should_not_wrap_inactive_warning_in_a_nested_flex_container', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    const warning = screen.getByText(/remove it from the roster/i)
    expect(warning.parentElement).toBe(screen.getByRole('group').parentElement)
    expect(warning.classList.contains('min-w-0')).toBe(true)
  })

  it('should_render_exhaustion_thresholds_heading_in_text_sm', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('heading', { name: /exhaustion thresholds/i }).className).toContain('text-sm')
  })

  it('should_check_use_barn_defaults_toggle_when_horse_thresholds_are_null', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement).checked).toBe(true)
  })

  it('should_uncheck_use_barn_defaults_toggle_when_horse_has_custom_thresholds', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement).checked).toBe(false)
  })

  it('should_prefill_moderate_input_with_barn_default_when_horse_override_is_null', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('5')
  })

  it('should_prefill_high_input_with_barn_default_when_horse_override_is_null', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('11')
  })

  it('should_prefill_moderate_input_with_horse_override_when_set', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('2')
  })

  it('should_prefill_high_input_with_horse_override_when_set', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('6')
  })

  it('should_disable_moderate_input_when_toggle_is_checked', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_disable_high_input_when_toggle_is_checked', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_enable_moderate_input_when_toggle_is_unchecked', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_enable_high_input_when_toggle_is_unchecked', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_enable_number_inputs_after_unchecking_toggle', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_disable_number_inputs_after_checking_toggle', () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_not_show_error_initially', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi
      .fn()
      .mockResolvedValue({ error: 'Moderate threshold must be less than high threshold' })
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(
      await screen.findByText('Moderate threshold must be less than high threshold')
    ).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_render_only_one_save_button', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getAllByRole('button', { name: /save/i }).length).toBe(1)
  })

  it('should_show_saved_indicator_after_successful_save', async () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(await screen.findByText(/saved/i)).toBeDefined()
  })

  it('should_not_show_saved_indicator_when_save_fails', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'invalid status' })
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={failingAction} />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.queryByText(/saved/i)).toBeNull()
  })

  it('should_keep_use_barn_defaults_unchecked_when_react_auto_resets_form_after_action', () => {
    // React 19 calls the native form.reset() after a form action succeeds. Without
    // an onReset guard, that reverts the controlled checkbox to its mount-time value.
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    const checkbox = screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    act(() => {
      checkbox.closest('form')!.reset()
    })

    expect(checkbox.checked).toBe(false)
  })

  it('should_keep_use_barn_defaults_unchecked_after_a_real_successful_submit', async () => {
    // The onReset guard above only intercepts an explicit .reset() call — it does not
    // intercept React 19's own post-action auto-reset, which desyncs the checkbox's DOM
    // `checked` property from state without going through the 'reset' event (#762 review).
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    const checkbox = screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    await act(async () => {
      fireEvent.submit(checkbox.closest('form')!)
    })

    expect(checkbox.checked).toBe(false)
  })

  it('should_display_submitted_custom_thresholds_after_save_instead_of_stale_horse_prop_values', async () => {
    // `horse` here never updates across the save (simulating revalidatePath's
    // prop refresh not having landed yet) — the displayed values must come
    // from what was submitted, not from the stale prop.
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))
    fireEvent.change(screen.getByLabelText(/moderate threshold/i), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText(/high threshold/i), { target: { value: '8' } })

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })

    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('3')
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('8')
  })

  it('should_render_feed_notes_textarea', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /feed notes/i })).toBeDefined()
  })

  it('should_render_medication_notes_textarea', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /medication notes/i })).toBeDefined()
  })

  it('should_prefill_feed_notes_textarea_with_horse_value', () => {
    render(<HorseManagerForm horse={horseWithNotes} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('2 flakes hay AM/PM')
  })

  it('should_prefill_medication_notes_textarea_with_horse_value', () => {
    render(<HorseManagerForm horse={horseWithNotes} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /medication notes/i }) as HTMLTextAreaElement).value).toBe('Bute 1g daily')
  })

  it('should_render_feed_notes_textarea_empty_when_horse_value_is_null', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('')
  })

  it('should_update_feed_notes_textarea_on_change', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.change(screen.getByRole('textbox', { name: /feed notes/i }), { target: { value: '1 flake AM only' } })
    expect((screen.getByRole('textbox', { name: /feed notes/i }) as HTMLTextAreaElement).value).toBe('1 flake AM only')
  })

  it('should_update_medication_notes_textarea_on_change', () => {
    render(<HorseManagerForm horse={activeHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.change(screen.getByRole('textbox', { name: /medication notes/i }), { target: { value: 'Banamine PRN' } })
    expect((screen.getByRole('textbox', { name: /medication notes/i }) as HTMLTextAreaElement).value).toBe('Banamine PRN')
  })

  it('should_display_barn_defaults_after_save_when_checked_instead_of_stale_horse_prop_values', async () => {
    render(<HorseManagerForm horse={customThresholdsHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))

    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })

    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('5')
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('11')
  })
})
