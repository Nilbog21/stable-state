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
  getActiveTrainerMembershipsByBarn,
  getMembershipById,
  getBarnMembershipsForUser,
  getInstructorsByBarn,
  getActiveMembersWithProfiles,
  resolveMemberNames,
  createManagedMember,
  claimManagedMember,
  revokeInviteToken,
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

    const result = await createPendingMembership('user-1', 'barn-1', 'trainer')

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

    await expect(createPendingMembership('user-1', 'barn-1', 'trainer')).rejects.toThrow('insert failed')
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

describe('getActiveTrainerMembershipsByBarn', () => {
  it('should_return_active_trainer_memberships_for_barn', async () => {
    const trainers = [mockMembership]
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: trainers, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getActiveTrainerMembershipsByBarn('barn-1')

    expect(result).toEqual(trainers)
  })

  it('should_return_empty_array_when_no_active_trainers', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getActiveTrainerMembershipsByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_query_by_barn_id_trainer_role_and_active_status', async () => {
    const mockActiveEq = vi.fn().mockReturnValue({
      order: vi.fn().mockResolvedValue({ data: [], error: null }),
    })
    const mockRoleEq = vi.fn().mockReturnValue({ eq: mockActiveEq })
    const mockBarnEq = vi.fn().mockReturnValue({ eq: mockRoleEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockBarnEq }),
      }),
    } as any)

    await getActiveTrainerMembershipsByBarn('barn-1')

    expect(mockBarnEq).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockRoleEq).toHaveBeenCalledWith('role', 'trainer')
    expect(mockActiveEq).toHaveBeenCalledWith('status', 'active')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: dbError }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getActiveTrainerMembershipsByBarn('barn-1')).rejects.toThrow('query failed')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getActiveTrainerMembershipsByBarn('barn-1')

    expect(result).toEqual([])
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
})

describe('getBarnMembershipsForUser', () => {
  const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
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
    const barn2 = { id: 'barn-2', name: 'Sunny Stables', slug: 'sunny-stables', created_at: '' }
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

  it('should_return_instructors_with_names_joined_from_profiles', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ user_id: 'trainer-1' }],
        null,
        [{ user_id: 'trainer-1', first_name: 'Bob', last_name: 'Smith' }],
        null
      )
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ userId: 'trainer-1', name: 'Bob Smith' }])
  })

  it('should_fall_back_to_unknown_instructor_when_profile_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ user_id: 'trainer-1' }], null, [], null)
    )

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ userId: 'trainer-1', name: 'Unknown Instructor' }])
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
    vi.mocked(createClient).mockResolvedValue(makeClient([{ user_id: 'trainer-1' }], null, null, dbError))

    await expect(getInstructorsByBarn('barn-1')).rejects.toThrow('profiles query failed')
  })

  it('should_fall_back_to_unknown_instructor_when_profiles_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient([{ user_id: 'trainer-1' }], null, null, null))

    const result = await getInstructorsByBarn('barn-1')

    expect(result).toEqual([{ userId: 'trainer-1', name: 'Unknown Instructor' }])
  })
})

describe('getActiveMembersWithProfiles', () => {
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
})

describe('resolveMemberNames', () => {
  function makeClient(membershipsData: unknown, membershipsError: unknown, profilesData: unknown, profilesError: unknown) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: membershipsData, error: membershipsError }),
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

  it('should_return_empty_map_when_membership_ids_is_empty', async () => {
    const result = await resolveMemberNames([], 'barn-1')
    expect(result).toEqual(new Map())
  })

  it('should_return_map_with_full_name_for_known_membership', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient(
        [{ id: 'mem-1', profile_id: 'profile-1' }],
        null,
        [{ id: 'profile-1', first_name: 'Jane', last_name: 'Rider' }],
        null
      )
    )
    const result = await resolveMemberNames(['mem-1'], 'barn-1')
    expect(result).toEqual(new Map([['mem-1', 'Jane Rider']]))
  })

  it('should_fall_back_to_membership_id_when_profile_is_missing', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: 'profile-1' }], null, [], null)
    )
    const result = await resolveMemberNames(['mem-1'], 'barn-1')
    expect(result).toEqual(new Map([['mem-1', 'mem-1']]))
  })

  it('should_throw_when_barn_memberships_query_fails', async () => {
    const dbError = new Error('memberships query failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(null, dbError, null, null))
    await expect(resolveMemberNames(['mem-1'], 'barn-1')).rejects.toThrow('memberships query failed')
  })

  it('should_throw_when_profiles_query_fails', async () => {
    const dbError = new Error('profiles query failed')
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: 'profile-1' }], null, null, dbError)
    )
    await expect(resolveMemberNames(['mem-1'], 'barn-1')).rejects.toThrow('profiles query failed')
  })

  it('should_fall_back_to_membership_id_when_profiles_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: 'profile-1' }], null, null, null)
    )
    const result = await resolveMemberNames(['mem-1'], 'barn-1')
    expect(result).toEqual(new Map([['mem-1', 'mem-1']]))
  })
})

describe('createManagedMember', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  function makeClient(profileData: unknown, profileError: unknown, membershipData: unknown, membershipError: unknown) {
    let insertCallCount = 0
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: profileData, error: profileError }),
              }),
            }),
          }
        }
        if (table === 'barn_memberships') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: membershipData, error: membershipError }),
              }),
            }),
          }
        }
        return {}
      }),
    } as any
  }

  it('should_return_membership_id_on_success', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient({ id: 'profile-99' }, null, { id: 'mem-99' }, null)
    )
    const result = await createManagedMember('barn-1', 'Alex', 'Smith')
    expect(result).toEqual({ membershipId: 'mem-99' })
  })

  it('should_throw_when_profile_insert_fails', async () => {
    const dbError = new Error('profile insert failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(null, dbError, null, null))
    await expect(createManagedMember('barn-1', 'Alex', 'Smith')).rejects.toThrow('profile insert failed')
  })

  it('should_throw_when_membership_insert_fails', async () => {
    const dbError = new Error('membership insert failed')
    vi.mocked(createClient).mockResolvedValue(makeClient({ id: 'profile-99' }, null, null, dbError))
    await expect(createManagedMember('barn-1', 'Alex', 'Smith')).rejects.toThrow('membership insert failed')
  })
})

describe('claimManagedMember', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_call_claim_managed_member_rpc_with_correct_args', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await claimManagedMember('tok-abc', 'user-99', 'user@example.com')
    expect(rpc).toHaveBeenCalledWith('claim_managed_member', {
      p_token: 'tok-abc',
      p_user_id: 'user-99',
      p_email: 'user@example.com',
    })
  })

  it('should_throw_on_token_not_found', async () => {
    const dbError = new Error('token_not_found')
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: dbError }) } as any)
    await expect(claimManagedMember('bad-tok', 'user-99', 'u@e.com')).rejects.toThrow('token_not_found')
  })

  it('should_throw_on_user_already_claimed', async () => {
    const dbError = new Error('user_already_claimed')
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: dbError }) } as any)
    await expect(claimManagedMember('tok-abc', 'user-99', 'u@e.com')).rejects.toThrow('user_already_claimed')
  })
})

describe('revokeInviteToken', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_return_new_token_string', async () => {
    const newToken = 'aaaa-bbbb-cccc'
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { invite_token: newToken }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)
    const result = await revokeInviteToken('mem-1', 'barn-1')
    expect(result).toBe(newToken)
  })

  it('should_throw_when_update_fails', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
              }),
            }),
          }),
        }),
      }),
    } as any)
    await expect(revokeInviteToken('mem-1', 'barn-1')).rejects.toThrow('update failed')
  })
})
