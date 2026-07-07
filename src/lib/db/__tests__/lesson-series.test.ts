import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockLessonSeries } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createLessonSeries, getSeriesById } from '../lesson-series'

const mockLesson = createMockLesson({ series_id: 'series-1' })
const mockSeries = createMockLessonSeries()

describe('createLessonSeries', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_parameters', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonSeries({
      barnId: 'barn-1',
      instructorId: 'mem-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1', 'horse-2'],
      exertionLevels: [3, 5],
      riderIds: ['rider-1'],
      lessonType: 'normal',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_series_with_participants', {
      p_barn_id: 'barn-1',
      p_instructor_id: 'mem-1',
      p_lesson_at: '2026-05-16T10:00:00Z',
      p_fee: 75,
      p_horse_ids: ['horse-1', 'horse-2'],
      p_exertion_levels: [3, 5],
      p_rider_ids: ['rider-1'],
      p_lesson_type: 'normal',
      p_jumping: false,
      p_tier_name: 'Custom',
      p_payment_type: null,
    })
  })

  it('should_pass_jumping_tier_name_and_payment_type_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createLessonSeries({
      barnId: 'barn-1',
      instructorId: 'mem-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [5],
      riderIds: ['rider-1'],
      lessonType: 'normal',
      jumping: true,
      tierName: 'Premium',
      paymentType: 'venmo',
    })

    expect(mockRpc).toHaveBeenCalledWith('create_lesson_series_with_participants',
      expect.objectContaining({ p_jumping: true, p_tier_name: 'Premium', p_payment_type: 'venmo' })
    )
  })

  it('should_return_the_created_lesson', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: mockLesson, error: null }),
    } as any)

    const result = await createLessonSeries({
      barnId: 'barn-1',
      instructorId: 'mem-1',
      lessonAt: '2026-05-16T10:00:00Z',
      fee: 75,
      horseIds: ['horse-1'],
      exertionLevels: [3],
      riderIds: ['rider-1'],
      lessonType: 'normal',
    })

    expect(result).toEqual(mockLesson)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('rpc error') }),
    } as any)

    await expect(
      createLessonSeries({
        barnId: 'barn-1',
        instructorId: 'mem-1',
        lessonAt: '2026-05-16T10:00:00Z',
        fee: 50,
        horseIds: ['horse-1'],
        exertionLevels: [3],
        riderIds: ['rider-1'],
        lessonType: 'normal',
      })
    ).rejects.toThrow('rpc error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = { rpc: vi.fn().mockResolvedValue({ data: mockLesson, error: null }) } as any

    await createLessonSeries(
      { barnId: 'barn-1', instructorId: 'mem-1', lessonAt: '2026-05-16T10:00:00Z', fee: 75, horseIds: ['horse-1'], exertionLevels: [3], riderIds: ['rider-1'], lessonType: 'normal' },
      injectedClient
    )

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockRpc = vi.fn().mockResolvedValue({ data: mockLesson, error: null })
    const injectedClient = { rpc: mockRpc } as any

    await createLessonSeries(
      { barnId: 'barn-1', instructorId: 'mem-1', lessonAt: '2026-05-16T10:00:00Z', fee: 75, horseIds: ['horse-1'], exertionLevels: [3], riderIds: ['rider-1'], lessonType: 'normal' },
      injectedClient
    )

    expect(mockRpc).toHaveBeenCalled()
  })
})

describe('getSeriesById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_the_series_when_found', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: mockSeries, error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle }),
          }),
        }),
      }),
    } as any)

    const result = await getSeriesById('series-1', 'barn-1')

    expect(result).toEqual(mockSeries)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }) }),
          }),
        }),
      }),
    } as any)

    const result = await getSeriesById('series-missing', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }) }),
          }),
        }),
      }),
    } as any)

    await expect(getSeriesById('series-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_scope_lookup_by_series_id_and_barn_id', async () => {
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: mockSeries, error: null }) })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq1 }),
      }),
    } as any)

    await getSeriesById('series-1', 'barn-1')

    expect(mockEq1).toHaveBeenCalledWith('id', 'series-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })
})
