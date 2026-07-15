import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, act, waitFor } from '@testing-library/react'

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  vi.setSystemTime(new Date('2026-07-04T12:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

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

  it('should_uncheck_a_horse_when_clicked_again', () => {
    const { container } = renderForm()
    const appleCheckbox = screen.getByRole('checkbox', { name: 'Apple' })
    fireEvent.click(appleCheckbox)
    fireEvent.click(appleCheckbox)
    const form = container.querySelector('form')!
    const fd = new FormData(form)
    expect(fd.getAll('horse_id')).toEqual([])
  })

  it('should_update_expense_type_when_user_edits_it_manually', () => {
    renderForm()
    const typeInput = screen.getByLabelText(/expense type/i) as HTMLInputElement
    fireEvent.change(typeInput, { target: { value: 'Grooming' } })
    expect(typeInput.value).toBe('Grooming')
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

  it('should_clear_the_flash_after_the_timeout_elapses', async () => {
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
    act(() => {
      vi.advanceTimersByTime(600)
    })
    expect(screen.getByLabelText(/expense type/i).className).not.toContain('ring-2')
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

  it('should_render_default_submit_label_when_submitLabel_omitted', () => {
    renderForm()
    expect(screen.getByRole('button', { name: 'Add Expense' })).toBeDefined()
  })

  it('should_render_custom_submit_label_when_provided', () => {
    renderForm({ submitLabel: 'Save Changes' })
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDefined()
  })

  it('should_prefill_recipient_from_initial', () => {
    renderForm({ initial: { recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: [] } })
    expect((screen.getByLabelText(/recipient/i) as HTMLInputElement).value).toBe('Dr. Hoof Farrier')
  })

  it('should_not_call_lookup_when_prefilled_recipient_is_blurred_unchanged', async () => {
    renderForm({ initial: { recipient: 'Dr. Hoof Farrier', expenseType: 'Farrier', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: [] } })
    const recipientInput = screen.getByLabelText(/recipient/i)
    await act(async () => {
      fireEvent.blur(recipientInput)
    })
    expect(getMostCommonExpenseTypeAction).not.toHaveBeenCalled()
  })

  it('should_prefill_expense_type_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: 'Farrier', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: [] } })
    expect((screen.getByLabelText(/expense type/i) as HTMLInputElement).value).toBe('Farrier')
  })

  it('should_prefill_time_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: '14:30', amount: null, notes: null, appliesToAllHorses: false, horseIds: [] } })
    expect((screen.getByLabelText(/time/i) as HTMLInputElement).value).toBe('14:30')
  })

  it('should_prefill_amount_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: 42.5, notes: null, appliesToAllHorses: false, horseIds: [] } })
    expect((screen.getByLabelText(/amount/i) as HTMLInputElement).value).toBe('42.5')
  })

  it('should_prefill_notes_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: 'Regular trim', appliesToAllHorses: false, horseIds: [] } })
    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe('Regular trim')
  })

  it('should_check_entire_barn_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: null, appliesToAllHorses: true, horseIds: [] } })
    expect((screen.getByRole('checkbox', { name: /entire barn/i }) as HTMLInputElement).checked).toBe(true)
  })

  it('should_disable_horse_checkboxes_when_entire_barn_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: null, appliesToAllHorses: true, horseIds: [] } })
    expect((screen.getByRole('checkbox', { name: 'Apple' }) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_check_the_horse_in_initial_horseIds', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: ['horse-2'] } })
    expect((screen.getByRole('checkbox', { name: 'Butter' }) as HTMLInputElement).checked).toBe(true)
  })

  it('should_leave_other_horses_unchecked_from_initial_horseIds', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: ['horse-2'] } })
    expect((screen.getByRole('checkbox', { name: 'Apple' }) as HTMLInputElement).checked).toBe(false)
  })

  it('should_show_time_field_when_date_is_today', () => {
    renderForm({ defaultDate: '2026-07-04' })
    expect(screen.getByLabelText(/time/i)).toBeDefined()
  })

  it('should_show_time_field_when_date_is_in_the_future', () => {
    renderForm({ defaultDate: '2026-07-05' })
    expect(screen.getByLabelText(/time/i)).toBeDefined()
  })

  it('should_hide_time_field_when_date_is_strictly_before_today', () => {
    renderForm({ defaultDate: '2026-07-03' })
    expect(screen.queryByLabelText(/time/i)).toBeNull()
  })

  it('should_hide_time_field_after_changing_date_to_the_past', () => {
    renderForm({ defaultDate: '2026-07-04' })
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-07-03' } })
    expect(screen.queryByLabelText(/time/i)).toBeNull()
  })

  it('should_show_time_field_again_after_changing_date_back_to_today', () => {
    renderForm({ defaultDate: '2026-07-03' })
    fireEvent.change(screen.getByLabelText(/date/i), { target: { value: '2026-07-04' } })
    expect(screen.getByLabelText(/time/i)).toBeDefined()
  })

  it('should_show_time_field_when_defaultDate_is_omitted', () => {
    renderForm({ defaultDate: undefined })
    expect(screen.getByLabelText(/time/i)).toBeDefined()
  })

  it('should_update_time_when_user_edits_it_manually', () => {
    renderForm()
    const timeInput = screen.getByLabelText(/time/i) as HTMLInputElement
    fireEvent.change(timeInput, { target: { value: '09:15' } })
    expect(timeInput.value).toBe('09:15')
  })

  it('should_preserve_existing_time_in_form_data_when_editing_a_past_dated_expense', () => {
    const { container } = renderForm({
      defaultDate: '2026-07-03',
      initial: { recipient: '', expenseType: '', expenseTime: '14:30', amount: null, notes: null, appliesToAllHorses: false, horseIds: [] },
    })
    const form = container.querySelector('form')!
    const fd = new FormData(form)
    expect(fd.get('expense_time')).toBe('14:30')
  })

  it('should_render_payment_type_select', () => {
    renderForm()
    expect(screen.getByLabelText(/payment type/i)).toBeDefined()
  })

  it('should_render_payment_type_options', () => {
    renderForm()
    const select = screen.getByLabelText(/payment type/i) as HTMLSelectElement
    const values = Array.from(select.options).map((o) => o.value)
    expect(values).toEqual(['', 'venmo', 'zelle', 'cash', 'check', 'freshbooks'])
  })

  it('should_default_payment_type_to_unpaid_when_no_initial', () => {
    renderForm()
    expect((screen.getByLabelText(/payment type/i) as HTMLSelectElement).value).toBe('')
  })

  it('should_prefill_payment_type_from_initial', () => {
    renderForm({ initial: { recipient: '', expenseType: '', expenseTime: null, amount: null, notes: null, appliesToAllHorses: false, horseIds: [], paymentType: 'venmo' } })
    expect((screen.getByLabelText(/payment type/i) as HTMLSelectElement).value).toBe('venmo')
  })

  it('should_include_selected_payment_type_in_form_data', () => {
    const { container } = renderForm()
    fireEvent.change(screen.getByLabelText(/payment type/i), { target: { value: 'cash' } })
    const form = container.querySelector('form')!
    const fd = new FormData(form)
    expect(fd.get('payment_type')).toBe('cash')
  })
})
