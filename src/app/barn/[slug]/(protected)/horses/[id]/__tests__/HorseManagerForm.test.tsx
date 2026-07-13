import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { createMockHorse } from '@/test/fixtures'
import { HorseManagerForm } from '../HorseManagerForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const activeHorse = createMockHorse({ is_active: true, is_available: true, unavailability_reason: null })
const unavailableHorse = createMockHorse({ is_active: true, is_available: false, unavailability_reason: 'on stall rest' })
const inactiveHorse = createMockHorse({ is_active: false, is_available: true, unavailability_reason: null })

const mockAction = vi.fn().mockResolvedValue({ error: null })

describe('HorseManagerForm', () => {
  it('should_render_name_input_prefilled_with_horse_name', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /^name$/i }) as HTMLInputElement).value).toBe('Thunderbolt')
  })

  it('should_render_active_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^active$/i })).toBeDefined()
  })

  it('should_render_unavailable_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i })).toBeDefined()
  })

  it('should_render_inactive_pill_button', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^inactive$/i })).toBeDefined()
  })

  it('should_select_active_pill_when_horse_is_active_and_available', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^active$/i, pressed: true })).toBeDefined()
  })

  it('should_not_select_unavailable_pill_when_horse_is_active_and_available', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i, pressed: false })).toBeDefined()
  })

  it('should_select_unavailable_pill_when_horse_is_active_and_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^unavailable$/i, pressed: true })).toBeDefined()
  })

  it('should_select_inactive_pill_when_horse_is_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /^inactive$/i, pressed: true })).toBeDefined()
  })

  it('should_not_render_reason_textarea_when_active_is_selected', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_render_reason_textarea_when_unavailable_is_selected', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    expect(screen.getByRole('textbox', { name: /reason/i })).toBeDefined()
  })

  it('should_not_render_reason_textarea_when_inactive_is_selected', () => {
    render(<HorseManagerForm horse={inactiveHorse} action={mockAction} />)
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_prefill_reason_textarea_with_unavailability_reason_when_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    expect((screen.getByRole('textbox', { name: /reason/i }) as HTMLTextAreaElement).value).toBe('on stall rest')
  })

  it('should_not_render_inactive_warning_when_active_is_selected', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_not_render_inactive_warning_when_unavailable_is_selected', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_not_render_inactive_warning_when_horse_is_already_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} action={mockAction} />)
    expect(screen.queryByText(/remove it from the roster/i)).toBeNull()
  })

  it('should_retain_typed_reason_after_switching_away_from_unavailable_and_back', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /reason/i }), { target: { value: 'injured leg' } })
    fireEvent.click(screen.getByRole('button', { name: /^active$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect((screen.getByRole('textbox', { name: /reason/i }) as HTMLTextAreaElement).value).toBe('injured leg')
  })

  it('should_set_hidden_status_input_to_active_when_horse_is_active', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('active')
  })

  it('should_set_hidden_status_input_to_unavailable_when_horse_is_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('unavailable')
  })

  it('should_set_hidden_status_input_to_inactive_when_horse_is_inactive', () => {
    render(<HorseManagerForm horse={inactiveHorse} action={mockAction} />)
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('inactive')
  })

  it('should_update_hidden_status_input_to_unavailable_after_clicking_unavailable_pill', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('unavailable')
  })

  it('should_update_hidden_status_input_to_inactive_after_clicking_inactive_pill', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    expect((document.querySelector('input[name="status"]') as HTMLInputElement)?.value).toBe('inactive')
  })

  it('should_show_reason_textarea_after_clicking_unavailable_pill', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^unavailable$/i }))
    expect(screen.getByRole('textbox', { name: /reason/i })).toBeDefined()
  })

  it('should_hide_reason_textarea_after_clicking_active_pill_from_unavailable', () => {
    render(<HorseManagerForm horse={unavailableHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^active$/i }))
    expect(screen.queryByRole('textbox', { name: /reason/i })).toBeNull()
  })

  it('should_show_inactive_warning_after_clicking_inactive_pill', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    expect(screen.getByText(/remove it from the roster/i)).toBeDefined()
  })

  it('should_not_wrap_inactive_warning_in_a_nested_flex_container', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /^inactive$/i }))
    const warning = screen.getByText(/remove it from the roster/i)
    expect(warning.parentElement).toBe(screen.getByRole('group').parentElement)
    expect(warning.classList.contains('min-w-0')).toBe(true)
  })

  it('should_render_save_button', () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_show_saved_indicator_after_successful_save', async () => {
    render(<HorseManagerForm horse={activeHorse} action={mockAction} />)
    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    expect(await screen.findByText(/saved/i)).toBeDefined()
  })

  it('should_not_show_saved_indicator_when_save_fails', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'invalid status' })
    render(<HorseManagerForm horse={activeHorse} action={failingAction} />)
    await act(async () => {
      fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)
    })
    expect(screen.queryByText(/saved/i)).toBeNull()
  })
})
