import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { HorseDocument, RiderDocument, TrainerDocument } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getDocuments, createDocument, deleteDocument, updateDocumentReminderDate, getDueDocuments } from '../documents'

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

  it('should_resolve_without_error_when_updating_reminder_date', async () => {
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
  })

  it('should_update_reminder_date', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq }) }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateDocumentReminderDate(entity as any, mockDoc.id, entityId, 'barn-1', '2027-01-01')
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

describe('getDueDocuments', () => {
  const today = '2026-07-07'

  const horseDoc = {
    id: 'doc-h1',
    barn_id: 'barn-1',
    horse_id: 'horse-1',
    record_type: 'coggins',
    file_name: 'coggins.pdf',
    reminder_date: '2026-01-01',
  }
  const trainerDoc = {
    id: 'doc-t1',
    barn_id: 'barn-1',
    trainer_id: 'user-9',
    record_type: 'instructor_contract',
    file_name: 'contract.pdf',
    reminder_date: '2026-02-01',
  }
  const riderDoc = {
    id: 'doc-r1',
    barn_id: 'barn-1',
    rider_id: 'user-8',
    record_type: 'liability_waiver',
    file_name: 'waiver.pdf',
    reminder_date: '2026-01-15',
  }

  function makeDocsChain(data: unknown[] | null, error: Error | null = null) {
    const mockLte = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ lte: mockLte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeHorseNamesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeMembershipsChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeProfilesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  function setupFrom({
    horseDocs = [],
    trainerDocs = [],
    riderDocs = [],
    horseNames = [],
    memberships = [],
    profiles = [],
    errors = {},
  }: {
    horseDocs?: unknown[] | null
    trainerDocs?: unknown[] | null
    riderDocs?: unknown[] | null
    horseNames?: unknown[] | null
    memberships?: unknown[] | null
    profiles?: unknown[] | null
    errors?: Partial<
      Record<'horse_documents' | 'trainer_documents' | 'rider_documents' | 'barn_memberships' | 'profiles', Error>
    >
  }) {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_documents') return makeDocsChain(horseDocs, errors.horse_documents ?? null)
      if (table === 'trainer_documents') return makeDocsChain(trainerDocs, errors.trainer_documents ?? null)
      if (table === 'rider_documents') return makeDocsChain(riderDocs, errors.rider_documents ?? null)
      if (table === 'horses') return makeHorseNamesChain(horseNames)
      if (table === 'barn_memberships') return makeMembershipsChain(memberships, errors.barn_memberships ?? null)
      return makeProfilesChain(profiles, errors.profiles ?? null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_array_when_no_due_documents', async () => {
    setupFrom({})

    const result = await getDueDocuments('barn-1', today)

    expect(result).toEqual([])
  })

  it('should_include_horse_document_with_resolved_horse_name', async () => {
    setupFrom({ horseDocs: [horseDoc], horseNames: [{ id: 'horse-1', name: 'Thunderbolt' }] })

    const result = await getDueDocuments('barn-1', today)

    expect(result).toEqual([
      {
        id: 'doc-h1',
        entity: 'horse',
        recordType: 'coggins',
        fileName: 'coggins.pdf',
        reminderDate: '2026-01-01',
        ownerName: 'Thunderbolt',
        ownerId: 'horse-1',
      },
    ])
  })

  it('should_include_trainer_document_with_resolved_membership_and_profile', async () => {
    setupFrom({
      trainerDocs: [trainerDoc],
      memberships: [{ id: 'mem-9', user_id: 'user-9' }],
      profiles: [{ user_id: 'user-9', first_name: 'Jane', last_name: 'Trainer' }],
    })

    const result = await getDueDocuments('barn-1', today)

    expect(result).toEqual([
      {
        id: 'doc-t1',
        entity: 'trainer',
        recordType: 'instructor_contract',
        fileName: 'contract.pdf',
        reminderDate: '2026-02-01',
        ownerName: 'Jane Trainer',
        ownerId: 'mem-9',
      },
    ])
  })

  it('should_include_rider_document_with_resolved_membership_and_profile', async () => {
    setupFrom({
      riderDocs: [riderDoc],
      memberships: [{ id: 'mem-8', user_id: 'user-8' }],
      profiles: [{ user_id: 'user-8', first_name: 'Bob', last_name: 'Rider' }],
    })

    const result = await getDueDocuments('barn-1', today)

    expect(result).toEqual([
      {
        id: 'doc-r1',
        entity: 'rider',
        recordType: 'liability_waiver',
        fileName: 'waiver.pdf',
        reminderDate: '2026-01-15',
        ownerName: 'Bob Rider',
        ownerId: 'mem-8',
      },
    ])
  })

  it('should_fall_back_to_raw_horse_id_when_horse_name_not_found', async () => {
    setupFrom({ horseDocs: [horseDoc], horseNames: [] })

    const result = await getDueDocuments('barn-1', today)

    expect(result[0].ownerName).toBe('horse-1')
  })

  it('should_fall_back_to_unknown_member_and_raw_user_id_when_membership_not_found', async () => {
    setupFrom({ trainerDocs: [trainerDoc], memberships: [], profiles: [] })

    const result = await getDueDocuments('barn-1', today)

    expect(result[0]).toMatchObject({ ownerName: 'Unknown Member', ownerId: 'user-9' })
  })

  it('should_sort_combined_results_by_reminder_date_ascending', async () => {
    setupFrom({
      horseDocs: [horseDoc],
      trainerDocs: [trainerDoc],
      riderDocs: [riderDoc],
      horseNames: [{ id: 'horse-1', name: 'Thunderbolt' }],
      memberships: [
        { id: 'mem-9', user_id: 'user-9' },
        { id: 'mem-8', user_id: 'user-8' },
      ],
      profiles: [
        { user_id: 'user-9', first_name: 'Jane', last_name: 'Trainer' },
        { user_id: 'user-8', first_name: 'Bob', last_name: 'Rider' },
      ],
    })

    const result = await getDueDocuments('barn-1', today)

    expect(result.map((d) => d.id)).toEqual(['doc-h1', 'doc-r1', 'doc-t1'])
  })

  it('should_throw_when_horse_documents_query_errors', async () => {
    setupFrom({ errors: { horse_documents: new Error('horse docs error') } })

    await expect(getDueDocuments('barn-1', today)).rejects.toThrow('horse docs error')
  })

  it('should_throw_when_trainer_documents_query_errors', async () => {
    setupFrom({ errors: { trainer_documents: new Error('trainer docs error') } })

    await expect(getDueDocuments('barn-1', today)).rejects.toThrow('trainer docs error')
  })

  it('should_throw_when_rider_documents_query_errors', async () => {
    setupFrom({ errors: { rider_documents: new Error('rider docs error') } })

    await expect(getDueDocuments('barn-1', today)).rejects.toThrow('rider docs error')
  })

  it('should_treat_null_document_query_data_as_empty', async () => {
    setupFrom({ horseDocs: null, trainerDocs: null, riderDocs: null })

    const result = await getDueDocuments('barn-1', today)

    expect(result).toEqual([])
  })

  it('should_fall_back_to_unknown_member_and_raw_user_id_for_rider_document_when_membership_not_found', async () => {
    setupFrom({ riderDocs: [riderDoc], memberships: [], profiles: [] })

    const result = await getDueDocuments('barn-1', today)

    expect(result[0]).toMatchObject({ ownerName: 'Unknown Member', ownerId: 'user-8' })
  })

  it('should_treat_null_membership_and_profile_data_as_empty', async () => {
    setupFrom({ trainerDocs: [trainerDoc], memberships: null, profiles: null })

    const result = await getDueDocuments('barn-1', today)

    expect(result[0]).toMatchObject({ ownerName: 'Unknown Member', ownerId: 'user-9' })
  })

  it('should_throw_when_barn_memberships_query_errors', async () => {
    setupFrom({ trainerDocs: [trainerDoc], errors: { barn_memberships: new Error('memberships error') } })

    await expect(getDueDocuments('barn-1', today)).rejects.toThrow('memberships error')
  })

  it('should_throw_when_profiles_query_errors', async () => {
    setupFrom({ trainerDocs: [trainerDoc], errors: { profiles: new Error('profiles error') } })

    await expect(getDueDocuments('barn-1', today)).rejects.toThrow('profiles error')
  })
})
