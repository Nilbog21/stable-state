import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { getInstructorsByBarn } from '@/lib/db/barn-memberships'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getTiersByBarn } from '@/lib/db/lesson-tiers'
import { submitLesson } from '@/app/actions/lessons'
import { LessonForm } from '../LessonForm'

export default async function LessonNewPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const barn = await getBarnBySlug(slug)

  if (!barn) {
    notFound()
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    notFound()
  }

  const [horses, riders, membership, tiers, instructors] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRidersByBarn(barn.id),
    getEffectiveMembership(user.id, barn.id),
    getTiersByBarn(barn.id),
    getInstructorsByBarn(barn.id),
  ])

  const isManager = membership?.role === 'manager'

  const submit = submitLesson.bind(null, barn.id, barn.slug)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Lesson
      </h1>
      <LessonForm
        mode="new"
        horses={horses}
        riders={riders}
        action={submit}
        isManager={isManager}
        instructors={instructors}
        currentUserId={user.id}
        tiers={tiers}
      />
    </main>
  )
}
