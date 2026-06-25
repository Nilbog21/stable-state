import { redirect } from 'next/navigation'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId } from '@/lib/db/profiles'
import { ProfileForm } from '../ProfileForm'

export default async function ProfileCompletePage() {
  const user = await getAuthenticatedUser()
  if (!user) redirect('/login')

  const profile = await getProfileByUserId(user.id)
  if (!profile) redirect('/login')

  return <ProfileForm profile={profile} heading="Complete your profile" redirectAfterSave="/" />
}
