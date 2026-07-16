import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { StopSeriesButton } from '../StopSeriesButton'

describe('StopSeriesButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_stop_recurring_lessons_button', () => {
    render(<StopSeriesButton action={vi.fn() as unknown as () => Promise<void>} />)
    expect(screen.getByRole('button', { name: /stop recurring lessons/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<StopSeriesButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /stop recurring lessons/i }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })
})
