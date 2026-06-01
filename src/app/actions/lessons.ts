'use server'

import { createClient } from '@/lib/supabase/server'
import { createLesson, addHorseToLesson, addRiderToLesson } from '@/lib/db/lessons'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { createHorse } from '@/lib/db/horses'
import { createRider } from '@/lib/db/riders'
import { redirect } from 'next/navigation'

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const horseIds = formData.getAll('horse_id') as string[]
  const newHorseName = (formData.get('new_horse_name') as string | null)?.trim() || null
  let riderId = (formData.get('rider_id') as string | null) || null
  const newRiderName = (formData.get('new_rider_name') as string | null)?.trim() || null
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null

  if (!riderId && !newRiderName) return { error: 'rider required' }
  if (riderId && newRiderName) return { error: 'select a rider or add a new one, not both' }
  if (!lessonAt) return { error: 'date and time required' }
  if (!newHorseName && horseIds.length === 0) return { error: 'horse required' }
  if (newHorseName && horseIds.length > 0) return { error: 'select a horse or add a new one, not both' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) return { error: 'not authenticated' }

  const membership = await getUserMembership(user.id, barnId)
  const isManager = membership?.role === 'manager'
  const instructorIdFromForm = isManager ? (formData.get('instructor_id') as string | null) : null
  const instructorId = instructorIdFromForm || user.id

  if (isManager && instructorIdFromForm && instructorIdFromForm !== user.id) {
    const trainerMemberships = await getActiveTrainerMembershipsByBarn(barnId)
    const validIds = new Set(trainerMemberships.map((m) => m.user_id))
    if (!validIds.has(instructorIdFromForm)) return { error: 'Invalid instructor' }
  }

  const fee = feeRaw ? parseFloat(feeRaw) : null

  try {
    if (newHorseName) {
      const membership = await getUserMembership(user.id, barnId)
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add horses' }
      }
      const horse = await createHorse(barnId, newHorseName)
      horseIds.push(horse.id)
    }

    if (newRiderName) {
      if (membership?.role !== 'manager') {
        return { error: 'not authorized to add riders' }
      }
      const rider = await createRider(barnId, newRiderName)
      riderId = rider.id
    }

    const lesson = await createLesson({
      barnId,
      instructorId,
      fee,
      lessonAt,
    })

    await Promise.all(horseIds.map(id => addHorseToLesson(lesson.id, id, barnId)))
    await addRiderToLesson(lesson.id, riderId!, barnId)
  } catch {
    return { error: 'Failed to submit lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}
