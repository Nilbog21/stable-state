import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/app/actions/expenses', () => ({
  getMostCommonExpenseTypeAction: vi.fn(),
}))

import { getMostCommonExpenseTypeAction } from '@/app/actions/expenses'
import { ExpenseForm } from '../ExpenseForm'

const horses = [
  { id: 'horse-1', name: 'Apple' },
  { id: 'horse-2', name: 'Butter' },
]
const recentRecipients = ['Dr. Hoof Farrier', 'Riverside Vet Clinic']
const recentExpenseTypes = ['Farrier', 'Veterinary']
const onSave = vi.fn().mockResolvedValue({ error: null })

beforeEach(() => {
  vi.mocked(getMostCommonExpenseTypeAction).mockReset()
  vi.mocked(getMostCommonExpenseTypeAction).mockResolvedValue(null)
  onSave.mockClear()
})

function renderForm(overrides: Partial<Parameters<typeof ExpenseForm>[0]> = {}) {
  return render(
    <ExpenseForm
      barnSlug="green-acres"
      horses={horses}
      recentRecipients={recentRecipients}
      recentExpenseTypes={recentExpenseTypes}
      defaultDate="2026-07-04"
      onSave={onSave}
      {...overrides}
    />
  )
}

describe('ExpenseForm', () => {
  it('should_render_recipient_input_as_required', () => {
    renderForm()
    expect((screen.getByLabelText(/recipient/i) as HTMLInputElement).required).toBe(true)
  })

  it('should_render_recipient_datalist_options_from_recentRecipients', () => {
    const { container } = renderForm()
    const options = Array.from(container.querySelectorAll('datalist#recipient-options option')).map(
      (o) => (o as HTMLOptionElement).value
    )
    expect(options).toEqual(recentRecipients)
  })

  it('should_render_expense_type_datalist_options_from_recentExpenseTypes', () => {
    const { container } = renderForm()
    const options = Array.from(container.querySelectorAll('datalist#expense-type-options option')).map(
      (o) => (o as HTMLOptionElement).value
    )
    expect(options).toEqual(recentExpenseTypes)
  })

  it('should_render_date_input_as_required', () => {
    renderForm()
    expect((screen.getByLabelText(/date/i) as HTMLInputElement).required).toBe(true)
  })

  it('should_render_time_input_as_optional', () => {
    renderForm()
    expect((screen.getByLabelText(/time/i) as HTMLInputElement).required).toBe(false)
  })

  it('should_render_amount_input_as_optional', () => {
    renderForm()
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).required).toBe(false)
  })

  it('should_prefill_date_from_defaultDate', () => {
    renderForm()
    expect((screen.getByLabelText(/date/i) as HTMLInputElement).value).toBe('2026-07-04')
  })

  it('should_render_a_checkbox_for_each_horse', () => {
    renderForm()
    expect(screen.getByRole('checkbox', { name: 'Apple' })).toBeDefined()
    expect(screen.getByRole('checkbox', { name: 'Butter' })).toBeDefined()
  })

  it('should_disable_horse_checkboxes_when_entire_barn_is_checked', () => {
    renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: /entire barn/i }))
    expect((screen.getByRole('checkbox', { name: 'Apple' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_exclude_horse_id_from_form_data_when_entire_barn_is_checked', () => {
    const { container } = renderForm()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Apple' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /entire barn/i }))
    const form = container.querySelector('form')!
    const fd = new FormData(form)
    expect(fd.getAll('horse_id')).toEqual([])
  })

  it('should_call_getMostCommonExpenseTypeAction_with_trimmed_recipient_on_blur', async () => {
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    fireEvent.change(recipientInput, { target: { value: '  Dr. Hoof Farrier  ' } })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    expect(getMostCommonExpenseTypeAction).toHaveBeenCalledWith('green-acres', 'Dr. Hoof Farrier')
  })

  it('should_autofill_expense_type_when_lookup_returns_a_type', async () => {
    vi.mocked(getMostCommonExpenseTypeAction).mockResolvedValue('Farrier')
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    fireEvent.change(recipientInput, { target: { value: 'Dr. Hoof Farrier' } })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    await waitFor(() => {
      expect((screen.getByLabelText(/expense type/i) as HTMLInputElement).value).toBe('Farrier')
    })
  })

  it('should_flash_expense_type_field_when_autofilled', async () => {
    vi.mocked(getMostCommonExpenseTypeAction).mockResolvedValue('Farrier')
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    fireEvent.change(recipientInput, { target: { value: 'Dr. Hoof Farrier' } })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    await waitFor(() => {
      expect(screen.getByLabelText(/expense type/i).className).toContain('ring-2')
    })
  })

  it('should_not_call_lookup_again_when_recipient_is_unchanged_since_last_check', async () => {
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    fireEvent.change(recipientInput, { target: { value: 'Dr. Hoof Farrier' } })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    expect(getMostCommonExpenseTypeAction).toHaveBeenCalledTimes(1)
  })

  it('should_not_call_lookup_when_recipient_is_blank_on_blur', async () => {
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    expect(getMostCommonExpenseTypeAction).not.toHaveBeenCalled()
  })

  it('should_not_autofill_when_lookup_returns_null', async () => {
    vi.mocked(getMostCommonExpenseTypeAction).mockResolvedValue(null)
    renderForm()
    const recipientInput = screen.getByLabelText(/recipient/i)
    fireEvent.change(recipientInput, { target: { value: 'New Vendor' } })
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    expect((screen.getByLabelText(/expense type/i) as HTMLInputElement).value).toBe('')
  })

  it('should_render_error_message_when_action_returns_error', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'recipient required' })
    renderForm({ onSave: errorAction })
    const form = screen.getByRole('button', { name: /add expense/i }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('should_not_render_error_message_when_form_has_not_been_submitted', () => {
    renderForm()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
