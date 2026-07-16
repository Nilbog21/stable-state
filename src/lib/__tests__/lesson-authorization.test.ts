import { describe, it, expect } from 'vitest'
import { isLessonCancellationEligible, canManageLesson, isLateCancellation, isWithinLateCancellationWindow, isInstructorOfLesson, getHorseAttentionReasons, isLessonEligibleForAttentionBadge } from '@/lib/lesson-authorization'

describe('isLessonCancellationEligible', () => {
  it('should_return_true_when_lesson_at_is_future_and_paid', () => {
    const lesson = { lesson_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), payment_type: 'cash' as const }
    expect(isLessonCancellationEligible(lesson)).toBe(true)
  })

  it('should_return_false_when_lesson_at_is_past_and_paid', () => {
    const lesson = { lesson_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), payment_type: 'cash' as const }
    expect(isLessonCancellationEligible(lesson)).toBe(false)
  })

  it('should_return_true_when_lesson_at_is_past_and_unpaid', () => {
    const lesson = { lesson_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), payment_type: null }
    expect(isLessonCancellationEligible(lesson)).toBe(true)
  })
})

describe('canManageLesson', () => {
  it('should_return_true_for_manager_regardless_of_instructor_id_match', () => {
    expect(canManageLesson('manager', 'membership-1', { instructor_id: 'someone-else' })).toBe(true)
  })

  it('should_return_true_for_trainer_when_instructor_id_matches_membership_id', () => {
    expect(canManageLesson('trainer', 'membership-1', { instructor_id: 'membership-1' })).toBe(true)
  })

  it('should_return_false_for_trainer_when_instructor_id_does_not_match', () => {
    expect(canManageLesson('trainer', 'membership-1', { instructor_id: 'membership-2' })).toBe(false)
  })

  it('should_return_false_for_rider', () => {
    expect(canManageLesson('rider', 'membership-1', { instructor_id: 'membership-1' })).toBe(false)
  })
})

describe('isInstructorOfLesson', () => {
  it('should_return_true_when_instructor_id_matches_membership_id', () => {
    expect(isInstructorOfLesson('membership-1', { instructor_id: 'membership-1' })).toBe(true)
  })

  it('should_return_false_when_instructor_id_does_not_match', () => {
    expect(isInstructorOfLesson('membership-1', { instructor_id: 'membership-2' })).toBe(false)
  })
})

describe('isLateCancellation', () => {
  it('should_return_false_when_cancelled_by_instructor_regardless_of_timing', () => {
    const soonLessonAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(soonLessonAt, true)).toBe(false)
  })

  it('should_return_true_when_cancelled_by_rider_within_24_hours_of_lesson', () => {
    const soonLessonAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(soonLessonAt, false)).toBe(true)
  })

  it('should_return_false_when_cancelled_by_rider_more_than_24_hours_before_lesson', () => {
    const farLessonAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(farLessonAt, false)).toBe(false)
  })
})

describe('isWithinLateCancellationWindow', () => {
  it('should_return_true_when_lesson_is_within_24_hours', () => {
    const soonLessonAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isWithinLateCancellationWindow(soonLessonAt)).toBe(true)
  })

  it('should_return_false_when_lesson_is_more_than_24_hours_away', () => {
    const farLessonAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    expect(isWithinLateCancellationWindow(farLessonAt)).toBe(false)
  })
})

describe('isLessonEligibleForAttentionBadge', () => {
  it('should_return_true_when_lesson_is_future_and_not_cancelled', () => {
    expect(isLessonEligibleForAttentionBadge({ lesson_at: '2099-01-01T10:00:00Z', cancelled_at: null })).toBe(true)
  })

  it('should_return_false_when_lesson_is_in_the_past', () => {
    expect(isLessonEligibleForAttentionBadge({ lesson_at: '2020-01-01T10:00:00Z', cancelled_at: null })).toBe(false)
  })

  it('should_return_false_when_lesson_is_cancelled', () => {
    expect(isLessonEligibleForAttentionBadge({ lesson_at: '2099-01-01T10:00:00Z', cancelled_at: '2026-01-01T00:00:00Z' })).toBe(false)
  })
})

describe('getHorseAttentionReasons', () => {
  const futureLessonAt = '2099-01-01T10:00:00Z'
  const pastLessonAt = '2020-01-01T10:00:00Z'

  it('should_return_reason_for_inactive_horse', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual(['Buttercup is inactive'])
  })

  it('should_return_reason_with_text_for_unavailable_horse', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Rocky', is_active: true, is_available: false, unavailability_reason: 'lame — resting per vet' } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual(['Rocky is unavailable: lame — resting per vet'])
  })

  it('should_return_reason_without_colon_when_unavailable_horse_has_no_reason_text', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Rocky', is_active: true, is_available: false, unavailability_reason: null } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual(['Rocky is unavailable'])
  })

  it('should_prefer_inactive_reason_when_horse_is_both_inactive_and_unavailable', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Willow', is_active: false, is_available: false, unavailability_reason: 'injured' } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual(['Willow is inactive'])
  })

  it('should_return_multiple_reasons_for_multiple_affected_horses', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [
        { horses: { name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } },
        { horses: { name: 'Rocky', is_active: true, is_available: false, unavailability_reason: 'lame' } },
      ],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual(['Buttercup is inactive', 'Rocky is unavailable: lame'])
  })

  it('should_return_empty_array_when_all_horses_active_and_available', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual([])
  })

  it('should_return_empty_array_when_lesson_is_cancelled', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: '2026-01-01T00:00:00Z',
      lesson_horses: [{ horses: { name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual([])
  })

  it('should_return_empty_array_when_lesson_is_in_the_past', () => {
    const lesson = {
      lesson_at: pastLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: { name: 'Buttercup', is_active: false, is_available: true, unavailability_reason: null } }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual([])
  })

  it('should_skip_lesson_horses_with_null_horse', () => {
    const lesson = {
      lesson_at: futureLessonAt,
      cancelled_at: null,
      lesson_horses: [{ horses: null }],
    }
    expect(getHorseAttentionReasons(lesson)).toEqual([])
  })
})
