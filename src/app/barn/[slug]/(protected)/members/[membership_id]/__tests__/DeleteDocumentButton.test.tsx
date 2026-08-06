import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

import { DeleteDocumentButton } from '../DeleteDocumentButton'

describe('DeleteDocumentButton', () => {
  it('should_call_action_with_useActionState_arguments_on_submit', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<DeleteDocumentButton action={action} />)
    fireEvent.submit(screen.getByRole('button', { name: /delete/i }).closest('form')!)
    await Promise.resolve()
    expect(action).toHaveBeenCalledWith({ error: null }, expect.any(FormData))
  })

  it('should_show_error_message_when_action_returns_error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Forbidden' })
    render(<DeleteDocumentButton action={action} />)
    fireEvent.submit(screen.getByRole('button', { name: /delete/i }).closest('form')!)
    expect(await screen.findByText('Forbidden')).toBeDefined()
  })
})
