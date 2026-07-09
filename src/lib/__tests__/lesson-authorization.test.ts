import { describe, it, expect } from 'vitest'
import { isLessonCancellationEligible, canManageLesson, isLateCancellation } from '@/lib/lesson-authorization'

describe('isLessonCancellationEligible', () => {
  it('returns true when lesson_at is in the future and paid', () => {
    const lesson = { lesson_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), payment_type: 'cash' as const }
    expect(isLessonCancellationEligible(lesson)).toBe(true)
  })

  it('returns false when lesson_at is in the past and paid', () => {
    const lesson = { lesson_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), payment_type: 'cash' as const }
    expect(isLessonCancellationEligible(lesson)).toBe(false)
  })

  it('returns true when lesson_at is in the past and unpaid', () => {
    const lesson = { lesson_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(), payment_type: null }
    expect(isLessonCancellationEligible(lesson)).toBe(true)
  })
})

describe('canManageLesson', () => {
  it('returns true for manager regardless of instructor_id match', () => {
    expect(canManageLesson('manager', 'membership-1', { instructor_id: 'someone-else' })).toBe(true)
  })

  it('returns true for trainer when instructor_id matches membershipId', () => {
    expect(canManageLesson('trainer', 'membership-1', { instructor_id: 'membership-1' })).toBe(true)
  })

  it('returns false for trainer when instructor_id does not match', () => {
    expect(canManageLesson('trainer', 'membership-1', { instructor_id: 'membership-2' })).toBe(false)
  })

  it('returns false for rider', () => {
    expect(canManageLesson('rider', 'membership-1', { instructor_id: 'membership-1' })).toBe(false)
  })
})

describe('isLateCancellation', () => {
  it('returns false when cancelled by instructor regardless of timing', () => {
    const soonLessonAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(soonLessonAt, true)).toBe(false)
  })

  it('returns true when cancelled by rider within 24 hours of the lesson', () => {
    const soonLessonAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(soonLessonAt, false)).toBe(true)
  })

  it('returns false when cancelled by rider more than 24 hours before the lesson', () => {
    const farLessonAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()
    expect(isLateCancellation(farLessonAt, false)).toBe(false)
  })
})
