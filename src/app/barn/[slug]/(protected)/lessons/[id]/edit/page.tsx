import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getInstructorsByBarn } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { updateLessonAction } from '@/app/actions/lessons'
import { LessonForm } from '../../LessonForm'

export default async function EditLessonPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) notFound()

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) notFound()

  const [lesson, membership] = await Promise.all([
    getLessonById(id, barn.id),
    getEffectiveMembership(user.id, barn.id),
  ])

  if (!membership || membership.status !== 'active') notFound()
  if (membership.role !== 'manager') notFound()
  if (!lesson) notFound()

  const [horses, riders, tiers, instructors] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRidersByBarn(barn.id),
    getAllTiersByBarn(barn.id),
    getInstructorsByBarn(barn.id),
  ])

  const update = updateLessonAction.bind(null, lesson.id, barn.slug, barn.id)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Lesson
      </h1>
      <LessonForm
        mode="edit"
        initialLesson={lesson}
        horses={horses}
        riders={riders}
        isManager={true}
        instructors={instructors}
        currentUserId={user.id}
        tiers={tiers}
        action={update}
      />
    </main>
  )
}
