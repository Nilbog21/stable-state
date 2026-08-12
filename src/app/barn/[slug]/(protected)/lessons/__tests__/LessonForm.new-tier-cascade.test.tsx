import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react'
import { createMockLessonTier, createMockHorse } from '@/test/fixtures'
import { LessonForm } from '../LessonForm'
import { calendarDate } from '@/lib/local-day'

afterEach(cleanup)

const sampleTier = createMockLessonTier({ is_default: true })

const baseProps = {
  mode: 'new' as const,
  horses: [],
  riders: [],
  isManager: false,
  action: vi.fn().mockResolvedValue({ error: null }),
  instructors: [],
  currentMembershipId: 'user-1',
  tiers: [sampleTier],
  todayStr: calendarDate('2026-06-01'),
}

describe('LessonForm tier cascade', () => {
  const horse = createMockHorse({ id: 'h1', name: 'Thunder', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  const horse2 = createMockHorse({ id: 'h2', name: 'Lightning', barn_id: 'b1', created_at: '2026-01-01', updated_at: '2026-01-01' })
  afterEach(() => vi.useRealTimers())

  it('should_render_tier_selector_before_jumping_checkbox', () => {
    render(<LessonForm timezone={'America/New_York'} {...baseProps} />)
    const tierSelect = screen.getByRole('combobox', { name: /tier/i })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(tierSelect.compareDocumentPosition(jumpingCheckbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('should_cascade_default_jumping_true_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_cascade_default_jumping_false_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noJumpTier = createMockLessonTier({ id: 't-nojump', name: 'No Jump', default_jumping: false })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, noJumpTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-nojump' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_cascade_default_exertion_into_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_first_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e1 = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(e1.value).toBe('2')
  })

  it('should_cascade_default_exertion_into_second_checked_horse_when_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse, horse2]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Lightning/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    const e2 = screen.getByRole('spinbutton', { name: /Exertion level for Lightning/i }) as HTMLInputElement
    expect(e2.value).toBe('2')
  })

  it('should_not_cascade_jumping_when_tier_default_jumping_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_jumping: null })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, nullTier]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('true')
  })

  it('should_not_cascade_exertion_when_tier_default_exertion_is_null', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const nullTier = createMockLessonTier({ id: 't-null', name: 'Null Tier', default_exertion_level: null })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, nullTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    fireEvent.change(exertionInput, { target: { value: '5' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-null' } })
    expect(exertionInput.value).toBe('5')
  })

  it('should_reset_jumping_to_off_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_jumping: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const jumpingInput = container.querySelector('input[name="jumping"]') as HTMLInputElement
    expect(jumpingInput.value).toBe('false')
  })

  it('should_reset_exertion_to_3_for_checked_horses_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, default_exertion_level: 5 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('3')
  })

  it('should_use_tier_default_exertion_when_horse_checked_after_tier_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('2')
  })

  it('should_use_jumping_fallback_when_tier_has_no_default_exertion_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const noExTier = createMockLessonTier({ id: 't-noex', name: 'No Exertion', default_exertion_level: null })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, noExTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-noex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_not_crash_when_selected_tier_id_is_unknown', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const { container } = render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    const select = screen.getByRole('combobox', { name: /tier/i }) as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'nonexistent-id' } })
    expect(container.querySelector('form')).not.toBeNull()
  })

  it('should_bump_exertion_to_4_when_jumping_toggled_on_over_tier_default_below_4', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const exertionTier = createMockLessonTier({ id: 't-ex', name: 'Exertion Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, exertionTier]} horses={[horse]} />)
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-ex' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })

  it('should_flash_jumping_when_tier_cascades_default_jumping', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).toContain('ring-2')
  })

  it('should_clear_flash_after_600ms', async () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const jumpTier = createMockLessonTier({ id: 't-jump', name: 'Jump Tier', default_jumping: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, jumpTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-jump' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).not.toContain('ring-2')
  })

  it('should_not_flash_jumping_when_custom_selected_and_jumping_already_off', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    const jumpingCheckbox = screen.getByRole('checkbox', { name: /jumping/i })
    expect(jumpingCheckbox.className).not.toContain('ring-2')
  })

  it('should_reset_fee_to_blank_when_custom_selected', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.value).toBe('')
  })

  it('should_flash_fee_when_tier_cascades_price', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).toContain('ring-2')
  })

  it('should_clear_fee_flash_after_600ms', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true, price: 60 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-base' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).not.toContain('ring-2')
  })

  it('should_not_flash_fee_when_custom_selected_and_fee_already_blank', () => {
    vi.useFakeTimers()
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier]} />)
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    act(() => {
      vi.advanceTimersByTime(600)
    })
    act(() => {
      fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: '__custom__' } })
    })
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i })
    expect(feeInput.className).not.toContain('ring-2')
  })

  it('should_floor_exertion_at_4_when_tier_default_below_4_and_jumping_on_and_horse_checked', () => {
    const baseTier = createMockLessonTier({ id: 't-base', is_default: true })
    const lowTier = createMockLessonTier({ id: 't-low', name: 'Low Tier', default_exertion_level: 2 })
    render(<LessonForm timezone={'America/New_York'} {...baseProps} tiers={[baseTier, lowTier]} horses={[horse]} />)
    fireEvent.change(screen.getByRole('combobox', { name: /tier/i }), { target: { value: 't-low' } })
    fireEvent.click(screen.getByRole('checkbox', { name: /jumping/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Thunder/i }))
    const exertionInput = screen.getByRole('spinbutton', { name: /Exertion level for Thunder/i }) as HTMLInputElement
    expect(exertionInput.value).toBe('4')
  })
})
