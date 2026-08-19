import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DownloadButton } from '../DownloadButton'

afterEach(() => vi.restoreAllMocks())

describe('DownloadButton', () => {
  it('should_render_download_button', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadButton action={action} disabled={false} label="Download All Documents" />)

    expect(screen.getByRole('button', { name: /download all documents/i })).toBeDefined()
  })

  it('should_render_a_custom_label', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadButton action={action} disabled={false} label="Download Data" />)

    expect(screen.getByRole('button', { name: /download data/i })).toBeDefined()
  })

  it('should_disable_button_when_disabled_is_true', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadButton action={action} disabled={true} label="Download All Documents" />)

    expect(screen.getByRole('button', { name: /download all documents/i }).hasAttribute('disabled')).toBe(true)
  })

  it('should_not_show_error_initially', () => {
    const action = vi.fn().mockResolvedValue({ error: null, url: null })
    render(<DownloadButton action={action} disabled={false} label="Download All Documents" />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'No documents to download yet', url: null })
    render(<DownloadButton action={failingAction} disabled={false} label="Download All Documents" />)

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
    render(<DownloadButton action={succeedingAction} disabled={false} label="Download All Documents" />)

    fireEvent.submit(screen.getByRole('button', { name: /download all documents/i }).closest('form')!)

    await waitFor(() => expect(window.location.href).toBe('https://example.com/zip'))

    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })
})
