'use server'

import { requireMembership } from '@/lib/auth/guard'
import { cancelLesson, getLessonById } from '@/lib/db/lessons'
import { cancelRiderParticipation } from '@/lib/db/lesson-participants'
import type { NotificationType } from '@/lib/db/types'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { createNotification, resolveCancellationRecipients, upsertNotificationsForRecipients } from '@/lib/db/notifications'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { canManageLesson, isLateCancellation, isLessonCancellationEligible } from '@/lib/lesson-authorization'

function computeCancellationIsLate(lessonAt: string, formData: FormData, allowInstructorOverride: boolean): boolean {
  const cancelledByInstructor = allowInstructorOverride && formData.get('cancel_type') === 'instructor'
  return isLateCancellation(lessonAt, cancelledByInstructor)
}

// upsertNotificationsForRecipients defaults to a raw table upsert that requires a
// service-role client (see its own comment); these Server Actions run with the acting
// user's session client instead, so this routes through the create_or_update_notification
// RPC (SECURITY DEFINER, authorizes on the caller's own membership) to stay RLS-safe when
// notifying a different user.
function sendNotificationViaRpc(
  client: SupabaseClient,
  params: { userId: string; barnId: string; type: NotificationType; title: string; body: string; link: string }
): Promise<void> {
  return createNotification(params, client)
}

// Shared by cancelLessonAction and cancelRiderParticipationAction (including its cascade
// branch) -- resolves recipient user ids into the Map upsertNotificationsForRecipients
// expects, then fires it with the RPC-backed send adapter. All three call sites otherwise
// differed only in which recipient ids, notification type, and title they used.
async function notifyCancellationRecipients(
  client: SupabaseClient,
  recipientIds: string[],
  barnId: string,
  barnSlug: string,
  lessonId: string,
  type: NotificationType,
  title: string
): Promise<void> {
  const recipients = new Map(recipientIds.map((userId) => [userId, { userId, barnId, payload: undefined }]))
  await upsertNotificationsForRecipients(
    client,
    recipients,
    () => ({ title, body: '' }),
    type,
    () => `/barn/${barnSlug}/lessons/${lessonId}`,
    sendNotificationViaRpc
  )
}

export async function cancelLessonAction(
  barnId: string,
  barnSlug: string,
  lessonId: string,
  formData: FormData
): Promise<void> {
  const { membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const lesson = await getLessonById(lessonId, barnId, membership.role, membership.id)
  if (!lesson) {
    redirect(`/barn/${barnSlug}/lessons`)
    return
  }

  if (membership.role === 'trainer' && !canManageLesson(membership.role, membership.id, lesson)) {
    redirect(`/barn/${barnSlug}/lessons`)
    return
  }

  const isEligible = lesson.cancelled_at === null && isLessonCancellationEligible(lesson)
  if (!isEligible) {
    redirect(`/barn/${barnSlug}/lessons`)
    return
  }

  if (lesson.lesson_type === 'group' && formData.get('cancel_type') === 'rider') {
    const riderId = formData.get('rider_id')
    if (typeof riderId === 'string' && riderId) {
      return cancelRiderParticipationAction(barnId, barnSlug, lessonId, riderId, formData)
    }
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  const isLate = lesson.lesson_type === 'normal' ? computeCancellationIsLate(lesson.lesson_at, formData, true) : false

  const notes = (formData.get('notes') as string | null)?.trim() || null
  await cancelLesson(lessonId, barnId, notes, isLate)

  const riderUserIds = lesson.lesson_riders
    .map((lr) => lr.barn_membership?.user_id)
    .filter((id): id is string => id != null)

  const recipientIds = await resolveCancellationRecipients({
    scope: 'lesson',
    actorRole: membership.role,
    riderUserIds,
    instructorUserId: lesson.instructor_user_id,
    getManagerUserIds: () => getActiveManagerUserIds(barnId),
  })

  const supabase = await createClient()
  await notifyCancellationRecipients(supabase, recipientIds, barnId, barnSlug, lessonId, 'lesson_cancelled', 'Lesson cancelled')

  redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
}

export async function cancelRiderParticipationAction(
  barnId: string,
  barnSlug: string,
  lessonId: string,
  riderId: string,
  formData: FormData
): Promise<void> {
  const { user, membership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const lesson = await getLessonById(lessonId, barnId, membership.role, membership.id)
  if (!lesson) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  if (lesson.cancelled_at !== null) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  if (membership.role === 'trainer' && !canManageLesson(membership.role, membership.id, lesson)) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  const targetRider = lesson.lesson_riders.find((lr) => lr.barn_membership?.id === riderId) ?? null
  if (!targetRider?.barn_membership) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  if (membership.role === 'rider' && targetRider.barn_membership.user_id !== user.id) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  const isEligible = targetRider.cancelled_at === null && isLessonCancellationEligible(lesson)
  if (!isEligible) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  const isLate = computeCancellationIsLate(lesson.lesson_at, formData, membership.role !== 'rider')

  const notes = (formData.get('notes') as string | null)?.trim() || null
  const cascaded = await cancelRiderParticipation(lessonId, barnId, riderId, notes, isLate)

  const recipientIds = await resolveCancellationRecipients({
    scope: 'rider_participation',
    actorRole: membership.role,
    affectedRiderUserId: targetRider.barn_membership.user_id,
    instructorUserId: lesson.instructor_user_id,
    getManagerUserIds: () => getActiveManagerUserIds(barnId),
  })

  const supabase = await createClient()
  await notifyCancellationRecipients(
    supabase,
    recipientIds,
    barnId,
    barnSlug,
    lessonId,
    'rider_participation_cancelled',
    'Lesson participation cancelled'
  )

  if (cascaded) {
    const riderUserIds = lesson.lesson_riders
      .map((lr) => lr.barn_membership?.user_id)
      .filter((id): id is string => id != null)

    const lessonCancelledRecipientIds = await resolveCancellationRecipients({
      scope: 'lesson',
      actorRole: membership.role,
      riderUserIds,
      instructorUserId: lesson.instructor_user_id,
      getManagerUserIds: () => getActiveManagerUserIds(barnId),
    })

    await notifyCancellationRecipients(
      supabase,
      lessonCancelledRecipientIds,
      barnId,
      barnSlug,
      lessonId,
      'lesson_cancelled',
      'Lesson cancelled'
    )
  }

  redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
}
