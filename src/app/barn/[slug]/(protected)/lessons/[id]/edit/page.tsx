import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getInstructorsByBarn, getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getSeriesById } from '@/lib/db/lesson-series'
import { updateLessonAction, stopLessonSeriesAction } from '@/app/actions/lessons'
import { LessonForm } from '../../LessonForm'
import { StopSeriesButton } from '../../StopSeriesButton'

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

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()
  if (membership.role !== 'manager' && membership.role !== 'trainer') notFound()

  const role = membership.role as 'manager' | 'trainer'

  const [lesson, horses, riderMembers, tiers, instructorList] = await Promise.all([
    getLessonById(id, barn.id, role),
    getHorsesByBarn(barn.id),
    getActiveMembersWithProfiles(barn.id, 'rider'),
    getAllTiersByBarn(barn.id),
    getInstructorsByBarn(barn.id),
  ])

  if (!lesson) notFound()
  if (membership.role === 'trainer' && lesson.instructor_id !== membership.id) notFound()
  const riders = riderMembers.map((m) => ({ id: m.membershipId, name: m.name }))

  const series = lesson.series_id ? await getSeriesById(lesson.series_id, barn.id) : null
  const canStopSeries = membership.role === 'manager' || series?.instructor_id === membership.id
  const stopSeries = series && canStopSeries ? stopLessonSeriesAction.bind(null, slug, lesson.id, series.id) : null

  const instructors = lesson.instructor_id && instructorList.every((i) => i.membershipId !== lesson.instructor_id)
    ? [{ membershipId: lesson.instructor_id, userId: null, name: 'Former Instructor' }, ...instructorList]
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
      deactivated_at: null,
      exhaustion_threshold_high: null,
      exhaustion_threshold_moderate: null,
      created_at: '',
      updated_at: '',
    }))
  const horsesForForm = [...horses, ...inactiveAssigned]

  const update = updateLessonAction.bind(null, lesson.id, barn.slug, barn.id)

  const initialNotes = {
    horses: lesson.lesson_horses
      .filter(lh => lh.horses?.id)
      .map(lh => ({ id: lh.horses!.id, name: lh.horses!.name, horse_notes: lh.horse_notes })),
    riders: lesson.lesson_riders
      .filter(lr => lr.barn_membership?.id)
      .map(lr => ({ membershipId: lr.barn_membership!.id, name: lr.barn_membership!.name, rider_notes: lr.rider_notes, private_notes: lr.private_notes })),
  }

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white pt-8 dark:bg-black">
      <h1 className="w-full max-w-sm text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Edit Lesson
      </h1>
      <LessonForm
        mode="edit"
        initialLesson={lesson}
        horses={horsesForForm}
        riders={riders}
        isManager={membership.role === 'manager'}
        instructors={instructors}
        currentMembershipId={membership.id}
        tiers={tiers}
        action={update}
        initialNotes={initialNotes}
      />
      {series?.is_active && stopSeries && (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">This is part of a recurring series</p>
          <StopSeriesButton action={stopSeries} />
        </div>
      )}
    </main>
  )
}
