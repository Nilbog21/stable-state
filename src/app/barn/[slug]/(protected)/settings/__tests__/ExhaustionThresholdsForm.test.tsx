import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn } from '@/test/fixtures'
import { ExhaustionThresholdsForm } from '../ExhaustionThresholdsForm'

afterEach(() => vi.restoreAllMocks())

const mockAction = vi.fn().mockResolvedValue({ error: null })
const mockBarn = createMockBarn({ exhaustion_threshold_moderate: 5, exhaustion_threshold_high: 11 })

describe('ExhaustionThresholdsForm', () => {
  it('should_render_moderate_field_with_current_value', () => {
    render(<ExhaustionThresholdsForm barn={mockBarn} action={mockAction} />)

    expect((screen.getByLabelText(/moderate threshold/i) as HTMLInputElement).value).toBe('5')
  })

  it('should_render_high_field_with_current_value', () => {
    render(<ExhaustionThresholdsForm barn={mockBarn} action={mockAction} />)

    expect((screen.getByLabelText(/high threshold/i) as HTMLInputElement).value).toBe('11')
  })

  it('should_render_save_button', () => {
    render(<ExhaustionThresholdsForm barn={mockBarn} action={mockAction} />)

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_show_error_initially', () => {
    render(<ExhaustionThresholdsForm barn={mockBarn} action={mockAction} />)

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi
      .fn()
      .mockResolvedValue({ error: 'Moderate threshold must be less than high threshold' })
    render(<ExhaustionThresholdsForm barn={mockBarn} action={failingAction} />)

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(
      await screen.findByText('Moderate threshold must be less than high threshold')
    ).toBeDefined()
  })
})
