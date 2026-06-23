'use server'
import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId, updateProfile } from '@/lib/db/profiles'

export async function updateProfileAction(
  formData: FormData
): Promise<{ error: string | null }> {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  if (!data.user) return { error: 'not authenticated' }

  const firstName = (formData.get('first_name') as string ?? '').trim()
  const lastName = (formData.get('last_name') as string ?? '').trim()

  if (!firstName) return { error: 'first_name is required' }
  if (!lastName) return { error: 'last_name is required' }

  const profile = await getProfileByUserId(data.user.id)
  if (!profile) return { error: 'profile not found' }

  const phone = (formData.get('phone') as string | null)?.trim() || null
  const ecName = (formData.get('emergency_contact_name') as string | null)?.trim() || null
  const ecPhone = (formData.get('emergency_contact_phone') as string | null)?.trim() || null

  try {
    await updateProfile(profile.id, {
      first_name: firstName,
      last_name: lastName,
      phone,
      emergency_contact_name: ecName,
      emergency_contact_phone: ecPhone,
    })
    return { error: null }
  } catch (e) {
    console.error('updateProfileAction failed:', e)
    return { error: 'Failed to update profile' }
  }
}
