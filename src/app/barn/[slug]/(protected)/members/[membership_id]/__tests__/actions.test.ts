import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))
vi.mock('@/lib/db/barn-memberships', () => ({
  getMembershipById: vi.fn(),
}))
vi.mock('@/lib/db/trainer-documents', () => ({
  createTrainerDocument: vi.fn(),
  deleteTrainerDocument: vi.fn(),
}))
vi.mock('@/lib/db/rider-documents', () => ({
  createRiderDocument: vi.fn(),
  deleteRiderDocument: vi.fn(),
}))
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getMembershipById } from '@/lib/db/barn-memberships'
import { createTrainerDocument, deleteTrainerDocument } from '@/lib/db/trainer-documents'
import { createRiderDocument, deleteRiderDocument } from '@/lib/db/rider-documents'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { uploadDocumentAction, deleteDocumentAction } from '../actions'

const mockBarn = createMockBarn()

const managerMembership = createMockMembership({ id: 'mem-mgr', user_id: 'user-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', user_id: 'user-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', user_id: 'user-rdr', role: 'rider' })

const targetTrainerMembership = createMockMembership({ id: 'mem-target-trn', user_id: 'user-target-trn', barn_id: 'barn-1', role: 'trainer' })
const targetRiderMembership = createMockMembership({ id: 'mem-target-rdr', user_id: 'user-target-rdr', barn_id: 'barn-1', role: 'rider' })

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
    vi.mocked(createTrainerDocument).mockReset()
    vi.mocked(createRiderDocument).mockReset()
    vi.mocked(createClient).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ data: { path: 'some/path' }, error: null }),
        }),
      },
    } as any)
    vi.mocked(createTrainerDocument).mockResolvedValue({} as any)
    vi.mocked(createRiderDocument).mockResolvedValue({} as any)
  })

  it('should_upload_trainer_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(createTrainerDocument).toHaveBeenCalled()
  })

  it('should_upload_rider_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await uploadDocumentAction('green-acres', 'mem-target-rdr', fd)

    expect(createRiderDocument).toHaveBeenCalled()
  })

  it('should_upload_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-trn', fd)

    expect(createTrainerDocument).toHaveBeenCalled()
  })

  it('should_reject_upload_when_trainer_targets_rider', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    const fd = makeUploadFormData(makePdfFile(), 'liability_waiver')
    await expect(uploadDocumentAction('green-acres', 'mem-target-rdr', fd)).rejects.toThrow()
  })

  it('should_reject_file_over_5mb', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const bigFile = makePdfFile(6 * 1024 * 1024)
    const fd = makeUploadFormData(bigFile, 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', fd)).rejects.toThrow()
  })

  it('should_reject_unsupported_file_type', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const exeFile = new File([new Uint8Array(100)], 'virus.exe', { type: 'application/octet-stream' })
    const fd = new FormData()
    fd.set('file', exeFile)
    fd.set('record_type', 'instructor_contract')
    await expect(uploadDocumentAction('green-acres', 'mem-target-trn', fd)).rejects.toThrow()
  })

  it('should_revalidate_member_detail_path_after_upload', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    const fd = makeUploadFormData(makePdfFile(), 'instructor_contract')
    await uploadDocumentAction('green-acres', 'mem-target-trn', fd)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })
})

describe('deleteDocumentAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getMembershipById).mockReset()
    vi.mocked(deleteTrainerDocument).mockReset()
    vi.mocked(deleteRiderDocument).mockReset()
    vi.mocked(createClient).mockReset()
    vi.mocked(revalidatePath).mockReset()

    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ error: null }),
        }),
      },
    } as any)
    vi.mocked(deleteTrainerDocument).mockResolvedValue(undefined)
    vi.mocked(deleteRiderDocument).mockResolvedValue(undefined)
  })

  it('should_delete_trainer_document_as_manager', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'trainer', 'barn-1/trainers/user-target-trn/file.pdf')

    expect(deleteTrainerDocument).toHaveBeenCalledWith('doc-1', 'barn-1')
  })

  it('should_delete_own_trainer_document_as_trainer', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(trainerMembership)

    await deleteDocumentAction('green-acres', 'mem-trn', 'doc-1', 'trainer', 'barn-1/trainers/user-trn/file.pdf')

    expect(deleteTrainerDocument).toHaveBeenCalledWith('doc-1', 'barn-1')
  })

  it('should_reject_delete_when_trainer_targets_rider_document', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-trn' } as any, barn: mockBarn, membership: trainerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetRiderMembership)

    await expect(
      deleteDocumentAction('green-acres', 'mem-target-rdr', 'doc-2', 'rider', 'barn-1/riders/user-target-rdr/waiver.pdf')
    ).rejects.toThrow()
  })

  it('should_revalidate_member_detail_path_after_delete', async () => {
    vi.mocked(requireMembership).mockResolvedValue({ user: { id: 'user-mgr' } as any, barn: mockBarn, membership: managerMembership })
    vi.mocked(getMembershipById).mockResolvedValue(targetTrainerMembership)

    await deleteDocumentAction('green-acres', 'mem-target-trn', 'doc-1', 'trainer', 'barn-1/trainers/user-target-trn/file.pdf')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/members/mem-target-trn')
  })
})
