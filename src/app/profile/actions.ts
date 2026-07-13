'use server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId, updateProfile } from '@/lib/db/profiles'
import { isValidPhone } from '@/lib/phone'

// Not barn-scoped — no barnSlug/role dimension, every authenticated user
// edits only their own profile, so requireMembership doesn't apply.
export async function updateProfileAction(
  formData: FormData
): Promise<{ error: string | null }> {
  const user = await getAuthenticatedUser()
  if (!user) return { error: 'not authenticated' }

  const firstName = (formData.get('first_name') as string ?? '').trim()
  const lastName = (formData.get('last_name') as string ?? '').trim()

  if (!firstName) return { error: 'first_name is required' }
  if (!lastName) return { error: 'last_name is required' }

  const profile = await getProfileByUserId(user.id)
  if (!profile) return { error: 'profile not found' }

  const phone = (formData.get('phone') as string | null)?.trim() || null
  const ecName = (formData.get('emergency_contact_name') as string | null)?.trim() || null
  const ecPhone = (formData.get('emergency_contact_phone') as string | null)?.trim() || null

  if (phone && phone !== profile.phone && !isValidPhone(phone)) {
    return { error: 'Phone number must contain 7–15 digits' }
  }
  if (ecPhone && ecPhone !== profile.emergency_contact_phone && !isValidPhone(ecPhone)) {
    return { error: 'Emergency contact phone must contain 7–15 digits' }
  }

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
