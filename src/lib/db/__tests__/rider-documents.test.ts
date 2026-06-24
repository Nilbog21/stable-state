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
