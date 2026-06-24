import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { HorseActivationSection } from '../HorseActivationSection'

const mockAction = vi.fn().mockResolvedValue(undefined)

beforeEach(() => {
  mockAction.mockReset()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('HorseActivationSection', () => {
  it('should_render_set_inactive_button_when_is_active_true', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    expect(screen.getByRole('button', { name: /set inactive/i })).toBeDefined()
  })

  it('should_render_set_active_button_when_is_active_false', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    expect(screen.getByRole('button', { name: /set active/i })).toBeDefined()
  })

  it('should_show_confirm_button_after_clicking_set_inactive', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    expect(screen.getByRole('button', { name: /confirm/i })).toBeDefined()
  })

  it('should_show_cancel_button_after_clicking_set_inactive', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDefined()
  })

  it('should_restore_set_inactive_button_after_clicking_cancel', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.getByRole('button', { name: /set inactive/i })).toBeDefined()
  })

  it('should_hide_confirm_button_after_clicking_cancel', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
  })

  it('should_not_show_confirm_button_after_clicking_set_active', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set active/i }))
    expect(screen.queryByRole('button', { name: /confirm/i })).toBeNull()
  })

  it('should_not_show_cancel_button_after_clicking_set_active', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set active/i }))
    expect(screen.queryByRole('button', { name: /cancel/i })).toBeNull()
  })

  it('should_call_action_with_false_when_confirm_is_clicked', () => {
    render(<HorseActivationSection isActive={true} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set inactive/i }))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(mockAction).toHaveBeenCalledWith(false)
  })

  it('should_call_action_with_true_when_set_active_is_clicked', () => {
    render(<HorseActivationSection isActive={false} action={mockAction} />)
    fireEvent.click(screen.getByRole('button', { name: /set active/i }))
    expect(mockAction).toHaveBeenCalledWith(true)
  })
})
