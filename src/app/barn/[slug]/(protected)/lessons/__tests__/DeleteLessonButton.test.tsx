import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DeleteLessonButton } from '../DeleteLessonButton'

describe('DeleteLessonButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_delete_button', () => {
    render(<DeleteLessonButton action={vi.fn() as unknown as () => Promise<void>} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeleteLessonButton action={vi.fn() as unknown as () => Promise<void>} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(window.confirm).toHaveBeenCalledOnce()
  })
})
