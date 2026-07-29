import { describe, it, expect, vi } from 'vitest'
import { createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getActiveMemberships,
  getInstructorsByBarn,
  getActiveMembersWithProfiles,
} from '../barn-memberships'

const mockMembership = createMockMembership()

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

