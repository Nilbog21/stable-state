import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getHorsesByBarn, createHorse, updateHorse, getHorseExertionSummary } from '../horses'

const mockHorses = [
  createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
  createMockHorse({ id: 'horse-2', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
]

describe('getHorsesByBarn', () => {
  it('should_return_horses_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockHorses, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual(mockHorses)
  })

  it('should_return_empty_array_when_no_horses', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(getHorsesByBarn('barn-1')).rejects.toThrow('db error')
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
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1' }, { id: 'lesson-2' }])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { horse_id: 'horse-1', exertion_level: 4 },
        { horse_id: 'horse-1', exertion_level: 2 },
        { horse_id: 'horse-2', exertion_level: 3 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 2, totalExertion: 6 },
      { id: 'horse-2', name: 'Shadow', lessonCount: 1, totalExertion: 3 },
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
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 0, totalExertion: 0 },
    ])
  })

  it('should_include_horses_with_no_lesson_horses_entries_even_when_lessons_exist', async () => {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorsesChain([horse1, horse2])
      if (table === 'lessons') return makeLessonsChain([{ id: 'lesson-1' }])
      if (table === 'lesson_horses') return makeLessonHorsesChain([
        { horse_id: 'horse-1', exertion_level: 5 },
      ])
      return makeLessonHorsesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from } as any)

    const result = await getHorseExertionSummary('barn-1', since)

    expect(result).toEqual([
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 1, totalExertion: 5 },
      { id: 'horse-2', name: 'Shadow', lessonCount: 0, totalExertion: 0 },
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
      { id: 'horse-1', name: 'Thunderbolt', lessonCount: 0, totalExertion: 0 },
    ])
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
