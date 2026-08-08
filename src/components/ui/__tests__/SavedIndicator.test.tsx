import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { render, screen, cleanup, act, renderHook } from '@testing-library/react'
import { SavedIndicator, useSaveFlash, useSaveFlashOn } from '../SavedIndicator'

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

describe('useSaveFlashOn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_not_show_before_any_result_arrives', () => {
    const { result } = renderHook(() => useSaveFlashOn(null))
    expect(result.current).toBe(false)
  })

  it('should_show_when_a_result_arrives', () => {
    const { result, rerender } = renderHook(({ r }) => useSaveFlashOn(r), {
      initialProps: { r: null as object | null },
    })
    rerender({ r: { error: null } })
    expect(result.current).toBe(true)
  })

  it('should_stop_showing_after_the_timeout_elapses', () => {
    const { result, rerender } = renderHook(({ r }) => useSaveFlashOn(r), {
      initialProps: { r: null as object | null },
    })
    rerender({ r: { error: null } })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    expect(result.current).toBe(false)
  })

  it('should_show_again_for_a_second_result', () => {
    // Identity is the trigger, so a later save with an identical value still flashes — which is
    // what the real hook sees, since every server response deserializes to a fresh object.
    const { result, rerender } = renderHook(({ r }) => useSaveFlashOn(r), {
      initialProps: { r: null as object | null },
    })
    rerender({ r: { error: null } })
    act(() => {
      vi.advanceTimersByTime(2000)
    })
    rerender({ r: { error: null } })
    expect(result.current).toBe(true)
  })
})
