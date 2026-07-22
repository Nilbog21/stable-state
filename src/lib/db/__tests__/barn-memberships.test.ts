import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getUserMembership,
  createPendingMembership,
  getPendingMemberships,
  getActiveMemberships,
  approveMembership,
  deleteMembership,
  getMembershipById,
  getMembershipByIdForBarn,
  getBarnMembershipsForUser,
  getInstructorsByBarn,
  getActiveMembersWithProfiles,
  getActiveManagerUserIds,
  setCanInstruct,
} from '../barn-memberships'

const mockMembership = createMockMembership()

describe('getUserMembership', () => {
  it('should_return_membership_when_user_has_active_barn_membership', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockMembership,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getUserMembership('user-1', 'barn-1')

    expect(result).toEqual(mockMembership)
  })

  it('should_return_null_when_no_membership_exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getUserMembership('user-1', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getUserMembership('user-1', 'barn-1')).rejects.toThrow('query failed')
  })

  it('should_query_by_user_id_and_barn_id', async () => {
    const mockBarnEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
    })
    const mockUserEq = vi.fn().mockReturnValue({ eq: mockBarnEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockUserEq }),
      }),
    } as any)

    await getUserMembership('user-1', 'barn-1')

    expect(mockUserEq).toHaveBeenCalledWith('user_id', 'user-1')
    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })
})

describe('createPendingMembership', () => {
  it('should_insert_membership_with_pending_status', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: createMockMembership({ status: 'pending' }), error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createPendingMembership('user-1', 'barn-1', 'trainer', 'profile-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    )
  })

  it('should_return_the_created_membership', async () => {
    const pending = createMockMembership({ status: 'pending' })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: pending, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createPendingMembership('user-1', 'barn-1', 'trainer', 'profile-1')

    expect(result).toEqual(pending)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(createPendingMembership('user-1', 'barn-1', 'trainer', 'profile-1')).rejects.toThrow('insert failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: createMockMembership({ status: 'pending' }), error: null }),
          }),
        }),
      }),
    } as any

    await createPendingMembership('user-1', 'barn-1', 'trainer', 'profile-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createMockMembership({ status: 'pending' }), error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await createPendingMembership('user-1', 'barn-1', 'trainer', 'profile-1', injectedClient)

    expect(mockFrom).toHaveBeenCalled()
  })
})

describe('getPendingMemberships', () => {
  it('should_return_pending_memberships_for_barn', async () => {
    const pending = [createMockMembership({ status: 'pending' })]
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: pending, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getPendingMemberships('barn-1')

    expect(result).toEqual(pending)
  })

  it('should_return_empty_array_when_no_pending_memberships', async () => {
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

    const result = await getPendingMemberships('barn-1')

    expect(result).toEqual([])
  })

  it('should_query_by_barn_id_and_pending_status', async () => {
    const mockStatusEq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)

    await getPendingMemberships('barn-1')

    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockStatusEq).toHaveBeenCalledWith('status', 'pending')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getPendingMemberships('barn-1')).rejects.toThrow('query failed')
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

    const result = await getPendingMemberships('barn-1')

    expect(result).toEqual([])
  })
})

describe('getActiveMemberships', () => {
  it('should_return_active_memberships_for_barn', async () => {
    const active = [mockMembership]
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: active, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getActiveMemberships('barn-1')

    expect(result).toEqual(active)
  })

  it('should_query_by_barn_id_and_active_status', async () => {
    const mockStatusEq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)

    await getActiveMemberships('barn-1')

    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockStatusEq).toHaveBeenCalledWith('status', 'active')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getActiveMemberships('barn-1')).rejects.toThrow('query failed')
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

    const result = await getActiveMemberships('barn-1')

    expect(result).toEqual([])
  })
})

describe('approveMembership', () => {
  it('should_update_status_to_active', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await approveMembership('mem-1')

    expect(mockUpdate).toHaveBeenCalledWith({ status: 'active' })
    expect(mockEq).toHaveBeenCalledWith('id', 'mem-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(approveMembership('mem-1')).rejects.toThrow('update failed')
  })
})

describe('deleteMembership', () => {
  it('should_delete_membership_by_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: mockDelete }),
    } as any)

    await deleteMembership('mem-1')

    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'mem-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('delete failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(deleteMembership('mem-1')).rejects.toThrow('delete failed')
  })
})

describe('getMembershipById', () => {
  it('should_return_membership_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getMembershipById('mem-1')

    expect(result).toEqual(mockMembership)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getMembershipById('mem-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getMembershipById('mem-1')).rejects.toThrow('query failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: mockMembership, error: null })
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle }) }),
      }),
    } as any

    const result = await getMembershipById('mem-1', injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(result).toEqual(mockMembership)
  })
})

describe('getMembershipByIdForBarn', () => {
  function makeDirectClient(data: unknown, error: unknown = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
      rpc: vi.fn(),
    } as any
  }

  it('should_return_direct_result_when_narrow_policy_query_finds_row', async () => {
    const client = makeDirectClient(mockMembership)

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(result).toEqual(mockMembership)
  })

  it('should_not_call_rpc_when_narrow_policy_query_finds_row', async () => {
    const client = makeDirectClient(mockMembership)

    await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(client.rpc).not.toHaveBeenCalled()
  })

  it('should_call_rpc_with_barn_id_when_direct_query_returns_null', async () => {
    const client = makeDirectClient(null)
    client.rpc = vi.fn().mockResolvedValue({
      data: [
        { id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', role: 'rider', can_instruct: false, created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    })

    await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(client.rpc).toHaveBeenCalledWith('get_active_barn_member_summaries', { p_barn_id: 'barn-1' })
  })

  it('should_return_resolved_membership_from_rpc_when_direct_query_returns_null', async () => {
    const client = makeDirectClient(null)
    client.rpc = vi.fn().mockResolvedValue({
      data: [
        { id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', role: 'rider', can_instruct: false, created_at: '2026-01-01T00:00:00Z' },
      ],
      error: null,
    })

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(result).toEqual({
      id: 'mem-1',
      user_id: 'user-1',
      profile_id: 'profile-1',
      barn_id: 'barn-1',
      role: 'rider',
      status: 'active',
      can_instruct: false,
      invite_token: null,
      created_at: '2026-01-01T00:00:00Z',
    })
  })

  it('should_return_null_when_neither_direct_query_nor_rpc_finds_row', async () => {
    const client = makeDirectClient(null)
    client.rpc = vi.fn().mockResolvedValue({ data: [], error: null })

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(result).toBeNull()
  })

  it('should_return_null_when_rpc_data_is_null', async () => {
    const client = makeDirectClient(null)
    client.rpc = vi.fn().mockResolvedValue({ data: null, error: null })

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(result).toBeNull()
  })

  it('should_throw_when_direct_query_errors', async () => {
    const client = makeDirectClient(null, new Error('direct query failed'))

    await expect(getMembershipByIdForBarn('mem-1', 'barn-1', client)).rejects.toThrow('direct query failed')
  })

  it('should_throw_when_rpc_errors', async () => {
    const client = makeDirectClient(null)
    client.rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })

    await expect(getMembershipByIdForBarn('mem-1', 'barn-1', client)).rejects.toThrow('rpc failed')
  })

  it('should_call_createClient_when_no_client_provided', async () => {
    const client = makeDirectClient(mockMembership)
    vi.mocked(createClient).mockResolvedValue(client)

    await getMembershipByIdForBarn('mem-1', 'barn-1')

    expect(createClient).toHaveBeenCalled()
  })

  it('should_return_direct_result_when_no_client_provided', async () => {
    const client = makeDirectClient(mockMembership)
    vi.mocked(createClient).mockResolvedValue(client)

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1')

    expect(result).toEqual(mockMembership)
  })
})

describe('getBarnMembershipsForUser', () => {
  const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', instructor_cut: 25, created_at: '' }
  const mockRow = { ...mockMembership, barns: mockBarn }
  const expectedEntry = { barn: mockBarn, membership: mockMembership }

  function makeClient(data: unknown, error: unknown = null) {
    return {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data, error }),
          }),
        }),
      }),
    } as any
  }

  it('should_return_empty_array_when_user_has_no_memberships', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient([]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([])
  })

  it('should_return_single_active_membership_with_barn', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient([mockRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([expectedEntry])
  })

  it('should_return_multiple_active_memberships_with_barns', async () => {
    const barn2 = { id: 'barn-2', name: 'Sunny Stables', slug: 'sunny-stables', instructor_cut: 25, created_at: '' }
    const mem2 = createMockMembership({ id: 'mem-2', barn_id: 'barn-2' })
    const row2 = { ...mem2, barns: barn2 }
    vi.mocked(createClient).mockResolvedValue(makeClient([mockRow, row2]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([expectedEntry, { barn: barn2, membership: mem2 }])
  })

  it('should_return_pending_only_membership_with_barn', async () => {
    const pendingMem = createMockMembership({ status: 'pending' })
    const pendingRow = { ...pendingMem, barns: mockBarn }
    vi.mocked(createClient).mockResolvedValue(makeClient([pendingRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([{ barn: mockBarn, membership: pendingMem }])
  })

  it('should_return_mixed_active_and_pending_memberships', async () => {
    const pendingMem = createMockMembership({ id: 'mem-2', status: 'pending' })
    const pendingRow = { ...pendingMem, barns: mockBarn }
    vi.mocked(createClient).mockResolvedValue(makeClient([mockRow, pendingRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([expectedEntry, { barn: mockBarn, membership: pendingMem }])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(null, dbError))

    await expect(getBarnMembershipsForUser('user-1')).rejects.toThrow('query failed')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient(null))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([])
  })

  it('should_query_by_user_id', async () => {
    const mockEq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await getBarnMembershipsForUser('user-42')

    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-42')
  })

  it('should_exclude_rows_where_barns_is_null', async () => {
    const rowWithNullBarn = { ...mockMembership, barns: null }
    vi.mocked(createClient).mockResolvedValue(makeClient([rowWithNullBarn]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([])
  })

  it('should_exclude_rows_where_barn_is_demo', async () => {
    const demoBarn = { ...mockBarn, id: 'barn-demo', is_demo: true }
    const demoRow = { ...createMockMembership({ id: 'mem-2', barn_id: 'barn-demo' }), barns: demoBarn }
    vi.mocked(createClient).mockResolvedValue(makeClient([mockRow, demoRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([expectedEntry])
  })
})

describe('getInstructorsByBarn', () => {
  function makeClient(membershipsData: unknown, membershipsError: unknown, profilesData: unknown, profilesError: unknown) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: membershipsData, error: membershipsError }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: profilesData, error: profilesError }),
          }),
        }
      }),
    } as any
  }

  it('should_return_empty_array_when_no_can_instruct_members', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null))

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_memberships_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient(null, null, null, null))

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_instructors_with_membership_ids_and_names_joined_via_profile_id', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-trainer-1', user_id: 'user-trainer-1', profile_id: 'profile-1' }],
        null,
        [{ id: 'profile-1', first_name: 'Bob', last_name: 'Smith' }],
        null
      )
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ membershipId: 'mem-trainer-1', userId: 'user-trainer-1', name: 'Bob Smith' }])
  })

  it('should_include_stub_trainers_with_null_user_id', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-stub-1', user_id: null, profile_id: 'profile-2' }],
        null,
        [{ id: 'profile-2', first_name: 'Alex', last_name: 'Managed' }],
        null
      )
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ membershipId: 'mem-stub-1', userId: null, name: 'Alex Managed' }])
  })

  it('should_fall_back_to_unknown_instructor_when_profile_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-trainer-1', user_id: 'user-trainer-1', profile_id: 'profile-1' }], null, [], null)
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ membershipId: 'mem-trainer-1', userId: 'user-trainer-1', name: 'Unknown Instructor' }])
  })

  it('should_filter_by_barn_id', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockCanInstructEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockStatusEq = vi.fn().mockReturnValue({ eq: mockCanInstructEq })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)
    await getInstructorsByBarn('barn-1')
    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_active_status', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockCanInstructEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockStatusEq = vi.fn().mockReturnValue({ eq: mockCanInstructEq })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)
    await getInstructorsByBarn('barn-1')
    expect(mockStatusEq).toHaveBeenCalledWith('status', 'active')
  })

  it('should_filter_by_can_instruct_true', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockCanInstructEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockStatusEq = vi.fn().mockReturnValue({ eq: mockCanInstructEq })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockStatusEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)
    await getInstructorsByBarn('barn-1')
    expect(mockCanInstructEq).toHaveBeenCalledWith('can_instruct', true)
  })

  it('should_throw_when_memberships_query_fails', async () => {
    const dbError = new Error('memberships query failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(null, dbError, null, null))

    await expect(getInstructorsByBarn('barn-1')).rejects.toThrow('memberships query failed')
  })

  it('should_throw_when_profiles_query_fails', async () => {
    const dbError = new Error('profiles query failed')
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-trainer-1', user_id: 'user-trainer-1', profile_id: 'profile-1' }], null, null, dbError)
    )

    await expect(getInstructorsByBarn('barn-1')).rejects.toThrow('profiles query failed')
  })

  it('should_fall_back_to_unknown_instructor_when_profiles_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-trainer-1', user_id: 'user-trainer-1', profile_id: 'profile-1' }], null, null, null)
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ membershipId: 'mem-trainer-1', userId: 'user-trainer-1', name: 'Unknown Instructor' }])
  })
})

describe('getActiveMembersWithProfiles', () => {
  function makeClient(
    membershipsData: unknown,
    membershipsError: unknown,
    profilesData: unknown,
    profilesError: unknown,
    rpc: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue({ data: [], error: null })
  ) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    order: vi.fn().mockResolvedValue({ data: membershipsData, error: membershipsError }),
                  }),
                }),
              }),
            }),
          }
        }
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: profilesData, error: profilesError }),
          }),
        }
      }),
      rpc,
    } as any
  }

  it('should_return_empty_array_when_no_active_members', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null))
    const result = await getActiveMembersWithProfiles('barn-1', 'rider')
    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_memberships_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient(null, null, null, null))
    const result = await getActiveMembersWithProfiles('barn-1', 'trainer')
    expect(result).toEqual([])
  })

  it('should_return_members_with_names_joined_via_profile_id', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }],
        null,
        [{ id: 'profile-1', first_name: 'Carol', last_name: 'Rider', is_managed: false }],
        null
      )
    )
    const result = await getActiveMembersWithProfiles('barn-1', 'rider')
    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Carol Rider',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_return_is_managed_true_and_invite_token_for_managed_members', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-2', user_id: null, profile_id: 'profile-2', invite_token: 'tok-123' }],
        null,
        [{ id: 'profile-2', first_name: 'Alex', last_name: 'Smith', is_managed: true }],
        null
      )
    )
    const result = await getActiveMembersWithProfiles('barn-1', 'rider')
    expect(result).toEqual([{
      membershipId: 'mem-2',
      userId: null,
      name: 'Alex Smith',
      isManaged: true,
      inviteToken: 'tok-123',
    }])
  })

  it('should_fall_back_to_unknown_member_when_profile_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }],
        null,
        [],
        null
      )
    )
    const result = await getActiveMembersWithProfiles('barn-1', 'rider')
    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Unknown Member',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_fall_back_to_unknown_member_when_profiles_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }],
        null,
        null,
        null
      )
    )
    const result = await getActiveMembersWithProfiles('barn-1', 'rider')
    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Unknown Member',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_throw_when_memberships_query_fails', async () => {
    const dbError = new Error('memberships query failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(null, dbError, null, null))
    await expect(getActiveMembersWithProfiles('barn-1', 'rider')).rejects.toThrow('memberships query failed')
  })

  it('should_throw_when_profiles_query_fails', async () => {
    const dbError = new Error('profiles query failed')
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }], null, null, dbError)
    )
    await expect(getActiveMembersWithProfiles('barn-1', 'rider')).rejects.toThrow('profiles query failed')
  })

  it('should_skip_rpc_fallback_when_caller_supplies_a_client', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    const client = makeClient(
      [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }],
      null,
      [{ id: 'profile-1', first_name: 'Carol', last_name: 'Rider', is_managed: false }],
      null,
      rpc
    )

    const result = await getActiveMembersWithProfiles('barn-1', 'rider', client)

    expect(rpc).not.toHaveBeenCalled()
    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Carol Rider',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_call_get_active_barn_member_summaries_rpc_with_barn_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await getActiveMembersWithProfiles('barn-42', 'rider')

    expect(rpc).toHaveBeenCalledWith('get_active_barn_member_summaries', { p_barn_id: 'barn-42' })
  })

  it('should_merge_rpc_fallback_rows_not_returned_by_direct_query', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mem-rpc-1', user_id: 'user-9', profile_id: 'profile-9', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(
      makeClient([], null, [{ id: 'profile-9', first_name: 'Riley', last_name: 'Rider', is_managed: false }], null, rpc)
    )

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([{
      membershipId: 'mem-rpc-1',
      userId: 'user-9',
      name: 'Riley Rider',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_not_duplicate_rows_present_in_both_direct_query_and_rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: 'tok-1' }],
        null,
        [{ id: 'profile-1', first_name: 'Carol', last_name: 'Rider', is_managed: false }],
        null,
        rpc
      )
    )

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Carol Rider',
      isManaged: false,
      inviteToken: 'tok-1',
    }])
  })

  it('should_filter_rpc_rows_by_requested_role', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mem-manager-1', user_id: 'user-5', profile_id: 'profile-5', role: 'manager', can_instruct: false, created_at: '2026-01-01' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([])
  })

  it('should_set_invite_token_null_for_rpc_sourced_managed_member', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mem-rpc-2', user_id: null, profile_id: 'profile-managed', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(
      makeClient([], null, [{ id: 'profile-managed', first_name: 'Stub', last_name: 'Rider', is_managed: true }], null, rpc)
    )

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([{
      membershipId: 'mem-rpc-2',
      userId: null,
      name: 'Stub Rider',
      isManaged: true,
      inviteToken: null,
    }])
  })

  it('should_fall_back_to_unknown_member_when_rpc_sourced_profile_not_found', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'mem-rpc-3', user_id: 'user-3', profile_id: 'profile-missing', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([{
      membershipId: 'mem-rpc-3',
      userId: 'user-3',
      name: 'Unknown Member',
      isManaged: false,
      inviteToken: null,
    }])
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await expect(getActiveMembersWithProfiles('barn-1', 'rider')).rejects.toThrow('rpc failed')
  })

  it('should_return_direct_rows_when_rpc_data_is_null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', user_id: 'user-1', profile_id: 'profile-1', invite_token: null }],
        null,
        [{ id: 'profile-1', first_name: 'Carol', last_name: 'Rider', is_managed: false }],
        null,
        rpc
      )
    )

    const result = await getActiveMembersWithProfiles('barn-1', 'rider')

    expect(result).toEqual([{
      membershipId: 'mem-1',
      userId: 'user-1',
      name: 'Carol Rider',
      isManaged: false,
      inviteToken: null,
    }])
  })
})

describe('getActiveManagerUserIds', () => {
  function makeChain(result: { data: unknown; error: unknown }) {
    const mockEq3 = vi.fn().mockResolvedValue(result)
    const mockEq2 = vi.fn().mockReturnValue({ eq: mockEq3 })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
    return { mockFrom, mockSelect, mockEq1, mockEq2, mockEq3 }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_from_barn_memberships_table', async () => {
    const { mockFrom } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getActiveManagerUserIds('barn-1')

    expect(mockFrom).toHaveBeenCalledWith('barn_memberships')
  })

  it('should_filter_by_barn_id', async () => {
    const { mockFrom, mockEq1 } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getActiveManagerUserIds('barn-42')

    expect(mockEq1).toHaveBeenCalledWith('barn_id', 'barn-42')
  })

  it('should_filter_by_role_manager', async () => {
    const { mockFrom, mockEq2 } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getActiveManagerUserIds('barn-1')

    expect(mockEq2).toHaveBeenCalledWith('role', 'manager')
  })

  it('should_filter_by_status_active', async () => {
    const { mockFrom, mockEq3 } = makeChain({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await getActiveManagerUserIds('barn-1')

    expect(mockEq3).toHaveBeenCalledWith('status', 'active')
  })

  it('should_return_user_ids_from_matching_rows', async () => {
    const { mockFrom } = makeChain({ data: [{ user_id: 'user-1' }, { user_id: 'user-2' }], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getActiveManagerUserIds('barn-1')

    expect(result).toEqual(['user-1', 'user-2'])
  })

  it('should_exclude_rows_with_null_user_id', async () => {
    const { mockFrom } = makeChain({ data: [{ user_id: 'user-1' }, { user_id: null }], error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getActiveManagerUserIds('barn-1')

    expect(result).toEqual(['user-1'])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { mockFrom } = makeChain({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getActiveManagerUserIds('barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('select failed')
    const { mockFrom } = makeChain({ data: null, error: dbError })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(getActiveManagerUserIds('barn-1')).rejects.toThrow('select failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const { mockFrom } = makeChain({ data: [], error: null })
    const injectedClient = { from: mockFrom } as any

    await getActiveManagerUserIds('barn-1', injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockFrom).toHaveBeenCalledWith('barn_memberships')
  })
})

describe('setCanInstruct', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await setCanInstruct('mem-1', 'barn-1', true)

    expect(mockRpc).toHaveBeenCalledWith('set_can_instruct', {
      p_membership_id: 'mem-1',
      p_barn_id: 'barn-1',
      p_value: true,
    })
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const dbError = new Error('not authorized')
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: dbError }),
    } as any)

    await expect(setCanInstruct('mem-1', 'barn-1', true)).rejects.toThrow('not authorized')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as any

    await setCanInstruct('mem-1', 'barn-1', false, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('set_can_instruct', {
      p_membership_id: 'mem-1',
      p_barn_id: 'barn-1',
      p_value: false,
    })
  })
})
