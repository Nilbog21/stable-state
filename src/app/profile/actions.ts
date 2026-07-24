'use server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId, updateProfile } from '@/lib/db/profiles'
import { parseContactFields } from '@/lib/contact-info'
import { requireMembership } from '@/lib/auth/guard'
import { getOrCreateCalendarFeedToken, regenerateCalendarFeedToken } from '@/lib/db/calendar-feed'

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

  const parsed = parseContactFields(formData, profile)
  if ('error' in parsed) return parsed
  const { phone, emergencyContactName, emergencyContactPhone } = parsed.data

  try {
    await updateProfile(profile.id, {
      first_name: firstName,
      last_name: lastName,
      phone,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
    })
    return { error: null }
  } catch (e) {
    console.error('updateProfileAction failed:', e)
    return { error: 'Failed to update profile' }
  }
}

// Barn-scoped, unlike updateProfileAction above — the calendar feed token belongs to a
// specific membership, so requireMembership resolves the caller's own membership in this barn.
export async function getCalendarFeedLinkAction(barnSlug: string): Promise<string> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])
  return getOrCreateCalendarFeedToken(membership.id, barn.id)
}

export async function regenerateCalendarFeedLinkAction(barnSlug: string): Promise<string> {
  const { barn, membership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])
  return regenerateCalendarFeedToken(membership.id, barn.id)
}
