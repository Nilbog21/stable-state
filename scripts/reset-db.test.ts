import { describe, it, expect } from 'vitest'
import {
  buildLessonDates,
  getLessonVariation,
  getLessonHorseAssignment,
  getPaymentType,
  isGroupLesson,
  drawBar,
  DEV_PENDING_RIDER,
  DEV_MANAGER_2,
  PAYMENT_TYPES,
  buildExpenseSeeds,
  expenseDateFor,
  computeExhaustionWindowTotals,
  EXHAUSTION_PAST_BOUNDARY_INDEX,
  EXHAUSTION_FUTURE_BOUNDARY_INDEX,
} from './reset-db'

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

describe('DEV_PENDING_RIDER', () => {
  it('should_have_email_as_string', () => {
    expect(typeof DEV_PENDING_RIDER.email).toBe('string')
  })

  it('should_have_firstName', () => {
    expect(DEV_PENDING_RIDER.firstName).toBeTruthy()
  })

  it('should_have_lastName', () => {
    expect(DEV_PENDING_RIDER.lastName).toBeTruthy()
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

  it('should_include_exactly_one_future_dated_expense', () => {
    const seeds = buildExpenseSeeds(NOW)
    expect(seeds.filter((s) => s.daysOffset > 0)).toHaveLength(1)
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
    expect(seeds.filter((s) => s.daysOffset <= 0).every((s) => s.daysOffset >= -85)).toBe(true)
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
