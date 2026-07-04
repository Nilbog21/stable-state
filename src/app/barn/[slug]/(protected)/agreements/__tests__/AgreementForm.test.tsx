import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockAgreement } from '@/test/fixtures'
import { AgreementForm } from '../AgreementForm'

const riders = [{ id: 'rider-1', name: 'Dana Rider' }]
const horses = [{ id: 'horse-1', name: 'Apple' }]
const onSave = vi.fn()

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
})
