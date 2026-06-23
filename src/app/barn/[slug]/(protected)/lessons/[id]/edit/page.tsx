import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getInstructorsByBarn, getUserMembership } from '@/lib/db/barn-memberships'
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

  const user = await getAuthenticatedUser()

  if (!user) notFound()

  const [lesson, membership] = await Promise.all([
    getLessonById(id, barn.id),
    getUserMembership(user.id, barn.id),
  ])

  if (!membership || membership.status !== 'active') notFound()
  if (membership.role !== 'manager') notFound()
  if (!lesson) notFound()

  const [horses, riders, tiers, instructorList] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRidersByBarn(barn.id),
    getAllTiersByBarn(barn.id),
    getInstructorsByBarn(barn.id),
  ])

  const instructors = lesson.instructor_id && instructorList.every((i) => i.userId !== lesson.instructor_id)
    ? [{ userId: lesson.instructor_id, name: 'Former Instructor' }, ...instructorList]
    : instructorList

  const activeHorseIds = new Set(horses.map((h) => h.id))
  const inactiveAssigned = lesson.lesson_horses
    .filter((lh) => lh.horses && !activeHorseIds.has(lh.horses.id))
    .map((lh) => ({
      id: lh.horses!.id,
      barn_id: barn.id,
      name: `${lh.horses!.name} (inactive)`,
      is_active: false,
      is_available: true,
      unavailability_reason: null,
      created_at: '',
      updated_at: '',
    }))
  const horsesForForm = [...horses, ...inactiveAssigned]

  const update = updateLessonAction.bind(null, lesson.id, barn.slug, barn.id)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Lesson
      </h1>
      <LessonForm
        mode="edit"
        initialLesson={lesson}
        horses={horsesForForm}
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
