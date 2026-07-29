import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { DateHourPicker } from '../DateHourPicker'

afterEach(cleanup)

describe('DateHourPicker', () => {
  let originalTz: string | undefined

  beforeEach(() => {
    originalTz = process.env.TZ
    process.env.TZ = 'America/New_York'
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T14:30:00'))
  })

  afterEach(() => {
    vi.useRealTimers()
    process.env.TZ = originalTz
  })

  it('should_render_a_date_input', () => {
    render(<DateHourPicker />)
    expect(screen.getByLabelText('Date')).toBeDefined()
  })

  it('should_default_date_label_to_Date_when_not_provided', () => {
    render(<DateHourPicker />)
    expect(screen.getByText('Date')).toBeDefined()
  })

  it('should_use_custom_dateLabel_when_provided', () => {
    render(<DateHourPicker dateLabel="Starting Date" />)
    expect(screen.getByLabelText('Starting Date')).toBeDefined()
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

  it('should_combine_date_and_hour_into_hidden_lesson_at_as_a_utc_instant', () => {
    const { container } = render(<DateHourPicker />)
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    // 2026-06-01 14:00 America/New_York (EDT, UTC-4) => 18:00 UTC
    expect(hidden.value).toBe('2026-06-01T18:00:00.000Z')
  })

  it('should_update_hidden_input_when_date_changes', () => {
    const { container } = render(<DateHourPicker />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-06-15T18:00:00.000Z')
  })

  it('should_update_hidden_input_when_hour_changes', () => {
    const { container } = render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    fireEvent.change(select, { target: { value: '9' } })
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-06-01T13:00:00.000Z')
  })

  it('should_account_for_standard_time_offset_distinct_from_daylight_saving_offset', () => {
    // Jan 15 is EST (UTC-5, standard time) in America/New_York, unlike the DST
    // (UTC-4) dates used elsewhere in this file — catches a hardcoded offset.
    const { container } = render(<DateHourPicker initialDate="2026-01-15" initialHour={16} />)
    const hidden = container.querySelector('input[name="lesson_at"]') as HTMLInputElement
    expect(hidden.value).toBe('2026-01-15T21:00:00.000Z')
  })

  it('should_omit_hidden_input_when_date_is_cleared', () => {
    const { container } = render(<DateHourPicker />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(container.querySelector('input[name="lesson_at"]')).toBeNull()
  })

  it('should_use_initialDate_prop_when_provided', () => {
    const { container } = render(<DateHourPicker initialDate="2026-03-15" />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    expect(dateInput.value).toBe('2026-03-15')
  })

  it('should_use_initialHour_prop_when_provided', () => {
    render(<DateHourPicker initialHour={9} />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.value).toBe('9')
  })

  it('should_display_midnight_as_12_00_AM', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.options[0].text).toBe('12:00 AM')
  })

  it('should_display_1am_as_1_00_AM', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.options[1].text).toBe('1:00 AM')
  })

  it('should_display_noon_as_12_00_PM', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.options[12].text).toBe('12:00 PM')
  })

  it('should_display_11pm_as_11_00_PM', () => {
    render(<DateHourPicker />)
    const select = screen.getByLabelText('Hour') as HTMLSelectElement
    expect(select.options[23].text).toBe('11:00 PM')
  })

  it('should_call_onChange_with_combined_value_on_mount', () => {
    const onChange = vi.fn()
    render(<DateHourPicker onChange={onChange} />)
    expect(onChange).toHaveBeenCalledWith('2026-06-01T18:00:00.000Z')
  })

  it('should_call_onChange_with_updated_value_when_date_changes', () => {
    const onChange = vi.fn()
    const { container } = render(<DateHourPicker onChange={onChange} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-06-15' } })
    expect(onChange).toHaveBeenCalledWith('2026-06-15T18:00:00.000Z')
  })

  it('should_call_onChange_with_empty_string_when_date_is_cleared', () => {
    const onChange = vi.fn()
    const { container } = render(<DateHourPicker onChange={onChange} />)
    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith('')
  })

  // #1019 — the lesson form swaps the native date input for a month conflict calendar,
  // while EventForm keeps the plain input.
  it('should_render_the_native_date_input_when_no_renderDate_is_supplied', () => {
    const { container } = render(<DateHourPicker />)
    expect(container.querySelector('input[type="date"]')).not.toBeNull()
  })

  it('should_replace_the_native_date_input_when_renderDate_is_supplied', () => {
    const { container } = render(<DateHourPicker renderDate={() => <div>custom</div>} />)
    expect(container.querySelector('input[type="date"]')).toBeNull()
  })

  it('should_render_the_supplied_date_control', () => {
    render(<DateHourPicker renderDate={() => <div>custom</div>} />)
    expect(screen.getByText('custom')).toBeDefined()
  })

  it('should_hand_the_current_date_to_renderDate', () => {
    render(<DateHourPicker initialDate="2026-06-15" renderDate={(value) => <div>{value}</div>} />)
    expect(screen.getByText('2026-06-15')).toBeDefined()
  })

  it('should_let_the_supplied_date_control_change_the_date', () => {
    const onChange = vi.fn()
    render(
      <DateHourPicker
        onChange={onChange}
        renderDate={(_value, setValue) => <button onClick={() => setValue('2026-06-15')}>pick</button>}
      />
    )

    fireEvent.click(screen.getByText('pick'))

    expect(onChange).toHaveBeenCalledWith('2026-06-15T18:00:00.000Z')
  })

  it('should_still_submit_lesson_at_when_a_custom_date_control_is_used', () => {
    const { container } = render(<DateHourPicker initialDate="2026-06-15" renderDate={() => <div>custom</div>} />)
    expect((container.querySelector('input[name="lesson_at"]') as HTMLInputElement).value).toBe('2026-06-15T18:00:00.000Z')
  })
})
