import { isValidPhone } from './phone'

/**
 * Parsing/validation of the three profile contact fields (phone, emergency
 * contact name/phone) shared by `updateProfileAction` and
 * `updateContactInfoAction`, plus the profile-completeness predicate the
 * auth callback uses to route to `/profile/complete` and drive the
 * `incomplete_profile`/`member_incomplete_profile` notifications.
 */

export function parseContactFields(
  formData: FormData,
  current: { phone: string | null; emergency_contact_phone: string | null }
): { error: string } | { data: { phone: string | null; emergencyContactName: string | null; emergencyContactPhone: string | null } } {
  const phone = (formData.get('phone') as string | null)?.trim() || null
  const emergencyContactName = (formData.get('emergency_contact_name') as string | null)?.trim() || null
  const emergencyContactPhone = (formData.get('emergency_contact_phone') as string | null)?.trim() || null

  if (phone && phone !== current.phone && !isValidPhone(phone)) {
    return { error: 'Phone number must contain 7–15 digits' }
  }
  if (emergencyContactPhone && emergencyContactPhone !== current.emergency_contact_phone && !isValidPhone(emergencyContactPhone)) {
    return { error: 'Emergency contact phone must contain 7–15 digits' }
  }

  return { data: { phone, emergencyContactName, emergencyContactPhone } }
}

export function isProfileIncomplete(
  profile: { phone: string | null; emergency_contact_name: string | null; emergency_contact_phone: string | null } | null
): boolean {
  return !profile?.phone || !profile?.emergency_contact_name || !profile?.emergency_contact_phone
}
