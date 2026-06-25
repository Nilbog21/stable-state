import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  setHorseAvailability: vi.fn(),
  updateHorse: vi.fn(),
  setHorseActive: vi.fn(),
}))

vi.mock('@/lib/db/horse-documents', () => ({
  createHorseDocument: vi.fn(),
  deleteHorseDocument: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', async (importOriginal) => {
  const actual = await importOriginal()
  return { ...actual, uploadFile: vi.fn(), removeFile: vi.fn() }
})

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { createHorseDocument, deleteHorseDocument } from '@/lib/db/horse-documents'
import { uploadFile, removeFile } from '@/lib/db/document-storage'
import { revalidatePath } from 'next/cache'
import { updateHorseDetailsAction, uploadHorseDocumentAction, deleteHorseDocumentAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('updateHorseDetailsAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorse).mockReset()
    vi.mocked(setHorseActive).mockReset()
    vi.mocked(setHorseAvailability).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateHorse).mockResolvedValue({} as any)
    vi.mocked(setHorseActive).mockResolvedValue(undefined)
    vi.mocked(setHorseAvailability).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateHorse_when_status_is_active', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })

  it('should_call_setHorseActive_with_true_when_status_is_active', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, true)
  })

  it('should_call_setHorseAvailability_with_true_and_null_reason_when_status_is_active', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, true, null)
  })

  it('should_call_updateHorse_when_status_is_unavailable', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'unavailable')
    fd.set('reason', 'stall rest')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })

  it('should_call_setHorseActive_with_true_when_status_is_unavailable', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'unavailable')
    fd.set('reason', 'stall rest')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, true)
  })

  it('should_call_setHorseAvailability_with_false_and_reason_when_status_is_unavailable', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'unavailable')
    fd.set('reason', 'stall rest')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, 'stall rest')
  })

  it('should_treat_empty_reason_as_null_when_status_is_unavailable', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'unavailable')
    fd.set('reason', '   ')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, null)
  })

  it('should_call_updateHorse_when_status_is_inactive', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'inactive')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })

  it('should_call_setHorseActive_with_false_when_status_is_inactive', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'inactive')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, false)
  })

  it('should_not_call_setHorseAvailability_when_status_is_inactive', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'inactive')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseAvailability).not.toHaveBeenCalled()
  })

  it('should_not_call_updateHorse_when_name_is_blank', async () => {
    const fd = new FormData()
    fd.set('name', '   ')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_not_call_updateHorse_when_name_field_is_absent', async () => {
    const fd = new FormData()
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_not_call_setHorseActive_when_name_is_blank', async () => {
    const fd = new FormData()
    fd.set('name', '   ')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(setHorseActive).not.toHaveBeenCalled()
  })

  it('should_revalidate_horses_list_path', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    const fd = new FormData()
    fd.set('name', 'Stormy')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_trim_name_before_calling_updateHorse', async () => {
    const fd = new FormData()
    fd.set('name', '  Stormy  ')
    fd.set('status', 'active')
    await updateHorseDetailsAction('green-acres', 'horse-1', fd)
    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })
})

const mockBarnForDocs = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })

function makePdfFile(sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], 'coggins.pdf', { type: 'application/pdf' })
}

function makeUploadFormData(file: File, recordType: string, notes = ''): FormData {
  const fd = new FormData()
  fd.set('file', file)
  fd.set('record_type', recordType)
  fd.set('notes', notes)
  return fd
}

describe('uploadHorseDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(createHorseDocument).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(createHorseDocument).mockResolvedValue({} as any)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_and_trainer_roles', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager', 'trainer'])
  })

  it('should_call_uploadFile_when_manager_uploads', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(uploadFile).toHaveBeenCalled()
  })

  it('should_call_createHorseDocument_when_manager_uploads', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(createHorseDocument).toHaveBeenCalled()
  })

  it('should_upload_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-trn' } as any,
      barn: mockBarnForDocs,
      membership: trainerMembership,
    })
    const fd = makeUploadFormData(makePdfFile(), 'shot_record')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(createHorseDocument).toHaveBeenCalled()
  })

  it('should_reject_file_larger_than_5mb', async () => {
    const bigFile = new File([new Uint8Array(6 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    const fd = makeUploadFormData(bigFile, 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/5 MB/)
  })

  it('should_reject_unsupported_mime_type', async () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/octet-stream' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/Unsupported/)
  })

  it('should_reject_unsupported_extension', async () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/pdf' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/Unsupported/)
  })

  it('should_reject_invalid_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'not_a_valid_type')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/Invalid/)
  })

  it('should_accept_other_as_valid_horse_record_type', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'other')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(createHorseDocument).toHaveBeenCalled()
  })

  it('should_reject_when_no_file_provided', async () => {
    const fd = new FormData()
    fd.set('record_type', 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/No file/)
  })

  it('should_reject_file_with_no_extension', async () => {
    const file = new File([new Uint8Array(100)], 'coggins', { type: 'application/pdf' })
    const fd = makeUploadFormData(file, 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow(/Unsupported/)
  })

  it('should_pass_null_notes_when_notes_field_is_absent', async () => {
    const fd = new FormData()
    fd.set('file', makePdfFile())
    fd.set('record_type', 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(createHorseDocument).toHaveBeenCalledWith(
      expect.any(String), 'horse-1', 'coggins', expect.any(String), expect.any(String), expect.any(Number), null
    )
  })

  it('should_rollback_storage_on_db_error', async () => {
    vi.mocked(createHorseDocument).mockRejectedValue(new Error('db error'))
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await expect(uploadHorseDocumentAction('green-acres', 'horse-1', fd)).rejects.toThrow('db error')
    expect(removeFile).toHaveBeenCalled()
  })

  it('should_revalidate_horse_detail_path', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('deleteHorseDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteHorseDocument).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(deleteHorseDocument).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarnForDocs,
      membership: managerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_delete_document_record', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(deleteHorseDocument).toHaveBeenCalledWith('doc-1', 'horse-1', mockBarnForDocs.id)
  })

  it('should_remove_storage_file', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(removeFile).toHaveBeenCalledWith('barn-1/horses/horse-1/coggins.pdf')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})
