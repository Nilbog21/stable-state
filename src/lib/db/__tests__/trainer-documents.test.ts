import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { TrainerDocument } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getTrainerDocuments,
  createTrainerDocument,
  deleteTrainerDocument,
  getDocumentSignedUrl,
} from '../trainer-documents'

const mockDoc: TrainerDocument = {
  id: 'doc-1',
  barn_id: 'barn-1',
  trainer_id: 'user-1',
  record_type: 'instructor_contract',
  storage_path: 'barn-1/trainers/user-1/contract.pdf',
  file_name: 'contract.pdf',
  file_size: 1024,
  notes: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

describe('getTrainerDocuments', () => {
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

    const result = await getTrainerDocuments('user-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_return_documents_for_trainer', async () => {
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

    const result = await getTrainerDocuments('user-1', 'barn-1')

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

    await expect(getTrainerDocuments('user-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('createTrainerDocument', () => {
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

    const result = await createTrainerDocument(
      'barn-1', 'user-1', 'instructor_contract',
      'barn-1/trainers/user-1/contract.pdf', 'contract.pdf', 1024, null
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
      createTrainerDocument('barn-1', 'user-1', 'instructor_contract', 'path', 'file.pdf', 1024, null)
    ).rejects.toThrow('insert error')
  })
})

describe('deleteTrainerDocument', () => {
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

    await expect(deleteTrainerDocument('doc-1', 'barn-1')).resolves.toBeUndefined()
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

    await expect(deleteTrainerDocument('doc-1', 'barn-1')).rejects.toThrow('delete error')
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

    const url = await getDocumentSignedUrl('barn-1/trainers/user-1/file.pdf')

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
})
