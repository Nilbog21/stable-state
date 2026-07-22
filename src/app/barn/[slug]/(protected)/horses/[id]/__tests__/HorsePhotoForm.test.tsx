import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useActionState } from 'react'
import { HorsePhotoForm } from '../HorsePhotoForm'

function makeFile(sizeBytes: number): File {
  return new File([new Uint8Array(sizeBytes)], 'photo.jpg', { type: 'image/jpeg' })
}

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

  it('should_show_oversized_file_error_when_file_exceeds_4_5mb', () => {
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile(4500001)] } })
    expect(screen.getByRole('alert').textContent).toBe('File exceeds 4.5 MB limit')
  })

  it('should_clear_the_file_input_when_file_exceeds_4_5mb', () => {
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile(4500001)] } })
    expect(fileInput.value).toBe('')
  })

  it('should_not_show_a_file_error_for_a_file_within_the_size_limit', () => {
    render(<HorsePhotoForm action={noop} label="Add Photo" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    fireEvent.change(fileInput, { target: { files: [makeFile(1000)] } })
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
