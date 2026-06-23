import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteRiderButton } from '../DeleteRiderButton'

describe('DeleteRiderButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_delete_button', () => {
    render(<DeleteRiderButton action={vi.fn() as unknown as () => Promise<void>} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeleteRiderButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })

  it('should_prevent_default_when_confirm_is_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = vi.fn()
    render(<DeleteRiderButton action={action as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(action).not.toHaveBeenCalled()
  })
})
