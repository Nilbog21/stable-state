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
import { getHorsesByBarn, getHorseById, getHorsesByIds, resolveHorseNames, getOwnedHorses, getUpcomingLessonsForHorse } from '../horses'

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

describe('getOwnedHorses', () => {
  function makeSelectChain(data: unknown, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    return { chain: { select: vi.fn().mockReturnValue({ eq: mockEq1 }) }, mockEq1, mockEq2, mockOrder }
  }

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_horses_owned_by_the_given_membership', async () => {
    const { chain } = makeSelectChain(mockHorses)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    const result = await getOwnedHorses('barn-1', 'mem-1')

    expect(result).toEqual(mockHorses)
  })

  it('should_filter_by_barn_id', async () => {
    const { chain, mockEq1 } = makeSelectChain(mockHorses)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    await getOwnedHorses('barn-1', 'mem-1')

    expect(mockEq1).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_owning_member_id', async () => {
    const { chain, mockEq2 } = makeSelectChain(mockHorses)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    await getOwnedHorses('barn-1', 'mem-1')

    expect(mockEq2).toHaveBeenCalledWith('owning_member_id', 'mem-1')
  })

  it('should_return_empty_array_when_no_owned_horses', async () => {
    const { chain } = makeSelectChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    const result = await getOwnedHorses('barn-1', 'mem-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { chain } = makeSelectChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    await expect(getOwnedHorses('barn-1', 'mem-1')).rejects.toThrow('db error')
  })
})

describe('getUpcomingLessonsForHorse', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeLinksChain(data: { lesson_id: string }[] | null, error: Error | null = null) {
    const mockEqBarnId = vi.fn().mockResolvedValue({ data, error })
    const mockEqHorseId = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    return { select: vi.fn().mockReturnValue({ eq: mockEqHorseId }), mockEqHorseId, mockEqBarnId }
  }

  function makeLessonsChain(data: { id: string; lesson_at: string }[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ order: mockOrder })
    const mockIs = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEqBarnId = vi.fn().mockReturnValue({ is: mockIs })
    const mockIn = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    return { select: vi.fn().mockReturnValue({ in: mockIn }), mockIn, mockEqBarnId, mockIs, mockGte, mockOrder }
  }

  it('should_return_empty_array_when_horse_has_no_lesson_links', async () => {
    const links = makeLinksChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(links),
    } as any)

    const result = await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_scope_the_link_lookup_to_the_horse_id', async () => {
    const links = makeLinksChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(links),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(links.mockEqHorseId).toHaveBeenCalledWith('horse_id', 'horse-1')
  })

  it('should_scope_the_link_lookup_to_the_barn_id', async () => {
    const links = makeLinksChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(links),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(links.mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_treat_null_link_lookup_data_as_empty_array', async () => {
    const links = makeLinksChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(links),
    } as any)

    const result = await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_the_link_lookup_errors', async () => {
    const links = makeLinksChain(null, new Error('link error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(links),
    } as any)

    await expect(getUpcomingLessonsForHorse('horse-1', 'barn-1')).rejects.toThrow('link error')
  })

  it('should_return_upcoming_non_cancelled_lessons_ordered_ascending', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }, { lesson_id: 'lesson-2' }])
    const lessons = makeLessonsChain([
      { id: 'lesson-1', lesson_at: '2026-08-01T10:00:00Z' },
      { id: 'lesson-2', lesson_at: '2026-08-08T10:00:00Z' },
    ])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    const result = await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(result).toEqual([
      { id: 'lesson-1', lessonAt: '2026-08-01T10:00:00Z' },
      { id: 'lesson-2', lessonAt: '2026-08-08T10:00:00Z' },
    ])
  })

  it('should_scope_the_lessons_lookup_to_the_linked_lesson_ids', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(lessons.mockIn).toHaveBeenCalledWith('id', ['lesson-1'])
  })

  it('should_scope_the_lessons_lookup_to_the_barn_id', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(lessons.mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_scope_the_lessons_lookup_to_uncancelled_only', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(lessons.mockIs).toHaveBeenCalledWith('cancelled_at', null)
  })

  it('should_scope_the_lessons_lookup_to_future_lessons_only', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(lessons.mockGte).toHaveBeenCalledWith('lesson_at', expect.any(String))
  })

  it('should_order_the_lessons_lookup_ascending', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain([])
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(lessons.mockOrder).toHaveBeenCalledWith('lesson_at', { ascending: true })
  })

  it('should_treat_null_lessons_lookup_data_as_empty_array', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain(null)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    const result = await getUpcomingLessonsForHorse('horse-1', 'barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_the_lessons_lookup_errors', async () => {
    const links = makeLinksChain([{ lesson_id: 'lesson-1' }])
    const lessons = makeLessonsChain(null, new Error('lessons error'))
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValueOnce(links).mockReturnValueOnce(lessons),
    } as any)

    await expect(getUpcomingLessonsForHorse('horse-1', 'barn-1')).rejects.toThrow('lessons error')
  })
})
