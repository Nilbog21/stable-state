'use server'

import { createClient } from '@/lib/supabase/server'
import { createLesson, addHorseToLesson, addRiderToLesson } from '@/lib/db/lessons'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { redirect } from 'next/navigation'

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const horseId = formData.get('horse_id') as string | null
  const riderId = formData.get('rider_id') as string | null
  const lessonAt = formData.get('lesson_at') as string | null
  const feeRaw = formData.get('fee') as string | null

  if (!horseId) return { error: 'horse required' }
  if (!riderId) return { error: 'rider required' }
  if (!lessonAt) return { error: 'date and time required' }

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
    const lesson = await createLesson({
      barnId,
      instructorId,
      fee,
      lessonAt,
    })

    await addHorseToLesson(lesson.id, horseId, barnId)
    await addRiderToLesson(lesson.id, riderId, barnId)
  } catch {
    return { error: 'Failed to submit lesson' }
  }

  redirect(`/barn/${barnSlug}/lessons`)
}
