import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { RiderDocument } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getRiderDocuments,
  createRiderDocument,
  deleteRiderDocument,
  uploadDocumentFile,
  removeDocumentFile,
  getDocumentSignedUrl,
} from '../rider-documents'

const mockDoc: RiderDocument = {
  id: 'doc-2',
  barn_id: 'barn-1',
  rider_id: 'user-2',
  record_type: 'liability_waiver',
  storage_path: 'barn-1/riders/user-2/waiver.pdf',
  file_name: 'waiver.pdf',
  file_size: 512,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('getRiderDocuments', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_array_when_no_documents', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getRiderDocuments('user-2', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_return_documents_for_rider', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockDoc], error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getRiderDocuments('user-2', 'barn-1')

    expect(result).toEqual([mockDoc])
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getRiderDocuments('user-2', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getRiderDocuments('user-2', 'barn-1')

    expect(result).toEqual([])
  })
})

describe('createRiderDocument', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_create_and_return_document', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createRiderDocument(
      'barn-1', 'user-2', 'liability_waiver',
      'barn-1/riders/user-2/waiver.pdf', 'waiver.pdf', 512, null
    )

    expect(result).toEqual(mockDoc)
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('insert error') }),
          }),
        }),
      }),
    } as any)

    await expect(
      createRiderDocument('barn-1', 'user-2', 'liability_waiver', 'path', 'file.pdf', 512, null)
    ).rejects.toThrow('insert error')
  })
})

describe('deleteRiderDocument', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_delete_document', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: mockEq }),
        }),
      }),
    } as any)

    await expect(deleteRiderDocument('doc-2', 'barn-1')).resolves.toBeUndefined()
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: new Error('delete error') }),
          }),
        }),
      }),
    } as any)

    await expect(deleteRiderDocument('doc-2', 'barn-1')).rejects.toThrow('delete error')
  })
})

describe('uploadDocumentFile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_upload_file_to_storage', async () => {
    const mockUpload = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ upload: mockUpload }) },
    } as any)

    const file = new File([new Uint8Array(100)], 'waiver.pdf', { type: 'application/pdf' })
    await expect(uploadDocumentFile('barn-1/riders/user-2/waiver.pdf', file, 'application/pdf')).resolves.toBeUndefined()
  })

  it('should_throw_on_storage_upload_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error('upload error') }),
        }),
      },
    } as any)

    const file = new File([new Uint8Array(100)], 'waiver.pdf', { type: 'application/pdf' })
    await expect(uploadDocumentFile('some/path', file, 'application/pdf')).rejects.toThrow('upload error')
  })
})

describe('removeDocumentFile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_remove_file_from_storage', async () => {
    const mockRemove = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      storage: { from: vi.fn().mockReturnValue({ remove: mockRemove }) },
    } as any)

    await expect(removeDocumentFile('barn-1/riders/user-2/waiver.pdf')).resolves.toBeUndefined()
  })

  it('should_throw_on_storage_remove_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          remove: vi.fn().mockResolvedValue({ error: new Error('remove error') }),
        }),
      },
    } as any)

    await expect(removeDocumentFile('some/path')).rejects.toThrow('remove error')
  })
})

describe('getDocumentSignedUrl', () => {
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

    const url = await getDocumentSignedUrl('barn-1/riders/user-2/file.pdf')

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

    await expect(getDocumentSignedUrl('some/path')).rejects.toThrow('storage error')
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

    await expect(getDocumentSignedUrl('some/path')).rejects.toThrow('No signed URL returned')
  })
})
