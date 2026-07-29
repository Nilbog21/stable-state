'use server'

/**
 * Global lesson Server Actions, all guarded by `requireMembership` (manager/trainer):
 * form submission (`submitLesson` — parse via `./lesson-form-parsing`, optional
 * manager-only inline new-horse create, then `createLessonWithParticipants` or, when
 * recurring, `createLessonSeries`, then best-effort nearby-instructor notification
 * fan-out that must never surface as a submission error), edit (`updateLessonAction` —
 * same parse, then the participant update plus a second, deliberately non-atomic phase
 * saving per-horse/per-rider/cancellation notes), post-creation lifecycle
 * (`deleteLessonAction` — manager-only; `updatePaymentTypeAction` — a trainer only for
 * their own lesson; `updateCancellationFeePaymentTypeAction` — manager-only, like the
 * RPC it wraps; `stopLessonSeriesAction` — a trainer only for their own series), and
 * the two read-only lookups feeding the lesson form (`getScheduleRangeForBarn` for the
 * conflict calendar, `getProjectedExhaustionForBarn` for the exhaustion preview).
 * Whole-lesson and per-rider cancellation live in `lesson-cancellation.ts`.
 */
import { requireMembership } from '@/lib/auth/guard'
import { collectLessonPayment, deleteLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes, updateCancellationFeePaymentType } from '@/lib/db/lesson-participants'
import { createLessonSeries, getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import { getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getNearbyInstructorMembershipIds, getScheduleForRange } from '@/lib/db/schedule'
import { createNotification, formatNearbyInstructorNotification, getUnreadNotificationCount, upsertNotificationsForRecipients } from '@/lib/db/notifications'
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Barn, Lesson, NotificationType, PaymentType, ScheduleItem } from '@/lib/db/types'
import { wallClockToInstant } from '@/lib/barn-timezone'
import { createHorse, getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { parseLessonFormData } from './lesson-form-parsing'

function sendNearbyInstructorNotificationViaRpc(
  client: SupabaseClient,
  params: { userId: string; barnId: string; type: NotificationType; title: string; body: string; link: string }
): Promise<void> {
  return createNotification(params, client)
}

// Best-effort courtesy notification -- failures here must never surface as a lesson
// submission error, since the lesson itself was already created successfully.
async function notifyNearbyInstructors(barnSlug: string, barn: Barn, lesson: Lesson): Promise<void> {
  try {
    const nearbyMembershipIds = await getNearbyInstructorMembershipIds(
      barn.id, lesson.id, lesson.lesson_at, lesson.instructor_id, barn.schedule_buffer_minutes
    )
    if (nearbyMembershipIds.length === 0) return

    const supabase = await createClient()
    const recipients = new Map<string, { userId: string; barnId: string; payload: number }>()
    for (const membershipId of nearbyMembershipIds) {
      try {
        const membership = await getMembershipByIdForBarn(membershipId, barn.id)
        if (!membership?.user_id) continue
        const existingCount = await getUnreadNotificationCount(supabase, membership.user_id, barn.id, 'instructor_lesson_nearby')
        recipients.set(membership.user_id, { userId: membership.user_id, barnId: barn.id, payload: existingCount + 1 })
      } catch (err) {
        console.error(`Failed to resolve nearby-instructor recipient ${membershipId}:`, (err as Error).message)
      }
    }

    await upsertNotificationsForRecipients(
      supabase,
      recipients,
      formatNearbyInstructorNotification,
      'instructor_lesson_nearby',
      () => `/barn/${barnSlug}/lessons`,
      sendNearbyInstructorNotificationViaRpc
    )
  } catch (err) {
    console.error('Failed to notify nearby instructors:', (err as Error).message)
  }
}

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const isRecurring = formData.get('is_recurring') === 'true'

  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const parsed = await parseLessonFormData(formData, barnId, membership)
  if ('error' in parsed) return parsed

  let { horseIds } = parsed.data
  const { newHorseName, newHorseExertionLevel, exertionLevels, riderIds, lessonAt, fee, lessonType, jumping, paymentType, tierName, instructorId, instructorCut } = parsed.data

  let lesson: Lesson
  try {
    if (newHorseName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add horses' }
      }
      const horse = await createHorse(barnId, newHorseName, membership.id)
      horseIds = [...horseIds, horse.id]
      exertionLevels.set(horse.id, newHorseExertionLevel)
    }

    const createLesson = isRecurring ? createLessonSeries : createLessonWithParticipants
    lesson = await createLesson({
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

  await notifyNearbyInstructors(barnSlug, barn, lesson)

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

  const cancellationNotesRaw = formData.get('cancellation_notes') as string | null

  try {
    // Checked before the write, not after: update_lesson_with_participants never touches
    // cancelled_at, so hoisting is behaviour-preserving and stops a rejected save from
    // having already committed participant edits.
    if (cancellationNotesRaw !== null) {
      const currentLesson = await getLessonById(lessonId, barnId, membership.role)
      if (!currentLesson || currentLesson.cancelled_at === null) {
        return { error: 'lesson is not cancelled' }
      }
    }

    if (newHorseName) {
      if (membership.role !== 'manager') return { error: 'not authorized to add horses' }
      const horse = await createHorse(barnId, newHorseName, membership.id)
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
  } catch (err) {
    console.error('Failed to update lesson:', (err as Error).message)
    return { error: 'Failed to update lesson' }
  }

  // Not atomic with the phase above: update_lesson_with_participants has already committed,
  // so a failure here leaves participant edits applied and notes unsaved — hence the distinct
  // message rather than claiming the whole save failed. Upgrade path if that ever matters:
  // fold the note writes into update_lesson_with_participants so the save is one transaction.
  try {
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
      ...(cancellationNotesRaw !== null
        ? [updateLesson(lessonId, barnId, { cancellation_notes: cancellationNotesRaw.trim() || null })]
        : []),
    ])
  } catch (err) {
    console.error('Failed to save lesson notes:', (err as Error).message)
    return { error: 'Lesson updated, but notes could not be saved' }
  }

  redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
}

export async function deleteLessonAction(
  barnId: string,
  barnSlug: string,
  lessonId: string,
  formData: FormData
): Promise<void> {
  const { membership } = await requireMembership(barnSlug, ['manager'])

  const lesson = await getLessonById(lessonId, barnId, membership.role)
  if (!lesson) {
    redirect(`/barn/${barnSlug}/lessons`)
    return
  }

  const deleteCollectedTransactions = formData.get('alsoDeleteTransactions') === 'on'
  await deleteLesson(lessonId, barnId, deleteCollectedTransactions)
  redirect(`/barn/${barnSlug}/lessons`)
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
    await collectLessonPayment(lessonId, barn.id, paymentType as PaymentType | null)
  } catch {
    return { error: 'Failed to update payment type' }
  }

  return { error: null }
}

// collect_rider_cancellation_fee (#831) is manager-only — a cancellation fee is
// surfaced on Outstanding for visibility to trainer/rider, but marking it paid is
// restricted the same way mark_agreement_charge_paid is.
export async function updateCancellationFeePaymentTypeAction(
  barnSlug: string,
  lessonRiderId: string,
  paymentType: string | null
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  try {
    await updateCancellationFeePaymentType(lessonRiderId, barn.id, paymentType as PaymentType | null)
  } catch {
    return { error: 'Failed to update payment type' }
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

/**
 * #1019 — one read per displayed month for the lesson form's conflict calendar. The
 * heatmap/dot/tint model is then recomputed client-side from this payload as the horse and
 * rider selection changes (see src/lib/month-calendar.ts), rather than re-querying per
 * selection or calling get_horse_projected_exhaustion once per day cell.
 *
 * `fromDate`/`toDate` are "YYYY-MM-DD" barn-local calendar days; `toDate` is exclusive,
 * matching getScheduleForRange's own half-open range.
 *
 * Deliberately does NOT apply scopeScheduleItemsForRole, unlike the dashboard's Day/Week
 * views: a horse's exhaustion is barn-wide, so narrowing a trainer to their own lessons here
 * would under-report the load on a horse another instructor is already working. No new lesson
 * exposure either — `lessons_select_staff` already grants trainers barn-wide lesson SELECT,
 * which the Lessons list's "All" filter surfaces directly. Expenses did need a new grant:
 * `trainer_select_horse_expenses`/`trainer_select_expense_horses` (#1019 review fix), without
 * which the AC's "a lesson **or expense**" dot could only ever fire on a lesson for a trainer.
 */
export async function getScheduleRangeForBarn(
  barnSlug: string,
  fromDate: string,
  toDate: string
): Promise<ScheduleItem[]> {
  const { barn } = await requireMembership(barnSlug, ['manager', 'trainer'])
  return getScheduleForRange(
    barn.id,
    wallClockToInstant(`${fromDate}T00:00:00`, barn.timezone).toISOString(),
    wallClockToInstant(`${toDate}T00:00:00`, barn.timezone).toISOString(),
    barn.timezone
  )
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
