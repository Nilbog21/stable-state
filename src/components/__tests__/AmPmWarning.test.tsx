import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { AmPmWarning } from '../AmPmWarning'

afterEach(cleanup)

// #1646. Chrome for Android's clock dialog marks the AM/PM selection with text brightness
// alone, and no page CSS reaches it, so the swap is caught by its consequence instead: a time
// that lands in the 8 PM–8 AM window. Every expectation here is on the bare "HH:MM" wall clock
// the native input produces — the component reads no clock and no zone, which is why nothing
// below pins a system time.
describe('AmPmWarning', () => {
  const text = () => screen.queryByText(/Check AM\/PM/)

  it('should_render_nothing_for_an_empty_value', () => {
    render(<AmPmWarning value="" />)

    expect(text()).toBeNull()
  })

  it('should_render_nothing_for_a_midday_time', () => {
    render(<AmPmWarning value="12:00" />)

    expect(text()).toBeNull()
  })

  // The copy puts both readings side by side, which is the one thing the dialog didn't.
  it('should_name_both_readings_of_an_8_pm_start', () => {
    render(<AmPmWarning value="20:00" />)

    expect(screen.getByText('Check AM/PM — this is 8:00 PM, not 8:00 AM.')).toBeDefined()
  })

  // The four boundaries of the >= 20:00 or < 08:00 window, one assertion each.
  it('should_warn_one_minute_before_the_morning_boundary', () => {
    render(<AmPmWarning value="07:59" />)

    expect(text()).not.toBeNull()
  })

  it('should_stay_silent_at_the_morning_boundary', () => {
    render(<AmPmWarning value="08:00" />)

    expect(text()).toBeNull()
  })

  it('should_stay_silent_one_minute_before_the_evening_boundary', () => {
    render(<AmPmWarning value="19:59" />)

    expect(text()).toBeNull()
  })

  it('should_warn_at_the_evening_boundary', () => {
    render(<AmPmWarning value="20:00" />)

    expect(text()).not.toBeNull()
  })

  // Hour 0 is the case a naive `h % 12` renders as "0:30"; 12-hour clocks call it 12.
  it('should_render_the_midnight_hour_as_12', () => {
    render(<AmPmWarning value="00:30" />)

    expect(screen.getByText('Check AM/PM — this is 12:30 AM, not 12:30 PM.')).toBeDefined()
  })

  // `ExpenseForm`'s edit path seeds its time field from `appointments.expense_time`, a Postgres
  // `time` that arrives as "HH:MM:SS" — so the value reaching this component is not always the
  // five characters the native input emits.
  it('should_handle_a_seconds_bearing_value_from_the_edit_form', () => {
    render(<AmPmWarning value="20:00:00" />)

    expect(screen.getByText('Check AM/PM — this is 8:00 PM, not 8:00 AM.')).toBeDefined()
  })
})
