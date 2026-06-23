import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { ProfileForm } from './ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const [profile, memberships] = await Promise.all([
    getProfileByUserId(data.user.id),
    getBarnMembershipsForUser(data.user.id),
  ])
  if (!profile) redirect('/login')

  const active = memberships.filter((m) => m.membership.status === 'active')
  const redirectAfterSave = active.length === 1 ? `/barn/${active[0].barn.slug}` : '/barns'

  return <ProfileForm profile={profile} heading="Edit Profile" redirectAfterSave={redirectAfterSave} />
}
