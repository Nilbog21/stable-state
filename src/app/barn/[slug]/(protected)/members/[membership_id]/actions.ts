'use server'

/**
 * Member detail page Server Actions: staff/rider document row actions
 * (`deleteDocumentAction` — any active role calls, the target resolved via
 * `document-target.ts`'s `resolveManageableTarget` with the table picked from the
 * target's real DB role; `updateDocumentReminderDateAction` — manager-only), the
 * manager-only managed-profile contact save (`updateContactInfoAction`, refused once
 * the profile is claimed and `is_managed` flips false), the Instructor Access toggle
 * (`setCanInstructAction` — manager/trainer targets only), member removal
 * (`removeMemberAction` — a manager can never remove themselves or another manager,
 * mirroring the #969 RLS rule), invite-token rotation (`revokeInviteTokenAction` —
 * returns `{ error }` rather than throwing, #1116), and profile-photo upload/delete
 * (`uploadProfilePhotoAction`/`deleteProfilePhotoAction` — the shared
 * `resolvePhotoTarget` allows self always, a manager only while the profile is still
 * managed).
 */
import { revalidatePath } from 'next/cache'
import { redirect, notFound } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById, setCanInstruct, deleteMembership } from '@/lib/db/barn-memberships'
import { revokeInviteToken } from '@/lib/db/member-invites'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { updateContactInfo, getProfileById, replaceProfilePhoto, removeProfilePhoto } from '@/lib/db/profiles'
import { removeFile, validateFile, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS } from '@/lib/db/document-storage'
import { getErrorMessage } from '@/lib/get-error-message'
import { parseContactFields } from '@/lib/contact-info'
import { resolveManageableTarget } from '@/lib/document-target'
import type { Barn, Profile } from '@/lib/db/types'

export async function deleteDocumentAction(
  barnSlug: string,
  membershipId: string,
  docId: string,
  storagePath: string,
  // The `useActionState` calling convention, both ignored — they exist so `page.tsx` can bind the
  // leading four and hand the Server Function straight to the hook (#1385).
  _prevState?: { error: string | null },
  _formData?: FormData
): Promise<{ error: string | null }> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const resolved = await resolveManageableTarget(barn, callerMembership, membershipId, user.id)
  if ('error' in resolved) return { error: resolved.error }
  const { targetMembership, entity } = resolved

  try {
    if (entity === 'rider') {
      await deleteDocument('rider', docId, targetMembership.id, barn.id)
    } else {
      await deleteDocument('trainer', docId, targetMembership.id, barn.id)
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

  const parsed = parseContactFields(formData, targetProfile)
  if ('error' in parsed) return parsed
  const { phone, emergencyContactName, emergencyContactPhone } = parsed.data

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

  try {
    if (targetMembership.role === 'rider') {
      await updateDocumentReminderDate('rider', docId, targetMembership.id, barn.id, reminderDate)
    } else {
      await updateDocumentReminderDate('trainer', docId, targetMembership.id, barn.id, reminderDate)
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

export async function removeMemberAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const { user, barn } = await requireMembership(barnSlug, ['manager'])

  const target = await getMembershipById(membershipId)
  if (!target || target.barn_id !== barn.id) notFound()
  if (target.user_id === user.id) notFound()
  if (target.role === 'manager') notFound()

  await deleteMembership(membershipId)

  revalidatePath(`/barn/${barnSlug}/members`)
  redirect(`/barn/${barnSlug}/members`)
}

export async function revokeInviteTokenAction(
  barnSlug: string,
  membershipId: string,
  // The `useActionState` calling convention, both ignored — same reason as deleteDocumentAction
  // above: `page.tsx` binds the leading two and hands the Server Function straight to the hook,
  // which is what keeps Revoke progressively enhanced (#1396).
  _prevState?: { error: string | null } | null,
  _formData?: FormData
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  // Returns the failure rather than throwing (#1116): a throw here is rethrown during
  // render as a rejected action state, and error.tsx swaps out the whole member detail
  // page — the manager loses the page instead of seeing why the revoke failed.
  try {
    await revokeInviteToken(membershipId, barn.id)
  } catch (dbError) {
    return { error: getErrorMessage(dbError) }
  }

  revalidatePath(`/barn/${barnSlug}/members`)
  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  return { error: null }
}

// Self can always upload/replace/delete their own photo; a manager may do so only for a
// managed/stub profile (mirrors updateContactInfoAction's is_managed gate above) — once a
// member claims their profile, is_managed flips false and this locks out manager writes.
async function resolvePhotoTarget(
  barnSlug: string,
  membershipId: string
): Promise<{ error: string } | { barn: Barn; targetProfile: Profile }> {
  const { user, barn, membership: callerMembership } = await requireMembership(barnSlug, ['manager', 'trainer', 'rider'])

  const targetMembership = await getMembershipById(membershipId)
  if (!targetMembership || targetMembership.barn_id !== barn.id) return { error: 'Not found' }

  const targetProfile = await getProfileById(targetMembership.profile_id)
  if (!targetProfile) return { error: 'Not found' }

  const isOwnPage = targetMembership.user_id === user.id
  if (!isOwnPage && !(callerMembership.role === 'manager' && targetProfile.is_managed)) {
    return { error: 'Forbidden' }
  }

  return { barn, targetProfile }
}

export async function uploadProfilePhotoAction(
  barnSlug: string,
  membershipId: string,
  prevState: { error: string | null },
  formData: FormData
): Promise<{ error: string | null }> {
  const resolved = await resolvePhotoTarget(barnSlug, membershipId)
  if ('error' in resolved) return { error: resolved.error }
  const { barn, targetProfile } = resolved

  const file = formData.get('file') as File | null
  let ext: string
  try {
    ext = validateFile(file, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  try {
    await replaceProfilePhoto(targetProfile.id, barn.id, file!, ext)
  } catch (err) {
    return { error: getErrorMessage(err) }
  }

  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
  redirect(`/barn/${barnSlug}/members/${membershipId}`)
}

export async function deleteProfilePhotoAction(
  barnSlug: string,
  membershipId: string
): Promise<void> {
  const resolved = await resolvePhotoTarget(barnSlug, membershipId)
  if ('error' in resolved) notFound()
  const { targetProfile } = resolved

  await removeProfilePhoto(targetProfile.id)
  revalidatePath(`/barn/${barnSlug}/members/${membershipId}`)
}
