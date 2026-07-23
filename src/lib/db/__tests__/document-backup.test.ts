import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

vi.mock('../document-storage', () => ({
  downloadFile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { resolveMemberNames } from '../member-names'
import { downloadFile } from '../document-storage'
import { getAllBarnDocuments, buildBackupZipEntries, buildDocumentsBackupZip } from '../document-backup'

function makeDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: 'doc-1',
    barn_id: 'barn-1',
    record_type: 'coggins',
    storage_path: 'barn-1/horses/horse-1/coggins.pdf',
    file_name: 'coggins.pdf',
    file_size: 1024,
    notes: null,
    reminder_date: null,
    created_at: '2026-03-05T00:00:00Z',
    updated_at: '2026-03-05T00:00:00Z',
    ...overrides,
  }
}

describe('buildBackupZipEntries', () => {
  const horseNames = new Map([['horse-1', 'Thunderbolt']])
  const memberNames = new Map([
    ['mem-9', 'Jane Trainer'],
    ['mem-8', 'Bob Rider'],
  ])

  it('should_place_horse_document_under_horse_folder', () => {
    const docs = { horse: [makeDoc({ horse_id: 'horse-1' })], trainer: [], rider: [] }

    const entries = buildBackupZipEntries(docs, horseNames, new Map())

    expect(entries).toEqual([
      { zipPath: 'horse/Thunderbolt/coggins-coggins-2026-03-05.pdf', storagePath: 'barn-1/horses/horse-1/coggins.pdf' },
    ])
  })

  it('should_place_trainer_and_rider_documents_of_the_same_member_under_one_member_folder', () => {
    const docs = {
      horse: [],
      trainer: [
        makeDoc({
          trainer_id: 'mem-9',
          record_type: 'instructor_contract',
          file_name: 'contract.pdf',
          storage_path: 's/t.pdf',
        }),
      ],
      rider: [
        makeDoc({
          rider_id: 'mem-9',
          record_type: 'liability_waiver',
          file_name: 'waiver.pdf',
          storage_path: 's/r.pdf',
        }),
      ],
    }

    const entries = buildBackupZipEntries(docs, new Map(), memberNames)

    expect(entries.map((e) => e.zipPath)).toEqual([
      'member/Jane Trainer/contract-instructor_contract-2026-03-05.pdf',
      'member/Jane Trainer/waiver-liability_waiver-2026-03-05.pdf',
    ])
  })

  it('should_append_numeric_suffix_on_filename_collision_within_the_same_folder', () => {
    const docs = {
      horse: [makeDoc({ horse_id: 'horse-1', id: 'doc-1' }), makeDoc({ horse_id: 'horse-1', id: 'doc-2' })],
      trainer: [],
      rider: [],
    }

    const entries = buildBackupZipEntries(docs, horseNames, new Map())

    expect(entries.map((e) => e.zipPath)).toEqual([
      'horse/Thunderbolt/coggins-coggins-2026-03-05.pdf',
      'horse/Thunderbolt/coggins-coggins-2026-03-05-1.pdf',
    ])
  })

  it('should_not_collide_across_different_folders', () => {
    const docs = {
      horse: [makeDoc({ horse_id: 'horse-1' })],
      trainer: [],
      rider: [makeDoc({ rider_id: 'mem-8', storage_path: 's/other.pdf' })],
    }

    const entries = buildBackupZipEntries(docs, horseNames, memberNames)

    expect(entries.map((e) => e.zipPath)).toEqual([
      'horse/Thunderbolt/coggins-coggins-2026-03-05.pdf',
      'member/Bob Rider/coggins-coggins-2026-03-05.pdf',
    ])
  })

  it('should_fall_back_to_raw_horse_id_when_name_unresolved', () => {
    const docs = { horse: [makeDoc({ horse_id: 'horse-unknown' })], trainer: [], rider: [] }

    const entries = buildBackupZipEntries(docs, new Map(), new Map())

    expect(entries[0].zipPath).toBe('horse/horse-unknown/coggins-coggins-2026-03-05.pdf')
  })

  it('should_fall_back_to_unknown_member_when_membership_name_unresolved', () => {
    const docs = { horse: [], trainer: [makeDoc({ trainer_id: 'mem-unknown' })], rider: [] }

    const entries = buildBackupZipEntries(docs, new Map(), new Map())

    expect(entries[0].zipPath).toBe('member/Unknown Member/coggins-coggins-2026-03-05.pdf')
  })

  it('should_sanitize_slashes_in_folder_names', () => {
    const docs = { horse: [makeDoc({ horse_id: 'horse-1' })], trainer: [], rider: [] }

    const entries = buildBackupZipEntries(docs, new Map([['horse-1', 'Thunder/Bolt']]), new Map())

    expect(entries[0].zipPath).toBe('horse/Thunder-Bolt/coggins-coggins-2026-03-05.pdf')
  })

  it('should_handle_file_names_without_an_extension', () => {
    const docs = { horse: [makeDoc({ horse_id: 'horse-1', file_name: 'noext' })], trainer: [], rider: [] }

    const entries = buildBackupZipEntries(docs, horseNames, new Map())

    expect(entries[0].zipPath).toBe('horse/Thunderbolt/noext-coggins-2026-03-05')
  })
})

describe('getAllBarnDocuments', () => {
  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function setupFrom({
    horseDocs = [],
    trainerDocs = [],
    riderDocs = [],
    errors = {},
  }: {
    horseDocs?: unknown[] | null
    trainerDocs?: unknown[] | null
    riderDocs?: unknown[] | null
    errors?: Partial<Record<'horse_documents' | 'staff_documents' | 'rider_documents', Error>>
  }) {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_documents') return makeChain(horseDocs, errors.horse_documents ?? null)
      if (table === 'staff_documents') return makeChain(trainerDocs, errors.staff_documents ?? null)
      if (table === 'rider_documents') return makeChain(riderDocs, errors.rider_documents ?? null)
      throw new Error(`unexpected table ${table}`)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_lists_when_barn_has_no_documents', async () => {
    setupFrom({})

    const result = await getAllBarnDocuments('barn-1')

    expect(result).toEqual({ horse: [], trainer: [], rider: [] })
  })

  it('should_return_documents_from_all_three_tables', async () => {
    const horseDoc = makeDoc({ horse_id: 'horse-1' })
    const trainerDoc = makeDoc({ trainer_id: 'mem-9' })
    const riderDoc = makeDoc({ rider_id: 'mem-8' })
    setupFrom({ horseDocs: [horseDoc], trainerDocs: [trainerDoc], riderDocs: [riderDoc] })

    const result = await getAllBarnDocuments('barn-1')

    expect(result).toEqual({ horse: [horseDoc], trainer: [trainerDoc], rider: [riderDoc] })
  })

  it('should_throw_on_horse_documents_query_error', async () => {
    setupFrom({ errors: { horse_documents: new Error('boom') } })

    await expect(getAllBarnDocuments('barn-1')).rejects.toThrow('boom')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const fromFn = vi.fn().mockImplementation(() => makeChain([]))
    const injectedClient = { from: fromFn } as any

    await getAllBarnDocuments('barn-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('buildDocumentsBackupZip', () => {
  function makeDocsChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeHorseNamesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function setupFrom({
    horseDocs = [],
    trainerDocs = [],
    riderDocs = [],
    horseNames = [],
  }: {
    horseDocs?: unknown[] | null
    trainerDocs?: unknown[] | null
    riderDocs?: unknown[] | null
    horseNames?: unknown[] | null
  }) {
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_documents') return makeDocsChain(horseDocs)
      if (table === 'staff_documents') return makeDocsChain(trainerDocs)
      if (table === 'rider_documents') return makeDocsChain(riderDocs)
      return makeHorseNamesChain(horseNames)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    vi.mocked(downloadFile).mockReset()
    vi.mocked(downloadFile).mockResolvedValue(new Blob(['content']))
  })

  it('should_return_null_when_barn_has_no_documents', async () => {
    setupFrom({})

    const result = await buildDocumentsBackupZip('barn-1')

    expect(result).toBeNull()
  })

  it('should_build_a_zip_containing_each_document_at_its_computed_path', async () => {
    setupFrom({
      horseDocs: [makeDoc({ horse_id: 'horse-1' })],
      horseNames: [{ id: 'horse-1', name: 'Thunderbolt' }],
    })

    const buffer = await buildDocumentsBackupZip('barn-1')
    expect(buffer).not.toBeNull()

    const zip = await JSZip.loadAsync(buffer as Buffer)
    const expectedPath = 'horse/Thunderbolt/coggins-coggins-2026-03-05.pdf'
    expect(Object.keys(zip.files)).toEqual([expectedPath])
    expect(await zip.files[expectedPath].async('string')).toBe('content')
  })

  it('should_download_each_documents_bytes_via_its_storage_path', async () => {
    setupFrom({
      horseDocs: [makeDoc({ horse_id: 'horse-1', storage_path: 'barn-1/horses/horse-1/coggins.pdf' })],
      horseNames: [{ id: 'horse-1', name: 'Thunderbolt' }],
    })

    await buildDocumentsBackupZip('barn-1')

    expect(downloadFile).toHaveBeenCalledWith('barn-1/horses/horse-1/coggins.pdf', expect.anything())
  })
})
