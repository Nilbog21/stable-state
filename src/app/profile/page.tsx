import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { ProfileForm } from './ProfileForm'
import { CalendarFeedSection } from './CalendarFeedSection'
import { getCalendarFeedLinkAction, regenerateCalendarFeedLinkAction } from './actions'

export default async function ProfilePage({
  searchParams = Promise.resolve({}),
}: {
  searchParams?: Promise<{ barn?: string }>
} = {}) {
  const { barn: barnSlug } = await searchParams
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const [profile, memberships] = await Promise.all([
    getProfileByUserId(user.id),
    getBarnMembershipsForUser(user.id),
  ])
  if (!profile) redirect('/login')

  const active = memberships.filter((m) => m.membership.status === 'active')
  const redirectAfterSave = barnSlug
    ? `/barn/${barnSlug}`
    : active.length === 1 ? `/barn/${active[0].barn.slug}` : '/barns'

  const activeMembershipForBarn = barnSlug ? active.find((m) => m.barn.slug === barnSlug) : undefined

  return (
    <>
      <ProfileForm profile={profile} heading="Edit Profile" redirectAfterSave={redirectAfterSave} />
      {activeMembershipForBarn && (
        <CalendarFeedSection
          initialToken={activeMembershipForBarn.membership.calendar_feed_token}
          getLinkAction={getCalendarFeedLinkAction.bind(null, barnSlug!)}
          regenerateAction={regenerateCalendarFeedLinkAction.bind(null, barnSlug!)}
        />
      )}
    </>
  )
}
