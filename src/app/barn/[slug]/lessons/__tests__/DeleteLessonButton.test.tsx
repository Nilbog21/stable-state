import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { DeleteLessonButton } from '../DeleteLessonButton'

afterEach(cleanup)

describe('DeleteLessonButton', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_render_delete_button', () => {
    render(<DeleteLessonButton action={vi.fn()} />)
    expect(screen.getByRole('button', { name: /delete/i })).toBeDefined()
  })

  it('should_prompt_confirmation_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<DeleteLessonButton action={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(window.confirm).toHaveBeenCalled()
  })

  it('should_not_call_action_when_user_cancels', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = vi.fn()
    render(<DeleteLessonButton action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(action).not.toHaveBeenCalled()
  })

  it('should_call_action_when_user_confirms', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = vi.fn()
    render(<DeleteLessonButton action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(action).toHaveBeenCalled()
  })
})
