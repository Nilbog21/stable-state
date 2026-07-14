import type { PaymentType, Role } from '@/lib/db/types'

export function isLessonCancellationEligible(lesson: { lesson_at: string; payment_type: PaymentType | null }): boolean {
  return new Date(lesson.lesson_at) > new Date() || lesson.payment_type === null
}

export function canManageLesson(role: Role, membershipId: string, lesson: { instructor_id: string | null }): boolean {
  return role === 'manager' || (role === 'trainer' && lesson.instructor_id === membershipId)
}

export function isInstructorOfLesson(membershipId: string, lesson: { instructor_id: string | null }): boolean {
  return lesson.instructor_id === membershipId
}

export function isLateCancellation(lessonAt: string, cancelledByInstructor: boolean): boolean {
  if (cancelledByInstructor) return false
  return new Date(lessonAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000
}

type HorseStatus = {
  name: string
  is_active?: boolean
  is_available?: boolean
  unavailability_reason?: string | null
}

export function getHorseAttentionReasons(lesson: {
  lesson_at: string
  cancelled_at: string | null
  lesson_horses: { horses: HorseStatus | null }[]
}): string[] {
  if (lesson.cancelled_at !== null) return []
  if (new Date(lesson.lesson_at) <= new Date()) return []

  return lesson.lesson_horses
    .filter((lh): lh is { horses: HorseStatus } => lh.horses !== null && (lh.horses.is_active === false || lh.horses.is_available === false))
    .map((lh) => {
      const h = lh.horses
      if (h.is_active === false) return `${h.name} is inactive`
      return `${h.name} is unavailable${h.unavailability_reason ? `: ${h.unavailability_reason}` : ''}`
    })
}
