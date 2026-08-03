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

function buildTierOptions(lessons: LessonWithDetails[]): string[] {
  return [...new Set(lessons.map((l) => l.tier_name))]
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
  const filter =
    filterParam === 'mine' || filterParam === 'all' || filterParam === 'trainer' || filterParam === 'rider' || filterParam === 'horse' || filterParam === 'tier'
      ? filterParam
      : null

  const allLessons = await getLessonsByBarn(barn.id, user.id, membership.role, barn.timezone)
  const isManager = membership.role === 'manager'
  const isTrainer = membership.role === 'trainer'
  const effectiveFilter = filter ?? (isTrainer ? 'mine' : 'all')

  let lessons = allLessons
  if (effectiveFilter === 'mine') {
    lessons = allLessons.filter((l) => l.instructor_id === membership.id)
  } else if (effectiveFilter === 'trainer' && filterId) {
    lessons = allLessons.filter((l) => l.instructor_id === filterId)
  } else if (effectiveFilter === 'rider' && filterId && (isManager || isTrainer)) {
    lessons = allLessons.filter((l) => l.rider_ids.includes(filterId))
  } else if (effectiveFilter === 'horse' && filterId) {
    lessons = allLessons.filter((l) => l.horse_ids.includes(filterId))
  } else if (effectiveFilter === 'tier' && filterId) {
    lessons = allLessons.filter((l) => l.tier_name === filterId)
  }
  const canCreateLesson = isManager || isTrainer

  // getTime/setTime rather than getDate/setDate: a day offset on a real instant is
  // zone-free, and reading the calendar field would resolve it in the host's zone (#1222).
  const cutoff = new Date()
  cutoff.setTime(cutoff.getTime() - OLDER_LESSON_CUTOFF_DAYS * 24 * 60 * 60 * 1000)
  const recentLessons = lessons.filter((l) => new Date(l.lesson_at.at) >= cutoff)
  const olderLessons = lessons.filter((l) => new Date(l.lesson_at.at) < cutoff)

  const riderOptions = isManager || isTrainer ? buildRiderOptions(allLessons) : []
  const trainerOptions = buildTrainerOptions(allLessons)
  const horseOptions = buildHorseOptions(allLessons)
  const tierOptions = buildTierOptions(allLessons)
  const barnHasLessons = allLessons.length > 0

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

      {barnHasLessons && (
        <div className="w-full max-w-2xl flex flex-col gap-2">
          <div className="flex flex-wrap gap-2 pb-2">
            {(isManager || isTrainer) && (
              <Pill href="?filter=mine" active={effectiveFilter === 'mine'}>My Lessons</Pill>
            )}
            <Pill href="?filter=all" active={effectiveFilter === 'all'}>All</Pill>
            <Pill href="?filter=trainer" active={effectiveFilter === 'trainer'}>By Instructor</Pill>
            {(isManager || isTrainer) && (
              <Pill href="?filter=rider" active={effectiveFilter === 'rider'}>By Rider</Pill>
            )}
            <Pill href="?filter=horse" active={effectiveFilter === 'horse'}>By Horse</Pill>
            <Pill href="?filter=tier" active={effectiveFilter === 'tier'}>By Tier</Pill>
          </div>
          {effectiveFilter === 'trainer' && (
            <div className="flex flex-wrap gap-2 pb-2">
              <Pill href="?filter=trainer" active={!filterId}>All</Pill>
              {trainerOptions.map((t) => (
                <Pill key={t.id} href={`?filter=trainer&id=${t.id}`} active={filterId === t.id}>
                  {t.name}
                </Pill>
              ))}
            </div>
          )}
          {effectiveFilter === 'rider' && (isManager || isTrainer) && (
            <div className="flex flex-wrap gap-2 pb-2">
              <Pill href="?filter=rider" active={!filterId}>All</Pill>
              {riderOptions.map((r) => (
                <Pill key={r.id} href={`?filter=rider&id=${r.id}`} active={filterId === r.id}>
                  {r.name}
                </Pill>
              ))}
            </div>
          )}
          {effectiveFilter === 'horse' && (
            <div className="flex flex-wrap gap-2 pb-2">
              <Pill href="?filter=horse" active={!filterId}>All</Pill>
              {horseOptions.map((h) => (
                <Pill key={h.id} href={`?filter=horse&id=${h.id}`} active={filterId === h.id}>
                  {h.name}
                </Pill>
              ))}
            </div>
          )}
          {effectiveFilter === 'tier' && (
            <div className="flex flex-wrap gap-2 pb-2">
              <Pill href="?filter=tier" active={!filterId}>All</Pill>
              {tierOptions.map((name) => (
                <Pill key={name} href={`?filter=tier&id=${encodeURIComponent(name)}`} active={filterId === name}>
                  {name}
                </Pill>
              ))}
            </div>
          )}
        </div>
      )}

      {lessons.length === 0 ? (
        <EmptyState
          heading={barnHasLessons ? 'No lessons match this filter' : 'No lessons yet'}
          subtext={barnHasLessons ? 'Try a different filter above.' : 'Lessons you record will appear here.'}
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
            viewerMembershipId={membership.id}
          />
        </>
      )}
    </main>
  )
}
