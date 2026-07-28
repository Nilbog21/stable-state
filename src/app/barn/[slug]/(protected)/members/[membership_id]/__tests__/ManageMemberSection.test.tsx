import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { ManageMemberSection } from '../ManageMemberSection'

afterEach(cleanup)

type RevokeAction = () => Promise<{ error: string | null }>

function okRevoke() {
  return vi.fn().mockResolvedValue({ error: null }) as unknown as RevokeAction
}

function failingRevoke(message = 'permission denied') {
  return vi.fn().mockResolvedValue({ error: message }) as unknown as RevokeAction
}

const defaultProps = {
  barnSlug: 'green-acres',
  inviteToken: 'tok-abc',
  revokeAction: okRevoke(),
}

function deferredRevoke() {
  let resolve!: () => void
  const promise = new Promise<{ error: string | null }>((r) => {
    resolve = () => r({ error: null })
  })
  const revokeAction = vi.fn(() => promise) as unknown as RevokeAction
  return { revokeAction, resolve }
}

function deferredWriteText() {
  let settle!: { resolve: () => void; reject: (reason: Error) => void }
  const promise = new Promise<void>((resolve, reject) => {
    settle = { resolve, reject }
  })
  Object.defineProperty(navigator, 'clipboard', {
    value: { writeText: vi.fn(() => promise) },
    writable: true,
    configurable: true,
  })
  return settle
}

function isDisabled(name: RegExp) {
  return (screen.getByRole('button', { name }) as HTMLButtonElement).disabled
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

  it('should_call_clipboard_with_invite_url_on_copy_click', async () => {
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/barn/green-acres/register?token=tok-abc')
    )
  })

  it('should_show_copied_label_after_copy_click', async () => {
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: /^copied!$/i })).toBeDefined()
  })

  it('should_revert_to_copy_invite_label_after_timeout', async () => {
    vi.useFakeTimers()
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: /^copy invite$/i })).toBeDefined()
    vi.useRealTimers()
  })

  it('should_not_show_copied_when_clipboard_write_fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: /^copied!$/i })).toBeNull()
  })

  it('should_show_error_message_when_clipboard_write_fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/could not copy the invite link/i)).toBeDefined()
  })

  it('should_clear_error_message_after_a_later_successful_copy', async () => {
    const writeText = vi
      .fn()
      .mockRejectedValueOnce(new Error('denied'))
      .mockResolvedValueOnce(undefined)
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      writable: true,
      configurable: true,
    })
    render(<ManageMemberSection {...defaultProps} />)
    const button = screen.getByRole('button', { name: /copy invite/i })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    expect(screen.queryByText(/could not copy the invite link/i)).toBeNull()
  })

  it('should_clear_error_message_when_revoke_is_submitted', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(screen.queryByText(/could not copy the invite link/i)).toBeNull()
  })

  it('should_clear_copied_label_when_revoke_is_submitted', async () => {
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: /^copied!$/i })).toBeNull()
  })

  it('should_not_show_error_when_copy_fails_after_revoke_submitted', async () => {
    const settle = deferredWriteText()
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    await act(async () => {
      settle.reject(new Error('denied'))
      await Promise.resolve()
    })
    expect(screen.queryByText(/could not copy the invite link/i)).toBeNull()
  })

  it('should_not_show_copied_when_copy_settles_after_revoke_submitted', async () => {
    const settle = deferredWriteText()
    render(<ManageMemberSection {...defaultProps} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    await act(async () => {
      settle.resolve()
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: /^copied!$/i })).toBeNull()
  })

  it('should_reset_timer_on_rapid_second_click', async () => {
    vi.useFakeTimers()
    render(<ManageMemberSection {...defaultProps} />)
    const button = screen.getByRole('button', { name: /copy invite/i })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(screen.getByRole('button', { name: /^copied!$/i })).toBeDefined()
    vi.useRealTimers()
  })

  it('should_call_revoke_action_on_revoke_submit', async () => {
    const revokeAction = okRevoke()
    render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(revokeAction).toHaveBeenCalledOnce()
  })

  it('should_disable_copy_invite_button_while_revoke_is_pending', async () => {
    const { revokeAction, resolve } = deferredRevoke()
    render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(isDisabled(/copy invite/i)).toBe(true)
    // Settle the action so it doesn't linger as a dangling pending transition for later tests
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
  })

  it('should_show_loading_state_on_revoke_button_while_pending', async () => {
    const { revokeAction, resolve } = deferredRevoke()
    render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(isDisabled(/revoke/i)).toBe(true)
    // Settle the action so it doesn't linger as a dangling pending transition for later tests
    await act(async () => {
      resolve()
      await Promise.resolve()
    })
  })

  it('should_keep_copy_invite_disabled_after_settle_before_token_prop_changes', async () => {
    const revokeAction = okRevoke()
    const { rerender } = render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    // Action settled, but the token prop hasn't caught up yet
    rerender(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    expect(isDisabled(/copy invite/i)).toBe(true)
  })

  it('should_keep_revoke_disabled_after_settle_before_token_prop_changes', async () => {
    // Regression test: a second Revoke click in this same window used to be allowed,
    // which re-pinned tokenBeforeRevoke to the still-stale token and let Copy Invite
    // re-enable on a token a second, still-in-flight revoke was about to supersede.
    const revokeAction = okRevoke()
    const { rerender } = render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    // Action settled, but the token prop hasn't caught up yet
    rerender(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    expect(isDisabled(/revoke/i)).toBe(true)
  })

  it('should_enable_copy_invite_once_token_prop_changes', async () => {
    const revokeAction = okRevoke()
    const { rerender } = render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    rerender(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} inviteToken="tok-new" />)
    expect(isDisabled(/copy invite/i)).toBe(false)
  })

  it('should_enable_revoke_once_token_prop_changes', async () => {
    const revokeAction = okRevoke()
    const { rerender } = render(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    rerender(<ManageMemberSection {...defaultProps} revokeAction={revokeAction} inviteToken="tok-new" />)
    expect(isDisabled(/revoke/i)).toBe(false)
  })

  it('should_show_error_message_when_revoke_fails', async () => {
    render(<ManageMemberSection {...defaultProps} revokeAction={failingRevoke()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/permission denied/i)).toBeDefined()
  })

  it('should_enable_copy_invite_after_failed_revoke', async () => {
    // The token was never rotated, so the awaiting-fresh-token gate has nothing to wait
    // for — without the reset both buttons stay disabled until a reload.
    render(<ManageMemberSection {...defaultProps} revokeAction={failingRevoke()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(isDisabled(/copy invite/i)).toBe(false)
  })

  it('should_enable_revoke_after_failed_revoke', async () => {
    render(<ManageMemberSection {...defaultProps} revokeAction={failingRevoke()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    expect(isDisabled(/revoke/i)).toBe(false)
  })

  it('should_show_copied_when_copy_settles_after_failed_revoke', async () => {
    const settle = deferredWriteText()
    render(<ManageMemberSection {...defaultProps} revokeAction={failingRevoke()} />)
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy invite/i }))
      await Promise.resolve()
    })
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /revoke/i }))
      await Promise.resolve()
    })
    await act(async () => {
      settle.resolve()
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: /^copied!$/i })).toBeDefined()
  })
})
