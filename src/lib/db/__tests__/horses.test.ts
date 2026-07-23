import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../document-storage', () => ({
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { uploadFile, removeFile } from '../document-storage'
import { createMockBarn } from '@/test/fixtures'
import { getHorsesByBarn, getHorsesByIds, createHorse, getHorseExertionSummary, getHorseById, resolveHorseNames, updateHorseDetails, updateHorseOwner, updateHorsePhotoPath, replaceHorsePhoto, removeHorsePhoto, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '../horses'

const mockHorses = [
  createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
  createMockHorse({ id: 'horse-2', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
]

describe('getHorsesByBarn', () => {
  it('should_return_horses_for_barn', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: mockHorses, error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual(mockHorses)
  })

  it('should_return_empty_array_when_no_horses', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }),
        }),
      }),
    } as any)

    await expect(getHorsesByBarn('barn-1')).rejects.toThrow('db error')
  })

  it('should_filter_to_active_horses_only', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: mockHorses, error: null })
    const mockEqIsActive = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqIsActive, order: mockOrder })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqBarnId }) }),
    } as any)

    await getHorsesByBarn('barn-1')

    expect(mockEqIsActive).toHaveBeenCalledWith('is_active', true)
  })

  it('should_return_horses_with_is_available_field', async () => {
    const horseWithAvailability = { ...mockHorses[0], is_available: false, unavailability_reason: 'on stall rest' }
    const mockOrder = vi.fn().mockResolvedValue({ data: [horseWithAvailability], error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ order: mockOrder }) }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result[0]).toMatchObject({ is_available: false, unavailability_reason: 'on stall rest' })
  })

  it('should_not_filter_out_unavailable_horses', async () => {
    const mockOrder = vi.fn().mockResolvedValue({ data: mockHorses, error: null })
    const mockEqIsActive = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqIsActive })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqBarnId }) }),
    } as any)

    await getHorsesByBarn('barn-1')

    expect(mockEqIsActive).not.toHaveBeenCalledWith('is_available', expect.anything())
  })
})

describe('createHorse', () => {
  const newHorse = createMockHorse({ id: 'horse-3', name: 'Blaze', created_at: '2026-01-03', updated_at: '2026-01-03' })

  it('should_create_horse_in_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createHorse('barn-1', 'Blaze')

    expect(result).toEqual(newHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(createHorse('barn-1', 'Blaze')).rejects.toThrow('db error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
          }),
        }),
      }),
    } as any

    await createHorse('barn-1', 'Blaze', undefined, injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await createHorse('barn-1', 'Blaze', undefined, injectedClient)

    expect(mockFrom).toHaveBeenCalled()
  })

  it('should_insert_with_owning_member_id_when_provided', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createHorse('barn-1', 'Blaze', 'mem-1')

    expect(insert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Blaze', owning_member_id: 'mem-1' })
  })

  it('should_insert_with_null_owning_member_id_when_omitted', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert }),
    } as any)

    await createHorse('barn-1', 'Blaze')

    expect(insert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Blaze', owning_member_id: null })
  })
})

describe('updateHorseOwner', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_owning_member_id', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateHorseOwner('horse-1', 'barn-1', 'mem-1')

    expect(update).toHaveBeenCalledWith({ owning_member_id: 'mem-1' })
  })

  it('should_clear_owning_member_id_when_null', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateHorseOwner('horse-1', 'barn-1', null)

    expect(update).toHaveBeenCalledWith({ owning_member_id: null })
  })

  it('should_scope_update_to_horse_and_barn', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const update = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateHorseOwner('horse-1', 'barn-1', 'mem-1')

    expect(mockEq1).toHaveBeenCalledWith('id', 'horse-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: new Error('update error') }),
          }),
        }),
      }),
    } as any)

    await expect(updateHorseOwner('horse-1', 'barn-1', 'mem-1')).rejects.toThrow('update error')
  })
})

describe('getHorseExertionSummary', () => {
  const targetDate = new Date('2026-05-26T00:00:00Z')

  function makeRpc(data: unknown[] | null, error: Error | null = null) {
    return vi.fn().mockResolvedValue({ data, error })
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_aggregated_lesson_count_and_total_exertion_per_horse', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 2, total_exertion: 6, jumping_count: 0 },
        { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, lesson_count: 1, total_exertion: 3, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 2, totalExertion: 6, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_return_zero_counts_for_horses_with_lessons_outside_the_plus_minus_three_day_window', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_include_horses_with_no_lesson_horses_entries_even_when_lessons_exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 1, total_exertion: 5, jumping_count: 0 },
        { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 5, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_return_empty_array_when_barn_has_no_horses', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([])
  })

  it('should_call_rpc_with_correct_function_name_and_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await getHorseExertionSummary('barn-1', targetDate)

    expect(mockRpc).toHaveBeenCalledWith('get_horse_exertion_summary', {
      p_barn_id: 'barn-1',
      p_target_date: targetDate.toISOString(),
    })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc(null, new Error('rpc error')),
    } as any)

    await expect(getHorseExertionSummary('barn-1', targetDate)).rejects.toThrow('rpc error')
  })

  it('should_return_empty_array_when_rpc_returns_null_data', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc(null),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([])
  })

  it('should_count_jumping_lessons_per_horse', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 2, total_exertion: 6, jumping_count: 1 },
        { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, lesson_count: 1, total_exertion: 3, jumping_count: 1 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 2, totalExertion: 6, jumpingCount: 1 },
      { id: 'horse-2', name: 'Shadow', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 1 },
    ])
  })

  it('should_return_jumping_count_zero_for_non_jumping_lessons', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 1, total_exertion: 3, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', registered_name: null, is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_include_is_available_false_in_summary', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: false, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result[0].is_available).toBe(false)
  })

  it('should_default_is_available_to_true_when_rpc_does_not_return_the_field', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result[0].is_available).toBe(true)
  })

  it('should_include_registered_name_in_summary', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Clover', registered_name: 'Four-Leaf Clover', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result[0].registered_name).toBe('Four-Leaf Clover')
  })

  it('should_default_registered_name_to_null_when_rpc_does_not_return_the_field', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', targetDate)

    expect(result[0].registered_name).toBe(null)
  })

})

describe('getHorseById', () => {
  const mockHorse = createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })

  function makeSelectChain(data: unknown, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEqBarnId = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    return { select: vi.fn().mockReturnValue({ eq: mockEqId }) }
  }

  it('should_return_horse_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(mockHorse)),
    } as any)

    const result = await getHorseById('horse-1', 'barn-1')

    expect(result).toEqual(mockHorse)
  })

  it('should_return_null_when_horse_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(null, { code: 'PGRST116', message: 'not found' } as any)),
    } as any)

    const result = await getHorseById('horse-1', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_non_not_found_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(null, new Error('db error'))),
    } as any)

    await expect(getHorseById('horse-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_scope_query_to_barn_id', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: mockHorse, error: null })
    const mockEqBarnId = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqId }) }),
    } as any)

    await getHorseById('horse-1', 'barn-1')

    expect(mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = { from: vi.fn().mockReturnValue(makeSelectChain(mockHorse)) } as any

    await getHorseById('horse-1', 'barn-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockFrom = vi.fn().mockReturnValue(makeSelectChain(mockHorse))
    const injectedClient = { from: mockFrom } as any

    await getHorseById('horse-1', 'barn-1', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('horses')
  })
})

describe('getHorsesByIds', () => {
  function makeSelectChain(data: unknown, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_array_when_ids_is_empty', async () => {
    const result = await getHorsesByIds([], 'barn-1')

    expect(result).toEqual([])
  })

  it('should_not_call_create_client_when_ids_is_empty', async () => {
    await getHorsesByIds([], 'barn-1')

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_return_horses_matching_ids', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(mockHorses)),
    } as any)

    const result = await getHorsesByIds(['horse-1', 'horse-2'], 'barn-1')

    expect(result).toEqual(mockHorses)
  })

  it('should_include_inactive_horses_when_their_id_is_requested', async () => {
    const inactiveHorse = createMockHorse({ id: 'horse-3', name: 'Retired', is_active: false })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain([inactiveHorse])),
    } as any)

    const result = await getHorsesByIds(['horse-3'], 'barn-1')

    expect(result).toEqual([inactiveHorse])
  })

  it('should_scope_query_to_barn_id', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) }),
    } as any)

    await getHorsesByIds(['horse-1'], 'barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(null, new Error('db error'))),
    } as any)

    await expect(getHorsesByIds(['horse-1'], 'barn-1')).rejects.toThrow('db error')
  })
})

describe('resolveHorseNames', () => {
  function makeSelectChain(data: unknown, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_map_when_ids_is_empty', async () => {
    const result = await resolveHorseNames([], 'barn-1')

    expect(result).toEqual(new Map())
  })

  it('should_not_call_create_client_when_ids_is_empty', async () => {
    await resolveHorseNames([], 'barn-1')

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_resolve_name_for_first_horse_id', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])),
    } as any)

    const result = await resolveHorseNames(['horse-1', 'horse-2'], 'barn-1')

    expect(result.get('horse-1')).toBe('Thunderbolt')
  })

  it('should_resolve_name_for_second_horse_id', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain([
        { id: 'horse-1', name: 'Thunderbolt' },
        { id: 'horse-2', name: 'Shadow' },
      ])),
    } as any)

    const result = await resolveHorseNames(['horse-1', 'horse-2'], 'barn-1')

    expect(result.get('horse-2')).toBe('Shadow')
  })

  it('should_return_undefined_for_horse_id_not_in_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain([{ id: 'horse-1', name: 'Thunderbolt' }])),
    } as any)

    const result = await resolveHorseNames(['horse-1', 'horse-unknown'], 'barn-1')

    expect(result.get('horse-unknown')).toBeUndefined()
  })

  it('should_scope_query_to_barn_id', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEq }) }),
    } as any)

    await resolveHorseNames(['horse-1'], 'barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(null, new Error('db error'))),
    } as any)

    await expect(resolveHorseNames(['horse-1'], 'barn-1')).rejects.toThrow('db error')
  })

  it('should_return_empty_map_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeSelectChain(null)),
    } as any)

    const result = await resolveHorseNames(['horse-1'], 'barn-1')

    expect(result).toEqual(new Map())
  })

  it('should_not_call_create_client_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn().mockReturnValue(makeSelectChain([{ id: 'horse-1', name: 'Thunderbolt' }])),
    } as any

    await resolveHorseNames(['horse-1'], 'barn-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockFrom = vi.fn().mockReturnValue(makeSelectChain([{ id: 'horse-1', name: 'Thunderbolt' }]))
    const injectedClient = { from: mockFrom } as any

    await resolveHorseNames(['horse-1'], 'barn-1', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('horses')
  })
})

describe('updateHorseDetails', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_resolve_when_called_with_valid_updates', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })).resolves.toBeUndefined()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { name: 'Blaze', is_active: false, is_available: false, unavailability_reason: 'stall rest', exhaustion_thresholds: { moderate: 4, high: 10 }, feed_notes: '2 flakes hay AM/PM', medication_notes: 'Bute 1g daily', registered_name: 'Blazing Comet' })
    expect(mockRpc).toHaveBeenCalledWith('update_horse_details', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_name: 'Blaze',
      p_is_active: false,
      p_is_available: false,
      p_unavailability_reason: 'stall rest',
      p_exhaustion_threshold_moderate: 4,
      p_exhaustion_threshold_high: 10,
      p_feed_notes: '2 flakes hay AM/PM',
      p_medication_notes: 'Bute 1g daily',
      p_registered_name: 'Blazing Comet',
    })
  })

  it('should_pass_null_name_when_name_is_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_name: null })
  })

  it('should_pass_null_thresholds_when_exhaustion_thresholds_is_null', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_exhaustion_threshold_moderate: null, p_exhaustion_threshold_high: null })
  })

  it('should_pass_null_feed_and_medication_notes_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_feed_notes: null, p_medication_notes: null })
  })

  it('should_pass_feed_and_medication_notes_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: '2 flakes hay AM/PM', medication_notes: 'Bute 1g daily', registered_name: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_feed_notes: '2 flakes hay AM/PM', p_medication_notes: 'Bute 1g daily' })
  })

  it('should_pass_null_registered_name_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_registered_name: null })
  })

  it('should_pass_registered_name_as_given', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: 'Four-Leaf Clover' })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_registered_name: 'Four-Leaf Clover' })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null, exhaustion_thresholds: null, feed_notes: null, medication_notes: null, registered_name: null })).rejects.toThrow('db error')
  })
})

describe('getHorseProjectedExhaustion', () => {
  const targetDate = new Date('2026-07-10T00:00:00Z')

  function makeRpc(data: unknown[] | null, error: Error | null = null) {
    return vi.fn().mockResolvedValue({ data, error })
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_lesson_at_and_exertion_level_rows', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { lesson_at: '2026-07-09T10:00:00Z', exertion_level: 3 },
        { lesson_at: '2026-07-11T10:00:00Z', exertion_level: 4 },
      ]),
    } as any)

    const result = await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate)

    expect(result).toEqual([
      { lessonAt: '2026-07-09T10:00:00Z', exertionLevel: 3 },
      { lessonAt: '2026-07-11T10:00:00Z', exertionLevel: 4 },
    ])
  })

  it('should_return_empty_array_when_rpc_returns_null_data', async () => {
    vi.mocked(createClient).mockResolvedValue({ rpc: makeRpc(null) } as any)

    const result = await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate)

    expect(result).toEqual([])
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({ rpc: makeRpc(null, new Error('rpc error')) } as any)

    await expect(getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate)).rejects.toThrow('rpc error')
  })

  it('should_call_rpc_with_null_exclude_lesson_id_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate)

    expect(mockRpc).toHaveBeenCalledWith('get_horse_projected_exhaustion', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_target_date: targetDate.toISOString(),
      p_exclude_lesson_id: null,
    })
  })

  it('should_call_rpc_with_exclude_lesson_id_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'lesson-1')

    expect(mockRpc).toHaveBeenCalledWith('get_horse_projected_exhaustion', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_target_date: targetDate.toISOString(),
      p_exclude_lesson_id: 'lesson-1',
    })
  })
})

describe('updateHorsePhotoPath', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_photo_path', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateHorsePhotoPath('horse-1', 'barn-1', 'barn-1/horse-photos/horse-1/123.jpg')
    expect(update).toHaveBeenCalledWith({ photo_path: 'barn-1/horse-photos/horse-1/123.jpg' })
  })

  it('should_clear_photo_path_when_null', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update }),
    } as any)

    await updateHorsePhotoPath('horse-1', 'barn-1', null)
    expect(update).toHaveBeenCalledWith({ photo_path: null })
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: new Error('update error') }),
          }),
        }),
      }),
    } as any)

    await expect(updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg')).rejects.toThrow('update error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const injectedClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    const mockFrom = vi.fn().mockReturnValue({ update })
    const injectedClient = { from: mockFrom } as any

    await updateHorsePhotoPath('horse-1', 'barn-1', 'path.jpg', injectedClient)

    expect(mockFrom).toHaveBeenCalledWith('horses')
  })
})

function makeSelectChainForPhotoPath(photoPath: string | null) {
  return {
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: createMockHorse({ id: 'horse-1', photo_path: photoPath }), error: null }),
        }),
      }),
    }),
  }
}

function makeUpdateChainForPhotoPath(error: Error | null = null) {
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error }) }),
    }),
  }
}

describe('replaceHorsePhoto', () => {
  const file = new File([new Uint8Array(10)], 'photo.jpg', { type: 'image/jpeg' })

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(uploadFile).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(uploadFile).mockResolvedValue(undefined)
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_upload_to_horse_photos_prefix', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath()) } as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), file, 'image/jpeg', undefined)
  })

  it('should_update_photo_path_after_successful_upload', async () => {
    const updateChain = makeUpdateChainForPhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(updateChain) } as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(updateChain.update).toHaveBeenCalledWith({ photo_path: expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/) })
  })

  it('should_remove_old_photo_after_replacing', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/old.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath()) } as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/old.jpg', undefined)
  })

  it('should_not_remove_anything_when_there_was_no_previous_photo', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath()) } as any)

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_roll_back_uploaded_file_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath(new Error('db error'))) } as any)

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), undefined)
  })

  it('should_not_remove_old_photo_when_db_update_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/old.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath(new Error('db error'))) } as any)

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('db error')
    expect(removeFile).not.toHaveBeenCalledWith('barn-1/horse-photos/horse-1/old.jpg')
  })

  it('should_propagate_error_when_upload_fails', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)
    vi.mocked(uploadFile).mockRejectedValue(new Error('upload error'))

    await expect(replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg')).rejects.toThrow('upload error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath(null))
        .mockReturnValueOnce(makeUpdateChainForPhotoPath()),
    } as any

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_upload_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath(null))
        .mockReturnValueOnce(makeUpdateChainForPhotoPath()),
    } as any

    await replaceHorsePhoto('horse-1', 'barn-1', file, 'jpg', injectedClient)

    expect(uploadFile).toHaveBeenCalledWith(expect.stringMatching(/^barn-1\/horse-photos\/horse-1\/\d+\.jpg$/), file, 'image/jpeg', injectedClient)
  })
})

describe('removeHorsePhoto', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(removeFile).mockReset()
    vi.mocked(removeFile).mockResolvedValue(undefined)
  })

  it('should_clear_photo_path_when_photo_present', async () => {
    const updateChain = makeUpdateChainForPhotoPath()
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(updateChain) } as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(updateChain.update).toHaveBeenCalledWith({ photo_path: null })
  })

  it('should_remove_storage_file_when_photo_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg')) } as any)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeUpdateChainForPhotoPath()) } as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/photo.jpg', undefined)
  })

  it('should_do_nothing_when_no_photo_is_present', async () => {
    vi.mocked(createClient)
      .mockResolvedValueOnce({ from: vi.fn().mockReturnValue(makeSelectChainForPhotoPath(null)) } as any)

    await removeHorsePhoto('horse-1', 'barn-1')

    expect(removeFile).not.toHaveBeenCalled()
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg'))
        .mockReturnValueOnce(makeUpdateChainForPhotoPath()),
    } as any

    await removeHorsePhoto('horse-1', 'barn-1', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_forward_injected_client_to_remove_file', async () => {
    const injectedClient = {
      from: vi.fn()
        .mockReturnValueOnce(makeSelectChainForPhotoPath('barn-1/horse-photos/horse-1/photo.jpg'))
        .mockReturnValueOnce(makeUpdateChainForPhotoPath()),
    } as any

    await removeHorsePhoto('horse-1', 'barn-1', injectedClient)

    expect(removeFile).toHaveBeenCalledWith('barn-1/horse-photos/horse-1/photo.jpg', injectedClient)
  })
})

describe('resolveExhaustionThresholds', () => {
  const barn = createMockBarn({ exhaustion_threshold_high: 11, exhaustion_threshold_moderate: 5 })

  it('should_use_horse_overrides_when_both_set', () => {
    const horse = createMockHorse({ exhaustion_threshold_high: 20, exhaustion_threshold_moderate: 8 })

    expect(resolveExhaustionThresholds(horse, barn)).toEqual({ high: 20, moderate: 8 })
  })

  it('should_fall_back_to_barn_defaults_when_horse_fields_are_null', () => {
    const horse = createMockHorse({ exhaustion_threshold_high: null, exhaustion_threshold_moderate: null })

    expect(resolveExhaustionThresholds(horse, barn)).toEqual({ high: 11, moderate: 5 })
  })

  it('should_resolve_high_and_moderate_independently_when_only_one_is_overridden', () => {
    const horse = createMockHorse({ exhaustion_threshold_high: 20, exhaustion_threshold_moderate: null })

    expect(resolveExhaustionThresholds(horse, barn)).toEqual({ high: 20, moderate: 5 })
  })

  it('should_clamp_moderate_below_high_when_a_single_override_would_invert_the_pair', () => {
    const horse = createMockHorse({ exhaustion_threshold_high: null, exhaustion_threshold_moderate: 15 })

    expect(resolveExhaustionThresholds(horse, barn)).toEqual({ high: 11, moderate: 10 })
  })
})
