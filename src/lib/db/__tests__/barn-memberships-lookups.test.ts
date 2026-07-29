import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockMembership } from '@/test/fixtures'
import type { MembershipStatus } from '../types'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getUserMembership,
  getMembershipById,
  getMembershipByIdForBarn,
  getBarnMembershipsForUser,
  getActiveManagerUserIds,
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

  it('should_use_injected_client_when_provided', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
            }),
          }),
        }),
      }),
    } as any

    const result = await getUserMembership('user-1', 'barn-1', mockClient)

    expect(result).toEqual(mockMembership)
    expect(createClient).not.toHaveBeenCalled()
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

  it('should_redact_calendar_feed_token_when_narrow_policy_query_finds_row', async () => {
    const client = makeDirectClient({ ...mockMembership, calendar_feed_token: 'real-token' })

    const result = await getMembershipByIdForBarn('mem-1', 'barn-1', client)

    expect(result?.calendar_feed_token).toBeNull()
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
      calendar_feed_token: null,
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

  it('should_return_inactive_only_membership_with_barn', async () => {
    const inactiveMem = createMockMembership({ status: 'inactive' as unknown as MembershipStatus })
    const inactiveRow = { ...inactiveMem, barns: mockBarn }
    vi.mocked(createClient).mockResolvedValue(makeClient([inactiveRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([{ barn: mockBarn, membership: inactiveMem }])
  })

  it('should_return_mixed_active_and_inactive_memberships', async () => {
    const inactiveMem = createMockMembership({ id: 'mem-2', status: 'inactive' as unknown as MembershipStatus })
    const inactiveRow = { ...inactiveMem, barns: mockBarn }
    vi.mocked(createClient).mockResolvedValue(makeClient([mockRow, inactiveRow]))

    const result = await getBarnMembershipsForUser('user-1')

    expect(result).toEqual([expectedEntry, { barn: mockBarn, membership: inactiveMem }])
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

