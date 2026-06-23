import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { ProfileForm } from './ProfileForm'

export default async function ProfilePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const [profile, memberships] = await Promise.all([
    getProfileByUserId(user.id),
    getBarnMembershipsForUser(user.id),
  ])
  if (!profile) redirect('/login')

  const active = memberships.filter((m) => m.membership.status === 'active')
  const redirectAfterSave = active.length === 1 ? `/barn/${active[0].barn.slug}` : '/barns'

  return <ProfileForm profile={profile} heading="Edit Profile" redirectAfterSave={redirectAfterSave} />
}
