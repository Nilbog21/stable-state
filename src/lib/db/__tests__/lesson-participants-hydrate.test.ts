import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../horses', () => ({
  resolveHorseNames: vi.fn(),
}))

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

import { resolveHorseNames } from '../horses'
import { resolveMemberNames } from '../member-names'
import {
  hydrateParticipants,
} from '../lesson-participants'

describe('hydrateParticipants', () => {
  beforeEach(() => {
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  function makeInChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeSupabase(
    lessonHorses: unknown[] | null,
    lessonRiders: unknown[] | null,
    lessonHorsesError: Error | null = null,
    lessonRidersError: Error | null = null
  ) {
    const from = vi.fn().mockImplementation((table: string) => {
      if (table === 'lesson_horses') return makeInChain(lessonHorses, lessonHorsesError)
      if (table === 'lesson_riders') return makeInChain(lessonRiders, lessonRidersError)
      return makeInChain([])
    })
    return { from } as any
  }

  it('should_return_empty_array_when_no_lessons', async () => {
    const result = await hydrateParticipants(makeSupabase([], []), [], 'barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_not_query_supabase_when_no_lessons', async () => {
    const supabase = makeSupabase([], [])

    await hydrateParticipants(supabase, [], 'barn-1', 'America/New_York')

    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('should_resolve_instructor_name_from_membership_map', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-instructor-1', 'John Doe']]))

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1', 'America/New_York')

    expect(result.instructor_name).toBe('John Doe')
  })

  it('should_return_null_instructor_name_when_instructor_id_is_null', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1', 'America/New_York')

    expect(result.instructor_name).toBeNull()
  })

  it('should_return_null_instructor_name_when_membership_map_has_no_entry', async () => {
    const lesson = createMockLesson({ instructor_id: 'mem-instructor-1' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const [result] = await hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1', 'America/New_York')

    expect(result.instructor_name).toBeNull()
  })

  it('should_resolve_horse_names_for_a_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_horse_ids_alongside_horse_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_ids).toEqual(['horse-1'])
  })

  // #1286: horse_names/rider_names are rendered as a sequence by LessonListItem and
  // CalendarLessonCard, and the junction queries that feed them carry only ids — the names
  // arrive from resolveHorseNames/resolveMemberNames afterwards, so the sort happens on the
  // resolved participants. Sorting the participant objects (not the name arrays) is what
  // keeps horse_ids/rider_ids/rider_cancelled_ats positionally aligned with them.
  it('should_order_horse_names_alphabetically', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-z', 'Zephyr'], ['horse-a', 'Apollo']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [
        { lesson_id: lesson.id, horse_id: 'horse-z' },
        { lesson_id: lesson.id, horse_id: 'horse-a' },
      ],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_names).toEqual(['Apollo', 'Zephyr'])
  })

  it('should_order_rider_names_alphabetically', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-z', 'Zoe Rider'], ['mem-a', 'Ada Rider']]))
    const supabase = makeSupabase(
      [],
      [
        { lesson_id: lesson.id, rider_id: 'mem-z', cancelled_at: null },
        { lesson_id: lesson.id, rider_id: 'mem-a', cancelled_at: null },
      ]
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_names).toEqual(['Ada Rider', 'Zoe Rider'])
  })

  it('should_keep_rider_cancelled_ats_aligned_with_alphabetically_ordered_riders', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-z', 'Zoe Rider'], ['mem-a', 'Ada Rider']]))
    const supabase = makeSupabase(
      [],
      [
        { lesson_id: lesson.id, rider_id: 'mem-z', cancelled_at: '2026-03-05T00:00:00Z' },
        { lesson_id: lesson.id, rider_id: 'mem-a', cancelled_at: null },
      ]
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_cancelled_ats).toEqual([null, '2026-03-05T00:00:00Z'])
  })

  it('should_filter_out_a_horse_when_the_name_map_has_no_entry_for_it', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_names).toEqual([])
  })

  it('should_count_horse_junction_rows_even_when_a_horse_name_is_unresolved', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([{ lesson_id: lesson.id, horse_id: 'horse-1' }], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_count).toBe(1)
  })

  it('should_treat_null_lesson_horses_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(null, [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.horse_names).toEqual([])
  })

  it('should_resolve_rider_names_for_a_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_names).toEqual(['Alice Rider'])
  })

  it('should_return_all_rider_names_for_a_group_lesson', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([
      ['mem-1', 'Alice Rider'],
      ['mem-2', 'Bob Rider'],
    ]))
    const supabase = makeSupabase([], [
      { lesson_id: lesson.id, rider_id: 'mem-1' },
      { lesson_id: lesson.id, rider_id: 'mem-2' },
    ])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_names).toEqual(['Alice Rider', 'Bob Rider'])
  })

  it('should_filter_out_a_rider_when_the_name_map_has_no_entry_for_it', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_names).toEqual([])
  })

  it('should_count_rider_junction_rows_even_when_a_rider_name_is_unresolved', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_count).toBe(1)
  })

  it('should_treat_null_lesson_riders_data_as_empty', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([], null)

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_names).toEqual([])
  })

  it('should_include_non_null_cancelled_at_for_a_cancelled_rider_participation', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1', cancelled_at: '2026-06-01T00:00:00Z' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_cancelled_ats).toEqual(['2026-06-01T00:00:00Z'])
  })

  it('should_default_cancelled_at_to_null_when_absent', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))
    const supabase = makeSupabase([], [{ lesson_id: lesson.id, rider_id: 'mem-1' }])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.rider_cancelled_ats).toEqual([null])
  })

  it('should_not_attach_another_lessons_horse_to_the_first_lesson', async () => {
    const lessonA = createMockLesson({ id: 'lesson-a', instructor_id: null })
    const lessonB = createMockLesson({ id: 'lesson-b', instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: 'lesson-a', horse_id: 'horse-1' },
      { lesson_id: 'lesson-b', horse_id: 'horse-2' },
    ], [])

    const [resultA] = await hydrateParticipants(supabase, [lessonA, lessonB], 'barn-1', 'America/New_York')

    expect(resultA.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_not_attach_the_first_lessons_horse_to_another_lesson', async () => {
    const lessonA = createMockLesson({ id: 'lesson-a', instructor_id: null })
    const lessonB = createMockLesson({ id: 'lesson-b', instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: 'lesson-a', horse_id: 'horse-1' },
      { lesson_id: 'lesson-b', horse_id: 'horse-2' },
    ], [])

    const [, resultB] = await hydrateParticipants(supabase, [lessonA, lessonB], 'barn-1', 'America/New_York')

    expect(resultB.horse_names).toEqual(['Shadow'])
  })

  it('should_throw_when_lesson_horses_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const supabase = makeSupabase([], [], new Error('horses error'))

    await expect(hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')).rejects.toThrow('horses error')
  })

  it('should_throw_when_lesson_riders_fetch_returns_an_error', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    const supabase = makeSupabase([], [], null, new Error('riders error'))

    await expect(hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')).rejects.toThrow('riders error')
  })

  it('should_propagate_errors_from_resolve_horse_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockRejectedValue(new Error('resolve horse names error'))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await expect(hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1', 'America/New_York')).rejects.toThrow('resolve horse names error')
  })

  it('should_propagate_errors_from_resolve_member_names', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve member names error'))

    await expect(hydrateParticipants(makeSupabase([], []), [lesson], 'barn-1', 'America/New_York')).rejects.toThrow('resolve member names error')
  })

  it('should_set_needs_attention_true_when_assigned_horse_is_inactive', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: false, is_available: true } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.needs_attention).toBe(true)
  })

  it('should_set_needs_attention_true_when_assigned_horse_is_unavailable', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: false } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.needs_attention).toBe(true)
  })

  it('should_set_needs_attention_false_when_all_assigned_horses_active_and_available', async () => {
    const lesson = createMockLesson({ instructor_id: null })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase(
      [{ lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: true } }],
      []
    )

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.needs_attention).toBe(false)
  })

  it('should_set_needs_attention_true_for_group_lesson_when_any_one_horse_is_bad', async () => {
    const lesson = createMockLesson({ instructor_id: null, lesson_type: 'group' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map([['horse-1', 'Thunderbolt'], ['horse-2', 'Shadow']]))
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
    const supabase = makeSupabase([
      { lesson_id: lesson.id, horse_id: 'horse-1', horses: { is_active: true, is_available: true } },
      { lesson_id: lesson.id, horse_id: 'horse-2', horses: { is_active: false, is_available: true } },
    ], [])

    const [result] = await hydrateParticipants(supabase, [lesson], 'barn-1', 'America/New_York')

    expect(result.needs_attention).toBe(true)
  })
})

describe('hydrateParticipants instant branding', () => {
  beforeEach(() => {
    vi.mocked(resolveHorseNames).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
  })

  function makeInChain(data: unknown[] | null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error: null })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    return { select: vi.fn().mockReturnValue({ eq: mockEq }) }
  }

  function makeSupabase() {
    return { from: vi.fn().mockImplementation(() => makeInChain([])) } as any
  }

  it('should_brand_lesson_at_with_the_barns_timezone', async () => {
    const lesson = createMockLesson({ lesson_at: '2026-07-15T20:00:00Z' })
    vi.mocked(resolveHorseNames).mockResolvedValue(new Map())
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const [result] = await hydrateParticipants(makeSupabase(), [lesson], 'barn-1', 'America/New_York')

    expect(result.lesson_at).toEqual({ at: '2026-07-15T20:00:00Z', tz: 'America/New_York' })
  })
})
