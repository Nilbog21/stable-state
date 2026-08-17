import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { createMockScheduleItem } from '@/test/fixtures'
import { MonthCalendarPicker } from '../MonthCalendarPicker'
import type { DayDecoration } from '@/lib/month-calendar'

afterEach(cleanup)

const NEUTRAL: DayDecoration = { past: false, band: null, scheduled: false, conflict: false }

function decorate(overrides: Record<string, Partial<DayDecoration>> = {}): Record<string, DayDecoration> {
  return Object.fromEntries(Object.entries(overrides).map(([date, d]) => [date, { ...NEUTRAL, ...d }]))
}

function renderPicker(props: Partial<React.ComponentProps<typeof MonthCalendarPicker>> = {}) {
  return render(
    <MonthCalendarPicker
      value="2026-03-10"
      onChange={vi.fn()}
      month="2026-03"
      onMonthChange={vi.fn()}
      decorations={decorate()}
      items={[]}
      describeItem={() => 'Lesson'}
      label="Date"
      {...props}
    />
  )
}

describe('MonthCalendarPicker — grid', () => {
  it('should_render_a_button_for_every_day_of_the_42_cell_grid', () => {
    renderPicker()

    expect(screen.getAllByRole('button', { name: /^\d{4}-\d{2}-\d{2}$/ })).toHaveLength(42)
  })

  it('should_show_the_month_and_year_in_the_header', () => {
    renderPicker()

    expect(screen.getByText('March 2026')).toBeDefined()
  })

  it('should_render_the_supplied_field_label', () => {
    renderPicker({ label: 'Starting Date' })

    expect(screen.getByText('Starting Date')).toBeDefined()
  })

  it('should_mark_the_selected_day_as_pressed', () => {
    renderPicker({ value: '2026-03-10' })

    expect(screen.getByRole('button', { name: '2026-03-10' }).getAttribute('aria-pressed')).toBe('true')
  })

  it('should_not_mark_an_unselected_day_as_pressed', () => {
    renderPicker({ value: '2026-03-10' })

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('aria-pressed')).toBe('false')
  })
})

describe('MonthCalendarPicker — month navigation', () => {
  it('should_move_to_the_previous_month', () => {
    const onMonthChange = vi.fn()
    renderPicker({ onMonthChange })

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }))

    expect(onMonthChange).toHaveBeenCalledWith('2026-02')
  })

  it('should_move_to_the_next_month', () => {
    const onMonthChange = vi.fn()
    renderPicker({ onMonthChange })

    fireEvent.click(screen.getByRole('button', { name: 'Next month' }))

    expect(onMonthChange).toHaveBeenCalledWith('2026-04')
  })
})

describe('MonthCalendarPicker — day decoration', () => {
  it('should_flag_a_past_day_as_past', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { past: true } }) })

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('data-past')).toBe('true')
  })

  it('should_expose_the_exertion_band_on_the_day_cell', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { band: 'high' } }) })

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('data-band')).toBe('high')
  })

  it('should_expose_the_flat_scheduled_tint_on_the_day_cell', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { scheduled: true } }) })

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('data-scheduled')).toBe('true')
  })

  it('should_render_a_conflict_dot_on_a_conflicting_day', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { conflict: true } }) })

    expect(screen.getByTestId('conflict-dot-2026-03-11')).toBeDefined()
  })

  it('should_paint_the_conflict_dot_in_the_day_cells_own_text_colour', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { conflict: true } }) })

    const dot = screen.getByTestId('conflict-dot-2026-03-11')
    expect(dot.className).toContain('bg-current')
    expect(dot.className).not.toMatch(/bg-red-/)
  })

  it('should_not_render_a_conflict_dot_on_a_clear_day', () => {
    renderPicker({ decorations: decorate({ '2026-03-11': { conflict: false } }) })

    expect(screen.queryByTestId('conflict-dot-2026-03-11')).toBeNull()
  })

  it('should_fall_back_to_a_neutral_cell_when_a_date_has_no_decoration', () => {
    renderPicker({ decorations: {} })

    expect(screen.getByRole('button', { name: '2026-03-11' }).getAttribute('data-band')).toBeNull()
  })

  it('should_dim_a_day_that_spills_in_from_an_adjacent_month', () => {
    renderPicker({ month: '2026-04' })

    expect(screen.getByRole('button', { name: '2026-03-30' }).getAttribute('data-outside')).toBe('true')
  })

  it('should_not_dim_a_day_belonging_to_the_displayed_month', () => {
    renderPicker({ month: '2026-04' })

    expect(screen.getByRole('button', { name: '2026-04-01' }).getAttribute('data-outside')).toBe('false')
  })
})

describe('MonthCalendarPicker — selecting a day', () => {
  it('should_report_the_tapped_day_to_onChange', () => {
    const onChange = vi.fn()
    renderPicker({ onChange })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(onChange).toHaveBeenCalledWith('2026-03-11')
  })

  it('should_open_that_days_schedule_popup', () => {
    renderPicker({
      items: [createMockScheduleItem({ id: 'l1', start: '2026-03-11T14:00:00' })],
      describeItem: () => 'Lesson — Bella',
    })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('Lesson — Bella')).toBeDefined()
  })

  it('should_show_the_item_time_in_12_hour_format', () => {
    renderPicker({ items: [createMockScheduleItem({ id: 'l1', start: '2026-03-11T14:00:00' })] })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('2:00 PM')).toBeDefined()
  })

  it('should_omit_items_belonging_to_other_days_from_the_popup', () => {
    renderPicker({
      items: [createMockScheduleItem({ id: 'l1', start: '2026-03-12T14:00:00' })],
      describeItem: () => 'Lesson — Bella',
    })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.queryByText('Lesson — Bella')).toBeNull()
  })

  it('should_tell_the_user_when_the_tapped_day_is_empty', () => {
    renderPicker({ items: [] })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('Nothing scheduled for this day.')).toBeDefined()
  })

  it('should_name_the_tapped_day_in_the_popup_heading', () => {
    renderPicker()

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('Wednesday, Mar 11')).toBeDefined()
  })

  it('should_close_the_popup_from_its_close_button', () => {
    renderPicker({ items: [] })
    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))

    expect(screen.queryByText('Nothing scheduled for this day.')).toBeNull()
  })
})

// #1021 — the lesson form hosts its start-time field inside this panel, so the panel stops being
// a transient popup there and becomes a form field: open from first render, no Close button.
// ExpenseForm passes neither prop and keeps the tap-to-open, dismissible popup asserted above.
describe('MonthCalendarPicker — day panel', () => {
  it('should_render_a_supplied_dayPanel_in_the_open_panel', () => {
    renderPicker({ dayPanel: <p>start time field</p> })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('start time field')).toBeDefined()
  })

  it('should_not_render_a_supplied_dayPanel_before_a_day_is_tapped', () => {
    renderPicker({ dayPanel: <p>start time field</p> })

    expect(screen.queryByText('start time field')).toBeNull()
  })

  it('should_open_the_panel_on_the_selected_day_from_first_render_when_always_open', () => {
    renderPicker({ value: '2026-03-10', dayPanelAlwaysOpen: true })

    expect(screen.getByText('Tuesday, Mar 10')).toBeDefined()
  })

  it('should_render_the_dayPanel_from_first_render_when_always_open', () => {
    renderPicker({ dayPanel: <p>start time field</p>, dayPanelAlwaysOpen: true })

    expect(screen.getByText('start time field')).toBeDefined()
  })

  it('should_show_the_selected_days_schedule_from_first_render_when_always_open', () => {
    renderPicker({
      value: '2026-03-10',
      dayPanelAlwaysOpen: true,
      items: [createMockScheduleItem({ id: 'l1', start: '2026-03-10T14:00:00' })],
      describeItem: () => 'Lesson — Bella',
    })

    expect(screen.getByText('Lesson — Bella')).toBeDefined()
  })

  it('should_not_offer_a_close_button_when_always_open', () => {
    renderPicker({ dayPanelAlwaysOpen: true })

    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
  })

  it('should_follow_the_tapped_day_when_always_open', () => {
    renderPicker({ value: '2026-03-10', dayPanelAlwaysOpen: true })

    fireEvent.click(screen.getByRole('button', { name: '2026-03-11' }))

    expect(screen.getByText('Wednesday, Mar 11')).toBeDefined()
  })
})
