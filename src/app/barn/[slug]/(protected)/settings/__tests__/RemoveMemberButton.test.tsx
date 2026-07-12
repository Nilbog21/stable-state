import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RemoveMemberButton } from '../RemoveMemberButton'

describe('RemoveMemberButton', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_remove_button', () => {
    render(<RemoveMemberButton action={vi.fn() as unknown as () => Promise<void>} name="Jane Rider" />)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RemoveMemberButton action={vi.fn() as unknown as () => Promise<void>} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(window.confirm).toHaveBeenCalledWith('This cannot be undone. Remove Jane Rider from the barn?')
  })

  it('should_not_submit_when_confirm_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = vi.fn() as unknown as () => Promise<void>
    render(<RemoveMemberButton action={action} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(action).not.toHaveBeenCalled()
  })

  it('should_submit_when_confirm_accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = vi.fn() as unknown as () => Promise<void>
    render(<RemoveMemberButton action={action} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(action).toHaveBeenCalledOnce()
  })
})
