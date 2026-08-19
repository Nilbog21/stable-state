/**
 * Pure lesson permission/eligibility predicates over already-fetched rows (no DB access),
 * shared by the lesson pages/cards and re-checked server-side by `lesson-cancellation.ts`'s
 * actions: `canManageLesson` (manager, or trainer on their own lesson) and the narrower
 * `isInstructorOfLesson`; `isLessonCancellationEligible` (still upcoming, or unpaid); the
 * late-cancellation pair (`isWithinLateCancellationWindow` — `lesson_at` 24 hours or less away
 * or already past; `isLateCancellation` — never late when the instructor cancels); and the
 * #847 attention-badge pair (`isLessonEligibleForAttentionBadge`; `getHorseAttentionReasons`
 * — inactive/unavailable-horse reasons, empty once the lesson is cancelled or past).
 */
import type { Instant, PaymentType, Role } from '@/lib/db/types'

export function isLessonCancellationEligible(lesson: { lesson_at: Instant; payment_type: PaymentType | null }): boolean {
  return new Date(lesson.lesson_at.at) > new Date() || lesson.payment_type === null
}

export function canManageLesson(role: Role, membershipId: string, lesson: { instructor_id: string | null }): boolean {
  return role === 'manager' || (role === 'trainer' && lesson.instructor_id === membershipId)
}

export function isInstructorOfLesson(membershipId: string, lesson: { instructor_id: string | null }): boolean {
  return lesson.instructor_id === membershipId
}

export function isWithinLateCancellationWindow(lessonAt: Instant): boolean {
  return new Date(lessonAt.at).getTime() - Date.now() <= 24 * 60 * 60 * 1000
}

export function isLateCancellation(lessonAt: Instant, cancelledByInstructor: boolean): boolean {
  if (cancelledByInstructor) return false
  return isWithinLateCancellationWindow(lessonAt)
}

// Shared by the #847 "Needs Attention" badge (LessonListItem, CalendarLessonCard) and this
// file's own getHorseAttentionReasons — a lesson only ever flags a horse issue while it's
// still upcoming and hasn't been cancelled.
export function isLessonEligibleForAttentionBadge(lesson: { lesson_at: Instant; cancelled_at: string | null }): boolean {
  return lesson.cancelled_at === null && new Date(lesson.lesson_at.at) > new Date()
}

type HorseStatus = {
  name: string
  is_active?: boolean
  is_available?: boolean
  unavailability_reason?: string | null
}

export function getHorseAttentionReasons(lesson: {
  lesson_at: Instant
  cancelled_at: string | null
  lesson_horses: { horses: HorseStatus | null }[]
}): string[] {
  if (!isLessonEligibleForAttentionBadge(lesson)) return []

  return lesson.lesson_horses
    .filter((lh): lh is { horses: HorseStatus } => lh.horses !== null && (lh.horses.is_active === false || lh.horses.is_available === false))
    .map((lh) => {
      const h = lh.horses
      if (h.is_active === false) return `${h.name} is inactive`
      return `${h.name} is unavailable${h.unavailability_reason ? `: ${h.unavailability_reason}` : ''}`
    })
}
