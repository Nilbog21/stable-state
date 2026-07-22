import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useActionState } from 'react'
import { DocumentUploadForm } from '../DocumentUploadForm'

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>()
  return { ...actual, useActionState: vi.fn() }
})

const noop = async () => ({ error: null })

describe('DocumentUploadForm', () => {
  beforeEach(() => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, false] as any)
  })

  it('should_render_server_error_inline', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: 'boom' }, noop, false] as any)
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('alert').textContent).toBe('boom')
  })

  it('should_render_upload_button', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_render_cancel_link_to_cancel_href', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('link', { name: /cancel/i }).getAttribute('href')).toBe('/back')
  })

  it('should_disable_upload_button_when_pending', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, true] as any)
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('button', { name: /uploading/i }).hasAttribute('disabled')).toBe(true)
  })

  it('should_show_progress_bar_when_pending', () => {
    vi.mocked(useActionState).mockReturnValue([{ error: null }, noop, true] as any)
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('progressbar')).toBeDefined()
  })

  it('should_not_show_progress_bar_when_not_pending', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.queryByRole('progressbar')).toBeNull()
  })

  it('should_show_insurance_binder_option_for_horse_entity', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Insurance Binder')).toBeDefined()
  })

  it('should_show_coggins_option_for_horse_entity', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Coggins')).toBeDefined()
  })

  it('should_show_shot_record_option_for_horse_entity', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Shot Record')).toBeDefined()
  })

  it('should_show_contract_option_for_horse_entity', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Contract')).toBeDefined()
  })

  it('should_show_instructor_contract_option_for_trainer_entity', () => {
    render(<DocumentUploadForm entity="trainer" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Instructor Contract')).toBeDefined()
  })

  it('should_not_show_horse_only_options_for_trainer_entity', () => {
    render(<DocumentUploadForm entity="trainer" action={noop} cancelHref="/back" />)
    expect(screen.queryByText('Coggins')).toBeNull()
  })

  it('should_show_liability_waiver_option_for_rider_entity', () => {
    render(<DocumentUploadForm entity="rider" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Liability Waiver')).toBeDefined()
  })

  it('should_show_lease_agreement_option_for_rider_entity', () => {
    render(<DocumentUploadForm entity="rider" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Lease Agreement')).toBeDefined()
  })

  it('should_show_boarding_contract_option_for_rider_entity', () => {
    render(<DocumentUploadForm entity="rider" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Boarding Contract')).toBeDefined()
  })

  it('should_show_other_option_for_every_entity', () => {
    render(<DocumentUploadForm entity="rider" action={noop} cancelHref="/back" />)
    expect(screen.getByText('Other')).toBeDefined()
  })

  it('should_update_hidden_input_when_select_changes', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'shot_record' } })
    const hidden = document.querySelector('input[name="record_type"]') as HTMLInputElement
    expect(hidden.value).toBe('shot_record')
  })

  it('should_show_file_size_error_when_file_exceeds_4_5mb', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText(/exceeds 4\.5 mb/i)).toBeDefined()
  })

  it('should_clear_file_size_error_when_valid_file_selected', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
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
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('button', { name: /choose file/i })).toBeDefined()
  })

  it('should_not_display_filename_before_file_selected', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.queryByText('small.pdf')).toBeNull()
  })

  it('should_display_filename_after_file_selected', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'small.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText('small.pdf')).toBeDefined()
  })

  it('should_hide_native_file_input', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.className).toContain('sr-only')
  })

  it('should_invoke_file_input_click_when_choose_file_button_clicked', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    let clicked = false
    fileInput.click = () => { clicked = true }
    fireEvent.click(screen.getByRole('button', { name: /choose file/i }))
    expect(clicked).toBe(true)
  })

  it('should_clear_filename_when_change_fires_with_no_file', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    Object.defineProperty(fileInput, 'files', { value: [], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.queryByText('doc.pdf')).toBeNull()
  })

  it('should_clear_filename_on_form_submit', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'upload.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    fireEvent.submit(screen.getByRole('button', { name: /upload/i }).closest('form')!)
    expect(screen.queryByText('upload.pdf')).toBeNull()
  })

  it('should_show_locked_photo_type_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    expect(screen.getByText('Photo')).toBeDefined()
  })

  it('should_not_show_document_type_select_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('should_not_show_notes_field_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    expect(screen.queryByText(/notes/i)).toBeNull()
  })

  it('should_not_show_reminder_date_field_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    expect(screen.queryByText(/expiration reminder/i)).toBeNull()
  })

  it('should_restrict_file_input_to_photo_extensions_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    expect(fileInput.accept).toBe('.jpg,.jpeg,.png')
  })

  it('should_auto_submit_form_on_valid_file_select_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'butter.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    expect(requestSubmitSpy).toHaveBeenCalled()
    requestSubmitSpy.mockRestore()
  })

  it('should_not_auto_submit_form_on_valid_file_select_when_not_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true })
    fireEvent.change(fileInput)
    expect(requestSubmitSpy).not.toHaveBeenCalled()
    requestSubmitSpy.mockRestore()
  })

  it('should_not_auto_submit_form_when_selected_file_exceeds_size_limit_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" photoMode action={noop} cancelHref="/back" />)
    const requestSubmitSpy = vi.spyOn(HTMLFormElement.prototype, 'requestSubmit').mockImplementation(() => {})
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = new File([new Uint8Array(4500001)], 'huge.jpg', { type: 'image/jpeg' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)
    expect(requestSubmitSpy).not.toHaveBeenCalled()
    requestSubmitSpy.mockRestore()
  })

  it('should_show_document_type_select_when_not_in_photo_mode', () => {
    render(<DocumentUploadForm entity="horse" action={noop} cancelHref="/back" />)
    expect(screen.getByRole('combobox')).toBeDefined()
  })
})
