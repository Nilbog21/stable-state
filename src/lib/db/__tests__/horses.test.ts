import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getHorsesByBarn, createHorse, updateHorse, setHorseActive, getHorseExertionSummary } from '../horses'

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
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 2, total_exertion: 6, jumping_count: 0 },
        { id: 'horse-2', name: 'Shadow', is_active: true, lesson_count: 1, total_exertion: 3, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 2, totalExertion: 6, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_return_zero_counts_for_horses_with_no_lessons_in_window', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_include_horses_with_no_lesson_horses_entries_even_when_lessons_exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 1, total_exertion: 5, jumping_count: 0 },
        { id: 'horse-2', name: 'Shadow', is_active: true, lesson_count: 0, total_exertion: 0, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 1, totalExertion: 5, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
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
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 2, total_exertion: 6, jumping_count: 1 },
        { id: 'horse-2', name: 'Shadow', is_active: true, lesson_count: 1, total_exertion: 3, jumping_count: 1 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 2, totalExertion: 6, jumpingCount: 1 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 1, totalExertion: 3, jumpingCount: 1 },
    ])
  })

  it('should_return_jumping_count_zero_for_non_jumping_lessons', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: makeRpc([
        { id: 'horse-1', name: 'Thunderbolt', is_active: true, lesson_count: 1, total_exertion: 3, jumping_count: 0 },
      ]),
    } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
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

describe('updateHorse', () => {
  const updatedHorse = createMockHorse({ id: 'horse-1', name: 'Blaze Updated' })

  it('should_return_updated_horse_on_success', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedHorse, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await updateHorse('horse-1', 'Blaze Updated')

    expect(result).toEqual(updatedHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateHorse('horse-1', 'Blaze Updated')).rejects.toThrow('db error')
  })
})
