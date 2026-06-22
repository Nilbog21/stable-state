import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId } from '@/lib/db/profiles'
import { ProfileForm } from './ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) redirect('/login')

  const profile = await getProfileByUserId(data.user.id)
  if (!profile) redirect('/login')

  return <ProfileForm profile={profile} heading="Edit Profile" redirectAfterSave={null} />
}
