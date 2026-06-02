import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DateHourPicker } from '../DateHourPicker'

afterEach(cleanup)

describe('DateHourPicker', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T14:30:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('should_render_a_date_input', () => {
    render(<DateHourPicker />)
    expect(screen.getByLabelText('Date')).toBeDefined()
  })

  it('should_render_hour_selector_with_24_options', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.options.length).toBe(24)
  })

  it('should_default_date_to_today', () => {
    const { container } = render(<DateHourPicker />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-06-01')
  })

  it('should_default_hour_to_current_hour', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.value).toBe('14')
  })

  it('should_combine_date_and_hour_into_hidden_lesson_at', () => {
    const { container } = render(<DateHourPicker />)
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-06-01T14:00')
  })

  it('should_update_hidden_input_when_date_changes', () => {
    const { container } = render(<DateHourPicker />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-06-15T14:00')
  })

  it('should_update_hidden_input_when_hour_changes', () => {
    const { container } = render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '9' } })
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-06-01T09:00')
  })

  it('should_omit_hidden_input_when_date_is_cleared', () => {
    const { container } = render(<DateHourPicker />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(container.querySelector('input[name="lesson_at"]')).toBeNull()
  })
})
