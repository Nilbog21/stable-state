import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeactivateButton } from '../DeactivateButton'

describe('DeactivateButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_deactivate_button', () => {
    render(<DeactivateButton action={vi.fn() as unknown as () => Promise<void>} />)
    expect(screen.getByRole('button', { name: /deactivate/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeactivateButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })

  it('should_mention_reactivation_is_possible_in_confirm_copy', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeactivateButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /deactivate/i }))
    expect(window.confirm).toHaveBeenCalledWith(
      expect.stringMatching(/reactivat/i)
    )
  })
})
