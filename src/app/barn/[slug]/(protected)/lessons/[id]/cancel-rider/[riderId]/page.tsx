import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { cancelRiderParticipationAction } from '@/app/actions/lessons'
import { Button } from '@/components/ui/Button'
import { canManageLesson, isLessonCancellationEligible } from '@/lib/lesson-authorization'

export default async function CancelRiderParticipationPage({
  params,
}: {
  params: Promise<{ slug: string; id: string; riderId: string }>
}) {
  const { slug, id, riderId } = await params
  const barn = await getBarnBySlug(slug)
  if (!barn) notFound()

  const user = await getAuthenticatedUser()
  if (!user) notFound()

  const membership = await getUserMembership(user.id, barn.id)
  if (!membership || membership.status !== 'active') notFound()

  const role = membership.role
  const lesson = await getLessonById(id, barn.id, role, user.id)
  if (!lesson) notFound()
  if (lesson.cancelled_at !== null) notFound()
  if (role === 'trainer' && !canManageLesson(role, membership.id, lesson)) notFound()

  const targetRider = lesson.lesson_riders.find((lr) => lr.barn_membership?.id === riderId) ?? null
  if (!targetRider?.barn_membership) notFound()
  if (role === 'rider' && targetRider.barn_membership.user_id !== user.id) notFound()

  const isEligible = targetRider.cancelled_at === null && isLessonCancellationEligible(lesson)
  if (!isEligible) notFound()

  const cancel = cancelRiderParticipationAction.bind(null, barn.id, slug, lesson.id, riderId)
  const cancelledByInstructorDefault = lesson.instructor_id === membership.id

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-sm">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Cancel Participation
        </h1>
        <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
          This will cancel {targetRider.barn_membership.name}&apos;s spot in this lesson. This
          cannot be undone.
        </p>
        <form action={cancel} className="flex flex-col gap-4">
          {role === 'rider' ? (
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</span>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">Cancelled by Rider</span>
            </div>
          ) : (
            <fieldset className="flex flex-col gap-2">
              <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</legend>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="radio" name="cancel_type" value="rider" defaultChecked={!cancelledByInstructorDefault} />
                Cancelled by Rider
              </label>
              <label className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300">
                <input type="radio" name="cancel_type" value="instructor" defaultChecked={cancelledByInstructorDefault} />
                Cancelled by Instructor
              </label>
            </fieldset>
          )}
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
