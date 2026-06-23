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

  const horse1 = createMockHorse({ id: 'horse-1', name: 'Thunderbolt' })
  const horse2 = createMockHorse({ id: 'horse-2', name: 'Shadow' })

  function makeHorsesChain(data: unknown[], error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeLessonsChain(data: unknown[], error: Error | null = null) {
    const mockGte = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeLessonHorsesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ in: mockIn })
    return { select: mockSelect }
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_aggregated_lesson_count_and_total_exertion_per_horse', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1, horse2])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', jumping: false }, { id: 'lesson-2', jumping: false }])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 4 },
        { lesson_id: 'lesson-2', horse_id: 'horse-1', exertion_level: 2 },
        { lesson_id: 'lesson-1', horse_id: 'horse-2', exertion_level: 3 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 2, totalExertion: 6, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 1, totalExertion: 3, jumpingCount: 0 },
    ])
  })

  it('should_return_zero_counts_for_horses_with_no_lessons_in_window', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1])
      if (table === 'lessons') return makeLessonsChain([])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_include_horses_with_no_lesson_horses_entries_even_when_lessons_exist', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1, horse2])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', jumping: false }])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 5 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 1, totalExertion: 5, jumpingCount: 0 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_return_empty_array_when_barn_has_no_horses', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([])
  })

  it('should_throw_when_horses_fetch_returns_an_error', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([], new Error('horses error'))
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getHorseExertionSummary('barn-1', since)).rejects.toThrow('horses error')
  })

  it('should_throw_when_lessons_fetch_returns_an_error', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1])
      if (table === 'lessons') return makeLessonsChain([], new Error('lessons error'))
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getHorseExertionSummary('barn-1', since)).rejects.toThrow('lessons error')
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1' }])
      if (table === 'lesson_horses') return makeLessonHorsesChain(null, new Error('lh error'))
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    await expect(getHorseExertionSummary('barn-1', since)).rejects.toThrow('lh error')
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1' }])
      if (table === 'lesson_horses') return makeLessonHorsesChain(null)
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 0, totalExertion: 0, jumpingCount: 0 },
    ])
  })

  it('should_count_jumping_lessons_per_horse', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1, horse2])
      if (table === 'lessons') return makeLessonsChain([
        { id: 'lesson-1', jumping: true },
        { id: 'lesson-2', jumping: false },
      ])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 4 },
        { lesson_id: 'lesson-2', horse_id: 'horse-1', exertion_level: 2 },
        { lesson_id: 'lesson-1', horse_id: 'horse-2', exertion_level: 3 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', is_active: true, lessonCount: 2, totalExertion: 6, jumpingCount: 1 },
      { id: 'horse-2', name: 'Shadow', is_active: true, lessonCount: 1, totalExertion: 3, jumpingCount: 1 },
    ])
  })

  it('should_return_jumping_count_zero_for_non_jumping_lessons', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1', jumping: false }])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { lesson_id: 'lesson-1', horse_id: 'horse-1', exertion_level: 3 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

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
