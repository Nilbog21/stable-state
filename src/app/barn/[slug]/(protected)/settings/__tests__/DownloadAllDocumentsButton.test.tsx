import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DownloadAllDocumentsButton } from '../DownloadAllDocumentsButton'

afterEach(() => vi.restoreAllMocks())

describe('DownloadAllDocumentsButton', () => {
  it('should_render_download_button', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadAllDocumentsButton action={action} disabled={false} />)

    expect(screen.getByRole('button', { name: /download all documents/i })).toBeDefined()
  })

  it('should_disable_button_when_disabled_is_true', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadAllDocumentsButton action={action} disabled={true} />)

    expect(screen.getByRole('button', { name: /download all documents/i })).toBeDisabled()
  })

  it('should_not_show_error_initially', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadAllDocumentsButton action={action} disabled={false} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'No documents to download yet', url: null })
    render(<DownloadAllDocumentsButton action={failingAction} disabled={false} />)

    fireEvent.submit(screen.getByRole('button', { name: /download all documents/i }).closest('form')!)

    expect(await screen.findByText('No documents to download yet')).toBeDefined()
  })

  it('should_navigate_to_the_signed_url_when_action_succeeds', async () => {
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, href: '' },
    })

    const succeedingAction = vi.fn().mockResolvedValue({ error: null, url: 'https://example.com/zip' })
    render(<DownloadAllDocumentsButton action={succeedingAction} disabled={false} />)

    fireEvent.submit(screen.getByRole('button', { name: /download all documents/i }).closest('form')!)

    await waitFor(() => expect(window.location.href).toBe('https://example.com/zip'))

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })
})
