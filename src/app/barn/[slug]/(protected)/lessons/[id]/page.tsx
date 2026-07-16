import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonById } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import type { LessonDetail } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'
import { canManageLesson, isLessonCancellationEligible, getHorseAttentionReasons } from '@/lib/lesson-authorization'
import { DeleteLessonButton } from '../DeleteLessonButton'
import { HorseStatusBanner } from '../HorseStatusBanner'
import { deleteLessonAction } from '@/app/actions/lessons'

function RiderStatusBadge({ cancelledAt }: { cancelledAt: string | null }) {
  if (cancelledAt === null) return null
  return (
    <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
      Cancelled
    </span>
  )
}

function RiderNotesBlock({
  lr,
  canSeeNotes,
}: {
  lr: LessonDetail['lesson_riders'][number]
  canSeeNotes: boolean
}) {
  if (!lr.barn_membership?.id) return null
  const hasStaffNotes = canSeeNotes && (lr.rider_notes || lr.private_notes)
  if (!hasStaffNotes && !lr.cancellation_notes) return null
  return (
    <div className="mt-1 flex flex-col gap-1">
      {canSeeNotes && lr.rider_notes && (
        <div>
          <p className="text-xs font-medium text-zinc-500">Rider Notes</p>
          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.rider_notes}</p>
        </div>
      )}
      {canSeeNotes && lr.private_notes && (
        <div className="rounded border border-zinc-200 bg-zinc-50 p-2 dark:border-zinc-700 dark:bg-zinc-900">
          <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">Private</p>
          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.private_notes}</p>
        </div>
      )}
      {lr.cancellation_notes && (
        <div>
          <p className="text-xs font-medium text-zinc-500">Cancellation Notes</p>
          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lr.cancellation_notes}</p>
        </div>
      )}
    </div>
  )
}

function OwnRiderNotesBlock({
  myRiderEntry,
  showOwnRiderBadge,
}: {
  myRiderEntry: LessonDetail['lesson_riders'][number]
  showOwnRiderBadge: boolean
}) {
  return (
    <div className="mt-2">
      <div className={`flex items-center gap-2 ${myRiderEntry.rider_notes ? 'justify-between' : 'justify-end'}`}>
        {myRiderEntry.rider_notes && <p className="text-xs font-medium text-zinc-500">Your Notes</p>}
        {showOwnRiderBadge && <RiderStatusBadge cancelledAt={myRiderEntry.cancelled_at} />}
      </div>
      {myRiderEntry.rider_notes && (
        <p className="text-sm text-zinc-900 dark:text-zinc-50">{myRiderEntry.rider_notes}</p>
      )}
    </div>
  )
}

export default async function LessonDetailPage({
  params,
}: {
  params: Promise<{ slug: string; id: string }>
}) {
  const { slug, id } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const user = await getAuthenticatedUser()

  if (!user) {
    notFound()
  }

  const membership = await getUserMembership(user.id, barn.id)

  if (!membership || membership.status !== 'active') {
    notFound()
  }

  const role = membership.role
  const lesson = await getLessonById(id, barn.id, role, membership.id)

  if (!lesson) {
    notFound()
  }

  const instructorName = lesson.instructor_name ?? '—'

  const formattedDate = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(lesson.lesson_at))

  const canSeeNotes = role === 'trainer' || role === 'manager'

  const myRiderEntry = role === 'rider'
    ? lesson.lesson_riders.find((lr) => lr.barn_membership?.id === membership.id) ?? null
    : null

  if (role === 'rider' && myRiderEntry === null) {
    notFound()
  }

  const lessonEligibleWindow = isLessonCancellationEligible(lesson)
  const canManage = canManageLesson(role, membership.id, lesson)
  const showManagerRiderActions = lesson.cancelled_at === null && canManage
  const showOwnRiderAction = lesson.cancelled_at === null && role === 'rider'

  const canCancelWhole = canManage && lesson.cancelled_at === null && lessonEligibleWindow
  const canCancelOwn =
    role === 'rider' &&
    myRiderEntry !== null &&
    myRiderEntry.barn_membership?.id != null &&
    lesson.cancelled_at === null &&
    myRiderEntry.cancelled_at === null &&
    lessonEligibleWindow

  const attentionReasons = getHorseAttentionReasons(lesson)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <HorseStatusBanner reasons={attentionReasons} />
      <div className="w-full max-w-2xl">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Lesson Detail
            </h1>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
              {lesson.lesson_type === 'group' ? 'Group' : 'Normal'}
            </span>
            {lesson.jumping && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Jumping
              </span>
            )}
            {lesson.series_id !== null && (
              <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                Recurring
              </span>
            )}
            {lesson.cancelled_at !== null && (
              <span className="rounded-full bg-red-600 px-2 py-0.5 text-xs font-medium text-white">
                Cancelled
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {canManage && (
              <Button href={`/barn/${slug}/lessons/${lesson.id}/edit`} variant="ghost">
                Edit
              </Button>
            )}
            {canCancelWhole && (
              <Button href={`/barn/${slug}/lessons/${lesson.id}/cancel`} variant="danger">
                Cancel
              </Button>
            )}
            {canCancelOwn && myRiderEntry?.barn_membership?.id && (
              <Button href={`/barn/${slug}/lessons/${lesson.id}/cancel-rider/${myRiderEntry.barn_membership.id}`} variant="danger">
                Cancel
              </Button>
            )}
            {role === 'manager' && (
              lesson.fee === 0 || lesson.payment_type !== null
                ? <Button href={`/barn/${slug}/lessons/${lesson.id}/delete`} variant="danger">Delete</Button>
                : <DeleteLessonButton action={deleteLessonAction.bind(null, barn.id, slug, lesson.id)} />
            )}
          </div>
        </div>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Date &amp; Time</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{formattedDate}</dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Instructor</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{instructorName}</dd>
          </div>
          {lesson.cancellation_notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Cancellation Notes</dt>
              <dd className="text-sm text-zinc-900 dark:text-zinc-50">{lesson.cancellation_notes}</dd>
            </div>
          )}
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Horse(s)</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.lesson_horses.length === 0 ? '—' : (
                <ul className="flex flex-col gap-2">
                  {lesson.lesson_horses.map((lh, i) => (
                    <li key={lh.horses?.id ?? i}>
                      <span>{lh.horses?.name ?? '—'}</span>{' '}
                      <span className="text-zinc-500">(exertion {lh.exertion_level})</span>{' '}
                      {lh.horses?.is_active === false ? (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Inactive</span>
                      ) : lh.horses?.is_available === false ? (
                        <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Unavailable</span>
                      ) : null}
                      {canSeeNotes && lh.horses?.id && lh.horse_notes && (
                        <div className="mt-1">
                          <p className="text-xs font-medium text-zinc-500">Horse Notes</p>
                          <p className="text-sm text-zinc-900 dark:text-zinc-50">{lh.horse_notes}</p>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Rider(s)</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {lesson.lesson_riders.length === 0 ? '—' : lesson.lesson_type === 'group' ? (
                <>
                  <ul className="flex flex-col gap-2">
                    {lesson.lesson_riders.map((lr, i) => (
                      <li key={lr.barn_membership?.id ?? i}>
                        <div className="flex items-center justify-between gap-2">
                          <span>{lr.barn_membership?.name ?? '—'}</span>
                          {showManagerRiderActions && lr.barn_membership?.id && (
                            <RiderStatusBadge cancelledAt={lr.cancelled_at} />
                          )}
                        </div>
                        <RiderNotesBlock lr={lr} canSeeNotes={canSeeNotes} />
                      </li>
                    ))}
                  </ul>
                  {role === 'rider' && myRiderEntry && (
                    <OwnRiderNotesBlock
                      myRiderEntry={myRiderEntry}
                      showOwnRiderBadge={showOwnRiderAction}
                    />
                  )}
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  {lesson.lesson_riders.map((lr, i) => (
                    <div key={lr.barn_membership?.id ?? i}>
                      <div className="flex items-center justify-between gap-2">
                        <span>{lr.barn_membership?.name ?? '—'}</span>
                        {showManagerRiderActions && lr.barn_membership?.id && (
                          <RiderStatusBadge cancelledAt={lr.cancelled_at} />
                        )}
                      </div>
                      <RiderNotesBlock lr={lr} canSeeNotes={canSeeNotes} />
                    </div>
                  ))}
                  {role === 'rider' && myRiderEntry && (
                    <OwnRiderNotesBlock
                      myRiderEntry={myRiderEntry}
                      showOwnRiderBadge={showOwnRiderAction}
                    />
                  )}
                </div>
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Fee</dt>
            <dd className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              ${lesson.fee}
              {lesson.payment_type === null && lesson.fee > 0 && new Date(lesson.lesson_at) < new Date() && (
                <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-medium text-white">Unpaid</span>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </main>
  )
}
