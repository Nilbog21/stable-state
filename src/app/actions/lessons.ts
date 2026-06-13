'use server'

import { createClient } from '@/lib/supabase/server'
import { createLessonWithParticipants, deleteLesson } from '@/lib/db/lessons'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { createRider, getRidersByBarn } from '@/lib/db/riders'
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
  let riderIds = formData.getAll('rider_id') as string[]
  const newRiderName = (formData.get('new_rider_name') as string | null)?.trim() || null
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null
  const lessonTypeRaw = (formData.get('lesson_type') as string | null) ?? 'normal'

  if (lessonTypeRaw !== 'normal' && lessonTypeRaw !== 'group') return { error: 'invalid lesson type' }
  const lessonType = lessonTypeRaw as 'normal' | 'group'

  if (riderIds.length === 0 && !newRiderName) return { error: 'rider required' }
  if (riderIds.length > 0 && newRiderName) return { error: 'select a rider or add a new one, not both' }
  if (lessonType === 'normal' && riderIds.length > 1) return { error: 'normal lesson requires exactly 1 rider' }
  if (lessonType === 'group' && riderIds.length < 2) return { error: 'group lesson requires at least 2 riders' }
  if (!lessonAt) return { error: 'date and time required' }
  if (!newHorseName && horseIds.length === 0) return { error: 'horse required' }
  if (newHorseName && horseIds.length > 0) return { error: 'select a horse or add a new one, not both' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  const membership = await getUserMembership(user.id, barnId)
  if (!membership || !['manager', 'trainer'].includes(membership.role)) {
    return { error: 'not authorized' }
  }
  const isManager = membership.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || user.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== user.id) {
    const trainerMemberships = await getActiveTrainerMembershipsByBarn(barnId)
    const validIds = new Set(trainerMemberships.map((m) => m.user_id))
    if (!validIds.has(instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const fee = feeRaw ? parseFloat(feeRaw) : null

  const exertionLevels = new Map<string, number>(
    horseIds.map(id => [id, parseExertionLevel(formData.get(`exertion_${id}`))])
  )
  const newHorseExertionLevel = parseExertionLevel(formData.get('new_horse_exertion_level'))

  const [barnHorses, barnRiders] = await Promise.all([
    getHorsesByBarn(barnId),
    getRidersByBarn(barnId),
  ])

  if (horseIds.length > 0) {
    const validHorseIds = new Set(barnHorses.map((h) => h.id))
    if (horseIds.some((id) => !validHorseIds.has(id))) {
      return { error: 'horse not found in this barn' }
    }
  }

  if (riderIds.length > 0) {
    const validRiderIds = new Set(barnRiders.map((r) => r.id))
    if (riderIds.some((id) => !validRiderIds.has(id))) {
      return { error: 'rider not found in this barn' }
    }
  }

  try {
    if (newHorseName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add horses' }
      }
      const horse = await createHorse(barnId, newHorseName)
      horseIds.push(horse.id)
      exertionLevels.set(horse.id, newHorseExertionLevel)
    }

    if (newRiderName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add riders' }
      }
      const rider = await createRider(barnId, newRiderName)
      riderIds = [rider.id]
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
    })
  } catch {
    return { error: 'Failed to submit lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}

export async function deleteLessonAction(
  barnId: string,
  barnSlug: string,
  lessonId: string
): Promise<{ error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  const membership = await getUserMembership(user.id, barnId)
  if (membership?.role !== 'manager') {
    return { error: 'not authorized' }
  }

  try {
    await deleteLesson(lessonId, barnId)
  } catch {
    return { error: 'Failed to delete lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}
