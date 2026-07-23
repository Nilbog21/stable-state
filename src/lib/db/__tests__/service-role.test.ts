import { describe, it, expect, vi } from 'vitest'
import {
  mustSucceed,
  createServiceClient,
  findAuthUserIdsByEmails,
  findOrCreateAuthUser,
  teardownBarnData,
  teardownAllData,
} from '../service-role'

describe('mustSucceed', () => {
  it('should_throw_with_label_and_message_when_result_has_error', () => {
    expect(() =>
      mustSucceed({ data: null, error: { message: 'boom' } }, 'test-label')
    ).toThrow('test-label: boom')
  })

  it('should_return_data_when_result_has_no_error', () => {
    expect(mustSucceed({ data: [1, 2, 3], error: null }, 'ok')).toEqual([1, 2, 3])
  })
})

describe('createServiceClient', () => {
  it('should_return_a_supabase_client', () => {
    const client = createServiceClient('http://localhost', 'key')
    expect(client.auth.admin).toBeDefined()
  })
})

function listUsersPage(users: { id: string; email?: string }[]) {
  return { data: { users }, error: null }
}

describe('findAuthUserIdsByEmails', () => {
  it('should_throw_when_list_users_errors', async () => {
    const client = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }) } } } as any
    await expect(findAuthUserIdsByEmails(['a@x.com'], client)).rejects.toThrow('list auth users: boom')
  })

  it('should_stop_when_list_data_is_null', async () => {
    const client = { auth: { admin: { listUsers: vi.fn().mockResolvedValue({ data: null, error: null }) } } } as any
    const result = await findAuthUserIdsByEmails(['a@x.com'], client)
    expect(result).toEqual([])
  })

  it('should_skip_users_with_no_email_and_users_not_in_the_target_set', async () => {
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(
            listUsersPage([{ id: 'u1' }, { id: 'u2', email: 'other@x.com' }, { id: 'u3', email: 'match@x.com' }])
          ),
        },
      },
    } as any
    const result = await findAuthUserIdsByEmails(['match@x.com'], client)
    expect(result).toEqual(['u3'])
  })

  it('should_paginate_when_first_page_is_full', async () => {
    const fullPage = Array.from({ length: 50 }, (_, i) => ({ id: `u${i}`, email: `u${i}@x.com` }))
    const listUsers = vi.fn()
      .mockResolvedValueOnce(listUsersPage(fullPage))
      .mockResolvedValueOnce(listUsersPage([{ id: 'u50', email: 'match@x.com' }]))
    const client = { auth: { admin: { listUsers } } } as any

    const result = await findAuthUserIdsByEmails(['match@x.com'], client)

    expect(listUsers).toHaveBeenCalledTimes(2)
    expect(result).toEqual(['u50'])
  })
})

describe('findOrCreateAuthUser', () => {
  it('should_return_existing_id_without_creating_when_email_found', async () => {
    const createUser = vi.fn()
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsersPage([{ id: 'existing-1', email: 'demo@x.com' }])),
          createUser,
        },
      },
    } as any

    const id = await findOrCreateAuthUser('demo@x.com', client)

    expect(id).toBe('existing-1')
    expect(createUser).not.toHaveBeenCalled()
  })

  it('should_create_when_email_not_found', async () => {
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsersPage([])),
          createUser: vi.fn().mockResolvedValue({ data: { user: { id: 'new-1' } }, error: null }),
        },
      },
    } as any

    const id = await findOrCreateAuthUser('new@x.com', client)

    expect(id).toBe('new-1')
  })

  it('should_throw_when_create_errors_and_re_lookup_also_finds_nothing', async () => {
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsersPage([])),
          createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } }),
        },
      },
    } as any

    await expect(findOrCreateAuthUser('new@x.com', client)).rejects.toThrow('create auth user new@x.com: boom')
  })

  it('should_return_race_winner_id_when_create_errors_but_re_lookup_finds_the_user', async () => {
    const listUsers = vi.fn()
      .mockResolvedValueOnce(listUsersPage([]))
      .mockResolvedValueOnce(listUsersPage([{ id: 'race-winner-1', email: 'new@x.com' }]))
    const client = {
      auth: {
        admin: {
          listUsers,
          createUser: vi.fn().mockResolvedValue({ data: null, error: { message: 'duplicate key' } }),
        },
      },
    } as any

    const id = await findOrCreateAuthUser('new@x.com', client)

    expect(id).toBe('race-winner-1')
    expect(listUsers).toHaveBeenCalledTimes(2)
  })

  it('should_throw_when_create_returns_no_user', async () => {
    const client = {
      auth: {
        admin: {
          listUsers: vi.fn().mockResolvedValue(listUsersPage([])),
          createUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
        },
      },
    } as any

    await expect(findOrCreateAuthUser('new@x.com', client)).rejects.toThrow('create auth user new@x.com: no user returned')
  })
})

// Generic chainable/thenable query-builder stub: every call returns itself except the
// terminal `.then`, so one factory covers every select/delete/eq/in/not chain shape below
// without hand-writing each depth (mirrors the real supabase-js query builder, which is
// itself thenable).
function chain(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {}
  const methods = ['select', 'delete', 'eq', 'in', 'not']
  for (const m of methods) builder[m] = vi.fn(() => builder)
  builder.then = (resolve: (v: unknown) => void) => resolve(result)
  return builder
}

type TableResult = { data: unknown; error: unknown }

function buildClient(opts: {
  tables: Record<string, TableResult | TableResult[]>
  rpc?: TableResult
  storageError?: unknown
  listUsersPages?: { id: string }[][]
}) {
  const tableCallCounts: Record<string, number> = {}
  const from = vi.fn((table: string) => {
    const entry = opts.tables[table]
    if (Array.isArray(entry)) {
      const idx = tableCallCounts[table] ?? 0
      tableCallCounts[table] = idx + 1
      return chain(entry[Math.min(idx, entry.length - 1)])
    }
    return chain(entry ?? { data: [], error: null })
  })

  let listUsersCall = 0
  const listUsers = vi.fn(() => {
    const pages = opts.listUsersPages ?? [[]]
    const page = pages[Math.min(listUsersCall, pages.length - 1)]
    listUsersCall++
    return Promise.resolve({ data: { users: page }, error: null })
  })

  return {
    from,
    rpc: vi.fn().mockResolvedValue(opts.rpc ?? { data: null, error: null }),
    storage: { from: vi.fn().mockReturnValue({ remove: vi.fn().mockResolvedValue({ error: opts.storageError ?? null }) }) },
    auth: { admin: { listUsers, deleteUser: vi.fn().mockResolvedValue({ error: null }) } },
  } as any
}

describe('teardownBarnData', () => {
  it('should_delete_all_barn_scoped_data_and_orphaned_managed_stub_profiles', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        // horse_documents has a storage_path to remove; the other two doc tables don't —
        // exercises both the "has paths" and "no paths" branch of removeDocumentStorage.
        horse_documents: [{ data: [{ storage_path: 'a/b.pdf' }], error: null }, { data: [], error: null }],
        staff_documents: [{ data: [], error: null }, { data: [], error: null }],
        rider_documents: [{ data: [], error: null }, { data: [], error: null }],
        horses: [{ data: [{ photo_path: 'h/1.jpg' }, { photo_path: null }], error: null }, { data: [], error: null }],
        barn_memberships: [{ data: [{ profile_id: 'p1' }], error: null }, { data: [], error: null }],
        profiles: { data: [], error: null },
      },
    })

    await teardownBarnData('barn-1', client)

    expect(client.storage.from).toHaveBeenCalledWith('documents')
  })

  it('should_purge_managed_stub_profile_photo_storage_before_deleting_profiles', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [], error: null },
        barn_memberships: [{ data: [{ profile_id: 'p1' }], error: null }, { data: [], error: null }],
        profiles: [{ data: [{ photo_path: 'p/1.jpg' }], error: null }, { data: [], error: null }],
      },
    })

    await teardownBarnData('barn-1', client)

    expect(client.storage.from('documents').remove).toHaveBeenCalledWith(['p/1.jpg'])
  })

  it('should_throw_when_profile_photo_storage_removal_errors', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [], error: null },
        barn_memberships: [{ data: [{ profile_id: 'p1' }], error: null }, { data: [], error: null }],
        profiles: [{ data: [{ photo_path: 'p/1.jpg' }], error: null }, { data: [], error: null }],
      },
      storageError: { message: 'storage down' },
    })

    await expect(teardownBarnData('barn-1', client)).rejects.toThrow('remove storage profiles: storage down')
  })

  it('should_skip_managed_stub_profile_delete_when_no_memberships_found', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [], error: null },
        barn_memberships: [{ data: [], error: null }, { data: [], error: null }],
      },
    })

    await expect(teardownBarnData('barn-1', client)).resolves.toBeUndefined()
  })

  it('should_throw_when_rpc_teardown_errors', async () => {
    const client = buildClient({ tables: {}, rpc: { data: null, error: { message: 'boom' } } })
    await expect(teardownBarnData('barn-1', client)).rejects.toThrow('teardown lessons: boom')
  })

  it('should_throw_when_document_storage_removal_errors', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [{ storage_path: 'a/b.pdf' }], error: null },
      },
      storageError: { message: 'storage down' },
    })
    await expect(teardownBarnData('barn-1', client)).rejects.toThrow('remove storage horse_documents: storage down')
  })

  it('should_treat_null_document_query_data_as_no_paths_to_remove', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: null, error: null },
        staff_documents: { data: null, error: null },
        rider_documents: { data: null, error: null },
        horses: { data: [], error: null },
        barn_memberships: [{ data: [], error: null }, { data: [], error: null }],
      },
    })

    await teardownBarnData('barn-1', client)

    expect(client.storage.from).not.toHaveBeenCalled()
  })

  it('should_treat_null_photo_query_data_as_no_paths_to_remove', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: null, error: null },
        barn_memberships: [{ data: [], error: null }, { data: [], error: null }],
      },
    })

    await teardownBarnData('barn-1', client)

    expect(client.storage.from).not.toHaveBeenCalled()
  })

  it('should_throw_when_photo_storage_removal_errors', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [{ photo_path: 'h/1.jpg' }], error: null },
      },
      storageError: { message: 'storage down' },
    })
    await expect(teardownBarnData('barn-1', client)).rejects.toThrow('remove storage horses: storage down')
  })
})

describe('teardownAllData', () => {
  it('should_delete_everything_and_page_through_all_auth_users', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [{ storage_path: 'a/b.pdf' }], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [{ photo_path: 'h/1.jpg' }], error: null },
        barn_memberships: { data: [], error: null },
        profiles: { data: [{ photo_path: null }], error: null },
        barns: { data: [], error: null },
      },
      listUsersPages: [
        Array.from({ length: 50 }, (_, i) => ({ id: `u${i}` })),
        [{ id: 'u50' }],
        [],
      ],
    })

    await teardownAllData(client)

    expect(client.auth.admin.deleteUser).toHaveBeenCalledTimes(51)
  })

  it('should_throw_when_listing_auth_users_errors', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [], error: null },
        barn_memberships: { data: [], error: null },
        profiles: { data: [], error: null },
        barns: { data: [], error: null },
      },
    })
    client.auth.admin.listUsers = vi.fn().mockResolvedValue({ data: null, error: { message: 'boom' } })

    await expect(teardownAllData(client)).rejects.toThrow('list auth users: boom')
  })

  it('should_throw_when_deleting_an_auth_user_errors', async () => {
    const client = buildClient({
      tables: {
        lesson_tiers: { data: [], error: null },
        notifications: { data: [], error: null },
        horse_documents: { data: [], error: null },
        staff_documents: { data: [], error: null },
        rider_documents: { data: [], error: null },
        horses: { data: [], error: null },
        barn_memberships: { data: [], error: null },
        profiles: { data: [], error: null },
        barns: { data: [], error: null },
      },
      listUsersPages: [[{ id: 'u1' }]],
    })
    client.auth.admin.deleteUser = vi.fn().mockResolvedValue({ error: { message: 'boom' } })

    await expect(teardownAllData(client)).rejects.toThrow('delete auth user u1: boom')
  })
})
