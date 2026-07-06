import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockLessonTier } from '@/test/fixtures'
import { TierForm } from '../TierForm'

afterEach(() => vi.restoreAllMocks())

const mockAction = vi.fn().mockResolvedValue({ error: null })
const mockDeactivate = vi.fn() as unknown as () => Promise<void>
const mockActivate = vi.fn() as unknown as () => Promise<void>

describe('TierForm — new mode', () => {
  it('should_render_name_field', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/name/i)).toBeDefined()
  })

  it('should_render_price_field', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/price/i)).toBeDefined()
  })

  it('should_render_default_jumping_select', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/default jumping/i)).toBeDefined()
  })

  it('should_render_default_exertion_select', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.getByLabelText(/default exertion/i)).toBeDefined()
  })

  it('should_render_save_button', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_render_deactivate_button_in_new_mode', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull()
  })

  it('should_not_render_activate_button_in_new_mode', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.queryByRole('button', { name: /activate/i })).toBeNull()
  })

  it('should_not_render_set_as_default_checkbox_in_new_mode', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.queryByLabelText(/set as default tier/i)).toBeNull()
  })

  it('should_not_show_rename_warning', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — edit mode, active tier', () => {
  const activeTier = createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true })

  it('should_render_name_field_with_initial_value', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Standard')
  })

  it('should_render_deactivate_button_for_active_tier', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    expect(screen.getByRole('button', { name: /deactivate/i })).toBeDefined()
  })

  it('should_not_render_activate_button_for_active_tier', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    expect(screen.queryByRole('button', { name: /^activate$/i })).toBeNull()
  })

  it('should_not_show_rename_warning_when_name_unchanged', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })

  it('should_show_rename_warning_when_name_changes', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Premium' } })

    expect(screen.getByText(/renaming will not update past lessons/i)).toBeDefined()
  })

  it('should_hide_rename_warning_when_name_reverted', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={activeTier}
        action={mockAction}
        onDeactivate={mockDeactivate}

      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Premium' } })
    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Standard' } })

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — edit mode, no initial tier', () => {
  it('should_not_show_rename_warning_when_no_initial_tier', () => {
    render(<TierForm mode="edit" action={mockAction} />)

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — default_jumping pre-selected', () => {
  it('should_pre_select_jumping_default_when_tier_has_default_jumping_true', () => {
    const tier = createMockLessonTier({ default_jumping: true })
    render(
      <TierForm
        mode="edit"
               initialTier={tier}
        action={mockAction}
        onDeactivate={mockDeactivate}

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
               initialTier={inactiveTier}
        action={mockAction}
        onActivate={mockActivate}

      />
    )

    expect(screen.getByRole('button', { name: /activate/i })).toBeDefined()
  })

  it('should_not_render_deactivate_button_for_inactive_tier', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={inactiveTier}
        action={mockAction}
        onActivate={mockActivate}

      />
    )

    expect(screen.queryByRole('button', { name: /deactivate/i })).toBeNull()
  })

  it('should_disable_save_button_when_inactive', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={inactiveTier}
        action={mockAction}
        onActivate={mockActivate}

      />
    )

    expect((screen.getByRole('button', { name: /save/i }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('should_disable_name_input_when_inactive', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={inactiveTier}
        action={mockAction}
        onActivate={mockActivate}

      />
    )

    expect((screen.getByLabelText(/name/i) as HTMLInputElement).disabled).toBe(true)
  })

  it('should_not_show_rename_warning_for_inactive_tier', () => {
    render(
      <TierForm
        mode="edit"
               initialTier={inactiveTier}
        action={mockAction}
        onActivate={mockActivate}

      />
    )

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Name' } })

    expect(screen.queryByText(/renaming will not update past lessons/i)).toBeNull()
  })
})

describe('TierForm — set as default checkbox', () => {
  it('should_render_set_as_default_checkbox_in_edit_mode', () => {
    const activeTier = createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true })
    render(<TierForm mode="edit" initialTier={activeTier} action={mockAction} />)

    expect(screen.getByLabelText(/set as default tier/i)).toBeDefined()
  })

  it('should_pre_check_checkbox_when_tier_is_default', () => {
    const defaultTier = createMockLessonTier({ id: 'tier-1', is_active: true, is_default: true })
    render(<TierForm mode="edit" initialTier={defaultTier} action={mockAction} />)

    expect((screen.getByLabelText(/set as default tier/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_not_pre_check_checkbox_when_tier_is_not_default', () => {
    const nonDefaultTier = createMockLessonTier({ id: 'tier-1', is_active: true, is_default: false })
    render(<TierForm mode="edit" initialTier={nonDefaultTier} action={mockAction} />)

    expect((screen.getByLabelText(/set as default tier/i) as HTMLInputElement).checked).toBe(false)
  })

  it('should_disable_set_as_default_checkbox_when_inactive', () => {
    const inactiveTier = createMockLessonTier({ id: 'tier-2', name: 'Old', is_active: false })
    render(<TierForm mode="edit" initialTier={inactiveTier} action={mockAction} />)

    expect((screen.getByLabelText(/set as default tier/i) as HTMLInputElement).disabled).toBe(true)
  })
})

describe('TierForm — price validation', () => {
  it('should_mark_price_input_as_required', () => {
    render(<TierForm mode="new" action={mockAction} />)

    expect((screen.getByLabelText(/price/i) as HTMLInputElement).required).toBe(true)
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'Price is required' })
    render(<TierForm mode="new" action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(await screen.findByText('Price is required')).toBeDefined()
  })
})
