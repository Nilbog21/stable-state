import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UploadForm } from '../UploadForm'

const noop = async () => {}

describe('UploadForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_render_upload_button_for_trainer', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_render_upload_button_for_rider', () => {
    render(<UploadForm memberRole="rider" action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
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

  it('should_show_file_size_error_when_file_exceeds_5mb', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText(/exceeds 5 mb/i)).toBeDefined()
  })

  it('should_clear_file_size_error_when_valid_file_selected', () => {
    render(<UploadForm memberRole="trainer" action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement

    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)

    const smallFile = new File([new Uint8Array(100)], 'small.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [smallFile], configurable: true })
    fireEvent.change(fileInput)

    expect(screen.queryByText(/exceeds 5 mb/i)).toBeNull()
  })
})
