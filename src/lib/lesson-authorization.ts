import type { PaymentType, Role } from '@/lib/db/types'

export function isLessonCancellationEligible(lesson: { lesson_at: string; payment_type: PaymentType | null }): boolean {
  return new Date(lesson.lesson_at) > new Date() || lesson.payment_type === null
}

export function canManageLesson(role: Role, membershipId: string, lesson: { instructor_id: string | null }): boolean {
  return role === 'manager' || (role === 'trainer' && lesson.instructor_id === membershipId)
}

export function isLateCancellation(lessonAt: string, cancelledByInstructor: boolean): boolean {
  if (cancelledByInstructor) return false
  return new Date(lessonAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000
}
