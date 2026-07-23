import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react'
import { CalendarFeedSection } from '../CalendarFeedSection'

afterEach(cleanup)

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe('CalendarFeedSection', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    })
  })

  it('should_render_get_link_button_when_no_initial_token', () => {
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    expect(screen.getByRole('button', { name: /get my calendar link/i })).toBeDefined()
  })

  it('should_render_explainer_text', () => {
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    expect(screen.getByText(/refresh cadence is controlled by that app/i)).toBeDefined()
  })

  it('should_not_show_get_link_button_when_initial_token_present', () => {
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    expect(screen.queryByRole('button', { name: /get my calendar link/i })).toBeNull()
  })

  it('should_show_url_containing_token_when_initial_token_present', () => {
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    expect(screen.getByText(/\/calendar\.ics\?token=tok-abc/)).toBeDefined()
  })

  it('should_reveal_url_after_clicking_get_link', async () => {
    const getLinkAction = vi.fn().mockResolvedValue('new-tok')
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={getLinkAction} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get my calendar link/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/\/calendar\.ics\?token=new-tok/)).toBeDefined()
  })

  it('should_show_loading_state_while_getting_link', async () => {
    const { promise, resolve } = deferred<string>()
    const getLinkAction = vi.fn().mockReturnValue(promise)
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={getLinkAction} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get my calendar link/i }))
      await Promise.resolve()
    })
    expect((screen.getByRole('button', { name: /get my calendar link/i }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      resolve('new-tok')
      await Promise.resolve()
    })
  })

  it('should_call_clipboard_with_full_url_on_copy_click', async () => {
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
      await Promise.resolve()
    })
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining('/calendar.ics?token=tok-abc')
    )
  })

  it('should_show_copied_label_after_copy_click', async () => {
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
      await Promise.resolve()
    })
    expect(screen.getByRole('button', { name: /^copied!$/i })).toBeDefined()
  })

  it('should_revert_to_copy_link_label_after_timeout', async () => {
    vi.useFakeTimers()
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
      await Promise.resolve()
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(screen.getByRole('button', { name: /^copy link$/i })).toBeDefined()
    vi.useRealTimers()
  })

  it('should_not_show_copied_when_clipboard_write_fails', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
      writable: true,
      configurable: true,
    })
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /copy link/i }))
      await Promise.resolve()
    })
    expect(screen.queryByRole('button', { name: /^copied!$/i })).toBeNull()
  })

  it('should_replace_url_after_regenerate', async () => {
    const regenerateAction = vi.fn().mockResolvedValue('fresh-tok')
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={regenerateAction} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/\/calendar\.ics\?token=fresh-tok/)).toBeDefined()
    expect(screen.queryByText(/\/calendar\.ics\?token=tok-abc/)).toBeNull()
  })

  it('should_reset_timer_on_rapid_second_copy_click', async () => {
    vi.useFakeTimers()
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={vi.fn()} />
    )
    const button = screen.getByRole('button', { name: /copy link/i })
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

  it('should_show_loading_state_on_regenerate_button_while_pending', async () => {
    const { promise, resolve } = deferred<string>()
    const regenerateAction = vi.fn().mockReturnValue(promise)
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={regenerateAction} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
      await Promise.resolve()
    })
    expect((screen.getByRole('button', { name: /regenerate/i }) as HTMLButtonElement).disabled).toBe(true)
    await act(async () => {
      resolve('fresh-tok')
      await Promise.resolve()
    })
  })

  it('should_show_error_message_when_get_link_action_fails', async () => {
    const getLinkAction = vi.fn().mockRejectedValue(new Error('network error'))
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={getLinkAction} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get my calendar link/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/could not generate your calendar link/i)).toBeDefined()
  })

  it('should_show_error_message_when_regenerate_action_fails', async () => {
    const regenerateAction = vi.fn().mockRejectedValue(new Error('network error'))
    render(
      <CalendarFeedSection initialToken="tok-abc" getLinkAction={vi.fn()} regenerateAction={regenerateAction} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/could not regenerate your calendar link/i)).toBeDefined()
  })

  it('should_clear_previous_error_on_new_get_link_attempt', async () => {
    const getLinkAction = vi.fn().mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce('new-tok')
    render(
      <CalendarFeedSection initialToken={null} getLinkAction={getLinkAction} regenerateAction={vi.fn()} />
    )
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get my calendar link/i }))
      await Promise.resolve()
    })
    expect(screen.getByText(/could not generate your calendar link/i)).toBeDefined()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /get my calendar link/i }))
      await Promise.resolve()
    })
    expect(screen.queryByText(/could not generate your calendar link/i)).toBeNull()
  })
})
