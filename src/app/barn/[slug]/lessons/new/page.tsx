import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getRidersByBarn } from '@/lib/db/riders'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import { submitLesson } from '@/app/actions/lessons'
import { LessonForm } from './LessonForm'

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

  if (!user) redirect(`/barn/${slug}/login`)

  const membership = await getUserMembership(user.id, barn.id)
  const isManager = membership?.role === 'manager'

  const [horses, riders] = await Promise.all([
    getHorsesByBarn(barn.id),
    getRidersByBarn(barn.id),
  ])

  let instructors: { userId: string; name: string }[] = []

  if (isManager && user) {
    const trainerMemberships = await getActiveTrainerMembershipsByBarn(barn.id)
    const trainerUserIds = trainerMemberships.map((m) => m.user_id)
    const allUserIds = [...new Set([user.id, ...trainerUserIds])]
    const profiles = await getProfilesByUserIds(allUserIds)

    const nameOf = (userId: string) => {
      const p = profiles.find((p) => p.user_id === userId)
      return p ? `${p.first_name} ${p.last_name}` : userId
    }

    instructors = [
      { userId: user.id, name: nameOf(user.id) },
      ...trainerMemberships.map((m) => ({ userId: m.user_id, name: nameOf(m.user_id) })),
    ]
  }

  const submit = submitLesson.bind(null, barn.id, barn.slug)

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-white dark:bg-black">
      <h1 className="text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Lesson
      </h1>
      <LessonForm
        horses={horses}
        riders={riders}
        action={submit}
        isManager={isManager}
        instructors={instructors}
        currentUserId={user?.id ?? ''}
      />
    </main>
  )
}
