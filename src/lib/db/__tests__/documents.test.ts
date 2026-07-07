import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HorseDocument, RiderDocument, TrainerDocument } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getDocuments, createDocument, deleteDocument, updateDocumentReminderDate } from '../documents'

type EntityCase = {
  entity: 'horse' | 'rider' | 'trainer'
  idColumn: string
  entityId: string
  recordType: string
  mockDoc: HorseDocument | RiderDocument | TrainerDocument
}

const CASES: EntityCase[] = [
  {
    entity: 'horse',
    idColumn: 'horse_id',
    entityId: 'horse-1',
    recordType: 'coggins',
    mockDoc: {
      id: 'doc-1',
      barn_id: 'barn-1',
      horse_id: 'horse-1',
      record_type: 'coggins',
      storage_path: 'barn-1/horses/horse-1/coggins.pdf',
      file_name: 'coggins.pdf',
      file_size: 1024,
      notes: null,
      reminder_date: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as HorseDocument,
  },
  {
    entity: 'rider',
    idColumn: 'rider_id',
    entityId: 'user-2',
    recordType: 'liability_waiver',
    mockDoc: {
      id: 'doc-2',
      barn_id: 'barn-1',
      rider_id: 'user-2',
      record_type: 'liability_waiver',
      storage_path: 'barn-1/riders/user-2/waiver.pdf',
      file_name: 'waiver.pdf',
      file_size: 512,
      notes: null,
      reminder_date: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as RiderDocument,
  },
  {
    entity: 'trainer',
    idColumn: 'trainer_id',
    entityId: 'user-1',
    recordType: 'instructor_contract',
    mockDoc: {
      id: 'doc-3',
      barn_id: 'barn-1',
      trainer_id: 'user-1',
      record_type: 'instructor_contract',
      storage_path: 'barn-1/trainers/user-1/contract.pdf',
      file_name: 'contract.pdf',
      file_size: 1024,
      notes: null,
      reminder_date: null,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    } as TrainerDocument,
  },
]

describe.each(CASES)('getDocuments($entity)', ({ entity, entityId, mockDoc }) => {
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

    const result = await getDocuments(entity as any, entityId, 'barn-1')

    expect(result).toEqual([])
  })

  it('should_return_documents_for_entity', async () => {
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

    const result = await getDocuments(entity as any, entityId, 'barn-1')

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

    const result = await getDocuments(entity as any, entityId, 'barn-1')

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

    await expect(getDocuments(entity as any, entityId, 'barn-1')).rejects.toThrow('db error')
  })
})

describe.each(CASES)('createDocument($entity)', ({ entity, entityId, recordType, mockDoc }) => {
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

    const result = await createDocument(
      entity as any, 'barn-1', entityId, recordType as any,
      mockDoc.storage_path, mockDoc.file_name, mockDoc.file_size, null, null
    )

    expect(result).toEqual(mockDoc)
  })

  it('should_pass_reminder_date_through_to_insert', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockDoc, reminder_date: '2027-01-01' }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createDocument(
      entity as any, 'barn-1', entityId, recordType as any,
      mockDoc.storage_path, mockDoc.file_name, mockDoc.file_size, null, '2027-01-01'
    )

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ reminder_date: '2027-01-01' }))
  })

  it('should_pass_null_reminder_date_through_to_insert_when_omitted', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockDoc, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createDocument(
      entity as any, 'barn-1', entityId, recordType as any,
      mockDoc.storage_path, mockDoc.file_name, mockDoc.file_size, null, null
    )

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ reminder_date: null }))
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
      createDocument(entity as any, 'barn-1', entityId, recordType as any, 'path', 'file.pdf', 1024, null, null)
    ).rejects.toThrow('insert error')
  })
})

describe.each(CASES)('updateDocumentReminderDate($entity)', ({ entity, entityId, mockDoc }) => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_reminder_date', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await expect(
      updateDocumentReminderDate(entity as any, mockDoc.id, entityId, 'barn-1', '2027-01-01')
    ).resolves.toBeUndefined()
    expect(update).toHaveBeenCalledWith({ reminder_date: '2027-01-01' })
  })

  it('should_clear_reminder_date_when_null', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateDocumentReminderDate(entity as any, mockDoc.id, entityId, 'barn-1', null)
    expect(update).toHaveBeenCalledWith({ reminder_date: null })
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: new Error('update error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(
      updateDocumentReminderDate(entity as any, mockDoc.id, entityId, 'barn-1', '2027-01-01')
    ).rejects.toThrow('update error')
  })
})

describe.each(CASES)('deleteDocument($entity)', ({ entity, entityId, mockDoc }) => {
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

    await expect(deleteDocument(entity as any, mockDoc.id, entityId, 'barn-1')).resolves.toBeUndefined()
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

    await expect(deleteDocument(entity as any, mockDoc.id, entityId, 'barn-1')).rejects.toThrow('delete error')
  })
})
