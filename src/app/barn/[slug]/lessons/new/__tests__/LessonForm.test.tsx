import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { LessonForm } from '../LessonForm'

afterEach(cleanup)

const baseProps = {
  horses: [],
  riders: [],
  isManager: false,
  action: vi.fn().mockResolvedValue({ error: null }),
  instructors: [],
  currentUserId: 'user-1',
}

describe('LessonForm', () => {
  it('should_render_fee_input_with_default_value_when_defaultFee_prop_provided', () => {
    render(<LessonForm {...baseProps} defaultFee={75} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('75')
  })

  it('should_render_fee_input_with_empty_value_when_defaultFee_prop_is_null', () => {
    render(<LessonForm {...baseProps} defaultFee={null} />)
    const feeInput = screen.getByRole('spinbutton', { name: /fee/i }) as HTMLInputElement
    expect(feeInput.defaultValue).toBe('')
  })
})
