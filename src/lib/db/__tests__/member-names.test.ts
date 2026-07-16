import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { resolveMemberNames } from '../member-names'

describe('resolveMemberNames', () => {
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
      rpc,
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

  it('should_return_empty_map_when_barn_memberships_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient(null, null, null, null))
    const result = await resolveMemberNames(['mem-1'], 'barn-1')
    expect(result).toEqual(new Map())
  })

  it('should_fall_back_to_membership_id_when_profile_id_is_empty', async () => {
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: '' }], null, [], null)
    )
    const result = await resolveMemberNames(['mem-1'], 'barn-1')
    expect(result).toEqual(new Map([['mem-1', 'mem-1']]))
  })

  it('should_skip_profiles_query_when_no_profile_ids_present', async () => {
    const mockProfilesFrom = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({ in: vi.fn().mockResolvedValue({ data: [], error: null }) }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'barn_memberships') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                in: vi.fn().mockResolvedValue({ data: [{ id: 'mem-1', profile_id: '' }], error: null }),
              }),
            }),
          }
        }
        return mockProfilesFrom(table)
      }),
    } as any)

    await resolveMemberNames(['mem-1'], 'barn-1')

    expect(mockProfilesFrom).not.toHaveBeenCalled()
  })

  it('should_resolve_instructor_name_via_rpc_when_membership_row_not_returned_by_base_query', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: 'instr-1', first_name: 'Terry', last_name: 'Trainer' }],
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await resolveMemberNames(['instr-1'], 'barn-1')

    expect(result).toEqual(new Map([['instr-1', 'Terry Trainer']]))
  })

  it('should_not_call_rpc_when_all_membership_ids_resolved_by_base_query', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: 'profile-1' }], null, [{ id: 'profile-1', first_name: 'Jane', last_name: 'Rider' }], null, rpc)
    )

    await resolveMemberNames(['mem-1'], 'barn-1')

    expect(rpc).not.toHaveBeenCalled()
  })

  it('should_call_rpc_with_only_the_unresolved_membership_ids_and_barn_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(
      makeClient([{ id: 'mem-1', profile_id: 'profile-1' }], null, [{ id: 'profile-1', first_name: 'Jane', last_name: 'Rider' }], null, rpc)
    )

    await resolveMemberNames(['mem-1', 'instr-1'], 'barn-1')

    expect(rpc).toHaveBeenCalledWith('get_instructor_membership_names', {
      p_membership_ids: ['instr-1'],
      p_barn_id: 'barn-1',
    })
  })

  it('should_omit_membership_id_from_map_when_neither_base_query_nor_rpc_resolves_it', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await resolveMemberNames(['instr-1'], 'barn-1')

    expect(result).toEqual(new Map())
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const dbError = new Error('rpc failed')
    const rpc = vi.fn().mockResolvedValue({ data: null, error: dbError })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await expect(resolveMemberNames(['instr-1'], 'barn-1')).rejects.toThrow('rpc failed')
  })

  it('should_omit_membership_id_from_map_when_rpc_data_is_null', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await resolveMemberNames(['instr-1'], 'barn-1')

    expect(result).toEqual(new Map())
  })

  it('should_resolve_a_co_rider_via_active_member_summaries_fallback_when_instructor_rpc_does_not_resolve_it', async () => {
    const rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'get_instructor_membership_names') return Promise.resolve({ data: [], error: null })
      if (fn === 'get_active_barn_member_summaries') {
        return Promise.resolve({
          data: [{ id: 'rider-2', user_id: 'user-2', profile_id: 'profile-2', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    })
    vi.mocked(createClient).mockResolvedValue(
      makeClient([], null, [{ id: 'profile-2', first_name: 'Riley', last_name: 'Rider' }], null, rpc)
    )

    const result = await resolveMemberNames(['rider-2'], 'barn-1')

    expect(result).toEqual(new Map([['rider-2', 'Riley Rider']]))
  })

  it('should_call_active_member_summaries_rpc_with_barn_id', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await resolveMemberNames(['rider-2'], 'barn-1')

    expect(rpc).toHaveBeenCalledWith('get_active_barn_member_summaries', { p_barn_id: 'barn-1' })
  })

  it('should_not_call_active_member_summaries_rpc_when_all_ids_resolved_by_instructor_rpc', async () => {
    const rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'get_instructor_membership_names') {
        return Promise.resolve({ data: [{ id: 'instr-1', first_name: 'Terry', last_name: 'Trainer' }], error: null })
      }
      return Promise.resolve({ data: [], error: null })
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await resolveMemberNames(['instr-1'], 'barn-1')

    expect(rpc).not.toHaveBeenCalledWith('get_active_barn_member_summaries', expect.anything())
  })

  it('should_fall_back_to_membership_id_when_active_member_summaries_row_has_no_profile', async () => {
    const rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'get_instructor_membership_names') return Promise.resolve({ data: [], error: null })
      if (fn === 'get_active_barn_member_summaries') {
        return Promise.resolve({
          data: [{ id: 'rider-2', user_id: 'user-2', profile_id: 'profile-2', role: 'rider', can_instruct: false, created_at: '2026-01-01' }],
          error: null,
        })
      }
      return Promise.resolve({ data: [], error: null })
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await resolveMemberNames(['rider-2'], 'barn-1')

    expect(result).toEqual(new Map([['rider-2', 'rider-2']]))
  })

  it('should_omit_membership_id_when_active_member_summaries_never_returns_it_either', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    const result = await resolveMemberNames(['rider-2'], 'barn-1')

    expect(result).toEqual(new Map())
  })

  it('should_throw_when_active_member_summaries_rpc_returns_error', async () => {
    const dbError = new Error('summaries rpc failed')
    const rpc = vi.fn().mockImplementation((fn: string) => {
      if (fn === 'get_instructor_membership_names') return Promise.resolve({ data: [], error: null })
      return Promise.resolve({ data: null, error: dbError })
    })
    vi.mocked(createClient).mockResolvedValue(makeClient([], null, [], null, rpc))

    await expect(resolveMemberNames(['rider-2'], 'barn-1')).rejects.toThrow('summaries rpc failed')
  })
})
