import { describe, it, expect } from 'vitest'
import { getMonthGrid, computeDayDecorations, type DayDecoration } from '@/lib/month-calendar'
import { calendarDate } from '@/lib/local-day'
import { barnDay } from '@/lib/barn-timezone'
import type { ScheduleItem } from '@/lib/db/types'
import {
  buildLessonDates,
  getLessonVariation,
  getLessonHorseAssignment,
  getPaymentType,
  isGroupLesson,
  drawBar,
  DEV_MANAGER_2,
  PAYMENT_TYPES,
  buildExpenseSeeds,
  expenseDateFor,
  computeExhaustionWindowTotals,
  EXHAUSTION_PAST_BOUNDARY_INDEX,
  EXHAUSTION_FUTURE_BOUNDARY_INDEX,
  buildCalendarBandLessons,
  DEV_CALENDAR_BAND_THRESHOLDS,
  withEmailDomain,
  buildHorseDocumentSeeds,
} from './seed-barn'

describe('buildLessonDates', () => {
  const NOW = new Date('2024-06-15T10:00:00.000Z')

  it('should_return_35_dates', () => {
    expect(buildLessonDates(NOW)).toHaveLength(35)
  })

  it('should_place_first_9_dates_in_historical_bucket', () => {
    const dates = buildLessonDates(NOW)
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(dates.slice(0, 9).every(d => d < sevenDaysAgo)).toBe(true)
  })

  it('should_place_dates_10_to_19_in_older_than_one_week_bucket', () => {
    const dates = buildLessonDates(NOW)
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(dates.slice(9, 19).every(d => d < sevenDaysAgo)).toBe(true)
  })

  it('should_place_dates_20_to_29_in_recent_past_week_bucket', () => {
    const dates = buildLessonDates(NOW)
    const sevenDaysAgo = new Date(NOW.getTime() - 7 * 24 * 60 * 60 * 1000)
    expect(dates.slice(19, 29).every(d => d >= sevenDaysAgo && d < NOW)).toBe(true)
  })

  it('should_place_date_29_today', () => {
    const dates = buildLessonDates(NOW)
    const today = dates[29]
    expect(today.getUTCFullYear()).toBe(NOW.getUTCFullYear())
    expect(today.getUTCMonth()).toBe(NOW.getUTCMonth())
    expect(today.getUTCDate()).toBe(NOW.getUTCDate())
  })

  it('should_place_dates_30_to_34_in_future_bucket', () => {
    const dates = buildLessonDates(NOW)
    expect(dates.slice(30, 35).every(d => d > NOW)).toBe(true)
  })
})

describe('getLessonVariation', () => {
  const t1 = { name: 'T1', price: 100 }
  const t2 = { name: 'T2', price: 150 }

  it('should_return_tier1_fee_for_even_index', () => {
    expect(getLessonVariation(0, t1, t2).fee).toBe(100)
  })

  it('should_return_tier2_fee_for_odd_index', () => {
    expect(getLessonVariation(1, t1, t2).fee).toBe(150)
  })

  it('should_return_jumping_true_for_even_index', () => {
    expect(getLessonVariation(0, t1, t2).jumping).toBe(true)
  })

  it('should_return_jumping_false_for_odd_index', () => {
    expect(getLessonVariation(1, t1, t2).jumping).toBe(false)
  })

  it('should_return_exertion_5_at_index_4', () => {
    expect(getLessonVariation(4, t1, t2).exertionLevel).toBe(5)
  })

  it('should_return_exertion_1_at_index_5', () => {
    expect(getLessonVariation(5, t1, t2).exertionLevel).toBe(1)
  })
})

describe('getLessonHorseAssignment', () => {
  const horseIds = ['apple', 'butter', 'clover']
  const retiredHorseId = 'willow'

  it('should_route_the_past_boundary_index_to_the_retired_horse_only', () => {
    expect(getLessonHorseAssignment(EXHAUSTION_PAST_BOUNDARY_INDEX, horseIds, retiredHorseId).horseIds).toEqual([retiredHorseId])
  })

  it('should_route_the_future_boundary_index_to_the_retired_horse_only', () => {
    expect(getLessonHorseAssignment(EXHAUSTION_FUTURE_BOUNDARY_INDEX, horseIds, retiredHorseId).horseIds).toEqual([retiredHorseId])
  })

  it('should_return_all_horses_for_a_group_index', () => {
    expect(getLessonHorseAssignment(30, horseIds, retiredHorseId).horseIds).toEqual(horseIds)
  })

  it('should_return_a_single_cycled_horse_for_a_normal_index', () => {
    expect(getLessonHorseAssignment(27, horseIds, retiredHorseId).horseIds).toEqual([horseIds[27 % horseIds.length]])
  })
})

describe('computeExhaustionWindowTotals', () => {
  const horseIds = ['apple', 'butter', 'clover']
  const retiredHorseId = 'willow'
  const base = new Date('2026-07-07T00:00:00.000Z')
  const totalsAcrossDay = Array.from({ length: (24 * 60) / 15 }, (_, step) =>
    computeExhaustionWindowTotals(new Date(base.getTime() + step * 15 * 60 * 1000), horseIds, retiredHorseId)
  )

  it('should_keep_apple_within_the_low_band_across_a_full_day', () => {
    expect(totalsAcrossDay.every((t) => t.apple <= 5)).toBe(true)
  })

  it('should_keep_butter_within_the_moderate_band_across_a_full_day', () => {
    expect(totalsAcrossDay.every((t) => t.butter >= 6 && t.butter <= 11)).toBe(true)
  })

  it('should_keep_clover_within_the_high_band_across_a_full_day', () => {
    expect(totalsAcrossDay.every((t) => t.clover > 11)).toBe(true)
  })
})

describe('withEmailDomain', () => {
  it('should_replace_the_domain_and_keep_the_local_part', () => {
    expect(withEmailDomain('trainer1@dev.local', 'demo.local')).toBe('trainer1@demo.local')
  })

  it('should_return_the_email_unchanged_for_its_own_domain', () => {
    expect(withEmailDomain(DEV_MANAGER_2.email, 'dev.local')).toBe(DEV_MANAGER_2.email)
  })
})

describe('DEV_MANAGER_2', () => {
  it('should_have_email_as_string', () => {
    expect(typeof DEV_MANAGER_2.email).toBe('string')
  })

  it('should_have_firstName', () => {
    expect(DEV_MANAGER_2.firstName).toBeTruthy()
  })

  it('should_have_lastName', () => {
    expect(DEV_MANAGER_2.lastName).toBeTruthy()
  })
})

describe('isGroupLesson', () => {
  it('should_return_true_at_index_0', () => {
    expect(isGroupLesson(0)).toBe(true)
  })

  it('should_return_true_at_index_5', () => {
    expect(isGroupLesson(5)).toBe(true)
  })

  it('should_return_true_at_index_10', () => {
    expect(isGroupLesson(10)).toBe(true)
  })

  it('should_return_false_at_index_1', () => {
    expect(isGroupLesson(1)).toBe(false)
  })

  it('should_return_false_at_index_4', () => {
    expect(isGroupLesson(4)).toBe(false)
  })

  it('should_produce_7_group_lessons_across_34_dates', () => {
    const count = Array.from({ length: 34 }, (_, i) => i).filter(isGroupLesson).length
    expect(count).toBe(7)
  })
})

describe('drawBar', () => {
  it('should_return_all_spaces_when_current_is_zero', () => {
    expect(drawBar(0, 34)).toBe(`[${' '.repeat(20)}]`)
  })

  it('should_return_partial_bar_for_mid_progress', () => {
    expect(drawBar(17, 34)).toBe(`[${'#'.repeat(10)}${' '.repeat(10)}]`)
  })

  it('should_return_all_hashes_when_current_equals_total', () => {
    expect(drawBar(34, 34)).toBe(`[${'#'.repeat(20)}]`)
  })

  it('should_respect_custom_width', () => {
    expect(drawBar(1, 2, 4)).toBe('[##  ]')
  })

  it('should_return_empty_bar_when_total_is_zero', () => {
    expect(drawBar(0, 0)).toBe(`[${' '.repeat(20)}]`)
  })

  it('should_clamp_when_current_exceeds_total', () => {
    expect(drawBar(35, 34)).toBe(`[${'#'.repeat(20)}]`)
  })
})

describe('getPaymentType', () => {
  it('should_return_null_for_future_lesson', () => {
    expect(getPaymentType(0, false)).toBeNull()
  })

  it('should_return_null_for_unpaid_slot_at_index_4', () => {
    expect(getPaymentType(4, true)).toBeNull()
  })

  it('should_return_null_for_unpaid_slot_at_index_9', () => {
    expect(getPaymentType(9, true)).toBeNull()
  })

  it('should_return_null_for_unpaid_slot_at_index_14', () => {
    expect(getPaymentType(14, true)).toBeNull()
  })

  it('should_return_null_for_unpaid_slot_at_index_19', () => {
    expect(getPaymentType(19, true)).toBeNull()
  })

  it('should_return_null_for_unpaid_slot_at_index_24', () => {
    expect(getPaymentType(24, true)).toBeNull()
  })

  it('should_return_a_valid_payment_type_for_paid_past_lesson', () => {
    expect(PAYMENT_TYPES).toContain(getPaymentType(0, true))
  })

  it('should_cover_all_five_payment_types_across_past_lessons', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 29; i++) {
      const pt = getPaymentType(i, true)
      if (pt !== null) seen.add(pt)
    }
    expect([...seen].sort()).toEqual([...PAYMENT_TYPES].sort())
  })
})

describe('buildExpenseSeeds', () => {
  const NOW = new Date('2026-07-04T10:00:00.000Z')

  it('should_include_at_least_one_planned_expense_with_null_amount', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.some((s) => s.amount === null && s.daysOffset > 0)).toBe(true)
  })

  it('should_include_exactly_one_future_dated_timed_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset > 0 && s.time !== null)).toHaveLength(1)
  })

  // #950's fixture, restated for #1640: a future date-only expense stays off the dashboard —
  // which is now the *unticked* ones, since a ticked date-only row is exactly the all-day case
  // shows_on_calendar opened up. Both branches get a seed of their own below.
  it('should_include_exactly_one_date_only_expense_for_tomorrow', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset === 1 && s.time === null)).toHaveLength(1)
  })

  it('should_leave_the_tomorrow_date_only_expense_unticked', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.find((s) => s.daysOffset === 1)?.showsOnCalendar).toBe(false)
  })

  it('should_include_exactly_one_ticked_future_dated_date_only_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset > 0 && s.time === null && s.showsOnCalendar)).toHaveLength(1)
  })

  // #1640: the backfill ticks every timed row, past ones included -- the pre-PR calendar
  // rendered a past timed appointment on its own historical day, so a future-only backfill
  // would have hidden it permanently. The seed mirrors the backfill rule exactly.
  it('should_tick_every_timed_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.time !== null).every((s) => s.showsOnCalendar)).toBe(true)
  })

  it('should_leave_every_past_dated_date_only_expense_unticked', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset < 0 && s.time === null).every((s) => !s.showsOnCalendar)).toBe(true)
  })

  it('should_leave_the_future_date_only_expense_unpriced', () => {
    const seeds = buildExpenseSeeds(NOW)
    const dateOnly = seeds.find((s) => s.daysOffset > 0 && s.time === null)
    expect(dateOnly?.amount).toBeNull()
  })

  it('should_include_a_recurring_farrier_recipient_with_a_consistent_expense_type', () => {
    const seeds = buildExpenseSeeds(NOW)
    const farrierSeeds = seeds.filter((s) => s.recipient === 'Dr. Hoof Farrier')
    expect(farrierSeeds.length).toBeGreaterThanOrEqual(2)
    expect(farrierSeeds.every((s) => s.expenseType === 'Farrier')).toBe(true)
  })

  it('should_include_a_recurring_vet_recipient_with_a_consistent_expense_type', () => {
    const seeds = buildExpenseSeeds(NOW)
    const vetSeeds = seeds.filter((s) => s.recipient === 'Riverside Vet Clinic')
    expect(vetSeeds.length).toBeGreaterThanOrEqual(2)
    expect(vetSeeds.every((s) => s.expenseType === 'Veterinary')).toBe(true)
  })

  it('should_include_at_least_one_barn_wide_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.some((s) => s.appliesToAllHorses)).toBe(true)
  })

  it('should_include_at_least_one_individual_horse_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.some((s) => !s.appliesToAllHorses)).toBe(true)
  })

  it('should_keep_all_non_future_daysOffset_within_the_barn_age_window', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset <= 0).every((s) => s.daysOffset >= -125)).toBe(true)
  })

  function findSeedInBarnCreationMonth(seeds: ReturnType<typeof buildExpenseSeeds>) {
    const monthStart = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 4, 1)
    const nextMonthStart = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - 3, 1)
    return seeds.find((s) => {
      const d = new Date(NOW)
      d.setUTCDate(d.getUTCDate() + s.daysOffset)
      const t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
      return t >= monthStart && t < nextMonthStart
    })
  }

  it('should_include_a_seed_dated_in_the_barn_creation_month', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(findSeedInBarnCreationMonth(seeds)).toBeDefined()
  })

  it('should_price_the_barn_creation_month_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(findSeedInBarnCreationMonth(seeds)!.amount).not.toBeNull()
  })

  it('should_give_the_barn_creation_month_expense_a_payment_type', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(findSeedInBarnCreationMonth(seeds)!.paymentType).not.toBeNull()
  })

  it('should_include_a_today_dated_timed_planned_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.some((s) => s.daysOffset === 0 && s.time !== null && s.amount === null)).toBe(true)
  })

  it('should_set_the_today_expense_time_two_hours_after_now_so_it_stays_upcoming', () => {
    const seeds = buildExpenseSeeds(NOW)
    const today = seeds.find((s) => s.daysOffset === 0)
    expect(today?.time).toBe('12:00:00')
  })

  it('should_roll_the_upcoming_expense_to_the_next_day_when_the_two_hour_shift_crosses_utc_midnight', () => {
    const lateNow = new Date('2026-07-12T23:30:00.000Z')
    const seeds = buildExpenseSeeds(lateNow)
    const upcoming = seeds.find((s) => s.time === '01:30:00')
    expect(upcoming?.daysOffset).toBe(1)
  })

  it('should_include_a_past_due_planned_expense_for_outstanding_testing', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.some((s) => s.daysOffset < 0 && s.time !== null && s.amount === null)).toBe(true)
  })

  it('should_leave_payment_type_null_for_planned_expenses', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.amount === null).every((s) => s.paymentType == null)).toBe(true)
  })

  it('should_give_priced_expenses_payment_type_variety', () => {
    const seeds = buildExpenseSeeds(NOW)
    const priced = seeds.filter((s) => s.amount !== null)
    const seen = new Set(priced.map((s) => s.paymentType).filter((pt): pt is string => pt !== null && pt !== undefined))
    expect([...seen].sort()).toEqual([...PAYMENT_TYPES].sort())
  })
})

describe('expenseDateFor', () => {
  const NOW = new Date('2026-07-04T10:00:00.000Z')

  it('should_format_the_date_as_yyyy_mm_dd', () => {
    expect(expenseDateFor(NOW, 0)).toBe('2026-07-04')
  })

  it('should_shift_the_date_backward_for_a_negative_offset', () => {
    expect(expenseDateFor(NOW, -10)).toBe('2026-06-24')
  })

  it('should_shift_the_date_forward_for_a_positive_offset', () => {
    expect(expenseDateFor(NOW, 10)).toBe('2026-07-14')
  })
})

// #1559: the two guarantees a reseed months later depends on — a reminder date that is still a
// believable 14 days overdue (a hardcoded literal keeps feeding the dashboard card either way,
// since `getDueDocuments` filters `reminder_date <= today` with no lower bound; it just drifts
// into an implausible figure), and a document on the rider-owned horse so the Phase 6 owner
// walk has something to open.
describe('buildHorseDocumentSeeds', () => {
  const NOW = new Date('2026-07-04T10:00:00.000Z')

  it('should_give_the_butter_document_a_past_due_reminder_date', () => {
    const butter = buildHorseDocumentSeeds(NOW).find((s) => s.recordType === 'coggins')
    expect(butter?.reminderDate).toBe('2026-06-20')
  })

  it('should_leave_the_apple_document_without_a_reminder', () => {
    const apple = buildHorseDocumentSeeds(NOW).find((s) => s.recordType === 'shot_record')
    expect(apple?.reminderDate).toBeNull()
  })

  it('should_seed_the_unreminded_document_on_the_rider_owned_horse', () => {
    const apple = buildHorseDocumentSeeds(NOW).find((s) => s.recordType === 'shot_record')
    expect(apple?.horseIndex).toBe(0)
  })
})

// The two dark-mode `(manual)` lines in `checklists/pre-release/phase-3-manager-lesson-entry.md`
// are walked by hand forever while every line around them gets automated away (#1413), so the
// amber day and the red day they compare have to come from the seed rather than from a
// neighbouring checkbox nobody performs. The guarantee is checked against the real production
// path — `getMonthGrid` + `computeDayDecorations` — not a restatement of it, and across every
// hour because the ±3-day exertion window is centred on the form's Start Time, not on midnight.
// Past the 5s default because each of the three cases below runs the real `computeDayDecorations`
// over a 42-cell grid 4384 times, and `barnDay` builds a fresh `Intl.DateTimeFormat` per call.
describe('buildCalendarBandLessons', { timeout: 30_000 }, () => {
  const HORSE_ID = 'juniper'

  // A real barn zone rather than UTC, and one west of it: the form's grid is anchored on
  // `barnToday()`, so at hour 0 the barn is still on the previous day — and on the 1st of a
  // month, still in the previous month. Sweeping in UTC would check the seed's month arithmetic
  // against its own frame and never notice the two disagreeing.
  const BARN_TZ = 'America/New_York'

  // Indices into `buildCalendarBandLessons`' return, so each assertion names the lesson it is
  // actually about rather than asking the whole grid whether *some* day carries the band.
  const MODERATE_LESSON = 0
  const HIGH_LESSON = 1
  const NEXT_MONTH_LESSON = 3

  /** One case: the month grid the New Lesson form draws for this "today" and Start Time with
   *  only this horse checked, and what it paints on the day each seeded lesson lands on.
   *
   *  `paintedOn` reports `band: null` when the day is off the grid or already past — both are
   *  the same failure to the checks below. It is pinned to that one lesson's day rather than
   *  asked of the grid as a whole because the neighbouring-month cluster is exertion 4 as well,
   *  so a grid-wide `has('moderate')` stays true whether or not day +1 does its job: dropping
   *  day +1 to exertion 1 fails 4168 of the 4384 cases this way and only 152 the other. */
  function paintCase(now: Date, hour: number) {
    const today = barnDay(now, BARN_TZ)
    const lessons = buildCalendarBandLessons(now, BARN_TZ)
    const items: ScheduleItem[] = lessons.map((lesson, i) => ({
      id: `band-${i}`,
      itemType: 'lesson',
      start: lesson.at.toISOString().slice(0, 19),
      durationMinutes: 60,
      instructorId: null,
      horseIds: [HORSE_ID],
      riderIds: [],
      exertionByHorseId: { [HORSE_ID]: lesson.exertionLevel },
      appliesToAllHorses: false,
      label: null,
    }))
    const todayStr = calendarDate(today)
    const decorations = computeDayDecorations(getMonthGrid(todayStr.slice(0, 7)), items, {
      selectedHorseIds: [HORSE_ID],
      selectedRiderIds: [],
      hour,
      thresholdsByHorseId: { [HORSE_ID]: DEV_CALENDAR_BAND_THRESHOLDS },
      todayStr,
    })
    const paintedOn = (lessonIndex: number): { date: string; band: string | null } => {
      const date = lessons[lessonIndex].at.toISOString().slice(0, 10)
      const decoration: DayDecoration | undefined = decorations[date]
      return { date, band: decoration && !decoration.past ? decoration.band : null }
    }
    return { today, paintedOn }
  }

  // Every day of a three-year span, at four hours each — enough to cover every (month length,
  // weekday the 1st falls on) pair, including the leap February. The tightest case is "today is
  // the last day of a 31-day month starting on a Saturday", where the grid reaches exactly 5
  // days past month end and both the high day and the neighbouring-month day sit on that edge.
  const days: Date[] = []
  for (let d = new Date(Date.UTC(2026, 0, 1)); d < new Date(Date.UTC(2029, 0, 1)); d.setUTCDate(d.getUTCDate() + 1)) {
    for (const hour of [0, 9, 17, 23]) days.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour)))
  }

  it('should_put_a_moderate_day_on_the_visible_grid_from_every_today_and_hour', () => {
    expect(days.filter((now) => paintCase(now, now.getUTCHours()).paintedOn(MODERATE_LESSON).band !== 'moderate')).toEqual([])
  })

  it('should_put_a_high_day_on_the_visible_grid_from_every_today_and_hour', () => {
    expect(days.filter((now) => paintCase(now, now.getUTCHours()).paintedOn(HIGH_LESSON).band !== 'high')).toEqual([])
  })

  /** The tinted day carried into the grid from a neighbouring month — the state the second
   *  dark-mode line reads the date number on. Those cells are dimmed, so they are the one place
   *  the tint and the day number compete.
   *
   *  `band !== 'low'` rather than a truthiness check: every day with a horse selected carries a
   *  band, and 'low' is deliberately painted with no background at all (`BAND_TINT_CLASS`), so a
   *  truthy test here passes on a grid with nothing tinted anywhere. The month is compared in the
   *  barn's frame, which is the frame the grid itself is drawn in. */
  it('should_tint_a_neighbouring_month_day_from_every_today_and_hour', () => {
    expect(days.filter((now) => {
      const { today, paintedOn } = paintCase(now, now.getUTCHours())
      const { date, band } = paintedOn(NEXT_MONTH_LESSON)
      return band === null || band === 'low' || date.slice(0, 7) === today.slice(0, 7)
    })).toEqual([])
  })
})
