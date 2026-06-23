import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { createMockHorse } from '@/test/fixtures'
import { HorseAvailabilityForm } from '../HorseAvailabilityForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const availableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: true, unavailability_reason: null })
const unavailableHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt', is_available: false, unavailability_reason: 'on stall rest' })
const mockAction = vi.fn()

describe('HorseAvailabilityForm', () => {
  it('should_render_availability_checkbox', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    expect(screen.getByRole('checkbox')).toBeDefined()
  })

  it('should_check_checkbox_when_horse_is_available', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true)
  })

  it('should_uncheck_checkbox_when_horse_is_unavailable', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false)
  })

  it('should_render_reason_textarea', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    expect(screen.getByRole('textbox')).toBeDefined()
  })

  it('should_disable_reason_textarea_when_horse_is_available', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('should_enable_reason_textarea_when_horse_is_unavailable', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('should_show_existing_reason_in_textarea_when_horse_is_unavailable', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toBe('on stall rest')
  })

  it('should_disable_reason_textarea_after_checking_available_checkbox', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(true)
  })

  it('should_enable_reason_textarea_after_unchecking_available_checkbox', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).disabled).toBe(false)
  })

  it('should_render_hidden_input_with_true_when_available', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    const hidden = document.querySelector('input[name="is_available"]') as HTMLInputElement
    expect(hidden?.value).toBe('true')
  })

  it('should_render_hidden_input_with_false_when_unavailable', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    const hidden = document.querySelector('input[name="is_available"]') as HTMLInputElement
    expect(hidden?.value).toBe('false')
  })

  it('should_update_hidden_input_to_false_after_unchecking_checkbox', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox'))
    const hidden = document.querySelector('input[name="is_available"]') as HTMLInputElement
    expect(hidden?.value).toBe('false')
  })

  it('should_update_hidden_input_to_true_after_checking_checkbox', () => {
    render(<HorseAvailabilityForm horse={unavailableHorse} action={mockAction} />)
    fireEvent.click(screen.getByRole('checkbox'))
    const hidden = document.querySelector('input[name="is_available"]') as HTMLInputElement
    expect(hidden?.value).toBe('true')
  })

  it('should_render_save_button', () => {
    render(<HorseAvailabilityForm horse={availableHorse} action={mockAction} />)
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })
})
