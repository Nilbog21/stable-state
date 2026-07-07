import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createMockBarn } from '@/test/fixtures'
import { getHorsesByBarn, createHorse, updateHorse, setHorseActive, getHorseExertionSummary, getHorseById, setHorseAvailability, resolveHorseNames, updateHorseDetails, getHorseProjectedExhaustion, resolveExhaustionThresholds, getExhaustionBand } from '../horses'

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

    await createHorse('barn-1', 'Blaze', injectedClient)

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

    await createHorse('barn-1', 'Blaze', injectedClient)

    expect(mockFrom).toHaveBeenCalled()
  })
})

describe('getHorseExertionSummary', () => {
  const since = new Date('2026-05-26T00:00:00Z')

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

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 2, totalExertion: 6, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_return_zero_counts_for_horses_with_no_lessons_in_window', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_include_horses_with_no_lesson_horses_entries_even_when_lessons_exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 1, total_exertion: 5, jumping_count: 0 },
        { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 5, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_return_empty_array_when_barn_has_no_horses', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([])
  })

  it('should_call_rpc_with_correct_function_name_and_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await getHorseExertionSummary('barn-1', since)

    expect(mockRpc).toHaveBeenCalledWith('get_horse_exertion_summary', {
      p_barn_id: 'barn-1',
      p_since: since.toISOString(),
    })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc(null, new Error('rpc error')),
    } as any)

    await expect(getHorseExertionSummary('barn-1', since)).rejects.toThrow('rpc error')
  })

  it('should_return_empty_array_when_rpc_returns_null_data', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc(null),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([])
  })

  it('should_count_jumping_lessons_per_horse', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 2, total_exertion: 6, jumping_count: 1 },
        { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, lesson_count: 1, total_exertion: 3, jumping_count: 1 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 2, totalExertion: 6, jumpingCount: 1 },
      { id: 'horse-2', name: 'Shadow', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 1 },
    ])
  })

  it('should_return_jumping_count_zero_for_non_jumping_lessons', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, lesson_count: 1, total_exertion: 3, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: true, unavailability_reason: null, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_include_is_available_false_in_summary', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, is_available: false, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result[0].is_available).toBe(false)
  })

  it('should_default_is_available_to_true_when_rpc_does_not_return_the_field', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result[0].is_available).toBe(true)
  })

})

describe('setHorseActive', () => {
  function makeToggleChain(error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data: { id: 'horse-1' }, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarnId = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    return { update: vi.fn().mockReturnValue({ eq: mockEqId }) }
  }

  it('should_resolve_when_deactivating', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeToggleChain()),
    } as any)

    await expect(setHorseActive('horse-1', 'barn-1', false)).resolves.toBeUndefined()
  })

  it('should_resolve_when_activating', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeToggleChain()),
    } as any)

    await expect(setHorseActive('horse-1', 'barn-1', true)).resolves.toBeUndefined()
  })

  it('should_pass_is_active_false_to_update_when_deactivating', async () => {
    const chain = makeToggleChain()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as any)

    await setHorseActive('horse-1', 'barn-1', false)

    expect(chain.update).toHaveBeenCalledWith({ is_active: false })
  })

  it('should_pass_is_active_true_to_update_when_activating', async () => {
    const chain = makeToggleChain()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as any)

    await setHorseActive('horse-1', 'barn-1', true)

    expect(chain.update).toHaveBeenCalledWith({ is_active: true })
  })

  it('should_scope_update_to_barn_id', async () => {
    const mockSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEqBarnId = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq: mockEqId }) }),
    } as any)

    await setHorseActive('horse-1', 'barn-1', false)

    expect(mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeToggleChain(new Error('db error'))),
    } as any)

    await expect(setHorseActive('horse-1', 'barn-1', false)).rejects.toThrow('db error')
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
})

describe('setHorseAvailability', () => {
  function makeUpdateChain(error: Error | null = null) {
    const mockEqBarnId = vi.fn().mockResolvedValue({ data: null, error })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    return { update: vi.fn().mockReturnValue({ eq: mockEqId }) }
  }

  it('should_resolve_when_setting_unavailable', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeUpdateChain()),
    } as any)

    await expect(setHorseAvailability('horse-1', 'barn-1', false, 'on stall rest')).resolves.toBeUndefined()
  })

  it('should_resolve_when_setting_available', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeUpdateChain()),
    } as any)

    await expect(setHorseAvailability('horse-1', 'barn-1', true, null)).resolves.toBeUndefined()
  })

  it('should_pass_is_available_false_and_reason_to_update', async () => {
    const chain = makeUpdateChain()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as any)

    await setHorseAvailability('horse-1', 'barn-1', false, 'on stall rest')

    expect(chain.update).toHaveBeenCalledWith({ is_available: false, unavailability_reason: 'on stall rest' })
  })

  it('should_pass_is_available_true_and_null_reason_to_update', async () => {
    const chain = makeUpdateChain()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as any)

    await setHorseAvailability('horse-1', 'barn-1', true, null)

    expect(chain.update).toHaveBeenCalledWith({ is_available: true, unavailability_reason: null })
  })

  it('should_scope_update_to_barn_id', async () => {
    const mockEqBarnId = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: vi.fn().mockReturnValue({ eq: mockEqId }) }),
    } as any)

    await setHorseAvailability('horse-1', 'barn-1', false, 'reason')

    expect(mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(makeUpdateChain(new Error('db error'))),
    } as any)

    await expect(setHorseAvailability('horse-1', 'barn-1', false, 'reason')).rejects.toThrow('db error')
  })
})

describe('updateHorse', () => {
  const updatedHorse = createMockHorse({ id: 'horse-1', name: 'Blaze Updated' })

  it('should_return_updated_horse_on_success', async () => {
    const selectChain = { single: vi.fn().mockResolvedValue({ data: updatedHorse, error: null }) }
    const eq2 = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: eq2 }),
        }),
      }),
    } as any)

    const result = await updateHorse('horse-1', 'barn-1', 'Blaze Updated')

    expect(result).toEqual(updatedHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const selectChain = { single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }) }
    const eq2 = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue(selectChain) })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: eq2 }),
        }),
      }),
    } as any)

    await expect(updateHorse('horse-1', 'barn-1', 'Blaze Updated')).rejects.toThrow('db error')
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
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null })).resolves.toBeUndefined()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { name: 'Blaze', is_active: false, is_available: false, unavailability_reason: 'stall rest' })
    expect(mockRpc).toHaveBeenCalledWith('update_horse_details', {
      p_horse_id: 'horse-1',
      p_barn_id: 'barn-1',
      p_name: 'Blaze',
      p_is_active: false,
      p_is_available: false,
      p_unavailability_reason: 'stall rest',
    })
  })

  it('should_pass_null_name_when_name_is_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null })
    expect(mockRpc.mock.calls[0][1]).toMatchObject({ p_name: null })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)
    await expect(updateHorseDetails('horse-1', 'barn-1', { is_active: true, is_available: true, unavailability_reason: null })).rejects.toThrow('db error')
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
})

describe('getExhaustionBand', () => {
  const thresholds = { high: 11, moderate: 5 }

  it('should_return_low_when_total_is_below_moderate', () => {
    expect(getExhaustionBand(0, thresholds)).toBe('low')
  })

  it('should_return_low_when_total_equals_moderate', () => {
    expect(getExhaustionBand(5, thresholds)).toBe('low')
  })

  it('should_return_moderate_when_total_is_just_above_moderate', () => {
    expect(getExhaustionBand(6, thresholds)).toBe('moderate')
  })

  it('should_return_moderate_when_total_equals_high', () => {
    expect(getExhaustionBand(11, thresholds)).toBe('moderate')
  })

  it('should_return_high_when_total_is_just_above_high', () => {
    expect(getExhaustionBand(12, thresholds)).toBe('high')
  })
})
