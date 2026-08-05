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
}))

vi.mock('@/lib/db/member-horse-privileges', () => ({
  getMyHorseDocumentPrivilege: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/document-storage')>()
  return { ...actual, uploadFile: vi.fn(), removeFile: vi.fn() }
})

const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ redirect: mockRedirect }))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createDocument } from '@/lib/db/documents'
import { getMyHorseDocumentPrivilege } from '@/lib/db/member-horse-privileges'
import { uploadFile, removeFile } from '@/lib/db/document-storage'
import { uploadDocumentAction } from '../actions'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })
const riderCallerMembership = createMockMembership({ id: 'mem-rdr-caller', role: 'rider' })

function makePdfFile(sizeBytes = 1024, name = 'coggins.pdf'): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: 'application/pdf' })
}

function makeUploadFormData(file: File, recordType: string, notes = ''): FormData {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('record_type', recordType)
  fd.set('notes', notes)
  return fd
}

describe('uploadDocumentAction — horse entity', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(createDocument).mockReset()
    vi.mocked(getMyHorseDocumentPrivilege).mockReset()
    mockRedirect.mockClear()

    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(createDocument).mockResolvedValue({} as any)
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('none')
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_all_three_roles_for_horse_entity', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_upload_horse_document_as_rider_with_write_privilege', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr-caller' } as any,
      barn: mockBarn,
      membership: riderCallerMembership,
    })
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('write')
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(getMyHorseDocumentPrivilege).toHaveBeenCalledWith('horse-1', mockBarn.id)
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_reject_horse_upload_when_rider_privilege_is_read', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr-caller' } as any,
      barn: mockBarn,
      membership: riderCallerMembership,
    })
    vi.mocked(getMyHorseDocumentPrivilege).mockResolvedValue('read')
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: 'Not authorized' })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('should_reject_horse_upload_when_rider_privilege_is_none', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr-caller' } as any,
      barn: mockBarn,
      membership: riderCallerMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: 'Not authorized' })
    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('should_not_check_privilege_for_manager_upload', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(getMyHorseDocumentPrivilege).not.toHaveBeenCalled()
  })

  it('should_call_uploadFile_when_manager_uploads', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(uploadFile).toHaveBeenCalled()
  })

  it('should_call_createDocument_with_horse_entity', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'horse', mockBarn.id, 'horse-1', 'coggins', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_upload_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-trn' } as any,
      barn: mockBarn,
      membership: trainerMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'shot_record')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_redirect_to_horse_detail_page_on_success', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_reject_file_larger_than_4_5mb', async () => {
    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const fd = makeUploadFormData(bigFile, 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/4\.5 MB/) })
  })

  it('should_reject_unsupported_mime_type', async () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/octet-stream' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_reject_unsupported_extension', async () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/pdf' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_reject_invalid_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'not_a_valid_type')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })

  it('should_accept_other_as_valid_horse_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_reject_when_no_file_provided', async () => {
    const fd = new FormData()
    fd.set('record_type', 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/No file/) })
  })

  it('should_reject_file_with_no_extension', async () => {
    const file = new File([new Uint8Array(100)], 'coggins', { type: 'application/pdf' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_return_error_when_storage_upload_fails', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage upload failed'))
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    const result = await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'storage upload failed' })
  })

  it('should_pass_null_notes_when_notes_field_is_absent', async () => {
    const fd = new FormData()
    fd.set('file', makePdfFile())
    fd.set('record_type', 'coggins')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'horse', mockBarn.id, 'horse-1', 'coggins', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_pass_reminder_date_when_provided', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    fd.set('reminder_date', '2027-01-01')
    await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'horse', mockBarn.id, 'horse-1', 'coggins', expect.any(String), expect.any(String), expect.any(Number), null, '2027-01-01'
    )
  })

  it('should_rollback_storage_on_db_error', async () => {
    vi.mocked(createDocument).mockRejectedValue(new Error('db error'))
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    const result = await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'db error' })
    expect(removeFile).toHaveBeenCalled()
  })

  it('should_return_generic_error_when_non_error_is_thrown', async () => {
    vi.mocked(createDocument).mockRejectedValue('not an Error instance')
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    const result = await uploadDocumentAction('green-acres', 'horse', 'horse-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not an Error instance' })
  })
})

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })
const targetManagerMembership = createMockMembership({ id: 'mem-mgr-target', user_id: 'user-mgr-target', barn_id: 'barn-1', role: 'manager' })
const ownTrainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', barn_id: 'barn-1', role: 'trainer' })
const ownRiderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', barn_id: 'barn-1', role: 'rider' })

describe('uploadDocumentAction — trainer/rider (member) entity', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(createDocument).mockReset()
    mockRedirect.mockClear()

    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(createDocument).mockResolvedValue({} as any)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-mgr' } as any,
      barn: mockBarn,
      membership: managerMembership,
    })
    vi.mocked(getMembershipById).mockImplementation(async (id: string) => {
      const all: Record<string, any> = {
        'mem-target-trn': targetTrainerMembership,
        'mem-target-rdr': targetRiderMembership,
        'mem-mgr-target': targetManagerMembership,
        'mem-trn': ownTrainerMembership,
        'mem-rdr': ownRiderMembership,
      }
      return all[id] ?? null
    })
  })

  it('should_call_requireMembership_with_all_three_roles', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd).catch(() => {})
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer', 'rider'])
  })

  it('should_upload_trainer_document_as_manager', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'trainer', mockBarn.id, 'mem-target-trn', 'instructor_contract', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_upload_rider_document_as_manager', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'rider', 'mem-target-rdr', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'rider', mockBarn.id, 'mem-target-rdr', 'liability_waiver', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_upload_manager_document_using_trainer_entity', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-mgr-target', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'trainer', mockBarn.id, 'mem-mgr-target', 'instructor_contract', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_use_managers_storage_folder_for_manager_target', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-mgr-target', { error: null }, fd).catch(() => {})
    expect(uploadFile).toHaveBeenCalledWith(expect.stringContaining('/managers/user-mgr-target/'), expect.anything(), expect.anything())
  })

  it('should_upload_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-trn' } as any,
      barn: mockBarn,
      membership: ownTrainerMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-trn', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_reject_upload_of_own_rider_document_as_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr' } as any,
      barn: mockBarn,
      membership: ownRiderMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'rider', 'mem-rdr', { error: null }, fd)).resolves.toEqual({ error: 'Forbidden' })
  })

  it('should_reject_upload_when_trainer_targets_another_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-trn' } as any,
      barn: mockBarn,
      membership: ownTrainerMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'rider', 'mem-target-rdr', { error: null }, fd)).resolves.toEqual({ error: 'Forbidden' })
  })

  it('should_reject_upload_when_rider_targets_other_member', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr' } as any,
      barn: mockBarn,
      membership: ownRiderMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: 'Forbidden' })
  })

  it('should_redirect_to_member_detail_page_on_success', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })

  it('should_reject_invalid_record_type_for_trainer', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })

  it('should_reject_invalid_record_type_for_rider', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'rider', 'mem-target-rdr', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })

  it('should_accept_other_as_valid_trainer_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_accept_other_as_valid_rider_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadDocumentAction('green-acres', 'rider', 'mem-target-rdr', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalled()
  })

  it('should_return_error_when_target_membership_not_found', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-gone', { error: null }, fd)).resolves.toEqual({ error: 'Not found' })
  })

  it('should_return_error_when_target_in_different_barn', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ id: 'mem-other', user_id: 'user-other', barn_id: 'barn-other', role: 'trainer' }))
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-other', { error: null }, fd)).resolves.toEqual({ error: 'Not found' })
  })

  it('should_upload_document_for_managed_member_with_no_user_id_as_manager', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' }))
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-nouser', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'trainer', mockBarn.id, 'mem-nouser', 'instructor_contract', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_use_membership_id_in_storage_path_for_managed_member_with_no_user_id', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' }))
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-nouser', { error: null }, fd).catch(() => {})
    expect(uploadFile).toHaveBeenCalledWith(expect.stringContaining('/trainers/mem-nouser/'), expect.anything(), expect.anything())
  })

  it('should_reject_upload_for_managed_member_when_caller_is_not_manager', async () => {
    vi.mocked(getMembershipById).mockImplementation(async (id: string) => {
      const all: Record<string, any> = {
        'mem-nouser': createMockMembership({ id: 'mem-nouser', user_id: null as any, barn_id: 'barn-1', role: 'trainer' }),
        'mem-rdr': ownRiderMembership,
      }
      return all[id] ?? null
    })
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-rdr' } as any,
      barn: mockBarn,
      membership: ownRiderMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-nouser', { error: null }, fd)).resolves.toEqual({ error: 'Forbidden' })
  })

  it('should_reject_file_over_4_5mb', async () => {
    const bigFile = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const fd = makeUploadFormData(bigFile, 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/4\.5 MB/) })
  })

  it('should_reject_unsupported_file_type', async () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/octet-stream' })
    const fd = makeUploadFormData(file, 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Unsupported/) })
  })

  it('should_return_error_when_no_file_provided', async () => {
    const fd = new FormData()
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/No file/) })
  })

  it('should_return_error_when_storage_upload_fails', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage upload failed'))
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)
    expect(result).toEqual({ error: 'storage upload failed' })
  })

  it('should_rollback_storage_on_db_error', async () => {
    vi.mocked(createDocument).mockRejectedValue(new Error('db error'))
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)
    expect(result).toEqual({ error: 'db error' })
    expect(removeFile).toHaveBeenCalled()
  })

  it('should_return_generic_error_when_non_error_is_thrown', async () => {
    vi.mocked(createDocument).mockRejectedValue('not an Error instance')
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd)
    expect(result).toEqual({ error: 'not an Error instance' })
  })

  it('should_pass_reminder_date_when_provided', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    fd.set('reminder_date', '2027-01-01')
    await uploadDocumentAction('green-acres', 'trainer', 'mem-target-trn', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'trainer', mockBarn.id, 'mem-target-trn', 'instructor_contract', expect.any(String), expect.any(String), expect.any(Number), null, '2027-01-01'
    )
  })

  it('should_reject_upload_when_target_has_unknown_role', async () => {
    vi.mocked(getMembershipById).mockResolvedValue(
      createMockMembership({ id: 'mem-unknown', user_id: 'user-unknown', barn_id: 'barn-1', role: 'unknown' as any })
    )
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    const result = await uploadDocumentAction('green-acres', 'trainer', 'mem-unknown', { error: null }, fd)
    expect(result.error).toBeTruthy()
  })

  it('should_write_using_targets_actual_role_when_url_entity_is_mismatched', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'rider', 'mem-target-trn', { error: null }, fd).catch(() => {})
    expect(createDocument).toHaveBeenCalledWith(
      'trainer', mockBarn.id, 'mem-target-trn', 'instructor_contract', expect.any(String), expect.any(String), expect.any(Number), null, null
    )
  })

  it('should_reject_record_type_invalid_for_targets_actual_role_even_when_valid_for_mismatched_url_entity', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'rider', 'mem-target-trn', { error: null }, fd)).resolves.toEqual({ error: expect.stringMatching(/Invalid/) })
  })
})
