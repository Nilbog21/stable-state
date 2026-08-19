import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { createMockBarnEvent, createMockScheduleItem, instant } from '@/test/fixtures'
import { EventForm } from '../EventForm'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const mockAction = vi.fn().mockResolvedValue({ error: null })

// The event every edit-mode test below is opened on: 22:30Z is 6:30 PM in the barn's Eastern
// (EDT, UTC-4). The half hour is load-bearing — it is the minute the old whole-hour picker threw
// away on every save (#1645), so a form that truncates fails here rather than in a later phase.
const EVENT_DAY = '2026-07-01'
const eventAtSixThirty = createMockBarnEvent({ event_at: instant('2026-07-01T22:30:00Z') })

function noSchedule() {
  return vi.fn().mockResolvedValue([])
}

function renderNew(getScheduleRange = noSchedule()) {
  return render(
    <EventForm timezone="America/New_York" mode="new" action={mockAction} getScheduleRange={getScheduleRange} />
  )
}

function renderEdit(getScheduleRange = noSchedule(), event = eventAtSixThirty) {
  return render(
    <EventForm
      timezone="America/New_York"
      mode="edit"
      initialEvent={event}
      action={mockAction}
      deleteHref="/delete"
      getScheduleRange={getScheduleRange}
    />
  )
}

function dayCell(date: string) {
  return screen.getByRole('button', { name: date })
}

function hiddenEventAt(container: HTMLElement) {
  return container.querySelector('input[name="event_at"]') as HTMLInputElement | null
}

describe('EventForm — fields', () => {
  it('should_render_title_field', () => {
    renderNew()

    expect(screen.getByLabelText(/title/i)).toBeDefined()
  })

  it('should_update_title_value_on_change', () => {
    renderNew()

    fireEvent.change(screen.getByLabelText(/title/i), { target: { value: 'Costume Party' } })

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('Costume Party')
  })

  it('should_render_notes_field', () => {
    renderNew()

    expect(screen.getByLabelText(/notes/i)).toBeDefined()
  })

  it('should_render_a_checkbox_for_each_role', () => {
    renderNew()

    expect(screen.getByLabelText(/^manager$/i)).toBeDefined()
    expect(screen.getByLabelText(/^trainer$/i)).toBeDefined()
    expect(screen.getByLabelText(/^rider$/i)).toBeDefined()
  })

  it('should_default_all_role_checkboxes_to_checked', () => {
    renderNew()

    expect((screen.getByLabelText(/^manager$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^trainer$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^rider$/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_save_button', () => {
    renderNew()

    expect(screen.getByRole('button', { name: /save/i })).toBeDefined()
  })

  it('should_not_render_delete_link_in_new_mode', () => {
    renderNew()

    expect(screen.queryByRole('link', { name: /delete/i })).toBeNull()
  })

  it('should_display_error_message_when_action_returns_error', async () => {
    const failingAction = vi.fn().mockResolvedValue({ error: 'Title is required' })
    render(
      <EventForm timezone="America/New_York" mode="new" action={failingAction} getScheduleRange={noSchedule()} />
    )

    fireEvent.submit(screen.getByRole('button', { name: /save/i }).closest('form')!)

    expect(await screen.findByText('Title is required')).toBeDefined()
  })

  it('should_not_show_error_before_submission', () => {
    renderNew()

    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('should_render_title_field_with_initial_value', () => {
    renderEdit()

    expect((screen.getByLabelText(/title/i) as HTMLInputElement).value).toBe('Costume Party')
  })

  it('should_render_notes_field_with_initial_value', () => {
    renderEdit(noSchedule(), createMockBarnEvent({ event_at: instant('2026-07-01T22:30:00Z'), notes: 'Bring candy' }))

    expect((screen.getByLabelText(/notes/i) as HTMLTextAreaElement).value).toBe('Bring candy')
  })

  it('should_check_only_roles_present_in_visible_to_roles', () => {
    renderEdit(
      noSchedule(),
      createMockBarnEvent({ event_at: instant('2026-07-01T22:30:00Z'), visible_to_roles: ['manager', 'rider'] })
    )

    expect((screen.getByLabelText(/^manager$/i) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByLabelText(/^trainer$/i) as HTMLInputElement).checked).toBe(false)
    expect((screen.getByLabelText(/^rider$/i) as HTMLInputElement).checked).toBe(true)
  })

  it('should_render_delete_link_in_edit_mode', () => {
    renderEdit()

    expect(screen.getByRole('link', { name: /delete/i })).toBeDefined()
  })

  it('should_point_delete_link_at_deleteHref', () => {
    renderEdit()

    expect(screen.getByRole('link', { name: /delete/i }).getAttribute('href')).toBe('/delete')
  })
})

// #1645 — the month grid replaces `DateHourPicker`'s native date box, in both modes.
describe('EventForm — month calendar', () => {
  it('should_render_the_month_grid_in_new_mode', () => {
    renderNew()

    expect(screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ })).toHaveLength(42)
  })

  it('should_render_the_month_grid_in_edit_mode', () => {
    renderEdit()

    expect(screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ })).toHaveLength(42)
  })

  it('should_label_the_calendar_Date', () => {
    renderNew()

    expect(screen.getByText('Date')).toBeDefined()
  })

  it('should_open_on_the_events_own_day_in_edit_mode', () => {
    renderEdit()

    expect(dayCell(EVENT_DAY).getAttribute('aria-pressed')).toBe('true')
  })

  it('should_open_on_the_barns_today_in_new_mode', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-15T18:30:00Z'))
    try {
      renderNew()

      expect(dayCell('2026-06-15').getAttribute('aria-pressed')).toBe('true')
    } finally {
      vi.useRealTimers()
    }
  })

  it('should_select_the_tapped_day', () => {
    renderEdit()

    fireEvent.click(dayCell('2026-07-09'))

    expect(dayCell('2026-07-09').getAttribute('aria-pressed')).toBe('true')
  })

  it('should_tint_a_day_that_holds_a_scheduled_item', async () => {
    renderEdit(
      vi.fn().mockResolvedValue([createMockScheduleItem({ start: `${EVENT_DAY}T09:00:00` })])
    )

    await waitFor(() => expect(dayCell(EVENT_DAY).getAttribute('data-scheduled')).toBe('true'))
  })

  it('should_not_tint_a_day_that_holds_nothing', async () => {
    renderEdit(
      vi.fn().mockResolvedValue([createMockScheduleItem({ start: `${EVENT_DAY}T09:00:00` })])
    )

    await waitFor(() => expect(dayCell(EVENT_DAY).getAttribute('data-scheduled')).toBe('true'))
    expect(dayCell('2026-07-03').getAttribute('data-scheduled')).toBe('false')
  })

  // `browseDayDecorations`, not `computeDayDecorations`: a past day stays plain and selectable,
  // matching what the native date box this replaced allowed.
  it('should_not_dim_a_past_day', () => {
    renderEdit()

    expect(dayCell('2026-06-30').getAttribute('data-past')).toBe('false')
  })
})

describe('EventForm — day panel', () => {
  it('should_open_the_day_panel_without_a_tap', () => {
    renderEdit()

    expect(screen.getByText('Wednesday, Jul 1')).toBeDefined()
  })

  it('should_list_a_lesson_on_that_day_by_time', async () => {
    renderEdit(vi.fn().mockResolvedValue([createMockScheduleItem({ start: `${EVENT_DAY}T09:00:00` })]))

    expect(await screen.findByText('9:00 AM')).toBeDefined()
  })

  // Lessons carry no server-built label, and naming their horses would cost this form a
  // `getHorsesByBarn` purely for a caption — the signal that matters when placing a barn-wide
  // event is that the slot is busy.
  it('should_describe_a_lesson_as_a_bare_Lesson', async () => {
    renderEdit(vi.fn().mockResolvedValue([createMockScheduleItem({ start: `${EVENT_DAY}T09:00:00` })]))

    expect(await screen.findByText('Lesson')).toBeDefined()
  })

  it('should_describe_an_appointment_by_its_server_built_label', async () => {
    renderEdit(
      vi.fn().mockResolvedValue([
        createMockScheduleItem({ id: 'appt-1', itemType: 'expense', start: `${EVENT_DAY}T11:00:00`, label: 'Veterinary — Dr. Smith' }),
      ])
    )

    expect(await screen.findByText('Veterinary — Dr. Smith')).toBeDefined()
  })

  it('should_describe_an_event_by_its_server_built_label', async () => {
    renderEdit(
      vi.fn().mockResolvedValue([
        createMockScheduleItem({ id: 'evt-2', itemType: 'event', start: `${EVENT_DAY}T14:00:00`, label: 'Costume Party' }),
      ])
    )

    expect(await screen.findByText('Costume Party')).toBeDefined()
  })

  it('should_omit_an_item_from_another_day', async () => {
    renderEdit(
      vi.fn().mockResolvedValue([
        createMockScheduleItem({ id: 'evt-3', itemType: 'event', start: '2026-07-08T14:00:00', label: 'Hauling Day' }),
      ])
    )

    await waitFor(() => expect(dayCell('2026-07-08').getAttribute('data-scheduled')).toBe('true'))
    expect(screen.queryByText('Hauling Day')).toBeNull()
  })

  it('should_say_nothing_is_scheduled_on_an_empty_day', () => {
    renderEdit()

    expect(screen.getByText('Nothing scheduled for this day.')).toBeDefined()
  })

  it('should_host_the_start_time_field_inside_the_day_panel', () => {
    renderEdit()

    expect(screen.getByLabelText('Start Time')).toBeDefined()
  })
})

describe('EventForm — start time', () => {
  it('should_open_the_start_time_empty_in_new_mode', () => {
    renderNew()

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('')
  })

  it('should_require_a_start_time', () => {
    renderNew()

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).required).toBe(true)
  })

  it('should_submit_no_event_at_until_a_time_is_entered', () => {
    const { container } = renderNew()

    expect(hiddenEventAt(container)).toBeNull()
  })

  it('should_seed_the_start_time_from_the_stored_minutes', () => {
    renderEdit()

    expect((screen.getByLabelText('Start Time') as HTMLInputElement).value).toBe('18:30')
  })

  // The #1645 regression in one assertion: the old picker seeded from the hour alone and
  // recombined at `:00`, so an untouched save rewrote 6:30 PM as 6:00 PM.
  it('should_preserve_the_minutes_when_the_time_is_never_touched', () => {
    const { container } = renderEdit()

    expect(hiddenEventAt(container)!.value).toBe('2026-07-01T22:30:00.000Z')
  })

  it('should_recombine_event_at_against_a_newly_tapped_day', () => {
    const { container } = renderEdit()

    fireEvent.click(dayCell('2026-07-09'))

    expect(hiddenEventAt(container)!.value).toBe('2026-07-09T22:30:00.000Z')
  })

  it('should_recombine_event_at_when_the_time_changes', () => {
    const { container } = renderEdit()

    fireEvent.change(screen.getByLabelText('Start Time'), { target: { value: '07:05' } })

    expect(hiddenEventAt(container)!.value).toBe('2026-07-01T11:05:00.000Z')
  })
})

// #1580's duty. The day panel is always open here, so it cannot close to avoid outliving its
// data — the range this form fetches has to keep covering the selected day however far the grid
// is paged, or the heading stays on the selected day above a silently empty body.
describe('EventForm — schedule range', () => {
  it('should_fetch_a_range_covering_the_whole_grid', async () => {
    const getScheduleRange = noSchedule()
    renderEdit(getScheduleRange)

    await waitFor(() => expect(getScheduleRange).toHaveBeenCalled())
    const [from, to] = getScheduleRange.mock.calls[0]
    // June 28 is the grid's first cell for July 2026; August 8 is the last.
    expect({ from, to }).toEqual({ from: '2026-06-28', to: '2026-08-09' })
  })

  it('should_keep_the_selected_day_inside_the_range_after_paging_two_months_away', async () => {
    const getScheduleRange = noSchedule()
    renderEdit(getScheduleRange)
    await waitFor(() => expect(getScheduleRange).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    await waitFor(() => expect(getScheduleRange.mock.calls).toHaveLength(3))
    const [from, to] = getScheduleRange.mock.calls[2]
    expect(from <= EVENT_DAY && to > EVENT_DAY).toBe(true)
  })
})
