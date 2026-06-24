import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HorseDocument } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getHorseDocuments,
  createHorseDocument,
  deleteHorseDocument,
  uploadDocumentFile,
  removeDocumentFile,
  getDocumentSignedUrl,
} from '../horse-documents'

const mockDoc: HorseDocument = {
  id: 'doc-1',
  barn_id: 'barn-1',
  horse_id: 'horse-1',
  record_type: 'coggins',
  storage_path: 'barn-1/horses/horse-1/coggins.pdf',
  file_name: 'coggins.pdf',
  file_size: 1024,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('getHorseDocuments', () => {
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

    const result = await getHorseDocuments('horse-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_return_documents_for_horse', async () => {
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

    const result = await getHorseDocuments('horse-1', 'barn-1')

    expect(result).toEqual([mockDoc])
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

    const result = await getHorseDocuments('horse-1', 'barn-1')

    expect(result).toEqual([])
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

    await expect(getHorseDocuments('horse-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('createHorseDocument', () => {
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

    const result = await createHorseDocument(
      'barn-1', 'horse-1', 'coggins',
      'barn-1/horses/horse-1/coggins.pdf', 'coggins.pdf', 1024, null
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
      createHorseDocument('barn-1', 'horse-1', 'coggins', 'path', 'file.pdf', 1024, null)
    ).rejects.toThrow('insert error')
  })
})

describe('deleteHorseDocument', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_delete_document', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) }),
        }),
      }),
    } as any)

    await expect(deleteHorseDocument('doc-1', 'horse-1', 'barn-1')).resolves.toBeUndefined()
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: new Error('delete error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(deleteHorseDocument('doc-1', 'horse-1', 'barn-1')).rejects.toThrow('delete error')
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

    const file = new File([new Uint8Array(100)], 'coggins.pdf', { type: 'application/pdf' })
    await expect(uploadDocumentFile('barn-1/horses/horse-1/coggins.pdf', file, 'application/pdf')).resolves.toBeUndefined()
  })

  it('should_throw_on_storage_upload_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: new Error('upload error') }),
        }),
      },
    } as any)

    const file = new File([new Uint8Array(100)], 'coggins.pdf', { type: 'application/pdf' })
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

    await expect(removeDocumentFile('barn-1/horses/horse-1/coggins.pdf')).resolves.toBeUndefined()
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

    const url = await getDocumentSignedUrl('barn-1/horses/horse-1/file.pdf')

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
