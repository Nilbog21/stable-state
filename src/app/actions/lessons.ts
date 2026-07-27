'use server'

import { requireMembership } from '@/lib/auth/guard'
import { collectLessonPayment, deleteLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes, updateCancellationFeePaymentType } from '@/lib/db/lesson-participants'
import { createLessonSeries, getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import type { PaymentType } from '@/lib/db/types'
import { createHorse, getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { parseLessonFormData } from './lesson-form-parsing'

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

  const lesson = await getLessonById(lessonId, barnId, membership.role, membership.id)
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
