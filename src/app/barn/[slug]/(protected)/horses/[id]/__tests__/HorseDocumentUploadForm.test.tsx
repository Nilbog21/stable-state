import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { HorseDocumentUploadForm } from '../HorseDocumentUploadForm'

const noop = async () => {}

describe('HorseDocumentUploadForm', () => {
  it('should_render_upload_button', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    expect(screen.getByRole('button', { name: /upload/i })).toBeDefined()
  })

  it('should_show_insurance_binder_option', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    expect(screen.getByText('Insurance Binder')).toBeDefined()
  })

  it('should_show_coggins_option', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    expect(screen.getByText('Coggins')).toBeDefined()
  })

  it('should_show_shot_record_option', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    expect(screen.getByText('Shot Record')).toBeDefined()
  })

  it('should_show_contract_option', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    expect(screen.getByText('Contract')).toBeDefined()
  })

  it('should_update_hidden_input_when_select_changes', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    const select = screen.getByRole('combobox')
    fireEvent.change(select, { target: { value: 'shot_record' } })
    const hidden = document.querySelector('input[name="record_type"]') as HTMLInputElement
    expect(hidden.value).toBe('shot_record')
  })

  it('should_show_file_size_error_when_file_exceeds_5mb', () => {
    render(<HorseDocumentUploadForm action={noop} />)
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    Object.defineProperty(fileInput, 'files', { value: [bigFile], configurable: true })
    fireEvent.change(fileInput)
    expect(screen.getByText(/exceeds 5 mb/i)).toBeDefined()
  })

  it('should_clear_file_size_error_when_valid_file_selected', () => {
    render(<HorseDocumentUploadForm action={noop} />)
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
