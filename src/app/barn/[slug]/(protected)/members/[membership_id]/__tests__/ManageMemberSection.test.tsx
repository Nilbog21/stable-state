import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ManageMemberSection } from '../ManageMemberSection'

afterEach(cleanup)

const defaultProps = {
  barnSlug: 'green-acres',
  inviteToken: 'tok-abc',
  revokeAction: vi.fn() as unknown as () => Promise<void>,
}

describe('ManageMemberSection', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('should_render_unlinked_notice_text', () => {
    render(<ManageMemberSection {...defaultProps} />)
    expect(
      screen.getByText(/this is an unlinked member/i)
    ).toBeDefined()
  })

  it('should_render_copy_invite_button', () => {
    render(<ManageMemberSection {...defaultProps} />)
    expect(screen.getByRole('button', { name: /copy invite/i })).toBeDefined()
  })

  it('should_render_revoke_button', () => {
    render(<ManageMemberSection {...defaultProps} />)
    expect(screen.getByRole('button', { name: /revoke/i })).toBeDefined()
  })

  it('should_call_clipboard_with_invite_url_on_copy_click', () => {
    render(<ManageMemberSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/barn/green-acres/login?token=tok-abc')
    )
  })

  it('should_show_copied_label_after_copy_click', () => {
    render(<ManageMemberSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
    expect(screen.getByRole('button', { name: /^copied!$/i })).toBeDefined()
  })

  it('should_revert_to_copy_invite_label_after_timeout', () => {
    vi.useFakeTimers()
    render(<ManageMemberSection {...defaultProps} />)
    fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
    vi.advanceTimersByTime(2000)
    expect(screen.getByRole('button', { name: /^copy invite$/i })).toBeDefined()
    vi.useRealTimers()
  })

  it('should_call_revoke_action_on_revoke_submit', () => {
    const revokeAction = vi.fn() as unknown as () => Promise<void>
    render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
    expect(revokeAction).toHaveBeenCalledOnce()
  })
})
