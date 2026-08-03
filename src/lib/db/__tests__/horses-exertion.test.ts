import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse, instant } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../document-storage', () => ({
  uploadFile: vi.fn(),
  removeFile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createMockBarn } from '@/test/fixtures'
import { getHorseExertionSummary, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '../horses'

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

    const result = await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'America/New_York')

    expect(result).toEqual([
      { lessonAt: instant('2026-07-09T10:00:00Z'), exertionLevel: 3 },
      { lessonAt: instant('2026-07-11T10:00:00Z'), exertionLevel: 4 },
    ])
  })

  it('should_return_empty_array_when_rpc_returns_null_data', async () => {
    vi.mocked(createClient).mockResolvedValue({ rpc: makeRpc(null) } as any)

    const result = await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({ rpc: makeRpc(null, new Error('rpc error')) } as any)

    await expect(getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'America/New_York')).rejects.toThrow('rpc error')
  })

  it('should_call_rpc_with_null_exclude_lesson_id_when_omitted', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: [], error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'America/New_York')

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

    await getHorseProjectedExhaustion('horse-1', 'barn-1', targetDate, 'America/New_York', 'lesson-1')

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

  it('should_clamp_moderate_below_high_when_a_single_override_would_invert_the_pair', () => {
    const horse = createMockHorse({ exhaustion_threshold_high: null, exhaustion_threshold_moderate: 15 })

    expect(resolveExhaustionThresholds(horse, barn)).toEqual({ high: 11, moderate: 10 })
  })
})


describe('getHorseProjectedExhaustion instant branding', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_brand_lesson_at_with_the_barns_timezone', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: [{ lesson_at: '2026-07-15T20:00:00Z', exertion_level: 3 }], error: null }),
    } as any)

    const [row] = await getHorseProjectedExhaustion('horse-1', 'barn-1', new Date('2026-07-01T00:00:00Z'), 'America/New_York')

    expect(row.lessonAt).toEqual({ at: '2026-07-15T20:00:00Z', tz: 'America/New_York' })
  })
})
