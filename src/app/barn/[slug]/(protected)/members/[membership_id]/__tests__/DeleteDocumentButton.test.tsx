import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('next/navigation', () => ({
  useRouter: vi.fn(),
}))

import { useRouter } from 'next/navigation'
import { DeleteDocumentButton } from '../DeleteDocumentButton'

beforeEach(() => {
  vi.mocked(useRouter).mockReset()
  vi.mocked(useRouter).mockReturnValue({ refresh: vi.fn() } as any)
})

describe('DeleteDocumentButton', () => {
  it('should_call_action_with_docId_and_storagePath_on_submit', async () => {
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<DeleteDocumentButton docId="doc-1" storagePath="barn-1/trainers/user-1/file.pdf" action={action} />)
    fireEvent.submit(screen.getByRole('button', { name: /delete/i }).closest('form')!)
    await Promise.resolve()
    expect(action).toHaveBeenCalledWith('doc-1', 'barn-1/trainers/user-1/file.pdf')
  })

  it('should_refresh_router_on_success', async () => {
    const refresh = vi.fn()
    vi.mocked(useRouter).mockReturnValue({ refresh } as any)
    const action = vi.fn().mockResolvedValue({ error: null })
    render(<DeleteDocumentButton docId="doc-1" storagePath="path" action={action} />)
    fireEvent.submit(screen.getByRole('button', { name: /delete/i }).closest('form')!)
    await Promise.resolve()
    expect(refresh).toHaveBeenCalled()
  })

  it('should_show_error_message_when_action_returns_error', async () => {
    const action = vi.fn().mockResolvedValue({ error: 'Forbidden' })
    render(<DeleteDocumentButton docId="doc-1" storagePath="path" action={action} />)
    fireEvent.submit(screen.getByRole('button', { name: /delete/i }).closest('form')!)
    expect(await screen.findByText('Forbidden')).toBeDefined()
  })
})
