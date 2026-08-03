import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { cancelLessonAction } from '@/app/actions/lesson-cancellation'
import { Button } from '@/components/ui/Button'
import { canManageLesson, isLessonCancellationEligible, isInstructorOfLesson } from '@/lib/lesson-authorization'
import { CancelLessonFields } from './CancelLessonFields'

export default async function CancelLessonPage({
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
  const lesson = await getLessonById(id, barn.id, role, barn.timezone)
  if (!lesson) notFound()
  if (role === 'trainer' && !canManageLesson(role, membership.id, lesson)) notFound()

  const isEligible = lesson.cancelled_at === null && isLessonCancellationEligible(lesson)
  if (!isEligible) notFound()

  const cancel = cancelLessonAction.bind(null, barn.id, slug, lesson.id)
  const cancelledByInstructorDefault = isInstructorOfLesson(membership.id, lesson)

  const activeLessonRiders = lesson.lesson_riders.filter((lr) => lr.cancelled_at === null)
  const activeRiderNames = activeLessonRiders
    .map((lr) => lr.barn_membership?.name)
    .filter((name): name is string => Boolean(name))
  const pickerRiders = activeLessonRiders
    .filter((lr): lr is typeof lr & { barn_membership: NonNullable<typeof lr.barn_membership> } => Boolean(lr.barn_membership))
    .map((lr) => ({ id: lr.barn_membership.id, name: lr.barn_membership.name }))
  const groupInstructorDescription = `This will mark the lesson as cancelled and zero out its fee for ${activeLessonRiders.length} enrolled rider${activeLessonRiders.length === 1 ? '' : 's'}: ${activeRiderNames.join(', ')}. This cannot be undone.`

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cancel Lesson
        </h1>
        {lesson.lesson_type === 'normal' && (
          <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
            This will mark the lesson as cancelled. This cannot be undone.
          </p>
        )}
        <form action={cancel} className="flex flex-col gap-4">
          <CancelLessonFields
            lessonType={lesson.lesson_type}
            cancelledByInstructorDefault={cancelledByInstructorDefault}
            groupInstructorDescription={groupInstructorDescription}
            pickerRiders={pickerRiders}
            lessonAt={lesson.lesson_at}
          />
          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Cancellation notes (optional)
            </label>
            <textarea
              id="notes"
              name="notes"
              rows={3}
              className="w-full rounded-lg border border-zinc-200 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            />
          </div>
          <Button type="submit" variant="danger">Confirm Cancellation</Button>
        </form>
      </div>
    </main>
  )
}
