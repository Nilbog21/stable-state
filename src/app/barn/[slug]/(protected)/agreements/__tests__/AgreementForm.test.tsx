import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { createMockAgreement } from '@/test/fixtures'
import { AgreementForm } from '../AgreementForm'

const riders = [{ id: 'rider-1', name: 'Dana Rider' }]
const horses = [{ id: 'horse-1', name: 'Apple' }]
const onSave = vi.fn().mockResolvedValue({ error: null })

describe('AgreementForm - new mode', () => {
  it('should_render_cadence_select_for_new_lease_mode', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.getByLabelText(/cadence/i)).toBeDefined()
  })

  it('should_render_hidden_monthly_cadence_input_for_new_board_mode', () => {
    const { container } = render(
      <AgreementForm mode="new" kind="board" riders={riders} horses={horses} onSave={onSave} />
    )
    const hidden = container.querySelector('input[name="cadence"][type="hidden"]') as HTMLInputElement
    expect(hidden.value).toBe('monthly')
  })

  it('should_prefill_fee_from_default_board_fee_in_new_board_mode', () => {
    render(
      <AgreementForm
        mode="new"
        kind="board"
        riders={riders}
        horses={horses}
        defaultBoardFee={1000}
        onSave={onSave}
      />
    )
    expect((screen.getByLabelText(/fee/i) as HTMLInputElement).value).toBe('1000')
  })

  it('should_prefill_start_date_with_default_start_date_in_new_mode', () => {
    render(
      <AgreementForm
        mode="new"
        kind="lease"
        riders={riders}
        horses={horses}
        defaultStartDate="2026-07-03"
        onSave={onSave}
      />
    )
    expect((screen.getByLabelText(/start date/i) as HTMLInputElement).value).toBe('2026-07-03')
  })

  it('should_render_rider_select_with_options_in_new_mode', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.getByRole('option', { name: 'Dana Rider' })).toBeDefined()
  })

  it('should_render_horse_select_with_options_in_new_mode', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.getByRole('option', { name: 'Apple' })).toBeDefined()
  })

  it('should_render_add_lease_button_label_in_new_lease_mode', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.getByRole('button', { name: /add lease/i })).toBeDefined()
  })

  it('should_render_add_boarding_button_label_in_new_board_mode', () => {
    render(
      <AgreementForm mode="new" kind="board" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.getByRole('button', { name: /add boarding/i })).toBeDefined()
  })

  it('should_update_fee_value_when_changed', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    const feeInput = screen.getByLabelText(/fee/i) as HTMLInputElement
    fireEvent.change(feeInput, { target: { value: '300' } })
    expect(feeInput.value).toBe('300')
  })

  it('should_render_error_message_when_action_returns_error', async () => {
    const errorAction = vi.fn().mockResolvedValue({ error: 'rider required' })
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={errorAction} />
    )
    const form = screen.getByRole('button', { name: /add lease/i }).closest('form')!
    fireEvent.submit(form)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeDefined()
    })
  })

  it('should_not_render_error_message_when_form_has_not_been_submitted', () => {
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={horses} onSave={onSave} />
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_sort_unavailable_horses_after_available_horses', () => {
    const mixedHorses = [
      { id: 'horse-2', name: 'Butter', is_available: false, unavailability_reason: 'Thrown shoe' },
      { id: 'horse-1', name: 'Apple', is_available: true, unavailability_reason: null },
    ]
    const { container } = render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={mixedHorses} onSave={onSave} />
    )
    const horseSelect = container.querySelector('select[name="horse_id"]') as HTMLSelectElement
    const options = Array.from(horseSelect.options).filter((o) => o.value !== '')
    expect(options[0].textContent).toContain('Apple')
  })

  it('should_disable_option_for_unavailable_horse', () => {
    const mixedHorses = [
      { id: 'horse-1', name: 'Apple', is_available: false, unavailability_reason: 'Thrown shoe' },
    ]
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={mixedHorses} onSave={onSave} />
    )
    const option = screen.getByRole('option', { name: /Apple/i }) as HTMLOptionElement
    expect(option.disabled).toBe(true)
  })

  it('should_show_unavailability_reason_for_unavailable_horse', () => {
    const mixedHorses = [
      { id: 'horse-1', name: 'Apple', is_available: false, unavailability_reason: 'Thrown shoe' },
    ]
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={mixedHorses} onSave={onSave} />
    )
    expect(screen.getByText(/Thrown shoe/)).toBeDefined()
  })

  it('should_show_generic_unavailable_label_when_no_reason_given', () => {
    const mixedHorses = [
      { id: 'horse-1', name: 'Apple', is_available: false, unavailability_reason: null },
    ]
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={mixedHorses} onSave={onSave} />
    )
    expect(screen.getByText(/Apple — Unavailable/)).toBeDefined()
  })

  it('should_not_disable_option_for_available_horse', () => {
    const mixedHorses = [
      { id: 'horse-1', name: 'Apple', is_available: true, unavailability_reason: null },
    ]
    render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={mixedHorses} onSave={onSave} />
    )
    const option = screen.getByRole('option', { name: 'Apple' }) as HTMLOptionElement
    expect(option.disabled).toBe(false)
  })

  it('should_keep_order_stable_when_both_horses_are_available', () => {
    const bothAvailable = [
      { id: 'horse-1', name: 'Apple', is_available: true, unavailability_reason: null },
      { id: 'horse-2', name: 'Butter', is_available: true, unavailability_reason: null },
    ]
    const { container } = render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={bothAvailable} onSave={onSave} />
    )
    const horseSelect = container.querySelector('select[name="horse_id"]') as HTMLSelectElement
    const options = Array.from(horseSelect.options).filter((o) => o.value !== '')
    expect(options.map((o) => o.value)).toEqual(['horse-1', 'horse-2'])
  })

  it('should_keep_order_stable_when_both_horses_are_unavailable', () => {
    const bothUnavailable = [
      { id: 'horse-1', name: 'Apple', is_available: false, unavailability_reason: 'Vet visit' },
      { id: 'horse-2', name: 'Butter', is_available: false, unavailability_reason: 'Thrown shoe' },
    ]
    const { container } = render(
      <AgreementForm mode="new" kind="lease" riders={riders} horses={bothUnavailable} onSave={onSave} />
    )
    const horseSelect = container.querySelector('select[name="horse_id"]') as HTMLSelectElement
    const options = Array.from(horseSelect.options).filter((o) => o.value !== '')
    expect(options.map((o) => o.value)).toEqual(['horse-1', 'horse-2'])
  })
})

describe('AgreementForm - edit mode', () => {
  const initialAgreement = createMockAgreement({ fee: 250, start_date: '2026-06-01', cadence: 'monthly' })

  it('should_render_rider_name_as_text_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect(screen.getByText('Dana Rider')).toBeDefined()
  })

  it('should_render_horse_name_as_text_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect(screen.getByText('Apple')).toBeDefined()
  })

  it('should_render_start_date_as_text_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect(screen.getByText('2026-06-01')).toBeDefined()
  })

  it('should_render_cadence_as_text_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect(screen.getByText('Monthly')).toBeDefined()
  })

  it('should_prefill_fee_input_from_initial_agreement_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect((screen.getByLabelText(/fee/i) as HTMLInputElement).value).toBe('250')
  })

  it('should_render_save_button_label_in_edit_mode', () => {
    render(
      <AgreementForm
        mode="edit"
        kind="lease"
        initialAgreement={initialAgreement}
        riderName="Dana Rider"
        horseName="Apple"
        onSave={onSave}
      />
    )
    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_render_dash_for_cadence_when_initial_agreement_missing', () => {
    render(
      <AgreementForm mode="edit" kind="lease" riderName="Dana Rider" horseName="Apple" onSave={onSave} />
    )
    expect(screen.getAllByText('—', { selector: 'p' }).length).toBeGreaterThan(0)
  })

  it('should_render_empty_fee_when_initial_agreement_missing', () => {
    render(
      <AgreementForm mode="edit" kind="lease" riderName="Dana Rider" horseName="Apple" onSave={onSave} />
    )
    expect((screen.getByLabelText(/fee/i) as HTMLInputElement).value).toBe('')
  })
})
