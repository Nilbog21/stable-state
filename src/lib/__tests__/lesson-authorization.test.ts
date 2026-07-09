import { describe, it, expect } from 'vitest'
import { isLessonCancellationEligible, canManageLesson, isLateCancellation } from '@/lib/lesson-authorization'

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
