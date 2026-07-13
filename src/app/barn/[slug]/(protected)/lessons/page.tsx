import { notFound } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getLessonsByBarn } from '@/lib/db/lessons'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { OlderLessonsToggle } from './OlderLessonsToggle'
import { LessonListItem } from './LessonListItem'
import { EmptyState } from '@/components/EmptyState'
import { Pill } from '@/components/ui/Pill'
import { Button } from '@/components/ui/Button'
import type { LessonWithDetails } from '@/lib/db/types'

const OLDER_LESSON_CUTOFF_DAYS = 7

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
    if (filter === 'trainer' && (isManager || isTrainer)) {
      lessons = allLessons.filter((l) => l.instructor_id === filterId)
    } else if (filter === 'rider' && (isManager || isTrainer)) {
      lessons = allLessons.filter((l) => l.rider_ids.includes(filterId))
    } else if (filter === 'horse' && (isManager || isTrainer)) {
      lessons = allLessons.filter((l) => l.horse_ids.includes(filterId))
    }
  }
  const canCreateLesson = isManager || isTrainer

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - OLDER_LESSON_CUTOFF_DAYS)
  const recentLessons = lessons.filter((l) => new Date(l.lesson_at) >= cutoff)
  const olderLessons = lessons.filter((l) => new Date(l.lesson_at) < cutoff)

  const riderOptions = isManager || isTrainer ? buildRiderOptions(allLessons) : []
  const trainerOptions = isManager || isTrainer ? buildTrainerOptions(allLessons) : []
  const horseOptions = isManager || isTrainer ? buildHorseOptions(allLessons) : []

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="flex w-full max-w-2xl items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Lessons
        </h1>
        {canCreateLesson && (
          <Button href={`/barn/${slug}/lessons/new`}>New Lesson</Button>
        )}
      </div>

      {(isManager || isTrainer) && (
        <div className="w-full max-w-2xl flex flex-col gap-2">
          <div className="overflow-x-auto">
            <div className="flex min-w-max gap-2 pb-2">
              <Pill href="?" active={!filter}>All</Pill>
              <Pill href="?filter=trainer" active={filter === 'trainer'}>By Instructor</Pill>
              <Pill href="?filter=rider" active={filter === 'rider'}>By Rider</Pill>
              <Pill href="?filter=horse" active={filter === 'horse'}>By Horse</Pill>
            </div>
          </div>
          {filter === 'trainer' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Pill href="?filter=trainer" active={!filterId}>All</Pill>
                {trainerOptions.map((t) => (
                  <Pill key={t.id} href={`?filter=trainer&id=${t.id}`} active={filterId === t.id}>
                    {t.name}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {filter === 'rider' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Pill href="?filter=rider" active={!filterId}>All</Pill>
                {riderOptions.map((r) => (
                  <Pill key={r.id} href={`?filter=rider&id=${r.id}`} active={filterId === r.id}>
                    {r.name}
                  </Pill>
                ))}
              </div>
            </div>
          )}
          {filter === 'horse' && (
            <div className="overflow-x-auto">
              <div className="flex min-w-max gap-2 pb-2">
                <Pill href="?filter=horse" active={!filterId}>All</Pill>
                {horseOptions.map((h) => (
                  <Pill key={h.id} href={`?filter=horse&id=${h.id}`} active={filterId === h.id}>
                    {h.name}
                  </Pill>
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
