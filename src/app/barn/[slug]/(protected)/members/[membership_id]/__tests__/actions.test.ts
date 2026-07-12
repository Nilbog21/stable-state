import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))
vi.mock('@/lib/db/barn-memberships', () => ({
  getMembershipById: vi.fn(),
  setCanInstruct: vi.fn(),
}))
vi.mock('@/lib/db/documents', () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
  updateDocumentReminderDate: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({
  updateContactInfo: vi.fn(),
  getProfileById: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/document-storage')>()
  return { ...actual, uploadFile: vi.fn(), removeFile: vi.fn() }
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
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById, setCanInstruct } from '@/lib/db/barn-memberships'
import { createDocument, deleteDocument, updateDocumentReminderDate } from '@/lib/db/documents'
import { updateContactInfo, getProfileById } from '@/lib/db/profiles'
import { uploadFile, removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import {
  uploadDocumentAction,
  deleteDocumentAction,
  updateDocumentReminderDateAction,
  updateContactInfoAction,
  setCanInstructAction,
} from '../actions'

const mockBarn = createMockBarn()

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })
const managerTargetMembership = createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })

function makePdfFile(sizeBytes = 1024): File {
  const buf = new Uint8Array(sizeBytes)
  return new File([buf], 'test.pdf', { type: 'application/pdf' })
}

function makeUploadFormData(file: File, recordType: string, notes = ''): FormData {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('record_type', recordType)
  fd.set('notes', notes)
  return fd
}

describe('uploadDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(createDocument).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(createDocument).mockResolvedValue({} as any)
  })

  it('should_upload_trainer_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_rider_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'mem-target-rdr', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-trn', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_own_rider_document_as_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'mem-rdr', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_reject_upload_when_trainer_targets_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'mem-target-rdr', { error: null }, fd)).resolves.toEqual({ error: expect.any(String) })
  })

  it('should_reject_upload_when_rider_targets_other_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.any(String) })
  })

  it('should_upload_manager_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-mgr-target', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_use_managers_storage_path_for_manager_target', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-mgr-target', { error: null }, fd)

    expect(uploadFile).toHaveBeenCalledWith(
      expect.stringContaining('/managers/'),
      expect.any(File),
      expect.any(String)
    )
  })

  it('should_accept_instructor_contract_for_manager_target', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-mgr-target', { error: null }, fd)).resolves.toEqual({ error: null })
  })

  it('should_reject_liability_waiver_for_manager_target', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'mem-mgr-target', { error: null }, fd)).resolves.toEqual({ error: expect.any(String) })
  })

  it('should_reject_upload_when_target_has_unknown_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-unknown', user_id: 'user-unknown', barn_id: 'barn-1', role: 'unknown' as any })
    )

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-unknown', { error: null }, fd)).resolves.toEqual({ error: expect.any(String) })
  })

  it('should_reject_file_over_4_5mb', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const bigFile = makePdfFile(5 * 1024 * 1024)
    const fd = makeUploadFormData(bigFile, 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/4\.5 MB/) })
  })

  it('should_reject_unsupported_file_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const exeFile = new File([new Uint8Array(100)], 'virus.exe', { type: 'application/octet-stream' })
    const fd = new FormData()
    fd.set('file', exeFile)
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_reject_file_with_no_extension', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const noExtFile = new File([new Uint8Array(100)], 'noextension', { type: 'application/pdf' })
    const fd = new FormData()
    fd.set('file', noExtFile)
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_reject_file_with_trailing_dot', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const trailingDotFile = new File([new Uint8Array(100)], 'file.', { type: 'application/pdf' })
    const fd = new FormData()
    fd.set('file', trailingDotFile)
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_reject_invalid_record_type_for_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })

  it('should_reject_invalid_record_type_for_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-rdr', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })

  it('should_accept_other_as_valid_trainer_record_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_accept_other_as_valid_rider_record_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'mem-target-rdr', { error: null }, fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_revalidate_member_detail_path_after_upload', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_return_error_when_target_membership_not_found', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-gone', { error: null }, fd)).resolves.toEqual({ error: 'Not found' })
  })

  it('should_return_error_when_target_has_no_user_id', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-nouser', { error: null }, fd)).resolves.toEqual({ error: 'Target member has no account linked' })
  })

  it('should_return_error_when_no_file_provided', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = new FormData()
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/No file/) })
  })

  it('should_return_error_when_storage_upload_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage upload failed'))

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: 'storage upload failed' })
  })

  it('should_cleanup_storage_on_db_insert_failure', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(createDocument).mockRejectedValue(new Error('db error'))

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: 'db error' })
    expect(removeFile).toHaveBeenCalled()
  })

  it('should_return_generic_error_when_non_error_is_thrown', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(createDocument).mockRejectedValue('not an Error instance')

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: 'not an Error instance' })
  })

  it('should_use_null_for_empty_notes', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = new FormData()
    fd.set('file', makePdfFile())
    fd.set('record_type', 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)

    expect(createDocument).toHaveBeenCalledWith(
      'trainer', expect.any(String), expect.any(String), expect.any(String),
      expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_pass_reminder_date_when_provided', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    fd.set('reminder_date', '2027-01-01')
    await uploadDocumentAction('green-acres', 'mem-target-trn', { error: null }, fd)

    expect(createDocument).toHaveBeenCalledWith(
      'trainer', expect.any(String), expect.any(String), expect.any(String),
      expect.any(String), expect.any(String), expect.any(Number), null, '2027-01-01'
    )
  })
})

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

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'user-target-trn', 'barn-1')
  })

  it('should_delete_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    await deleteDocumentAction('green-acres', 'mem-trn', 'doc-1', 'barn-1/trainers/user-trn/file.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'user-trn', 'barn-1')
  })

  it('should_delete_own_rider_document_as_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)

    await deleteDocumentAction('green-acres', 'mem-rdr', 'doc-1', 'barn-1/riders/user-rdr/file.pdf')

    expect(deleteDocument).toHaveBeenCalledWith('rider', 'doc-1', 'user-rdr', 'barn-1')
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

    expect(deleteDocument).toHaveBeenCalledWith('trainer', 'doc-1', 'user-mgr-target', 'barn-1')
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

    expect(deleteDocument).toHaveBeenCalledWith('rider', 'doc-2', 'user-target-rdr', 'barn-1')
  })

  it('should_return_error_when_target_has_no_user_id_on_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    const result = await deleteDocumentAction('green-acres', 'mem-nouser', 'doc-1', 'path')
    expect(result.error).toBe('Target member has no account linked')
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
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('trainer', 'doc-1', 'user-target-trn', 'barn-1', '2027-01-01')
  })

  it('should_update_rider_reminder_date', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-target-rdr', 'doc-2', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('rider', 'doc-2', 'user-target-rdr', 'barn-1', '2027-01-01')
  })

  it('should_update_manager_reminder_date_using_staff_documents_table', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    await updateDocumentReminderDateAction('green-acres', 'mem-mgr-target', 'doc-1', '2027-01-01')
    expect(updateDocumentReminderDate).toHaveBeenCalledWith('trainer', 'doc-1', 'user-mgr-target', 'barn-1', '2027-01-01')
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

  it('should_return_error_when_target_has_no_user_id', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    const result = await updateDocumentReminderDateAction('green-acres', 'mem-nouser', 'doc-1', '2027-01-01')
    expect(result.error).toBe('Target member has no account linked')
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

    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(setCanInstruct).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-trn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_to_login_when_target_not_found', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(null)

    await expect(setCanInstructAction('green-acres', 'mem-gone', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_target_in_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-other-barn', barn_id: 'barn-other', role: 'trainer' })
    )

    await expect(setCanInstructAction('green-acres', 'mem-other-barn', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_target_role_is_rider', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await expect(setCanInstructAction('green-acres', 'mem-target-rdr', true)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
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
