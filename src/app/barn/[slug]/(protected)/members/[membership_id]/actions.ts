'use server'

import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById, setCanInstruct } from '@/lib/db/barn-memberships'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { updateContactInfo, getProfileById } from '@/lib/db/profiles'
import { removeFile } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { isValidPhone } from '@/lib/phone'
import type { BarnMembership, Barn } from '@/lib/db/types'

function canManage(callerRole: string, isOwnPage: boolean): boolean {
  if (callerRole === 'manager') return true
  if (callerRole === 'trainer' && isOwnPage) return true
  if (callerRole === 'rider' && isOwnPage) return true
  return false
}

async function resolveManageableTarget(
  barn: Barn,
  callerMembership: BarnMembership,
  membershipId: string,
  callerUserId: string
): Promise<
  | { error: string }
  | { targetMembership: BarnMembership & { user_id: string }; entity: 'rider' | 'trainer' }
> {
  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    return { error: 'Forbidden' }
  }

  const isOwnPage = targetMembership.user_id === callerUserId
  if (!canManage(callerMembership.role, isOwnPage)) {
    return { error: 'Forbidden' }
  }

  if (!targetMembership.user_id) return { error: 'Target member has no account linked' }

  return {
    targetMembership: targetMembership as BarnMembership & { user_id: string },
    entity: targetMembership.role === 'rider' ? 'rider' : 'trainer',
  }
}

export async function deleteDocumentAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  storagePath: string
): Promise<{ error: string | null }> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const resolved = await resolveManageableTarget(barn, callerMembership, membershipId, user.id)
  if ('error' in resolved) return { error: resolved.error }
  const { targetMembership, entity } = resolved

  try {
    if (entity === 'rider') {
      await deleteDocument('rider', docId, targetMembership.user_id, barn.id)
    } else {
      await deleteDocument('trainer', docId, targetMembership.user_id, barn.id)
    }
  } catch (dbError) {
    return { error: getErrorMessage(dbError) }
  }

  await removeFile(storagePath).catch(() => {})

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}

export async function updateContactInfoAction(
  barnSlug: string,
  membershipId: string,
  formData: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  const targetProfile = await getProfileById(targetMembership.profile_id)
  if (!targetProfile || !targetProfile.is_managed) return { error: 'Forbidden' }

  const phone = (formData.get('phone') as string | null)?.trim() || null
  const emergencyContactName = (formData.get('emergency_contact_name') as string | null)?.trim() || null
  const emergencyContactPhone = (formData.get('emergency_contact_phone') as string | null)?.trim() || null

  if (phone && phone !== targetProfile.phone && !isValidPhone(phone)) {
    return { error: 'Phone number must contain 7–15 digits' }
  }
  if (
    emergencyContactPhone &&
    emergencyContactPhone !== targetProfile.emergency_contact_phone &&
    !isValidPhone(emergencyContactPhone)
  ) {
    return { error: 'Emergency contact phone must contain 7–15 digits' }
  }

  try {
    await updateContactInfo(targetMembership.profile_id, {
      phone,
      emergency_contact_name: emergencyContactName,
      emergency_contact_phone: emergencyContactPhone,
    })
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}

export async function updateDocumentReminderDateAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  reminderDate: string | null
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  if (targetMembership.role !== 'trainer' && targetMembership.role !== 'rider' && targetMembership.role !== 'manager') {
    return { error: 'Forbidden' }
  }

  if (!targetMembership.user_id) return { error: 'Target member has no account linked' }

  try {
    if (targetMembership.role === 'rider') {
      await updateDocumentReminderDate('rider', docId, targetMembership.user_id, barn.id, reminderDate)
    } else {
      await updateDocumentReminderDate('trainer', docId, targetMembership.user_id, barn.id, reminderDate)
    }
  } catch (dbError) {
    return { error: getErrorMessage(dbError) }
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}

export async function setCanInstructAction(
  barnSlug: string,
  membershipId: string,
  nextValue: boolean
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) notFound()
  if (targetMembership.role !== 'manager' && targetMembership.role !== 'trainer') {
    notFound()
  }

  await setCanInstruct(membershipId, barn.id, nextValue)

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  redirect(`/barn/${barnSlug}/members/${membershipId}`)
}
