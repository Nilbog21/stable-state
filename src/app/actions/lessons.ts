'use server'

import { requireMembership } from '@/lib/auth/guard'
import { cancelLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes, cancelRiderParticipation } from '@/lib/db/lesson-participants'
import { createLessonSeries, getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import type { PaymentType } from '@/lib/db/types'
import { getInstructorsByBarn, getActiveMembersWithProfiles, getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { createNotification } from '@/lib/db/notifications'
import { createHorse, getHorsesByBarn, getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { redirect } from 'next/navigation'

function parseExertionLevel(raw: FormDataEntryValue | null): number {
  const n = parseInt(raw as string ?? '', 10)
  return Number.isNaN(n) ? 3 : Math.max(1, Math.min(5, n))
}

function parseFee(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) ? null : n
}

function computeCancellationIsLate(lessonAt: string, formData: FormData, allowInstructorOverride: boolean): boolean {
  const cancelledByInstructor = allowInstructorOverride && formData.get('cancel_type') === 'instructor'
  const within24Hours = new Date(lessonAt).getTime() - Date.now() <= 24 * 60 * 60 * 1000
  return cancelledByInstructor ? false : within24Hours
}

type ParsedLessonFormData = {
  horseIds: string[]
  newHorseName: string | null
  newHorseExertionLevel: number
  exertionLevels: Map<string, number>
  riderIds: string[]
  lessonAt: string
  fee: number
  lessonType: 'normal' | 'group'
  jumping: boolean
  paymentType: PaymentType | null
  tierName: string
  instructorId: string
}

export async function parseLessonFormData(
  formData: FormData,
  barnId: string,
  membership: { id: string; role: string }
): Promise<{ error: string } | { data: ParsedLessonFormData }> {
  const horseIds = formData.getAll('horse_id') as string[]
  const newHorseName = (formData.get('new_horse_name') as string | null)?.trim() || null
  const riderIds = (formData.getAll('rider_id') as string[]).filter(id => id !== '')
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null
  const tierName = (formData.get('tier_name') as string | null) ?? 'Custom'
  const lessonTypeRaw = (formData.get('lesson_type') as string | null) ?? 'normal'
  const jumping = formData.get('jumping') === 'true'
  const paymentTypeRaw = (formData.get('payment_type') as string | null) || null
  const paymentType = paymentTypeRaw as PaymentType | null

  if (lessonTypeRaw !== 'normal' && lessonTypeRaw !== 'group') return { error: 'invalid lesson type' }
  const lessonType = lessonTypeRaw as 'normal' | 'group'

  if (riderIds.length === 0) return { error: 'rider required' }
  if (lessonType === 'normal' && riderIds.length > 1) return { error: 'normal lesson requires exactly 1 rider' }
  if (lessonType === 'group' && riderIds.length < 2) return { error: 'group lesson requires at least 2 riders' }
  if (!lessonAt) return { error: 'date and time required' }
  if (!newHorseName && horseIds.length === 0) return { error: 'horse required' }
  if (newHorseName && horseIds.length > 0) return { error: 'select a horse or add a new one, not both' }

  const isManager = membership.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || membership.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== membership.id) {
    const instructors = await getInstructorsByBarn(barnId)
    if (!instructors.some((i) => i.membershipId === instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const exertionLevels = new Map<string, number>(
    horseIds.map(id => [id, parseExertionLevel(formData.get(`exertion_${id}`))])
  )
  const newHorseExertionLevel = parseExertionLevel(formData.get('new_horse_exertion_level'))

  const [barnHorses, barnRiders] = await Promise.all([
    getHorsesByBarn(barnId),
    getActiveMembersWithProfiles(barnId, 'rider'),
  ])

  if (horseIds.length > 0) {
    const validHorseIds = new Set(barnHorses.map((h) => h.id))
    if (horseIds.some((id) => !validHorseIds.has(id))) {
      return { error: 'horse not found in this barn' }
    }
  }

  if (riderIds.length > 0) {
    const validRiderIds = new Set(barnRiders.map((m) => m.membershipId))
    if (riderIds.some((id) => !validRiderIds.has(id))) {
      return { error: 'rider not found in this barn' }
    }
  }

  const fee = parseFee(feeRaw)
  if (fee == null) return { error: 'fee is required' }

  return {
    data: {
      horseIds,
      newHorseName,
      newHorseExertionLevel,
      exertionLevels,
      riderIds,
      lessonAt,
      fee,
      lessonType,
      jumping,
      paymentType,
      tierName,
      instructorId,
    },
  }
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
  const { newHorseName, newHorseExertionLevel, exertionLevels, riderIds, lessonAt, fee, lessonType, jumping, paymentType, tierName, instructorId } = parsed.data

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
  const { newHorseName, newHorseExertionLevel, exertionLevels, riderIds, lessonAt, fee, lessonType, jumping, paymentType, tierName, instructorId } = parsed.data

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

  if (membership.role === 'trainer' && lesson.instructor_id !== membership.id) {
    redirect(`/barn/${barnSlug}/lessons`)
    return
  }

  const isEligible =
    lesson.cancelled_at === null &&
    (new Date(lesson.lesson_at) > new Date() || lesson.payment_type === null)
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

  let recipientIds: string[]
  if (membership.role === 'trainer') {
    const managerUserIds = await getActiveManagerUserIds(barnId)
    recipientIds = [...managerUserIds, ...riderUserIds]
  } else {
    recipientIds = lesson.instructor_user_id ? [lesson.instructor_user_id, ...riderUserIds] : riderUserIds
  }

  await Promise.allSettled(
    recipientIds.map((userId) =>
      createNotification({
        userId,
        barnId,
        type: 'lesson_cancelled',
        title: 'Lesson cancelled',
        link: `/barn/${barnSlug}/lessons/${lessonId}`,
      })
    )
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

  if (membership.role === 'trainer' && lesson.instructor_id !== membership.id) {
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

  const isEligible =
    targetRider.cancelled_at === null &&
    (new Date(lesson.lesson_at) > new Date() || lesson.payment_type === null)
  if (!isEligible) {
    redirect(`/barn/${barnSlug}/lessons/${lessonId}`)
    return
  }

  const isLate = computeCancellationIsLate(lesson.lesson_at, formData, membership.role !== 'rider')

  const notes = (formData.get('notes') as string | null)?.trim() || null
  await cancelRiderParticipation(lessonId, barnId, riderId, notes, isLate)

  let recipientIds: string[]
  if (membership.role === 'rider') {
    const managerUserIds = await getActiveManagerUserIds(barnId)
    recipientIds = lesson.instructor_user_id ? [lesson.instructor_user_id, ...managerUserIds] : managerUserIds
  } else {
    const affectedUserId = targetRider.barn_membership.user_id
    const riderRecipients = affectedUserId ? [affectedUserId] : []
    if (membership.role === 'trainer') {
      const managerUserIds = await getActiveManagerUserIds(barnId)
      recipientIds = [...riderRecipients, ...managerUserIds]
    } else {
      recipientIds = riderRecipients
    }
  }

  await Promise.allSettled(
    recipientIds.map((userId) =>
      createNotification({
        userId,
        barnId,
        type: 'rider_participation_cancelled',
        title: 'Lesson participation cancelled',
        link: `/barn/${barnSlug}/lessons/${lessonId}`,
      })
    )
  )

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
