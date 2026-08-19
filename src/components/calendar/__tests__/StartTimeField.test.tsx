import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { StartTimeField } from '../StartTimeField'

afterEach(cleanup)

// The minute-granular replacement for DateHourPicker's hour <select> (#1021), shared by the
// lesson and barn-event forms since #1645. Every expectation below is barn-local
// (America/New_York), never the host's zone — 20:30Z is 4:30 PM EDT (UTC-4).
//
// No clock is pinned here, and its absence is the point since #1578: the component no longer
// reads the clock at all. Every test that needs a time in the field supplies one through
// `initialTime`, which is also what the edit form does.
describe('StartTimeField', () => {
  // The lesson form's pair, so the moved cases below read exactly as they did when the field
  // hard-coded them. `id`/`name` are exercised as *parameters* by the two tests at the end.
  const ids = { id: 'lesson-start-time', name: 'lesson_at' }

  function hidden(container: HTMLElement, name = 'lesson_at') {
    return container.querySelector(`input[name="${name}"]`) as HTMLInputElement | null
  }

  it('should_render_a_time_input', () => {
    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" />)

    expect(screen.getByLabelText('Start Time')).toBeDefined()
  })

  it('should_accept_minutes_rather_than_whole_hours_only', () => {
    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" />)

    // step=60 (seconds) is what makes the native control minute-granular rather than
    // hour-granular; the whole point of #1021.
    expect(screen.getByLabelText('Start Time').getAttribute('step')).toBe('60')
  })

  // #1578 — the create form supplies no `initialTime`, and the field opening empty is what makes
  // `required` able to catch a manager who never looked at it. The pre-#1578 fallback to the top
  // of the barn's current hour was never a value the user chose, and a wrong one was invisible.
  it('should_default_to_an_empty_time_when_no_initialTime_is_given', () => {
    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" />)

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('')
  })

  it('should_omit_the_hidden_input_when_no_initialTime_is_given', () => {
    const { container } = render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" />)

    expect(hidden(container)).toBeNull()
  })

  it('should_use_initialTime_when_provided', () => {
    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="16:30" />)

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('16:30')
  })

  it('should_combine_date_and_time_into_the_hidden_field_as_a_utc_instant', () => {
    const { container } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="14:00" />
    )

    // 2026-06-01 14:00 America/New_York (EDT, UTC-4) => 18:00 UTC
    expect(hidden(container)!.value).toBe('2026-06-01T18:00:00.000Z')
  })

  it('should_carry_the_minutes_through_into_the_hidden_field', () => {
    const { container } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="16:30" />
    )

    // The #1021 bug in one assertion: the old picker rendered this as 20:00:00.000Z.
    expect(hidden(container)!.value).toBe('2026-06-01T20:30:00.000Z')
  })

  it('should_account_for_standard_time_offset_distinct_from_daylight_saving_offset', () => {
    // Jan 15 is EST (UTC-5), unlike the EDT (UTC-4) dates used elsewhere here — catches a
    // hardcoded offset.
    const { container } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-01-15" initialTime="16:45" />
    )

    expect(hidden(container)!.value).toBe('2026-01-15T21:45:00.000Z')
  })

  it('should_update_the_hidden_field_when_the_time_changes', () => {
    const { container } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="14:00" />
    )

    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '09:15' } })

    expect(hidden(container)!.value).toBe('2026-06-01T13:15:00.000Z')
  })

  it('should_omit_the_hidden_input_when_the_date_is_empty', () => {
    const { container } = render(<StartTimeField {...ids} timezone="America/New_York" date="" />)

    expect(hidden(container)).toBeNull()
  })

  // A native time input reports '' whenever the user clears it — select-all-and-delete, or
  // backspacing through the segments. The old hour `<select>` could never emit that, so the
  // empty branch is new with #1021. Unguarded, `wallClockToInstant('2026-06-01T:00', tz)` builds
  // an Invalid Date and throws RangeError out of `Intl.DateTimeFormat.formatToParts` *during
  // render*, unmounting the whole form and discarding every other field the user had filled in.
  //
  // The three below seed `initialTime` since #1578: with the field opening empty, clearing an
  // already-empty field would exercise nothing and all three would pass vacuously.
  it('should_not_throw_when_the_time_is_cleared', () => {
    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="14:00" />)

    expect(() =>
      fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '' } })
    ).not.toThrow()
  })

  it('should_omit_the_hidden_input_when_the_time_is_cleared', () => {
    const { container } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="14:00" />
    )

    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '' } })

    expect(hidden(container)).toBeNull()
  })

  it('should_call_onChange_with_an_empty_string_when_the_time_is_cleared', () => {
    const onChange = vi.fn()
    render(
      <StartTimeField
        {...ids}
        timezone="America/New_York"
        date="2026-06-01"
        initialTime="14:00"
        onChange={onChange}
      />
    )

    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '' } })

    expect(onChange).toHaveBeenLastCalledWith('')
  })

  // The edit form's prefill reaching `LessonForm`'s `lessonAt` state, which is what gates its
  // exhaustion fetch and its past-lesson check — the seeded value has to arrive without the user
  // touching the field.
  it('should_call_onChange_with_the_combined_value_on_mount', () => {
    const onChange = vi.fn()

    render(
      <StartTimeField
        {...ids}
        timezone="America/New_York"
        date="2026-06-01"
        initialTime="14:00"
        onChange={onChange}
      />
    )

    expect(onChange).toHaveBeenCalledWith('2026-06-01T18:00:00.000Z')
  })

  // The create form's mount, since #1578. `LessonForm` leans on this being `''` rather than
  // merely unset: it is the signal that no time has been entered, which is what selects
  // `estimateAt`'s stand-in instant (the selected day at the barn's current hour) over the real
  // one — and what `parseLessonFormData` rejects if the field is never filled. It does NOT keep
  // the exhaustion bars off; the estimate is there precisely so they stay up meanwhile.
  it('should_call_onChange_with_an_empty_string_on_mount_when_no_initialTime_is_given', () => {
    const onChange = vi.fn()

    render(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('should_call_onChange_with_an_empty_string_when_the_date_is_empty', () => {
    const onChange = vi.fn()

    render(<StartTimeField {...ids} timezone="America/New_York" date="" onChange={onChange} />)

    expect(onChange).toHaveBeenCalledWith('')
  })

  it('should_recombine_against_a_new_date_supplied_by_the_calendar', () => {
    const { container, rerender } = render(
      <StartTimeField {...ids} timezone="America/New_York" date="2026-06-01" initialTime="16:30" />
    )

    rerender(<StartTimeField {...ids} timezone="America/New_York" date="2026-06-15" initialTime="16:30" />)

    expect(hidden(container)!.value).toBe('2026-06-15T20:30:00.000Z')
  })

  // #1645 — the two props that made this shared. `EventForm` submits the same field under
  // `event_at` and needs its own `id`, since two of these can never coexist on one page but the
  // e2e specs address each form's field by id.
  it('should_name_the_hidden_input_from_the_name_prop', () => {
    const { container } = render(
      <StartTimeField id="event-start-time" name="event_at" timezone="America/New_York" date="2026-06-01" initialTime="16:30" />
    )

    expect(hidden(container, 'event_at')!.value).toBe('2026-06-01T20:30:00.000Z')
  })

  it('should_bind_the_label_to_the_time_input_through_the_id_prop', () => {
    render(
      <StartTimeField id="event-start-time" name="event_at" timezone="America/New_York" date="2026-06-01" />
    )

    expect(screen.getByLabelText('Start Time').getAttribute('id')).toBe('event-start-time')
  })
})
