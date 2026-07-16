import { describe, it, expect } from 'vitest'
import {
  isDueForGeneration,
  computeNextLessonAt,
  hasMissingRider,
  hasUnavailableHorse,
  formatSeriesStoppedNotification,
  formatHorseUnavailableNotification,
  formatGenerationSummary,
} from './generate-recurring-lessons'

describe('isDueForGeneration', () => {
  it('should_be_due_when_latest_lesson_is_within_28_day_horizon', () => {
    const now = new Date('2026-07-08T00:00:00Z')
    expect(isDueForGeneration('2026-07-20T00:00:00Z', now)).toBe(true)
  })

  it('should_be_due_when_latest_lesson_is_exactly_at_the_28_day_boundary', () => {
    const now = new Date('2026-07-08T00:00:00Z')
    expect(isDueForGeneration('2026-08-05T00:00:00Z', now)).toBe(true)
  })

  it('should_not_be_due_when_latest_lesson_is_past_the_28_day_boundary', () => {
    const now = new Date('2026-07-08T00:00:00Z')
    expect(isDueForGeneration('2026-08-05T00:00:00.001Z', now)).toBe(false)
  })
})

describe('computeNextLessonAt', () => {
  it('should_add_7_days_to_the_latest_lesson_at', () => {
    expect(computeNextLessonAt('2026-07-08T10:00:00.000Z')).toBe('2026-07-15T10:00:00.000Z')
  })
})

describe('hasMissingRider', () => {
  it('should_return_false_when_all_riders_are_active_members', () => {
    expect(hasMissingRider(['rider-1'], [{ id: 'rider-1', status: 'active' }])).toBe(false)
  })

  it('should_return_true_when_a_rider_membership_no_longer_exists', () => {
    expect(hasMissingRider(['rider-1', 'rider-2'], [{ id: 'rider-1', status: 'active' }])).toBe(true)
  })

  it('should_return_true_when_a_rider_membership_is_not_active', () => {
    expect(hasMissingRider(['rider-1'], [{ id: 'rider-1', status: 'pending' }])).toBe(true)
  })
})

describe('hasUnavailableHorse', () => {
  it('should_return_false_when_all_horses_are_active_and_available', () => {
    expect(hasUnavailableHorse(['horse-1'], [{ id: 'horse-1', is_active: true, is_available: true }])).toBe(false)
  })

  it('should_return_true_when_a_horse_is_inactive', () => {
    expect(hasUnavailableHorse(['horse-1'], [{ id: 'horse-1', is_active: false, is_available: true }])).toBe(true)
  })

  it('should_return_true_when_a_horse_is_unavailable', () => {
    expect(hasUnavailableHorse(['horse-1'], [{ id: 'horse-1', is_active: true, is_available: false }])).toBe(true)
  })

  it('should_return_true_when_a_horse_row_is_not_found', () => {
    expect(hasUnavailableHorse(['horse-1'], [])).toBe(true)
  })
})

describe('formatSeriesStoppedNotification', () => {
  it('should_use_singular_wording_for_one_series', () => {
    expect(formatSeriesStoppedNotification(1)).toEqual({
      title: '1 recurring series stopped',
      body: '1 recurring lesson series was stopped — a rider is no longer active, or the series has no lessons left to continue from.',
    })
  })

  it('should_use_plural_wording_for_multiple_series', () => {
    expect(formatSeriesStoppedNotification(2)).toEqual({
      title: '2 recurring series stopped',
      body: '2 recurring lesson series were stopped — a rider is no longer active, or the series has no lessons left to continue from.',
    })
  })
})

describe('formatHorseUnavailableNotification', () => {
  it('should_use_singular_wording_for_one_lesson', () => {
    expect(formatHorseUnavailableNotification(1)).toEqual({
      title: '1 recurring lesson generated with an unavailable horse',
      body: 'Check this lesson — the assigned horse is marked unavailable or inactive.',
    })
  })

  it('should_use_plural_wording_for_multiple_lessons', () => {
    expect(formatHorseUnavailableNotification(2)).toEqual({
      title: '2 recurring lessons generated with an unavailable horse',
      body: 'Check these lessons — the assigned horse is marked unavailable or inactive.',
    })
  })
})

describe('formatGenerationSummary', () => {
  it('should_report_success_when_no_errors', () => {
    expect(formatGenerationSummary(3, 1, 2, 0)).toBe('Generated 3 lesson(s), stopped 1 series, warned on 2 lesson(s).')
  })

  it('should_report_failure_count_when_errors_occurred', () => {
    expect(formatGenerationSummary(3, 1, 2, 1)).toBe('Generated 3 lesson(s), stopped 1 series, warned on 2 lesson(s); 1 failed.')
  })
})
