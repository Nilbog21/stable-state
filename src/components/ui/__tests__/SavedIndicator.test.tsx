import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, renderHook } from '@testing-library/react'
import { SavedIndicator, useSaveFlash } from '../SavedIndicator'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('SavedIndicator', () => {
  it('should_render_nothing_when_show_is_false', () => {
    render(<SavedIndicator show={false} />)
    expect(screen.queryByText(/saved/i)).toBeNull()
  })

  it('should_render_saved_text_when_show_is_true', () => {
    render(<SavedIndicator show={true} />)
    expect(screen.getByText(/saved/i)).toBeDefined()
  })
})

describe('useSaveFlash', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_set_show_to_true_after_calling_flash', () => {
    const { result } = renderHook(() => useSaveFlash())
    act(() => {
      result.current.flash()
    })
    expect(result.current.show).toBe(true)
  })

  it('should_set_show_to_false_after_the_timeout_elapses', () => {
    const { result } = renderHook(() => useSaveFlash())
    act(() => {
      result.current.flash()
    })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current.show).toBe(false)
  })

  it('should_reset_the_timer_when_flash_is_called_again_before_it_elapses', () => {
    const { result } = renderHook(() => useSaveFlash())
    act(() => {
      result.current.flash()
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    act(() => {
      result.current.flash()
    })
    act(() => {
      vi.advanceTimersByTime(1500)
    })
    expect(result.current.show).toBe(true)
  })

  it('should_clear_the_pending_timeout_on_unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const { result, unmount } = renderHook(() => useSaveFlash())
    act(() => {
      result.current.flash()
    })
    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()
  })
})
