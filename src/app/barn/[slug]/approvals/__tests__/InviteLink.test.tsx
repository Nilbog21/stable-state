import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import InviteLink from '../InviteLink'

afterEach(cleanup)

describe('InviteLink', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
      configurable: true,
    })
    vi.useRealTimers()
  })

  it('should_render_copy_button', () => {
    render(<InviteLink slug="green-acres" />)
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined()
  })

  it('should_display_full_invite_url_after_mount', () => {
    render(<InviteLink slug="green-acres" />)
    const input = screen.getByRole('textbox') as HTMLInputElement
    expect(input.value).toBe('https://example.com/barn/green-acres/register')
  })

  it('should_copy_url_to_clipboard_on_click', async () => {
    render(<InviteLink slug="green-acres" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      'https://example.com/barn/green-acres/register'
    )
  })

  it('should_show_copied_after_click', async () => {
    vi.useFakeTimers()
    render(<InviteLink slug="green-acres" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    expect(screen.getByRole('button', { name: 'Copied!' })).toBeDefined()
  })

  it('should_revert_to_copy_after_timeout', async () => {
    vi.useFakeTimers()
    render(<InviteLink slug="green-acres" />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy' }))
    })
    await act(async () => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDefined()
  })
})
