import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { RemoveMemberButton } from '../RemoveMemberButton'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

function makeAction() {
  return vi.fn().mockResolvedValue({ error: null })
}

describe('RemoveMemberButton', () => {
  it('should_render_remove_button', () => {
    render(<RemoveMemberButton action={makeAction()} name="Jane Rider" />)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_call_window_confirm_when_clicked', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<RemoveMemberButton action={makeAction()} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(window.confirm).toHaveBeenCalledWith('This cannot be undone. Remove Jane Rider from the barn and delete any documents associated with them?')
  })

  it('should_not_submit_when_confirm_cancelled', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    const action = makeAction()
    render(<RemoveMemberButton action={action} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(action).not.toHaveBeenCalled()
  })

  // #1549: the action is a `useActionState` reducer now, so it arrives with the previous state
  // and the form's FormData rather than bare.
  it('should_submit_with_the_useActionState_arguments_when_confirm_accepted', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = makeAction()
    render(<RemoveMemberButton action={action} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    await Promise.resolve()
    expect(action).toHaveBeenCalledWith({ error: null }, expect.any(FormData))
  })

  /**
   * The refusal path #1549 added: a member who still owns a horse can't be removed until ownership
   * moves, and the manager has to be able to read why without losing the page to `error.tsx`.
   */
  it('should_show_the_refusal_message_when_the_action_returns_one', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    const action = vi.fn().mockResolvedValue({ error: 'This member still owns Apple.' })
    render(<RemoveMemberButton action={action} name="Jane Rider" />)
    fireEvent.click(screen.getByRole('button', { name: /remove/i }))
    expect(await screen.findByText('This member still owns Apple.')).toBeDefined()
  })
})
