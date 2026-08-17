import { describe, it, expect } from 'vitest'
import { getMonthGrid, shiftMonth, computeDayDecorations, browseDayDecorations, type DayDecorationOptions } from '../month-calendar'
import { createMockScheduleItem as item } from '@/test/fixtures'
import { calendarDate } from '../local-day'

const baseOpts: DayDecorationOptions = {
  selectedHorseIds: [],
  selectedRiderIds: [],
  hour: 12,
  thresholdsByHorseId: {},
  todayStr: calendarDate('2026-03-01'),
  excludeItemId: null,
}

describe('getMonthGrid', () => {
  it('should_return_42_dates_so_the_grid_height_never_changes', () => {
    expect(getMonthGrid('2026-03')).toHaveLength(42)
  })

  it('should_start_on_the_first_of_the_month_when_that_day_is_a_sunday', () => {
    expect(getMonthGrid('2026-03')[0]).toBe('2026-03-01')
  })

  it('should_spill_back_to_the_preceding_sunday_when_the_first_is_mid_week', () => {
    expect(getMonthGrid('2026-04')[0]).toBe('2026-03-29')
  })

  it('should_spill_forward_into_the_following_month_to_fill_the_last_row', () => {
    expect(getMonthGrid('2026-04')[41]).toBe('2026-05-09')
  })

  it('should_handle_a_leap_year_february', () => {
    expect(getMonthGrid('2024-02')[0]).toBe('2024-01-28')
  })
})

describe('shiftMonth', () => {
  it('should_advance_to_the_next_month_within_a_year', () => {
    expect(shiftMonth('2026-03', 1)).toBe('2026-04')
  })

  it('should_roll_over_into_the_next_year_from_december', () => {
    expect(shiftMonth('2026-12', 1)).toBe('2027-01')
  })

  it('should_roll_back_into_the_previous_year_from_january', () => {
    expect(shiftMonth('2026-01', -1)).toBe('2025-12')
  })
})

describe('computeDayDecorations — past days', () => {
  it('should_mark_a_day_before_today_as_past', () => {
    const result = computeDayDecorations([calendarDate('2026-02-28')], [], { ...baseOpts, todayStr: calendarDate('2026-03-01') })

    expect(result['2026-02-28'].past).toBe(true)
  })

  it('should_not_mark_today_itself_as_past', () => {
    const result = computeDayDecorations([calendarDate('2026-03-01')], [], { ...baseOpts, todayStr: calendarDate('2026-03-01') })

    expect(result['2026-03-01'].past).toBe(false)
  })

  it('should_suppress_the_exertion_band_on_a_past_day', () => {
    const result = computeDayDecorations([calendarDate('2026-02-28')],
      [item({ id: 'l1', start: '2026-02-28T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: { h1: { high: 10, moderate: 6 } } }
    )

    expect(result['2026-02-28'].band).toBeNull()
  })

  it('should_suppress_the_conflict_dot_on_a_past_day', () => {
    const result = computeDayDecorations([calendarDate('2026-02-28')],
      [item({ id: 'l1', start: '2026-02-28T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 3 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: { h1: { high: 10, moderate: 6 } } }
    )

    expect(result['2026-02-28'].conflict).toBe(false)
  })

  it('should_suppress_the_rider_flat_tint_on_a_past_day', () => {
    const result = computeDayDecorations([calendarDate('2026-02-28')],
      [item({ id: 'l1', start: '2026-02-28T12:00:00', riderIds: ['r1'] })],
      { ...baseOpts, selectedRiderIds: ['r1'] }
    )

    expect(result['2026-02-28'].scheduled).toBe(false)
  })
})

describe('computeDayDecorations — heatmap bucketing', () => {
  const thresholds = { h1: { high: 10, moderate: 6 } }

  function bandFor(totalExertion: number): string | null {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      totalExertion === 0
        ? []
        : [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: totalExertion } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )
    return result['2026-03-10'].band
  }

  it('should_band_an_empty_window_as_low', () => {
    expect(bandFor(0)).toBe('low')
  })

  it('should_band_a_total_equal_to_the_moderate_threshold_as_low', () => {
    expect(bandFor(6)).toBe('low')
  })

  it('should_band_a_total_just_above_the_moderate_threshold_as_moderate', () => {
    expect(bandFor(7)).toBe('moderate')
  })

  it('should_band_a_total_equal_to_the_high_threshold_as_moderate', () => {
    expect(bandFor(10)).toBe('moderate')
  })

  it('should_band_a_total_above_the_high_threshold_as_high', () => {
    expect(bandFor(11)).toBe('high')
  })

  it('should_sum_exertion_across_every_lesson_in_the_window', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [
        item({ id: 'l1', start: '2026-03-09T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 5 } }),
        item({ id: 'l2', start: '2026-03-11T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 5 } }),
      ],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('moderate')
  })

  it('should_ignore_exertion_belonging_to_a_horse_that_is_not_selected', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h2'], exertionByHorseId: { h2: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('low')
  })

  it('should_ignore_expenses_when_summing_exertion', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'e1', itemType: 'expense', start: '2026-03-10T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('low')
  })

  it('should_ignore_a_barn_wide_expense_when_summing_exertion', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'e1', itemType: 'expense', start: '2026-03-10T12:00:00', horseIds: [], appliesToAllHorses: true, exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('low')
  })

  it('should_return_a_null_band_when_no_horse_is_selected', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')], [], baseOpts)

    expect(result['2026-03-10'].band).toBeNull()
  })

  it('should_return_a_null_band_when_the_selected_horse_has_no_resolved_thresholds', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: {} }
    )

    expect(result['2026-03-10'].band).toBeNull()
  })
})

describe('computeDayDecorations — exertion window bounds', () => {
  const thresholds = { h1: { high: 10, moderate: 6 } }

  it('should_include_a_lesson_exactly_72_hours_before_the_target_hour', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-07T06:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, hour: 6, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('high')
  })

  it('should_exclude_a_lesson_more_than_72_hours_before_the_target_hour', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-07T05:59:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, hour: 6, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('low')
  })

  it('should_include_a_lesson_exactly_72_hours_after_the_target_hour', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-13T06:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, hour: 6, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }
    )

    expect(result['2026-03-10'].band).toBe('high')
  })

  it('should_shift_the_window_with_the_selected_hour', () => {
    const items = [item({ id: 'l1', start: '2026-03-07T06:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })]
    const opts = { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }

    const atNoon = computeDayDecorations([calendarDate('2026-03-10')], items, { ...opts, hour: 12 })

    expect(atNoon['2026-03-10'].band).toBe('low')
  })
})

describe('computeDayDecorations — worst band across selected horses', () => {
  const items = [
    item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1', 'h2'], exertionByHorseId: { h1: 2, h2: 20 } }),
  ]
  const thresholdsByHorseId = { h1: { high: 10, moderate: 6 }, h2: { high: 10, moderate: 6 } }

  it('should_take_the_worst_band_when_one_selected_horse_is_far_more_loaded', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')], items, {
      ...baseOpts,
      selectedHorseIds: ['h1', 'h2'],
      thresholdsByHorseId,
    })

    expect(result['2026-03-10'].band).toBe('high')
  })

  it('should_prefer_moderate_over_low_when_neither_horse_is_high', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1', 'h2'], exertionByHorseId: { h1: 2, h2: 8 } })],
      { ...baseOpts, selectedHorseIds: ['h1', 'h2'], thresholdsByHorseId }
    )

    expect(result['2026-03-10'].band).toBe('moderate')
  })

  it('should_respect_each_horses_own_thresholds', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1', 'h2'], exertionByHorseId: { h1: 8, h2: 8 } })],
      {
        ...baseOpts,
        selectedHorseIds: ['h1', 'h2'],
        thresholdsByHorseId: { h1: { high: 100, moderate: 50 }, h2: { high: 4, moderate: 2 } },
      }
    )

    expect(result['2026-03-10'].band).toBe('high')
  })

  it('should_band_from_the_horses_that_do_have_thresholds_when_another_selected_horse_has_none', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1', 'h2'], exertionByHorseId: { h1: 20, h2: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1', 'h2'], thresholdsByHorseId: { h2: { high: 10, moderate: 6 } } }
    )

    expect(result['2026-03-10'].band).toBe('high')
  })
})

describe('computeDayDecorations — excluded item', () => {
  const thresholds = { h1: { high: 10, moderate: 6 } }

  it('should_not_count_the_excluded_lesson_toward_the_exertion_window', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds, excludeItemId: 'l1' }
    )

    expect(result['2026-03-10'].band).toBe('low')
  })

  it('should_not_let_the_excluded_lesson_raise_a_conflict_dot', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 3 } })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds, excludeItemId: 'l1' }
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  // The appointment form edits an appointment, not a lesson — same field, hence the rename
  // from excludeLessonId (#1020).
  it('should_not_let_the_excluded_appointment_raise_a_conflict_dot', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'a1', itemType: 'expense', start: '2026-03-10T12:00:00', horseIds: ['h1'] })],
      { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds, excludeItemId: 'a1' }
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })
})

describe('computeDayDecorations — conflict dot', () => {
  const thresholds = { h1: { high: 10, moderate: 6 } }
  const horseOpts = { ...baseOpts, selectedHorseIds: ['h1'], thresholdsByHorseId: thresholds }

  it('should_flag_a_day_where_a_selected_horse_already_has_a_lesson', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 3 } })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(true)
  })

  it('should_flag_a_day_where_a_selected_horse_has_a_scheduled_expense', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'e1', itemType: 'expense', start: '2026-03-10T09:00:00', horseIds: ['h1'] })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(true)
  })

  it('should_flag_a_day_where_a_barn_wide_expense_is_scheduled', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'e1', itemType: 'expense', start: '2026-03-10T09:00:00', horseIds: [], appliesToAllHorses: true })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(true)
  })

  it('should_not_flag_a_day_whose_only_lesson_belongs_to_another_horse', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h2'], exertionByHorseId: { h2: 3 } })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  it('should_not_flag_a_day_from_a_barn_event_since_events_carry_no_horse', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'ev1', itemType: 'event', start: '2026-03-10T09:00:00', label: 'Barn closed' })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  it('should_not_flag_a_neighbouring_day_that_only_contributes_exertion', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-09T12:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 20 } })],
      horseOpts
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  it('should_not_flag_any_day_when_only_riders_are_selected', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', riderIds: ['r1'] })],
      { ...baseOpts, selectedRiderIds: ['r1'] }
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })
})

// The mirror of #1147: that fix made a barn-wide *item* conflict with a selected horse; this is
// a barn-wide *selection* — the appointment form's "All" checkbox — conflicting with whatever is
// already booked. It ticks no horses, so without this the grid goes blank exactly when the
// appointment reaches the most horses.
describe('computeDayDecorations — barn-wide selection', () => {
  const barnWideOpts = { ...baseOpts, selectionAppliesToAllHorses: true }

  it('should_flag_a_day_holding_a_lesson_for_any_horse', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h2'], exertionByHorseId: { h2: 3 } })],
      barnWideOpts
    )

    expect(result['2026-03-10'].conflict).toBe(true)
  })

  it('should_flag_a_day_holding_another_appointment', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'a1', itemType: 'expense', start: '2026-03-10T09:00:00', horseIds: ['h2'] })],
      barnWideOpts
    )

    expect(result['2026-03-10'].conflict).toBe(true)
  })

  // Same rule the horse-selection branch follows: a barn event names no horse in either
  // direction, so it is not a scheduling conflict.
  it('should_not_flag_a_day_holding_only_a_barn_event', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'ev1', itemType: 'event', start: '2026-03-10T09:00:00', label: 'Barn closed' })],
      barnWideOpts
    )

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  it('should_not_flag_an_empty_day', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')], [], barnWideOpts)

    expect(result['2026-03-10'].conflict).toBe(false)
  })

  it('should_not_tint_a_day_since_an_appointment_has_no_exertion_band', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h2'], exertionByHorseId: { h2: 20 } })],
      barnWideOpts
    )

    expect(result['2026-03-10'].band).toBeNull()
  })
})

describe('computeDayDecorations — rider-only flat tint', () => {
  it('should_tint_a_day_where_a_selected_rider_already_has_a_lesson', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', riderIds: ['r1'] })],
      { ...baseOpts, selectedRiderIds: ['r1'] }
    )

    expect(result['2026-03-10'].scheduled).toBe(true)
  })

  it('should_not_tint_a_day_whose_only_lesson_belongs_to_another_rider', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', riderIds: ['r2'] })],
      { ...baseOpts, selectedRiderIds: ['r1'] }
    )

    expect(result['2026-03-10'].scheduled).toBe(false)
  })

  it('should_drop_the_flat_tint_once_a_horse_is_also_selected', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h1'], riderIds: ['r1'], exertionByHorseId: { h1: 3 } })],
      {
        ...baseOpts,
        selectedHorseIds: ['h1'],
        selectedRiderIds: ['r1'],
        thresholdsByHorseId: { h1: { high: 10, moderate: 6 } },
      }
    )

    expect(result['2026-03-10'].scheduled).toBe(false)
  })

  it('should_leave_a_day_undecorated_when_nothing_is_selected', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10')],
      [item({ id: 'l1', start: '2026-03-10T09:00:00', horseIds: ['h1'], riderIds: ['r1'] })],
      baseOpts
    )

    expect(result['2026-03-10']).toEqual({ past: false, band: null, scheduled: false, conflict: false })
  })

  it('should_return_a_decoration_for_every_requested_date', () => {
    const result = computeDayDecorations([calendarDate('2026-03-10'), calendarDate('2026-03-11')], [], baseOpts)

    expect(Object.keys(result)).toEqual(['2026-03-10', '2026-03-11'])
  })
})

describe('browseDayDecorations', () => {
  it('should_tint_a_day_that_has_an_item', () => {
    const result = browseDayDecorations([calendarDate('2026-03-10')], [item({ start: '2026-03-10T09:00:00' })])

    expect(result['2026-03-10'].scheduled).toBe(true)
  })

  it('should_not_tint_a_day_with_nothing_on_it', () => {
    const result = browseDayDecorations([calendarDate('2026-03-10')], [item({ start: '2026-03-11T09:00:00' })])

    expect(result['2026-03-10'].scheduled).toBe(false)
  })

  // The whole reason this is not computeDayDecorations: the dashboard browses history, and
  // `past: true` would suppress the tint on every day already gone (MonthCalendarPicker's
  // tint precedence checks `past` first).
  it('should_still_tint_a_day_that_is_already_in_the_past', () => {
    const result = browseDayDecorations([calendarDate('1999-01-04')], [item({ start: '1999-01-04T09:00:00' })])

    expect(result['1999-01-04']).toEqual({ past: false, band: null, scheduled: true, conflict: false })
  })

  it('should_carry_no_band_or_conflict_signal', () => {
    const result = browseDayDecorations([calendarDate('2026-03-10')],
      [item({ start: '2026-03-10T09:00:00', horseIds: ['h1'], exertionByHorseId: { h1: 9 } })])

    expect(result['2026-03-10']).toEqual({ past: false, band: null, scheduled: true, conflict: false })
  })

  it('should_decorate_every_requested_date_when_there_are_no_items', () => {
    const result = browseDayDecorations([calendarDate('2026-03-10'), calendarDate('2026-03-11')], [])

    expect(Object.keys(result)).toEqual(['2026-03-10', '2026-03-11'])
  })
})
