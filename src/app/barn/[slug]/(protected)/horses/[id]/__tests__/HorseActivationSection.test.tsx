import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseActivationSection } from '../HorseActivationSection'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mockAction = vi.fn().mockResolvedValue(undefined)

describe('HorseActivationSection', () => {
  it('should_render_set_inactive_button_when_is_active_true', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    expect(screen.getByRole('button', { name: /set inactive/i })).toBeDefined()
  })

  it('should_render_set_active_button_when_is_active_false', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    expect(screen.getByRole('button', { name: /set active/i })).toBeDefined()
  })

  it('should_show_confirm_and_cancel_after_clicking_set_inactive', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()
  })

  it('should_hide_confirmation_after_clicking_cancel', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByRole('button', { name: /set inactive/i })).toBeDefined()
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
  })

  it('should_not_show_confirmation_after_clicking_set_active', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set active/i }))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
  })

  it('should_call_action_when_confirm_is_clicked', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(mockAction).toHaveBeenCalled()
  })

  it('should_call_action_when_set_active_is_clicked', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set active/i }))
    expect(mockAction).toHaveBeenCalled()
  })
})
