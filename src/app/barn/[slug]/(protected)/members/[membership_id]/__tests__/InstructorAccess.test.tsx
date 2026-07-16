import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InstructorAccess } from '../InstructorAccess'

describe('InstructorAccess', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should_render_grant_button_when_can_instruct_is_false', () => {
    render(
      <InstructorAccess name="Bob Trainer" canInstruct={false} action={vi.fn() as unknown as () => Promise<void>} />
    )
    expect(screen.getByRole('button', { name: /grant instructor access/i })).toBeDefined()
  })

  it('should_render_revoke_button_when_can_instruct_is_true', () => {
    render(
      <InstructorAccess name="Bob Trainer" canInstruct={true} action={vi.fn() as unknown as () => Promise<void>} />
    )
    expect(screen.getByRole('button', { name: /revoke instructor access/i })).toBeDefined()
  })

  it('should_submit_grant_without_confirm', () => {
    vi.spyOn(window, 'confirm')
    const action = vi.fn() as unknown as () => Promise<void>
    render(<InstructorAccess name="Bob Trainer" canInstruct={false} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /grant instructor access/i }))
    expect(window.confirm).not.toHaveBeenCalled()
    expect(action).toHaveBeenCalledOnce()
  })

  it('should_call_window_confirm_with_expected_copy_when_revoking', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(
      <InstructorAccess name="Bob Trainer" canInstruct={true} action={vi.fn() as unknown as () => Promise<void>} />
    )
    fireEvent.click(screen.getByRole('button', { name: /revoke instructor access/i }))
    expect(window.confirm).toHaveBeenCalledWith(
      'Revoke instructor access for Bob Trainer? They will no longer be assignable to future lessons.'
    )
  })

  it('should_not_submit_when_revoke_confirm_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = vi.fn() as unknown as () => Promise<void>
    render(<InstructorAccess name="Bob Trainer" canInstruct={true} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /revoke instructor access/i }))
    expect(action).not.toHaveBeenCalled()
  })

  it('should_submit_when_revoke_confirm_accepted', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = vi.fn() as unknown as () => Promise<void>
    render(<InstructorAccess name="Bob Trainer" canInstruct={true} action={action} />)
    fireEvent.click(screen.getByRole('button', { name: /revoke instructor access/i }))
    expect(action).toHaveBeenCalledOnce()
  })
})
