import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  validateFile,
  uploadFile,
  removeFile,
  getSignedUrl,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  PHOTO_MIME_TYPES,
  PHOTO_EXTENSIONS,
} from '../document-storage'

function makePdfFile(sizeBytes = 1024): File {
  return new File([new Uint8Array(sizeBytes)], 'test.pdf', { type: 'application/pdf' })
}

describe('constants', () => {
  it('should_export_allowed_mime_types', () => {
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true)
  })

  it('should_export_allowed_extensions', () => {
    expect(ALLOWED_EXTENSIONS.has('pdf')).toBe(true)
  })

  it('should_export_max_file_size_as_4_5mb', () => {
    expect(MAX_FILE_SIZE).toBe(4500000)
  })

  it('should_export_photo_mime_types_as_jpeg_and_png_only', () => {
    expect(PHOTO_MIME_TYPES.has('image/jpeg')).toBe(true)
    expect(PHOTO_MIME_TYPES.has('image/png')).toBe(true)
    expect(PHOTO_MIME_TYPES.has('application/pdf')).toBe(false)
  })

  it('should_export_photo_extensions_as_jpg_jpeg_png_only', () => {
    expect(PHOTO_EXTENSIONS.has('jpg')).toBe(true)
    expect(PHOTO_EXTENSIONS.has('jpeg')).toBe(true)
    expect(PHOTO_EXTENSIONS.has('png')).toBe(true)
    expect(PHOTO_EXTENSIONS.has('pdf')).toBe(false)
  })
})

describe('validateFile', () => {
  it('should_return_lowercased_extension_for_valid_file', () => {
    const file = new File([new Uint8Array(100)], 'doc.PDF', { type: 'application/pdf' })
    expect(validateFile(file)).toBe('pdf')
  })

  it('should_throw_when_file_is_null', () => {
    expect(() => validateFile(null)).toThrow('No file provided')
  })

  it('should_throw_when_file_is_empty', () => {
    const file = new File([], 'empty.pdf', { type: 'application/pdf' })
    expect(() => validateFile(file)).toThrow('No file provided')
  })

  it('should_throw_when_file_exceeds_max_size', () => {
    const file = new File([new Uint8Array(5 * 1024 * 1024)], 'big.pdf', { type: 'application/pdf' })
    expect(() => validateFile(file)).toThrow('File exceeds 4.5 MB limit')
  })

  it('should_throw_when_mime_type_is_unsupported', () => {
    const file = new File([new Uint8Array(100)], 'virus.exe', { type: 'application/octet-stream' })
    expect(() => validateFile(file)).toThrow('Unsupported file type')
  })

  it('should_throw_when_file_has_no_extension', () => {
    const file = new File([new Uint8Array(100)], 'noextension', { type: 'application/pdf' })
    expect(() => validateFile(file)).toThrow('Unsupported file type')
  })

  it('should_throw_when_file_has_trailing_dot', () => {
    const file = new File([new Uint8Array(100)], 'file.', { type: 'application/pdf' })
    expect(() => validateFile(file)).toThrow('Unsupported file type')
  })

  it('should_throw_when_extension_is_not_allowed', () => {
    const file = new File([new Uint8Array(100)], 'bad.exe', { type: 'application/pdf' })
    expect(() => validateFile(file)).toThrow('Unsupported file type')
  })

  it('should_accept_jpeg_when_restricted_to_photo_types', () => {
    const file = new File([new Uint8Array(100)], 'horse.JPG', { type: 'image/jpeg' })
    expect(validateFile(file, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS)).toBe('jpg')
  })

  it('should_throw_when_pdf_is_passed_with_photo_only_allowed_types', () => {
    const file = makePdfFile()
    expect(() => validateFile(file, PHOTO_MIME_TYPES, PHOTO_EXTENSIONS)).toThrow('Unsupported file type')
  })
})

describe('uploadFile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_upload_file_to_documents_bucket', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ upload: mockUpload }) },
    } as any)

    const file = makePdfFile()
    await expect(uploadFile('barn-1/horses/horse-1/file.pdf', file, 'application/pdf')).resolves.toBeUndefined()
  })

  it('should_throw_on_storage_upload_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error('upload error') }),
        }),
      },
    } as any)

    const file = makePdfFile()
    await expect(uploadFile('some/path', file, 'application/pdf')).rejects.toThrow('upload error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      storage: { from: vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) }) },
    } as any

    const file = makePdfFile()
    await uploadFile('some/path', file, 'application/pdf', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_upload', async () => {
    const mockStorageFrom = vi.fn().mockReturnValue({ upload: vi.fn().mockResolvedValue({ error: null }) })
    const injectedClient = { storage: { from: mockStorageFrom } } as any

    const file = makePdfFile()
    await uploadFile('some/path', file, 'application/pdf', injectedClient)

    expect(mockStorageFrom).toHaveBeenCalledWith('documents')
  })
})

describe('removeFile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_remove_file_from_documents_bucket', async () => {
    const mockRemove = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ remove: mockRemove }) },
    } as any)

    await expect(removeFile('barn-1/horses/horse-1/file.pdf')).resolves.toBeUndefined()
  })

  it('should_throw_on_storage_remove_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ error: new Error('remove error') }),
        }),
      },
    } as any)

    await expect(removeFile('some/path')).rejects.toThrow('remove error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) }) },
    } as any

    await removeFile('some/path', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_remove', async () => {
    const mockStorageFrom = vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: null }) })
    const injectedClient = { storage: { from: mockStorageFrom } } as any

    await removeFile('some/path', injectedClient)

    expect(mockStorageFrom).toHaveBeenCalledWith('documents')
  })
})

describe('getSignedUrl', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_signed_url', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: 'https://example.com/signed' },
            error: null,
          }),
        }),
      },
    } as any)

    const url = await getSignedUrl('barn-1/horses/horse-1/file.pdf')

    expect(url).toBe('https://example.com/signed')
  })

  it('should_throw_on_storage_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: null,
            error: new Error('storage error'),
          }),
        }),
      },
    } as any)

    await expect(getSignedUrl('some/path')).rejects.toThrow('storage error')
  })

  it('should_throw_when_signed_url_is_missing', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          createSignedUrl: vi.fn().mockResolvedValue({
            data: { signedUrl: null },
            error: null,
          }),
        }),
      },
    } as any)

    await expect(getSignedUrl('some/path')).rejects.toThrow('No signed URL returned')
  })
})
