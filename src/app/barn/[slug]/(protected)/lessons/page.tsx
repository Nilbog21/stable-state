import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { OlderLessonsToggle } from './OlderLessonsToggle'
import { LessonListItem } from './LessonListItem'
import { EmptyState } from '@/components/EmptyState'
import type { LessonWithDetails } from '@/lib/db/types'

const OLDER_LESSON_CUTOFF_DAYS = 7

const pillBase = 'rounded-full px-4 py-1.5 text-sm font-medium transition-colors'
const pillActive = 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
const pillInactive = 'border border-zinc-300 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 dark:border-zinc-600 dark:text-zinc-400 dark:hover:border-zinc-300 dark:hover:text-zinc-50'

function pillClass(active: boolean) {
  return `${pillBase} ${active ? pillActive : pillInactive}`
}

function buildRiderOptions(lessons: LessonWithDetails[]): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const lesson of lessons) {
    lesson.rider_ids.forEach((id, i) => {
      if (!map.has(id) && lesson.rider_names[i]) map.set(id, lesson.rider_names[i])
    })
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}

function buildHorseOptions(lessons: LessonWithDetails[]): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const lesson of lessons) {
    lesson.horse_ids.forEach((id, i) => {
      if (!map.has(id) && lesson.horse_names[i]) map.set(id, lesson.horse_names[i])
    })
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}

function buildTrainerOptions(lessons: LessonWithDetails[]): { id: string; name: string }[] {
  const map = new Map<string, string>()
  for (const lesson of lessons) {
    if (lesson.instructor_id && lesson.instructor_name) {
      map.set(lesson.instructor_id, lesson.instructor_name)
    }
  }
  return [...map.entries()].map(([id, name]) => ({ id, name }))
}

export default async function LessonsPage({
  params,
  searchParams = Promise.resolve({}),
}: {
  params: Promise<{ slug: string }>
  searchParams?: Promise<{ filter?: string; id?: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const user = await getAuthenticatedUser()

  if (!user) {
    notFound()
  }

  const membership = await getUserMembership(user.id, barn.id)

  if (!membership) {
    notFound()
  }

  const { filter: filterParam, id: filterId } = await searchParams
  const filter = filterParam === 'trainer' || filterParam === 'rider' || filterParam === 'horse' ? filterParam : null

  const allLessons = await getLessonsByBarn(barn.id, user.id, membership.role)
  const isManager = membership.role === 'manager'
  const isTrainer = membership.role === 'trainer'

  let lessons = allLessons
  if (filter && filterId) {
    if (filter === 'trainer' && isManager) {
      lessons = allLessons.filter((l) => l.instructor_id === filterId)
    } else if (filter === 'rider' && (isManager || isTrainer)) {
      lessons = allLessons.filter((l) => l.rider_ids.includes(filterId))
    } else if (filter === 'horse' && isManager) {
      lessons = allLessons.filter((l) => l.horse_ids.includes(filterId))
    }
  }
  const canCreateLesson = isManager || isTrainer

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - OLDER_LESSON_CUTOFF_DAYS)
  const recentLessons = lessons.filter((l) => new Date(l.lesson_at) >= cutoff)
  const olderLessons = lessons.filter((l) => new Date(l.lesson_at) < cutoff)

  const riderOptions = isManager || isTrainer ? buildRiderOptions(allLessons) : []
  const trainerOptions = isManager ? buildTrainerOptions(allLessons) : []
  const horseOptions = isManager ? buildHorseOptions(allLessons) : []

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Lessons
        </h1>
        {canCreateLesson && (
          <Link
            href={`/barn/${slug}/lessons/new`}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            New Lesson
          </Link>
        )}
      </div>

      {isTrainer && riderOptions.length > 0 && (
        <div className="w-full max-w-2xl overflow-x-auto">
          <div className="flex min-w-max gap-2 pb-2">
            <Link href="?" className={pillClass(!filter)}>All</Link>
            {riderOptions.map((r) => (
              <Link
                key={r.id}
                href={`?filter=rider&id=${r.id}`}
                className={pillClass(filter === 'rider' && filterId === r.id)}
              >
                {r.name}
              </Link>
            ))}
          </div>
        </div>
      )}

      {isManager && (
        <div className="w-full max-w-2xl flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2 pb-2">
              <Link href="?" className={pillClass(!filter)}>All</Link>
              <Link href="?filter=trainer" className={pillClass(filter === 'trainer')}>By Trainer</Link>
              <Link href="?filter=rider" className={pillClass(filter === 'rider')}>By Rider</Link>
              <Link href="?filter=horse" className={pillClass(filter === 'horse')}>By Horse</Link>
            </div>
          </div>
          {filter === 'trainer' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Link href="?filter=trainer" className={pillClass(!filterId)}>All</Link>
                {trainerOptions.map((t) => (
                  <Link
                    key={t.id}
                    href={`?filter=trainer&id=${t.id}`}
                    className={pillClass(filterId === t.id)}
                  >
                    {t.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {filter === 'rider' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Link href="?filter=rider" className={pillClass(!filterId)}>All</Link>
                {riderOptions.map((r) => (
                  <Link
                    key={r.id}
                    href={`?filter=rider&id=${r.id}`}
                    className={pillClass(filterId === r.id)}
                  >
                    {r.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {filter === 'horse' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Link href="?filter=horse" className={pillClass(!filterId)}>All</Link>
                {horseOptions.map((h) => (
                  <Link
                    key={h.id}
                    href={`?filter=horse&id=${h.id}`}
                    className={pillClass(filterId === h.id)}
                  >
                    {h.name}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {lessons.length === 0 ? (
        <EmptyState
          heading="No lessons yet"
          subtext="Lessons you record will appear here."
          cta={canCreateLesson ? { label: 'New Lesson', href: `/barn/${slug}/lessons/new` } : undefined}
        />
      ) : (
        <>
          {recentLessons.length > 0 && (
            <ul className="w-full max-w-2xl space-y-2">
              {recentLessons.map((lesson) => (
                <LessonListItem
                  key={lesson.id}
                  lesson={lesson}
                  slug={slug}
                  isManager={isManager}
                  isTrainer={isTrainer}
                  currentMembershipId={membership.id}
                  viewerMembershipId={membership.id}
                />
              ))}
            </ul>
          )}
          <OlderLessonsToggle
            lessons={olderLessons}
            slug={slug}
            isManager={isManager}
            isTrainer={isTrainer}
            currentMembershipId={membership.id}
            viewerMembershipId={membership.id}
          />
        </>
      )}
    </main>
  )
}
