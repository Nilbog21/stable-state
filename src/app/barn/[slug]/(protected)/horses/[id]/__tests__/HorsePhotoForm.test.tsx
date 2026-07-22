import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useActionState } from 'react'
import { HorsePhotoForm } from '../HorsePhotoForm'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useActionState: vi.fn() }
})

const noop = async () => ({ error: null })

describe('HorsePhotoForm', () => {
  beforeEach(() => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, false] as any)
  })

  it('should_render_label_as_submit_button_text', () => {
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    expect(screen.getByRole('button', { name: 'Add Photo' })).toBeDefined()
  })

  it('should_render_file_input_restricted_to_photo_extensions', () => {
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.accept).toBe('.jpg,.jpeg,.png')
  })

  it('should_render_server_error_inline', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: 'boom' }, noop, false] as any)
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    expect(screen.getByRole('alert').textContent).toBe('boom')
  })

  it('should_disable_submit_button_when_pending', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, true] as any)
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    expect(screen.getByRole('button', { name: /uploading/i }).hasAttribute('disabled')).toBe(true)
  })
})
