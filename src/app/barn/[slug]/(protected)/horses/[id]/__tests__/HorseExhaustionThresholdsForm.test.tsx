import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockBarn, createMockHorse } from '@/test/fixtures'
import { HorseExhaustionThresholdsForm } from '../HorseExhaustionThresholdsForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mockAction = vi.fn().mockResolvedValue({ error: null })
const mockBarn = createMockBarn({ exhaustion_threshold_moderate: 5, exhaustion_threshold_high: 11 })
const defaultsHorse = createMockHorse({ exhaustion_threshold_moderate: null, exhaustion_threshold_high: null })
const customHorse = createMockHorse({ exhaustion_threshold_moderate: 2, exhaustion_threshold_high: 6 })

describe('HorseExhaustionThresholdsForm', () => {
  it('should_check_use_barn_defaults_toggle_when_horse_thresholds_are_null', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement).checked).toBe(true)
  })

  it('should_uncheck_use_barn_defaults_toggle_when_horse_has_custom_thresholds', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement).checked).toBe(false)
  })

  it('should_prefill_moderate_input_with_barn_default_when_horse_override_is_null', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('5')
  })

  it('should_prefill_high_input_with_barn_default_when_horse_override_is_null', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('11')
  })

  it('should_prefill_moderate_input_with_horse_override_when_set', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('2')
  })

  it('should_prefill_high_input_with_horse_override_when_set', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('6')
  })

  it('should_disable_moderate_input_when_toggle_is_checked', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_disable_high_input_when_toggle_is_checked', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_enable_moderate_input_when_toggle_is_unchecked', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_enable_high_input_when_toggle_is_unchecked', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_enable_number_inputs_after_unchecking_toggle', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('should_disable_number_inputs_after_checking_toggle', () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /use barn defaults/i }))
    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_not_show_error_initially', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi
      .fn()
      .mockResolvedValue({ error: 'Moderate threshold must be less than high threshold' })
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(
      await screen.findByText('Moderate threshold must be less than high threshold')
    ).toBeDefined()
  })

  it('should_show_saved_indicator_after_successful_save', async () => {
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={mockAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(await screen.findByText(/saved/i)).toBeDefined()
  })

  it('should_not_show_saved_indicator_when_save_fails', async () => {
    const failingAction = vi
      .fn()
      .mockResolvedValue({ error: 'Moderate threshold must be less than high threshold' })
    render(<HorseExhaustionThresholdsForm horse={customHorse} barn={mockBarn} action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    await screen.findByText('Moderate threshold must be less than high threshold')
    expect(screen.queryByText(/saved/i)).toBeNull()
  })

  it('should_render_save_button', () => {
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_keep_use_barn_defaults_unchecked_when_react_auto_resets_form_after_action', () => {
    // React 19 calls the native form.reset() after a form action succeeds. Without
    // an onReset guard, that reverts the controlled checkbox to its mount-time value.
    render(<HorseExhaustionThresholdsForm horse={defaultsHorse} barn={mockBarn} action={mockAction} />)
    const checkbox = screen.getByRole('checkbox', { name: /use barn defaults/i }) as HTMLInputElement

    fireEvent.click(checkbox)
    expect(checkbox.checked).toBe(false)

    act(() => {
      checkbox.closest('form')!.reset()
    })

    expect(checkbox.checked).toBe(false)
  })
})
