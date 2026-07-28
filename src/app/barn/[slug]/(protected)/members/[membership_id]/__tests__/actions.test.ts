import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))
vi.mock('@/lib/db/barn-memberships', () => ({
  getMembershipById: vi.fn(),
  setCanInstruct: vi.fn(),
  deleteMembership: vi.fn(),
}))
vi.mock('@/lib/db/member-invites', () => ({
  revokeInviteToken: vi.fn(),
}))
vi.mock('@/lib/db/documents', () => ({
  deleteDocument: vi.fn(),
  updateDocumentReminderDate: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({
  updateContactInfo: vi.fn(),
  getProfileById: vi.fn(),
  replaceProfilePhoto: vi.fn(),
  removeProfilePhoto: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/document-storage')>()
  return { ...actual, removeFile: vi.fn() }
})
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  notFound: mockNotFound,
}))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById, setCanInstruct, deleteMembership } from '@/lib/db/barn-memberships'
import { revokeInviteToken } from '@/lib/db/member-invites'
import { deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { updateContactInfo, getProfileById, replaceProfilePhoto, removeProfilePhoto } from '@/lib/db/profiles'
import { removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import {
  deleteDocumentAction,
  updateDocumentReminderDateAction,
  updateContactInfoAction,
  setCanInstructAction,
  revokeInviteTokenAction,
  removeMemberAction,
  uploadProfilePhotoAction,
  deleteProfilePhotoAction,
} from '../actions'

const mockBarn = createMockBarn()

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })
const managerTargetMembership = createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })

describe('deleteDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(deleteDocument).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(deleteDocument).mockResolvedValue(undefined)
  })

  it('should_return_null_error_on_success', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const result = await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'barn-1/trainers/user-target-trn/file.pdf')
    expect(result).toEqual({ error: null })
  })

  it('should_delete_trainer_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'barn-1/trainers/user-target-trn/file.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-target-trn', 'barn-1')
  })

  it('should_delete_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    await deleteDocumentAction('green-acres', 'mem-trn', 'doc-1', 'barn-1/trainers/user-trn/file.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-trn', 'barn-1')
  })

  it('should_reject_delete_of_own_rider_document_as_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)

    const result = await deleteDocumentAction('green-acres', 'mem-rdr', 'doc-1', 'barn-1/riders/user-rdr/file.pdf')

    expect(result.error).toBeTruthy()
  })

  it('should_reject_delete_when_trainer_targets_rider_document', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const result = await deleteDocumentAction('green-acres', 'mem-target-rdr', 'doc-2', 'barn-1/riders/user-target-rdr/waiver.pdf')
    expect(result.error).toBeTruthy()
  })

  it('should_delete_manager_document_using_staff_documents_table', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    await deleteDocumentAction('green-acres', 'mem-mgr-target', 'doc-1', 'barn-1/managers/user-mgr-target/file.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-mgr-target', 'barn-1')
  })

  it('should_revalidate_member_detail_path_after_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'barn-1/trainers/user-target-trn/file.pdf')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_delete_rider_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await deleteDocumentAction('green-acres', 'mem-target-rdr', 'doc-2', 'barn-1/riders/user-target-rdr/waiver.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('rider', 'doc-2', 'mem-target-rdr', 'barn-1')
  })

  it('should_delete_document_for_managed_member_with_no_user_id_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    await deleteDocumentAction('green-acres', 'mem-nouser', 'doc-1', 'path')
    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-nouser', 'barn-1')
  })

  it('should_reject_delete_when_target_has_unknown_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-unknown', user_id: 'user-unknown', barn_id: 'barn-1', role: 'unknown' as any })
    )

    const result = await deleteDocumentAction('green-acres', 'mem-unknown', 'doc-1', 'path')
    expect(result.error).toBeTruthy()
  })

  it('should_return_error_when_target_membership_not_found_on_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const result = await deleteDocumentAction('green-acres', 'mem-gone', 'doc-1', 'path')
    expect(result.error).toBe('Not found')
  })

  it('should_succeed_when_storage_remove_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(removeFile).mockRejectedValue(new Error('storage remove failed'))

    const result = await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'barn-1/trainers/user-target-trn/file.pdf')
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_db_delete_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(deleteDocument).mockRejectedValue(new Error('db error'))

    const result = await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'barn-1/trainers/user-target-trn/file.pdf')
    expect(result.error).toBe('db error')
    expect(removeFile).not.toHaveBeenCalled()
  })
})

describe('updateDocumentReminderDateAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(updateDocumentReminderDate).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(updateDocumentReminderDate).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-target-trn', 'doc-1', '2027-01-01')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_update_trainer_reminder_date', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-target-trn', 'doc-1', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-target-trn', 'barn-1', '2027-01-01')
  })

  it('should_update_rider_reminder_date', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-target-rdr', 'doc-2', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('rider', 'doc-2', 'mem-target-rdr', 'barn-1', '2027-01-01')
  })

  it('should_update_manager_reminder_date_using_staff_documents_table', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-mgr-target', 'doc-1', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-mgr-target', 'barn-1', '2027-01-01')
  })

  it('should_revalidate_member_detail_path', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-target-trn', 'doc-1', '2027-01-01')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_return_error_when_target_membership_not_found', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const result = await updateDocumentReminderDateAction('green-acres', 'mem-gone', 'doc-1', '2027-01-01')
    expect(result.error).toBe('Not found')
  })

  it('should_update_reminder_date_for_managed_member_with_no_user_id', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    await updateDocumentReminderDateAction('green-acres', 'mem-nouser', 'doc-1', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('trainer', 'doc-1', 'mem-nouser', 'barn-1', '2027-01-01')
  })

  it('should_reject_when_target_has_unknown_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-unknown', user_id: 'user-unknown', barn_id: 'barn-1', role: 'unknown' as any })
    )

    const result = await updateDocumentReminderDateAction('green-acres', 'mem-unknown', 'doc-1', '2027-01-01')
    expect(result.error).toBeTruthy()
  })

  it('should_return_null_error_on_success', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const result = await updateDocumentReminderDateAction('green-acres', 'mem-target-trn', 'doc-1', '2027-01-01')
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_db_update_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(updateDocumentReminderDate).mockRejectedValue(new Error('db error'))

    const result = await updateDocumentReminderDateAction('green-acres', 'mem-target-trn', 'doc-1', '2027-01-01')
    expect(result.error).toBe('db error')
  })
})

describe('updateContactInfoAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(getProfileById).mockReset()
    vi.mocked(updateContactInfo).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: true }))
    vi.mocked(updateContactInfo).mockResolvedValue(undefined)
  })

  function makeContactFormData(phone = '555-1111', ecName = 'Alice', ecPhone = '555-2222'): FormData {
    const fd = new FormData()
    fd.set('phone', phone)
    fd.set('emergency_contact_name', ecName)
    fd.set('emergency_contact_phone', ecPhone)
    return fd
  }

  it('should_call_requireMembership_with_manager_role_only', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_update_contact_info_with_trimmed_fields', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData(' 555-1111 ', ' Alice ', ' 555-2222 '))
    expect(updateContactInfo).toHaveBeenCalledWith('profile-1', {
      phone: '555-1111',
      emergency_contact_name: 'Alice',
      emergency_contact_phone: '555-2222',
    })
  })

  it('should_normalize_empty_strings_to_null', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData('', '', ''))
    expect(updateContactInfo).toHaveBeenCalledWith('profile-1', {
      phone: null,
      emergency_contact_name: null,
      emergency_contact_phone: null,
    })
  })

  it('should_return_null_error_on_success', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(result).toEqual({ error: null })
  })

  it('should_revalidate_member_detail_path_after_update', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_return_error_when_phone_is_invalid', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData('555-CALL-NOW'))
    expect(result).toEqual({ error: 'Phone number must contain 7–15 digits' })
  })

  it('should_not_call_updateContactInfo_when_phone_is_invalid', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData('555-CALL-NOW'))
    expect(updateContactInfo).not.toHaveBeenCalled()
  })

  it('should_return_error_when_emergency_contact_phone_is_invalid', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData('555-1111', 'Alice', '123'))
    expect(result).toEqual({ error: 'Emergency contact phone must contain 7–15 digits' })
  })

  it('should_not_call_updateContactInfo_when_emergency_contact_phone_is_invalid', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData('555-1111', 'Alice', '123'))
    expect(updateContactInfo).not.toHaveBeenCalled()
  })

  it('should_allow_save_when_phone_is_unchanged_legacy_format', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(
      createMockProfile({ id: 'profile-1', is_managed: true, phone: '555-123-4567 x205' })
    )

    const result = await updateContactInfoAction(
      'green-acres',
      'mem-target-trn',
      makeContactFormData('555-123-4567 x205')
    )
    expect(result).toEqual({ error: null })
  })

  it('should_allow_save_when_emergency_contact_phone_is_unchanged_legacy_format', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(
      createMockProfile({ id: 'profile-1', is_managed: true, emergency_contact_phone: '212.555.0123' })
    )

    const result = await updateContactInfoAction(
      'green-acres',
      'mem-target-trn',
      makeContactFormData('555-1111', 'Alice', '212.555.0123')
    )
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_target_membership_not_found', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const result = await updateContactInfoAction('green-acres', 'mem-gone', makeContactFormData())
    expect(result.error).toBe('Not found')
  })

  it('should_return_error_when_target_in_different_barn', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-other-barn', profile_id: 'profile-other', barn_id: 'barn-other', role: 'trainer' })
    )

    const result = await updateContactInfoAction('green-acres', 'mem-other-barn', makeContactFormData())
    expect(result.error).toBe('Not found')
  })

  it('should_return_error_when_updateContactInfo_throws', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(updateContactInfo).mockRejectedValue(new Error('new row violates row-level security policy'))

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(result.error).toBe('new row violates row-level security policy')
  })

  it('should_return_forbidden_when_target_profile_is_not_managed', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(result.error).toBe('Forbidden')
  })

  it('should_not_call_updateContactInfo_when_target_profile_is_not_managed', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(updateContactInfo).not.toHaveBeenCalled()
  })

  it('should_return_forbidden_when_target_profile_not_found', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(getProfileById).mockResolvedValue(null)

    const result = await updateContactInfoAction('green-acres', 'mem-target-trn', makeContactFormData())
    expect(result.error).toBe('Forbidden')
  })
})

describe('setCanInstructAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(setCanInstruct).mockReset()
    vi.mocked(revalidatePath).mockReset()
    mockRedirect.mockClear()
    mockNotFound.mockClear()

    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(setCanInstruct).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-trn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_404_when_target_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await expect(setCanInstructAction('green-acres', 'mem-gone', true)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_404_when_target_in_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-other-barn', barn_id: 'barn-other', role: 'trainer' })
    )

    await expect(setCanInstructAction('green-acres', 'mem-other-barn', true)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_404_when_target_role_is_rider', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-rdr', true)).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_call_setCanInstruct_for_trainer_target', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-trn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(setCanInstruct).toHaveBeenCalledWith('mem-target-trn', 'barn-1', true)
  })

  it('should_call_setCanInstruct_for_manager_target', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    await expect(setCanInstructAction('green-acres', 'mem-mgr-target', false)).rejects.toThrow('NEXT_REDIRECT')
    expect(setCanInstruct).toHaveBeenCalledWith('mem-mgr-target', 'barn-1', false)
  })

  it('should_revalidate_member_detail_path', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-trn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_redirect_to_member_detail_page_after_update', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-trn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })
})

describe('revokeInviteTokenAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(revokeInviteToken).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(revokeInviteToken).mockResolvedValue('new-tok-abc')
  })

  it('should_call_revokeInviteToken_with_membership_and_barn_ids', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(revokeInviteToken).toHaveBeenCalledWith('mem-target-trn', 'barn-1')
  })

  it('should_require_manager_role', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_revalidate_members_list_path_after_revoke', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members')
  })

  it('should_revalidate_member_detail_path_after_revoke', async () => {
    await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_return_null_error_when_revoke_succeeds', async () => {
    const result = await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_revoke_fails', async () => {
    vi.mocked(revokeInviteToken).mockRejectedValue(new Error('permission denied'))
    const result = await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(result).toEqual({ error: 'permission denied' })
  })

  it('should_not_revalidate_when_revoke_fails', async () => {
    vi.mocked(revokeInviteToken).mockRejectedValue(new Error('permission denied'))
    await revokeInviteTokenAction('green-acres', 'mem-target-trn')
    expect(revalidatePath).not.toHaveBeenCalled()
  })
})

describe('removeMemberAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(deleteMembership).mockReset()
    vi.mocked(revalidatePath).mockReset()
    mockRedirect.mockClear()
    mockNotFound.mockClear()

    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(deleteMembership).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(removeMemberAction('green-acres', 'mem-target-trn')).rejects.toThrow('NEXT_REDIRECT')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_404_when_target_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await expect(removeMemberAction('green-acres', 'mem-gone')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_404_when_target_in_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-other-barn', barn_id: 'barn-other', role: 'trainer' })
    )

    await expect(removeMemberAction('green-acres', 'mem-other-barn')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_404_when_target_is_callers_own_membership', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', barn_id: 'barn-1', role: 'manager' })
    )

    await expect(removeMemberAction('green-acres', 'mem-mgr')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_404_when_target_role_is_manager', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    await expect(removeMemberAction('green-acres', 'mem-mgr-target')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
    expect(deleteMembership).not.toHaveBeenCalled()
  })

  it('should_call_deleteMembership_with_target_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(removeMemberAction('green-acres', 'mem-target-trn')).rejects.toThrow('NEXT_REDIRECT')
    expect(deleteMembership).toHaveBeenCalledWith('mem-target-trn')
  })

  it('should_revalidate_members_list_path', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(removeMemberAction('green-acres', 'mem-target-trn')).rejects.toThrow('NEXT_REDIRECT')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members')
  })

  it('should_redirect_to_members_list_after_removal', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(removeMemberAction('green-acres', 'mem-target-trn')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/members')
  })
})

function makePhotoFile(): File {
  return new File([new Uint8Array(100)], 'headshot.jpg', { type: 'image/jpeg' })
}

function formDataWithPhoto(): FormData {
  const fd = new FormData()
  fd.set('file', makePhotoFile())
  return fd
}

describe('uploadProfilePhotoAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(getProfileById).mockReset()
    vi.mocked(replaceProfilePhoto).mockReset()
    vi.mocked(revalidatePath).mockReset()
    mockRedirect.mockClear()

    vi.mocked(replaceProfilePhoto).mockResolvedValue(undefined)
  })

  it('should_return_not_found_when_target_membership_does_not_exist', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const result = await uploadProfilePhotoAction('green-acres', 'mem-gone', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'Not found' })
  })

  it('should_return_not_found_when_target_membership_belongs_to_a_different_barn', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue({ ...riderMembership, barn_id: 'barn-other' })

    const result = await uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'Not found' })
  })

  it('should_return_not_found_when_target_profile_does_not_exist', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(null)

    const result = await uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'Not found' })
  })

  it('should_allow_self_upload_regardless_of_managed_status', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    await expect(uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, formDataWithPhoto())).rejects.toThrow('NEXT_REDIRECT')
    expect(replaceProfilePhoto).toHaveBeenCalledWith('profile-1', 'barn-1', expect.any(File), 'jpg')
  })

  it('should_allow_manager_upload_for_managed_profile', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: true }))

    await expect(uploadProfilePhotoAction('green-acres', 'mem-target-rdr', { error: null }, formDataWithPhoto())).rejects.toThrow('NEXT_REDIRECT')
    expect(replaceProfilePhoto).toHaveBeenCalledWith('profile-1', 'barn-1', expect.any(File), 'jpg')
  })

  it('should_reject_manager_upload_for_unmanaged_profile', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    const result = await uploadProfilePhotoAction('green-acres', 'mem-target-rdr', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('should_not_call_replaceProfilePhoto_when_manager_upload_is_forbidden', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    await uploadProfilePhotoAction('green-acres', 'mem-target-rdr', { error: null }, formDataWithPhoto())
    expect(replaceProfilePhoto).not.toHaveBeenCalled()
  })

  it('should_reject_trainer_uploading_for_another_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: true }))

    const result = await uploadProfilePhotoAction('green-acres', 'mem-target-rdr', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'Forbidden' })
  })

  it('should_return_error_when_file_type_is_not_jpeg_or_png', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1' }))

    const fd = new FormData()
    fd.set('file', new File([new Uint8Array(100)], 'doc.pdf', { type: 'application/pdf' }))
    const result = await uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, fd)
    expect(result).toEqual({ error: 'Unsupported file type' })
  })

  it('should_return_error_when_replaceProfilePhoto_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1' }))
    vi.mocked(replaceProfilePhoto).mockRejectedValue(new Error('upload error'))

    const result = await uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, formDataWithPhoto())
    expect(result).toEqual({ error: 'upload error' })
  })

  it('should_revalidate_and_redirect_to_member_detail_page_on_success', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1' }))

    await expect(uploadProfilePhotoAction('green-acres', 'mem-rdr', { error: null }, formDataWithPhoto())).rejects.toThrow('NEXT_REDIRECT')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-rdr')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/members/mem-rdr')
  })
})

describe('deleteProfilePhotoAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(getProfileById).mockReset()
    vi.mocked(removeProfilePhoto).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(removeProfilePhoto).mockResolvedValue(undefined)
  })

  it('should_allow_self_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    await deleteProfilePhotoAction('green-acres', 'mem-rdr')
    expect(removeProfilePhoto).toHaveBeenCalledWith('profile-1')
  })

  it('should_allow_manager_delete_for_managed_profile', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: true }))

    await deleteProfilePhotoAction('green-acres', 'mem-target-rdr')
    expect(removeProfilePhoto).toHaveBeenCalledWith('profile-1')
  })

  it('should_404_when_manager_targets_unmanaged_profile', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1', is_managed: false }))

    await expect(deleteProfilePhotoAction('green-acres', 'mem-target-rdr')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(removeProfilePhoto).not.toHaveBeenCalled()
  })

  it('should_revalidate_member_detail_path_after_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)
    vi.mocked(getProfileById).mockResolvedValue(createMockProfile({ id: 'profile-1' }))

    await deleteProfilePhotoAction('green-acres', 'mem-rdr')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-rdr')
  })
})
