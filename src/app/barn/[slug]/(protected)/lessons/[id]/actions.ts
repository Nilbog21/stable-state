'use server'

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import { updateLessonRiderNotes, updateLessonHorseNotes } from '@/lib/db/lesson-participants'

export async function updateAllNotesAction(slug: string, lessonId: string, formData: FormData) {
  const { barn } = await requireMembership(slug, ['trainer', 'manager'])
  const horseIds = formData.getAll('horseIds') as string[]
  for (const horseId of horseIds) {
    const horseNotes = (formData.get(`horse_notes_${horseId}`) as string) || null
    await updateLessonHorseNotes(lessonId, horseId, barn.id, horseNotes)
  }
  const riderIds = formData.getAll('riderIds') as string[]
  for (const riderId of riderIds) {
    const riderNotes = (formData.get(`rider_notes_${riderId}`) as string) || null
    const privateNotes = (formData.get(`private_notes_${riderId}`) as string) || null
    await updateLessonRiderNotes(lessonId, riderId, barn.id, riderNotes, privateNotes)
  }
  revalidatePath(`/barn/${slug}/lessons/${lessonId}`)
}
