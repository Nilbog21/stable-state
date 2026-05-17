'use server'

import { createClient } from '@/lib/supabase/server'
import { createLesson, addHorseToLesson, addRiderToLesson } from '@/lib/db/lessons'
import { redirect } from 'next/navigation'

export async function submitLesson(
  barnId: string,
  barnSlug: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const horseId = formData.get('horse_id') as string | null
  const riderId = formData.get('rider_id') as string | null
  const lessonAt = formData.get('lesson_at') as string
  const feeRaw = formData.get('fee') as string | null

  if (!horseId) return { error: 'horse required' }
  if (!riderId) return { error: 'rider required' }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const fee = feeRaw ? parseFloat(feeRaw) : null

  const lesson = await createLesson({
    barnId,
    instructorId: user?.id ?? null,
    fee,
    lessonAt,
  })

  await addHorseToLesson(lesson.id, horseId, barnId)
  await addRiderToLesson(lesson.id, riderId, barnId)

  redirect(`/barn/${barnSlug}/lessons`)
}
