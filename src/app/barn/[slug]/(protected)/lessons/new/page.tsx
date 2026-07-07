import { notFound, redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getBarnBySlug } from '@/lib/db/barns'
import { getHorsesByBarn } from '@/lib/db/horses'
import { getActiveMembersWithProfiles, getInstructorsByBarn, getUserMembership } from '@/lib/db/barn-memberships'
import { getTiersByBarn } from '@/lib/db/lesson-tiers'
import { submitLesson, getProjectedExhaustionForBarn } from '@/app/actions/lessons'
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

  const user = await getAuthenticatedUser()

  if (!user) {
    notFound()
  }

  const membership = await getUserMembership(user.id, barn.id)

  if (membership?.role === 'rider') {
    redirect(`/barn/${slug}/lessons`)
  }

  const [horses, riderMembers, tiers, instructors] = await Promise.all([
    getHorsesByBarn(barn.id),
    getActiveMembersWithProfiles(barn.id, 'rider'),
    getTiersByBarn(barn.id),
    getInstructorsByBarn(barn.id),
  ])
  const riders = riderMembers.map((m) => ({ id: m.membershipId, name: m.name }))

  const isManager = membership?.role === 'manager'

  const submit = submitLesson.bind(null, barn.id, barn.slug)
  const getProjectedExhaustion = getProjectedExhaustionForBarn.bind(null, barn.slug, null)

  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white pt-8 dark:bg-black">
      <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        New Lesson
      </h1>
      <LessonForm
        mode="new"
        horses={horses}
        riders={riders}
        action={submit}
        isManager={isManager}
        instructors={instructors}
        currentMembershipId={membership?.id ?? ''}
        tiers={tiers}
        getProjectedExhaustion={getProjectedExhaustion}
      />
    </main>
  )
}
