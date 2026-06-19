import { describe, it, expect, vi } from 'vitest'
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
  applyPreAuthProfile,
  getInstructorsByBarn,
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

    await createPendingMembership('user-1', 'barn-1', 'trainer')

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

    await createPendingMembership('user-1', 'barn-1', 'trainer', injectedClient)

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

    await createPendingMembership('user-1', 'barn-1', 'trainer', injectedClient)

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

describe('applyPreAuthProfile', () => {
  function makeProfileClient(profileData: unknown, upsertError: unknown = null, updateError: unknown = null) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: profileData }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: updateError }),
            }),
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: upsertError }) }
      }),
    } as any
  }

  it('should_not_upsert_membership_when_no_profile_found', async () => {
    const mockUpsert = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null }),
              }),
            }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'unknown@example.com')

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('should_not_upsert_membership_when_profile_has_no_barn_id', async () => {
    const mockUpsert = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: null, barn_id: null, role: 'manager' },
                }),
              }),
            }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('should_not_upsert_membership_when_profile_has_no_role', async () => {
    const mockUpsert = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: null, barn_id: 'barn-1', role: null },
                }),
              }),
            }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpsert).not.toHaveBeenCalled()
  })

  it('should_update_user_id_when_profile_is_pre_auth', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockResolvedValue({ error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: null, barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: mockUpdate,
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpdate).toHaveBeenCalledWith({ user_id: 'user-1' })
  })

  it('should_not_update_user_id_when_profile_already_has_user_id', async () => {
    const mockUpdate = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: 'existing-user', barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: mockUpdate,
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it('should_upsert_active_membership_for_pre_auth_profile', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: null, barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', barn_id: 'barn-1', role: 'manager', status: 'active' }),
      expect.objectContaining({ onConflict: 'user_id,barn_id' })
    )
  })

  it('should_throw_when_profile_update_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: null, barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: dbError }) }),
          }
        }
        return { upsert: vi.fn() }
      }),
    } as any)

    await expect(applyPreAuthProfile('user-1', 'manager@example.com')).rejects.toThrow('update failed')
  })

  it('should_throw_when_membership_upsert_returns_error', async () => {
    const dbError = new Error('upsert failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: 'existing-user', barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: vi.fn(),
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: dbError }) }
      }),
    } as any)

    await expect(applyPreAuthProfile('user-1', 'manager@example.com')).rejects.toThrow('upsert failed')
  })

  it('should_set_can_instruct_true_when_role_is_trainer', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: 'existing-user', barn_id: 'barn-1', role: 'trainer' },
                }),
              }),
            }),
            update: vi.fn(),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'trainer@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ can_instruct: true }),
      expect.anything()
    )
  })

  it('should_set_can_instruct_false_when_role_is_not_trainer', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'profiles') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'p1', user_id: 'existing-user', barn_id: 'barn-1', role: 'manager' },
                }),
              }),
            }),
            update: vi.fn(),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applyPreAuthProfile('user-1', 'manager@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ can_instruct: false }),
      expect.anything()
    )
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
