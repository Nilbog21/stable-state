import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lesson-tiers', () => ({
  createTier: vi.fn(),
  updateTier: vi.fn(),
  setDefaultTier: vi.fn(),
  getTierById: vi.fn(),
  deactivateTier: vi.fn(),
  reactivateTier: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  updateBarnDefaultBoardFee: vi.fn(),
  setInstructorCut: vi.fn(),
  updateExhaustionThresholds: vi.fn(),
  updateBarnTimezone: vi.fn(),
  updateScheduleBufferMinutes: vi.fn(),
}))

vi.mock('@/lib/db/barn-events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('@/lib/db/document-backup', () => ({
  buildDocumentsBackupZip: vi.fn(),
}))

vi.mock('@/lib/db/backup', () => ({
  buildBarnDataBackupBuffer: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', () => ({
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
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

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { buildDocumentsBackupZip } from '@/lib/db/document-backup'
import { buildBarnDataBackupBuffer } from '@/lib/db/backup'
import { uploadFile, getSignedUrl } from '@/lib/db/document-storage'
import {
  downloadAllDocumentsAction,
  downloadBarnDataAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('downloadAllDocumentsAction', () => {
  const emptyDownloadState = { error: null, url: null }
  const emptyFormData = new FormData()

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(buildDocumentsBackupZip).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(getSignedUrl).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(null)

    await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_return_no_documents_error_when_barn_has_no_documents', async () => {
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(null)

    const result = await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(result).toEqual({ error: 'No documents to download yet', url: null })
  })

  it('should_not_upload_when_barn_has_no_documents', async () => {
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(null)

    await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(uploadFile).not.toHaveBeenCalled()
  })

  it('should_upload_the_zip_with_upsert', async () => {
    const buffer = Buffer.from('zip contents')
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(buffer)
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed-zip')

    await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(uploadFile).toHaveBeenCalledWith(
      `${mockBarn.id}/backup-archive/all-documents.zip`,
      expect.any(File),
      'application/zip',
      undefined,
      true
    )
  })

  it('should_request_a_signed_url_for_the_uploaded_zip_path', async () => {
    const buffer = Buffer.from('zip contents')
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(buffer)
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed-zip')

    await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(getSignedUrl).toHaveBeenCalledWith(`${mockBarn.id}/backup-archive/all-documents.zip`)
  })

  it('should_return_the_signed_url_on_success', async () => {
    const buffer = Buffer.from('zip contents')
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(buffer)
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed-zip')

    const result = await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(result).toEqual({ error: null, url: 'https://example.com/signed-zip' })
  })

  it('should_return_an_error_message_when_the_upload_fails', async () => {
    const buffer = Buffer.from('zip contents')
    vi.mocked(buildDocumentsBackupZip).mockResolvedValue(buffer)
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage unavailable'))

    const result = await downloadAllDocumentsAction('green-acres', emptyDownloadState, emptyFormData)

    expect(result).toEqual({ error: 'storage unavailable', url: null })
  })
})

describe('downloadBarnDataAction', () => {
  const emptyDownloadState = { error: null, url: null }
  const emptyFormData = new FormData()

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(buildBarnDataBackupBuffer).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(getSignedUrl).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(buildBarnDataBackupBuffer).mockResolvedValue(Buffer.from('xlsx contents'))
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(getSignedUrl).mockResolvedValue('https://example.com/signed-xlsx')
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_build_the_backup_buffer_scoped_to_the_barn_and_its_timezone', async () => {
    await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(buildBarnDataBackupBuffer).toHaveBeenCalledWith(mockBarn.id, mockBarn.timezone)
  })

  it('should_upload_the_workbook_with_upsert', async () => {
    await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(uploadFile).toHaveBeenCalledWith(
      `${mockBarn.id}/backup-archive/data-export.xlsx`,
      expect.any(File),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      undefined,
      true
    )
  })

  it('should_request_a_signed_url_for_the_uploaded_workbook_path', async () => {
    await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(getSignedUrl).toHaveBeenCalledWith(`${mockBarn.id}/backup-archive/data-export.xlsx`)
  })

  it('should_return_the_signed_url_on_success', async () => {
    const result = await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(result).toEqual({ error: null, url: 'https://example.com/signed-xlsx' })
  })

  it('should_return_an_error_message_when_the_upload_fails', async () => {
    vi.mocked(uploadFile).mockRejectedValue(new Error('storage unavailable'))

    const result = await downloadBarnDataAction('green-acres', emptyDownloadState, emptyFormData)

    expect(result).toEqual({ error: 'storage unavailable', url: null })
  })
})
