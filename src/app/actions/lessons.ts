'use server'

import { requireMembership } from '@/lib/auth/guard'
import { cancelLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes, cancelRiderParticipation } from '@/lib/db/lesson-participants'
import { createLessonSeries, getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import type { NotificationType, PaymentType } from '@/lib/db/types'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { createNotification, resolveCancellationRecipients, upsertNotificationsForRecipients } from '@/lib/db/notifications'
import { createHorse, getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { parseLessonFormData } from './lesson-form-parsing'
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

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const isRecurring = formData.get('is_recurring') === 'true'

  const { membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const parsed = await parseLessonFormData(formData, barnId, membership)
  if ('error' in parsed) return parsed

  let { horseIds } = parsed.data
  const { newHorseName, newHorseExertionLevel, exertionLevels, riderIds, lessonAt, fee, lessonType, jumping, paymentType, tierName, instructorId, instructorCut } = parsed.data

  try {
    if (newHorseName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add horses' }
      }
      const horse = await createHorse(barnId, newHorseName)
      horseIds = [...horseIds, horse.id]
      exertionLevels.set(horse.id, newHorseExertionLevel)
    }

    const createLesson = isRecurring ? createLessonSeries : createLessonWithParticipants
    await createLesson({
      barnId,
      instructorId,
      fee,
      lessonAt,
      horseIds,
      exertionLevels: horseIds.map(id => exertionLevels.get(id)!),
      riderIds,
      lessonType,
      jumping,
      tierName,
      paymentType,
      instructorCut,
    })
  } catch {
    return { error: 'Failed to submit lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}

export async function updateLessonAction(
  lessonId: string,
  barnSlug: string,
  barnId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const { membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const parsed = await parseLessonFormData(formData, barnId, membership)
  if ('error' in parsed) return parsed

  let { horseIds } = parsed.data
  const { newHorseName, newHorseExertionLevel, exertionLevels, riderIds, lessonAt, fee, lessonType, jumping, paymentType, tierName, instructorId, instructorCut } = parsed.data

  try {
    if (newHorseName) {
      if (membership.role !== 'manager') return { error: 'not authorized to add horses' }
      const horse = await createHorse(barnId, newHorseName)
      horseIds = [...horseIds, horse.id]
      exertionLevels.set(horse.id, newHorseExertionLevel)
    }

    await updateLessonWithParticipants({
      lessonId,
      barnId,
      lessonAt,
      instructorId,
      fee,
      lessonType,
      jumping,
      paymentType,
      tierName,
      horseIds,
      exertionLevels: horseIds.map(id => exertionLevels.get(id)!),
      riderIds,
      instructorCut,
    })

    const horseIdSet = new Set(horseIds)
    const riderIdSet = new Set(riderIds)
    const noteHorseIds = (formData.getAll('noteHorseId') as string[]).filter(id => horseIdSet.has(id))
    const noteRiderIds = (formData.getAll('noteRiderId') as string[]).filter(id => riderIdSet.has(id))
    await Promise.all([
      ...noteHorseIds.map(hId =>
        updateLessonHorseNotes(lessonId, hId, barnId, (formData.get(`horse_notes_${hId}`) as string) || null)
      ),
      ...noteRiderIds.map(rId =>
        updateLessonRiderNotes(
          lessonId, rId, barnId,
          (formData.get(`rider_notes_${rId}`) as string) || null,
          (formData.get(`private_notes_${rId}`) as string) || null,
        )
      ),
    ])
  } catch {
    return { error: 'Failed to update lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
}

export async function cancelLessonAction(
  barnId: string,
  barnSlug: string,
  lessonId: string,
  formData: FormData
): Promise<void> {
  const { user, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const lesson = await getLessonById(lessonId, barnId, membership.role, user.id)
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
  const recipients = new Map(recipientIds.map((userId) => [userId, { userId, barnId, payload: undefined }]))
  await upsertNotificationsForRecipients(
    supabase,
    recipients,
    () => ({ title: 'Lesson cancelled', body: '' }),
    'lesson_cancelled',
    () => `/barn/${barnSlug}/lessons/${lessonId}`,
    sendNotificationViaRpc
  )

  redirect(`/barn/${barnSlug}/lessons`)
}

export async function cancelRiderParticipationAction(
  barnId: string,
  barnSlug: string,
  lessonId: string,
  riderId: string,
  formData: FormData
): Promise<void> {
  const { user, membership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const lesson = await getLessonById(lessonId, barnId, membership.role, user.id)
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
  const recipients = new Map(recipientIds.map((userId) => [userId, { userId, barnId, payload: undefined }]))
  await upsertNotificationsForRecipients(
    supabase,
    recipients,
    () => ({ title: 'Lesson participation cancelled', body: '' }),
    'rider_participation_cancelled',
    () => `/barn/${barnSlug}/lessons/${lessonId}`,
    sendNotificationViaRpc
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

    const lessonCancelledRecipients = new Map(
      lessonCancelledRecipientIds.map((userId) => [userId, { userId, barnId, payload: undefined }])
    )
    await upsertNotificationsForRecipients(
      supabase,
      lessonCancelledRecipients,
      () => ({ title: 'Lesson cancelled', body: '' }),
      'lesson_cancelled',
      () => `/barn/${barnSlug}/lessons/${lessonId}`,
      sendNotificationViaRpc
    )
  }

  redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
}

export async function updatePaymentTypeAction(
  lessonId: string,
  barnSlug: string,
  paymentType: string | null
): Promise<{ error: string | null }> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  if (membership.role === 'trainer') {
    const lesson = await getLessonById(lessonId, barn.id, 'trainer')
    if (!lesson) return { error: 'lesson not found' }
    if (lesson.instructor_id !== membership.id) return { error: 'not authorized' }
  }

  try {
    await updateLesson(lessonId, barn.id, { payment_type: paymentType as PaymentType | null })
  } catch {
    return { error: 'Failed to update payment type' }
  }

  return { error: null }
}

export async function updateCancellationNotesAction(
  lessonId: string,
  barnSlug: string,
  notes: string
): Promise<{ error: string | null }> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const lesson = await getLessonById(lessonId, barn.id, membership.role)
  if (!lesson) return { error: 'lesson not found' }
  if (!canManageLesson(membership.role, membership.id, lesson)) return { error: 'not authorized' }
  if (lesson.cancelled_at === null) return { error: 'lesson is not cancelled' }

  try {
    await updateLesson(lessonId, barn.id, { cancellation_notes: notes.trim() || null })
  } catch {
    return { error: 'Failed to update cancellation notes' }
  }

  return { error: null }
}

export async function stopLessonSeriesAction(barnSlug: string, lessonId: string, seriesId: string): Promise<void> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const series = await getSeriesById(seriesId, barn.id)
  const redirectPath = `/barn/${barnSlug}/lessons/${lessonId}/edit`

  if (!series) {
    redirect(redirectPath)
    return
  }

  if (membership.role === 'trainer' && series.instructor_id !== membership.id) {
    redirect(redirectPath)
    return
  }

  await stopLessonSeries(seriesId, barn.id)

  redirect(redirectPath)
}

export async function getProjectedExhaustionForBarn(
  barnSlug: string,
  excludeLessonId: string | null,
  targetDateIso: string,
  horseIds: string[]
): Promise<Record<string, { existingRows: { lessonAt: string; exertionLevel: number }[]; thresholds: { high: number; moderate: number } }>> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer'])
  const horses = await getHorsesByIds(horseIds, barn.id)
  const targetDate = new Date(targetDateIso)

  const entries = await Promise.all(
    horses.map(async (h) => {
      const existingRows = await getHorseProjectedExhaustion(h.id, barn.id, targetDate, excludeLessonId ?? undefined)
      return [h.id, { existingRows, thresholds: resolveExhaustionThresholds(h, barn) }] as const
    })
  )

  return Object.fromEntries(entries)
}
