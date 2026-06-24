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
  uploadDocumentFile: vi.fn(),
  removeDocumentFile: vi.fn(),
  createHorseDocument: vi.fn(),
  deleteHorseDocument: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { setHorseAvailability, updateHorse, setHorseActive } from '@/lib/db/horses'
import { uploadDocumentFile, removeDocumentFile, createHorseDocument, deleteHorseDocument } from '@/lib/db/horse-documents'
import { revalidatePath } from 'next/cache'
import { updateHorseAvailabilityAction, renameHorseAction, setHorseActiveAction, uploadHorseDocumentAction, deleteHorseDocumentAction } from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('updateHorseAvailabilityAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setHorseAvailability).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setHorseAvailability).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setHorseAvailability_with_false_and_reason_when_unavailable', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, 'stall rest')
  })

  it('should_call_setHorseAvailability_with_true_and_null_reason_when_available', async () => {
    const formData = new FormData()
    formData.set('is_available', 'true')
    formData.set('reason', 'stall rest')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, true, null)
  })

  it('should_revalidate_horses_list_path', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'injury')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', 'injury')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })

  it('should_treat_empty_reason_as_null_when_unavailable', async () => {
    const formData = new FormData()
    formData.set('is_available', 'false')
    formData.set('reason', '   ')

    await updateHorseAvailabilityAction('green-acres', 'horse-1', formData)

    expect(setHorseAvailability).toHaveBeenCalledWith('horse-1', mockBarn.id, false, null)
  })
})

describe('renameHorseAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateHorse).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateHorse).mockResolvedValue({} as any)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateHorse_with_trimmed_name_and_barn_id', async () => {
    const formData = new FormData()
    formData.set('name', '  Stormy  ')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).toHaveBeenCalledWith('horse-1', mockBarn.id, 'Stormy')
  })

  it('should_not_call_updateHorse_when_name_is_blank', async () => {
    const formData = new FormData()
    formData.set('name', '   ')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_not_call_updateHorse_when_name_field_is_absent', async () => {
    const formData = new FormData()

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(updateHorse).not.toHaveBeenCalled()
  })

  it('should_revalidate_horses_list_path', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    const formData = new FormData()
    formData.set('name', 'Stormy')

    await renameHorseAction('green-acres', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})

describe('setHorseActiveAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setHorseActive).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setHorseActive).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setHorseActive_with_false_when_deactivating', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, false)
  })

  it('should_call_setHorseActive_with_true_when_activating', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', true)

    expect(setHorseActive).toHaveBeenCalledWith('horse-1', mockBarn.id, true)
  })

  it('should_revalidate_horses_list_path', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await setHorseActiveAction('green-acres', 'horse-1', false)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
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
    vi.mocked(uploadDocumentFile).mockReset()
    vi.mocked(removeDocumentFile).mockReset()
    vi.mocked(createHorseDocument).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(uploadDocumentFile).mockResolvedValue(undefined)
    vi.mocked(removeDocumentFile).mockResolvedValue(undefined)
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

  it('should_upload_document_as_manager', async () => {
    const fd = makeUploadFormData(makePdfFile(), 'coggins')
    await uploadHorseDocumentAction('green-acres', 'horse-1', fd)
    expect(uploadDocumentFile).toHaveBeenCalled()
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
    expect(removeDocumentFile).toHaveBeenCalled()
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
    vi.mocked(removeDocumentFile).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(deleteHorseDocument).mockResolvedValue(undefined)
    vi.mocked(removeDocumentFile).mockResolvedValue(undefined)
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

  it('should_delete_document_record_and_storage_file', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(deleteHorseDocument).toHaveBeenCalledWith('doc-1', mockBarnForDocs.id)
    expect(removeDocumentFile).toHaveBeenCalledWith('barn-1/horses/horse-1/coggins.pdf')
  })

  it('should_revalidate_horse_detail_path', async () => {
    await deleteHorseDocumentAction('green-acres', 'horse-1', 'doc-1', 'barn-1/horses/horse-1/coggins.pdf')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/horses/horse-1')
  })
})
