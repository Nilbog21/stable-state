import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockLessonTier } from '@/test/fixtures'
import { TierRow } from '../TierRow'

vi.mock('../DeactivateButton', () => ({
  DeactivateButton: ({ action }: { action: () => Promise<void> }) => (
    <form action={action}><button type="submit">Deactivate</button></form>
  ),
}))

const noop = vi.fn()

describe('TierRow', () => {
  beforeEach(() => {
    vi.mocked(noop).mockReset()
  })

  it('should_render_name_input_with_tier_name', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ name: 'Premium' })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByDisplayValue('Premium')).toBeDefined()
  })

  it('should_render_save_button_for_active_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: true })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDefined()
  })

  it('should_not_render_save_button_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
  })

  it('should_render_default_badge_when_tier_is_default', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_default: true })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByText('Default')).toBeDefined()
  })

  it('should_not_render_set_default_button_when_tier_is_default', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_default: true })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.queryByRole('button', { name: /set default/i })).toBeNull()
  })

  it('should_render_set_default_button_when_tier_is_active_and_not_default', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: true, is_default: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByRole('button', { name: /set default/i })).toBeDefined()
  })

  it('should_render_active_status_for_active_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: true })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByText('Active')).toBeDefined()
  })

  it('should_render_inactive_status_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.getByText('Inactive')).toBeDefined()
  })

  it('should_not_show_rename_warning_initially', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier()} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })

  it('should_show_rename_warning_after_name_input_changes', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ name: 'Standard' })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    fireEvent.change(screen.getByDisplayValue('Standard'), { target: { value: 'Gold' } })

    expect(screen.getByText(/renaming will not update past lessons/i)).toBeDefined()
  })

  it('should_render_error_message_when_showError_is_true', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier()} formId="form-1" setDefaultAction={noop} deactivateAction={noop} showError />
      </tbody></table>
    )

    expect(screen.getByText(/cannot deactivate the default tier/i)).toBeDefined()
  })

  it('should_not_render_error_message_when_showError_is_false', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier()} formId="form-1" setDefaultAction={noop} deactivateAction={noop} showError={false} />
      </tbody></table>
    )

    expect(screen.queryByText(/cannot deactivate the default tier/i)).toBeNull()
  })

  it('should_render_jumping_select_with_empty_default_when_null', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ default_jumping: null })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /jumping/i }) as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('should_render_jumping_select_pre_filled_with_true', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ default_jumping: true })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /jumping/i }) as HTMLSelectElement
    expect(select.value).toBe('true')
  })

  it('should_render_jumping_select_pre_filled_with_false', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ default_jumping: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /jumping/i }) as HTMLSelectElement
    expect(select.value).toBe('false')
  })

  it('should_render_exertion_select_with_empty_default_when_null', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ default_exertion_level: null })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /exertion/i }) as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('should_render_exertion_select_pre_filled_with_value', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ default_exertion_level: 4 })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /exertion/i }) as HTMLSelectElement
    expect(select.value).toBe('4')
  })

  it('should_disable_jumping_select_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /jumping/i }) as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('should_disable_exertion_select_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const select = screen.getByRole('combobox', { name: /exertion/i }) as HTMLSelectElement
    expect(select.disabled).toBe(true)
  })

  it('should_disable_name_input_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ name: 'Standard', is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const input = screen.getByDisplayValue('Standard') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('should_not_render_deactivate_button_for_inactive_tier', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ is_active: false })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull()
  })

  it('should_render_empty_price_input_when_price_is_null', () => {
    render(
      <table><tbody>
        <TierRow tier={createMockLessonTier({ price: null })} formId="form-1" setDefaultAction={noop} deactivateAction={noop} />
      </tbody></table>
    )

    const priceInput = screen.getByRole('spinbutton') as HTMLInputElement
    expect(priceInput.value).toBe('')
  })
})
