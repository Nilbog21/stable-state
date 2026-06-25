'use server'

import { requireMembership } from '@/lib/auth/guard'
import { deleteLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes } from '@/lib/db/lesson-participants'
import type { PaymentType } from '@/lib/db/types'
import { getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { redirect } from 'next/navigation'

function parseExertionLevel(raw: FormDataEntryValue | null): number {
  const n = parseInt(raw as string ?? '', 10)
  return Number.isNaN(n) ? 3 : Math.max(1, Math.min(5, n))
}

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
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

  const { user, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const isManager = membership.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || user.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== user.id) {
    const instructors = await getInstructorsByBarn(barnId)
    if (!instructors.some((i) => i.userId === instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const fee = feeRaw ? parseFloat(feeRaw) : null

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

  if (formData.get('is_custom') === 'true' && !feeRaw) return { error: 'fee required for custom tier' }

  try {
    if (newHorseName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add horses' }
      }
      const horse = await createHorse(barnId, newHorseName)
      horseIds.push(horse.id)
      exertionLevels.set(horse.id, newHorseExertionLevel)
    }

    await createLessonWithParticipants({
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
  let horseIds = formData.getAll('horse_id') as string[]
  const riderIds = (formData.getAll('rider_id') as string[]).filter(id => id !== '')
  const newHorseName = (formData.get('new_horse_name') as string | null)?.trim() || null
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null
  const lessonTypeRaw = (formData.get('lesson_type') as string | null) ?? 'normal'
  const jumping = formData.get('jumping') === 'true'
  const paymentTypeRaw = (formData.get('payment_type') as string | null) || null
  const tierName = (formData.get('tier_name') as string | null) ?? 'Custom'

  if (lessonTypeRaw !== 'normal' && lessonTypeRaw !== 'group') return { error: 'invalid lesson type' }
  const lessonType = lessonTypeRaw as 'normal' | 'group'

  if (horseIds.length === 0 && !newHorseName) return { error: 'horse required' }
  if (newHorseName && horseIds.length > 0) return { error: 'select a horse or add a new one, not both' }
  if (lessonType === 'normal' && riderIds.length === 0) return { error: 'rider required' }
  if (lessonType === 'normal' && riderIds.length > 1) return { error: 'normal lesson requires exactly 1 rider' }
  if (lessonType === 'group' && riderIds.length < 2) return { error: 'group lesson requires at least 2 riders' }
  if (!lessonAt) return { error: 'date and time required' }

  const { user, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  const isManager = membership.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || user.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== user.id) {
    const instructors = await getInstructorsByBarn(barnId)
    if (!instructors.some((i) => i.userId === instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const fee = feeRaw ? parseFloat(feeRaw) : null
  const paymentType = paymentTypeRaw as PaymentType | null

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
    if (horseIds.some((id) => !validHorseIds.has(id))) return { error: 'horse not found in this barn' }
  }

  if (riderIds.length > 0) {
    const validRiderIds = new Set(barnRiders.map((m) => m.membershipId))
    if (riderIds.some((id) => !validRiderIds.has(id))) return { error: 'rider not found in this barn' }
  }

  try {
    if (newHorseName) {
      if (!isManager) return { error: 'not authorized to add horses' }
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

export async function deleteLessonAction(
  barnId: string,
  barnSlug: string,
  lessonId: string
): Promise<{ error: string }> {
  await requireMembership(barnSlug, ['manager'])

  try {
    await deleteLesson(lessonId, barnId)
  } catch {
    return { error: 'Failed to delete lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}

export async function updatePaymentTypeAction(
  lessonId: string,
  barnSlug: string,
  paymentType: string | null
): Promise<{ error: string | null }> {
  const { user, barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer'])

  if (membership.role === 'trainer') {
    const lesson = await getLessonById(lessonId, barn.id, 'trainer')
    if (!lesson) return { error: 'lesson not found' }
    if (lesson.instructor_id !== user.id) return { error: 'not authorized' }
  }

  try {
    await updateLesson(lessonId, barn.id, { payment_type: paymentType as PaymentType | null })
  } catch {
    return { error: 'Failed to update payment type' }
  }

  return { error: null }
}
