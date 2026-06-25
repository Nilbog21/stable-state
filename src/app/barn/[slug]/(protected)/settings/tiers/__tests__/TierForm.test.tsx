import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockLessonTier } from '@/test/fixtures'
import { TierForm } from '../TierForm'

afterEach(() => vi.restoreAllMocks())

const mockSave = vi.fn() as unknown as (fd: FormData) => Promise<void>
const mockDeactivate = vi.fn() as unknown as () => Promise<void>
const mockActivate = vi.fn() as unknown as () => Promise<void>
const mockSetDefault = vi.fn() as unknown as () => Promise<void>

describe('TierForm — new mode', () => {
  it('should_render_name_field', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.getByLabelText(/name/i)).toBeDefined()
  })

  it('should_render_price_field', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.getByLabelText(/price/i)).toBeDefined()
  })

  it('should_render_default_jumping_select', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.getByLabelText(/default jumping/i)).toBeDefined()
  })

  it('should_render_default_exertion_select', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.getByLabelText(/default exertion/i)).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_render_deactivate_or_activate_button', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /activate/i })).toBeNull()
  })

  it('should_not_render_set_default_button', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.queryByRole('button', { name: /set default/i })).toBeNull()
  })

  it('should_not_show_rename_warning', () => {
    render(<TierForm mode="new" slug="green-acres" onSave={mockSave} />)

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — edit mode, active tier', () => {
  const activeTier = createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true })

  it('should_render_name_field_with_initial_value', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Standard')
  })

  it('should_render_deactivate_button_for_active_tier', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.getByRole('button', { name: /deactivate/i })).toBeDefined()
  })

  it('should_not_render_activate_button_for_active_tier', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.queryByRole('button', { name: /^activate$/i })).toBeNull()
  })

  it('should_render_set_default_button_in_edit_mode', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.getByRole('button', { name: /set default/i })).toBeDefined()
  })

  it('should_not_show_rename_warning_when_name_unchanged', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })

  it('should_show_rename_warning_when_name_changes', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Premium' } })

    expect(screen.getByText(/renaming will not update past lessons/i)).toBeDefined()
  })

  it('should_hide_rename_warning_when_name_reverted', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={activeTier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Premium' } })
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Standard' } })

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — edit mode, no initial tier', () => {
  it('should_not_show_rename_warning_when_no_initial_tier', () => {
    render(<TierForm mode="edit" slug="green-acres" onSave={mockSave} />)

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — default_jumping pre-selected', () => {
  it('should_pre_select_jumping_default_when_tier_has_default_jumping_true', () => {
    const tier = createMockLessonTier({ default_jumping: true })
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={tier}
        onSave={mockSave}
        onDeactivate={mockDeactivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(
      (screen.getByLabelText(/default jumping/i) as HTMLSelectElement).value
    ).toBe('true')
  })
})

describe('TierForm — edit mode, inactive tier', () => {
  const inactiveTier = createMockLessonTier({ id: 'tier-2', name: 'Old', is_active: false })

  it('should_render_activate_button_for_inactive_tier', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.getByRole('button', { name: /activate/i })).toBeDefined()
  })

  it('should_not_render_deactivate_button_for_inactive_tier', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull()
  })

  it('should_disable_save_button_when_inactive', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('should_disable_name_input_when_inactive', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect((screen.getByLabelText(/name/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_disable_set_default_button_when_inactive', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    expect((screen.getByRole('button', { name: /set default/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('should_not_show_rename_warning_for_inactive_tier', () => {
    render(
      <TierForm
        mode="edit"
        slug="green-acres"
        initialTier={inactiveTier}
        onSave={mockSave}
        onActivate={mockActivate}
        onSetDefault={mockSetDefault}
      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Name' } })

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})
