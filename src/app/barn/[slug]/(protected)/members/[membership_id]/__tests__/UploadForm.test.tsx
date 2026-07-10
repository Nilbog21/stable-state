import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useActionState } from 'react'
import { UploadForm } from '../UploadForm'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useActionState: vi.fn() }
})

const noop = async () => ({ error: null })

describe('UploadForm', () => {
  beforeEach(() => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, false] as any)
  })

  it('should_render_server_error_inline', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: 'boom' }, noop, false] as any)
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('alert').textContent).toBe('boom')
  })

  it('should_render_upload_button_for_trainer', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_render_upload_button_for_rider', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_disable_upload_button_when_pending', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, true] as any)
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('button', { name: /uploading/i }).hasAttribute('disabled')).toBe(true)
  })

  it('should_show_progress_bar_when_pending', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, true] as any)
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('progressbar')).toBeDefined()
  })

  it('should_not_show_progress_bar_when_not_pending', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('should_show_instructor_contract_option_for_trainer', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByText('Instructor Contract')).toBeDefined()
  })

  it('should_show_liability_waiver_option_for_rider', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    expect(screen.getByText('Liability Waiver')).toBeDefined()
  })

  it('should_show_lease_agreement_option_for_rider', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    expect(screen.getByText('Lease Agreement')).toBeDefined()
  })

  it('should_show_boarding_contract_option_for_rider', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    expect(screen.getByText('Boarding Contract')).toBeDefined()
  })

  it('should_update_hidden_input_when_select_changes', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'lease_agreement' } })
    const hidden = document.querySelector('input[name="record_type"]') as HTMLInputElement
    expect(hidden.value).toBe('lease_agreement')
  })

  it('should_show_file_size_error_when_file_exceeds_4_5mb', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText(/exceeds 4\.5 mb/i)).toBeDefined()
  })

  it('should_clear_file_size_error_when_valid_file_selected', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)

    const smallFile = new File([new Uint8Array(100)], 'small.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [smallFile], configurable: true })
    fireEvent.change(fileInput)

    expect(screen.queryByText(/exceeds 4\.5 mb/i)).toBeNull()
  })

  it('should_render_choose_file_button', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDefined()
  })

  it('should_not_display_filename_before_file_selected', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.queryByText('small.pdf')).toBeNull()
  })

  it('should_display_filename_after_file_selected', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'small.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText('small.pdf')).toBeDefined()
  })

  it('should_hide_native_file_input', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.className).toContain('sr-only')
  })

  it('should_invoke_file_input_click_when_choose_file_button_clicked', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    let clicked = false
    fileInput.click = () => { clicked = true }
    fireEvent.click(screen.getByRole('button', { name: /choose file/i }))
    expect(clicked).toBe(true)
  })

  it('should_clear_filename_when_change_fires_with_no_file', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    Object.defineProperty(fileInput, 'files', { value: [], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.queryByText('doc.pdf')).toBeNull()
  })

  it('should_clear_filename_on_form_submit', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'upload.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    fireEvent.submit(screen.getByRole('button', { name: /upload/i }).closest('form')!)
    expect(screen.queryByText('upload.pdf')).toBeNull()
  })

  it('should_render_upload_button_for_manager', () => {
    render(<UploadForm memberRole="manager" action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_show_instructor_contract_option_for_manager', () => {
    render(<UploadForm memberRole="manager" action={noop} />)
    expect(screen.getByText('Instructor Contract')).toBeDefined()
  })

  it('should_not_show_liability_waiver_for_manager', () => {
    render(<UploadForm memberRole="manager" action={noop} />)
    expect(screen.queryByText('Liability Waiver')).toBeNull()
  })
})
