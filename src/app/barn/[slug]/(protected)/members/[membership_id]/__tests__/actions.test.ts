import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))
vi.mock('@/lib/db/barn-memberships', () => ({
  getMembershipById: vi.fn(),
}))
vi.mock('@/lib/db/documents', () => ({
  createDocument: vi.fn(),
  deleteDocument: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, uploadFile: vi.fn(), removeFile: vi.fn() }
})
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createDocument, deleteDocument } from '@/lib/db/documents'
import { uploadFile, removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import { uploadDocumentAction, deleteDocumentAction } from '../actions'

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
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_rider_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'mem-target-rdr', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-trn', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_upload_own_rider_document_as_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(riderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'mem-rdr', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_reject_upload_when_trainer_targets_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    const result = await uploadDocumentAction('green-acres', 'mem-target-rdr', fd)
    expect(result.error).toBeTruthy()
  })

  it('should_reject_upload_when_rider_targets_other_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-rdr' } as any, barn: mockBarn, membership: riderMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toBeTruthy()
  })

  it('should_upload_manager_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-mgr-target', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_use_managers_storage_path_for_manager_target', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-mgr-target', fd)

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
    await expect(uploadDocumentAction('green-acres', 'mem-mgr-target', fd)).resolves.toEqual({ error: null })
  })

  it('should_reject_liability_waiver_for_manager_target', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(managerTargetMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    const result = await uploadDocumentAction('green-acres', 'mem-mgr-target', fd)
    expect(result.error).toBeTruthy()
  })

  it('should_reject_upload_when_target_has_unknown_role', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-unknown', user_id: 'user-unknown', barn_id: 'barn-1', role: 'unknown' as any })
    )

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-unknown', fd)
    expect(result.error).toBeTruthy()
  })

  it('should_reject_file_over_5mb', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const bigFile = makePdfFile(6 * 1024 * 1024)
    const fd = makeUploadFormData(bigFile, 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/5 MB/)
  })

  it('should_reject_unsupported_file_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const exeFile = new File([new Uint8Array(100)], 'virus.exe', { type: 'application/octet-stream' })
    const fd = new FormData()
    fd.set('file', exeFile)
    fd.set('record_type', 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/Unsupported/)
  })

  it('should_reject_file_with_no_extension', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const noExtFile = new File([new Uint8Array(100)], 'noextension', { type: 'application/pdf' })
    const fd = new FormData()
    fd.set('file', noExtFile)
    fd.set('record_type', 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/Unsupported/)
  })

  it('should_reject_file_with_trailing_dot', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const trailingDotFile = new File([new Uint8Array(100)], 'file.', { type: 'application/pdf' })
    const fd = new FormData()
    fd.set('file', trailingDotFile)
    fd.set('record_type', 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/Unsupported/)
  })

  it('should_reject_invalid_record_type_for_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/Invalid/)
  })

  it('should_reject_invalid_record_type_for_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-rdr', fd)
    expect(result.error).toMatch(/Invalid/)
  })

  it('should_accept_other_as_valid_trainer_record_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_accept_other_as_valid_rider_record_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'mem-target-rdr', fd)

    expect(createDocument).toHaveBeenCalled()
  })

  it('should_revalidate_member_detail_path_after_upload', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_return_error_when_target_membership_not_found', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(null)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-gone', fd)
    expect(result.error).toBe('Not found')
  })

  it('should_return_error_when_target_has_no_user_id', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' })
    )

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-nouser', fd)
    expect(result.error).toBe('Target member has no account linked')
  })

  it('should_return_error_when_no_file_provided', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = new FormData()
    fd.set('record_type', 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toMatch(/No file/)
  })

  it('should_return_error_when_storage_upload_fails', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage upload failed'))

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toBe('storage upload failed')
  })

  it('should_cleanup_storage_on_db_insert_failure', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)
    vi.mocked(createDocument).mockRejectedValue(new Error('db error'))

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'mem-target-trn', fd)
    expect(result.error).toBe('db error')
    expect(removeFile).toHaveBeenCalled()
  })

  it('should_use_null_for_empty_notes', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = new FormData()
    fd.set('file', makePdfFile())
    fd.set('record_type', 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(createDocument).toHaveBeenCalledWith(
      'trainer', expect.any(String), expect.any(String), expect.any(String),
      expect.any(String), expect.any(String), expect.any(Number), null
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

  it('should_delete_manager_document_using_trainer_documents_table', async () => {
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
