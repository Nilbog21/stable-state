import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({}),
}))
vi.mock('../lesson-finance-queries')
vi.mock('../member-names')

import { createClient } from '@/lib/supabase/server'
import { getOutstandingLessonRows, getOutstandingCancellationFeeRows, getLessonJunctionRows } from '../lesson-finance-queries'
import { resolveMemberNames } from '../member-names'
import { mergeOutstandingItems, getOutstandingLessons, getOutstandingCancellationFees } from '../outstanding'
import { calendarDate } from '@/lib/local-day'

describe('getOutstandingLessons', () => {
  beforeEach(() => {
    vi.mocked(getOutstandingLessonRows).mockReset()
    vi.mocked(getLessonJunctionRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(createClient).mockClear()
  })

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])
    const injectedClient = {} as any

    await getOutstandingLessons('barn-1', undefined, undefined, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(getOutstandingLessonRows).toHaveBeenCalledWith('barn-1', undefined, undefined, injectedClient)
  })

  it('should_return_empty_array_when_no_outstanding_rows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    const result = await getOutstandingLessons('barn-1')

    expect(result).toEqual([])
  })

  it('should_not_fetch_lesson_riders_when_no_outstanding_rows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    await getOutstandingLessons('barn-1')

    expect(getLessonJunctionRows).not.toHaveBeenCalled()
  })

  it('should_forward_userId_and_role_to_getOutstandingLessonRows', async () => {
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([])

    await getOutstandingLessons('barn-1', 'user-trainer', 'trainer')

    expect(getOutstandingLessonRows).toHaveBeenCalledWith('barn-1', 'user-trainer', 'trainer', expect.anything())
  })

  it('should_return_lesson_id_in_result', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].id).toBe('lesson-1')
  })

  it('should_return_the_lesson_fee_in_result', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].fee).toBe(75)
  })

  it('should_include_rider_names_resolved_from_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-1', 'Alice Rider']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Alice Rider'])
  })

  // #1286: getLessonJunctionRows returns rider_id only, so the ordering can't come from
  // that query — names are resolved here, and OutstandingTable renders them as a sequence.
  it('should_order_rider_names_alphabetically', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([
      { lesson_id: 'lesson-1', rider_id: 'mem-z' },
      { lesson_id: 'lesson-1', rider_id: 'mem-a' },
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-z', 'Zoe Rider'], ['mem-a', 'Ada Rider']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual(['Ada Rider', 'Zoe Rider'])
  })

  it('should_omit_rider_name_when_not_found_in_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-orphan' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].rider_names).toEqual([])
  })

  it('should_include_instructor_name_resolved_from_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-instructor', 'Jane Doe']]))

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBe('Jane Doe')
  })

  it('should_return_null_instructor_name_when_not_found_in_membership_map', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingLessons('barn-1')

    expect(result[0].instructor_name).toBeNull()
  })

  it('should_deduplicate_instructor_ids_before_resolving_names', async () => {
    const lesson1 = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    const lesson2 = createMockLesson({ id: 'lesson-2', fee: 50, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson1, lesson2])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingLessons('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-instructor'], 'barn-1', expect.anything())
  })

  it('should_resolve_member_names_scoped_to_barn', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([{ lesson_id: 'lesson-1', rider_id: 'mem-1' }])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingLessons('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-1'], 'barn-1', expect.anything())
  })

  it('should_throw_when_getOutstandingLessonRows_rejects', async () => {
    vi.mocked(getOutstandingLessonRows).mockRejectedValue(new Error('outstanding error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('outstanding error')
  })

  it('should_throw_when_getLessonJunctionRows_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: null })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockRejectedValue(new Error('lr error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('lr error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    const lesson = createMockLesson({ id: 'lesson-1', fee: 75, instructor_id: 'mem-instructor' })
    vi.mocked(getOutstandingLessonRows).mockResolvedValue([lesson])
    vi.mocked(getLessonJunctionRows).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getOutstandingLessons('barn-1')).rejects.toThrow('resolve error')
  })
})

describe('getOutstandingCancellationFees', () => {
  beforeEach(() => {
    vi.mocked(getOutstandingCancellationFeeRows).mockReset()
    vi.mocked(resolveMemberNames).mockReset()
    vi.mocked(createClient).mockClear()
  })

  function feeRow(overrides: Partial<{ id: string; lessonId: string; lessonAt: string; instructorId: string | null; riderId: string; fee: number }> = {}) {
    return {
      id: 'lr-1', lessonId: 'lesson-1', lessonAt: '2026-06-10T10:00:00Z',
      instructorId: 'mem-instructor', riderId: 'mem-rider', fee: 75,
      ...overrides,
    }
  }

  it('should_use_injected_client_when_provided', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([])
    const injectedClient = {} as any

    await getOutstandingCancellationFees('barn-1', undefined, undefined, injectedClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(getOutstandingCancellationFeeRows).toHaveBeenCalledWith('barn-1', undefined, undefined, injectedClient)
  })

  it('should_forward_userId_and_role', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([])

    await getOutstandingCancellationFees('barn-1', 'user-trainer', 'trainer')

    expect(getOutstandingCancellationFeeRows).toHaveBeenCalledWith('barn-1', 'user-trainer', 'trainer', expect.anything())
  })

  it('should_return_empty_array_when_no_rows', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([])

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result).toEqual([])
  })

  it('should_not_resolve_names_when_no_rows', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([])

    await getOutstandingCancellationFees('barn-1')

    expect(resolveMemberNames).not.toHaveBeenCalled()
  })

  it('should_resolve_rider_and_instructor_ids_together', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingCancellationFees('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-rider', 'mem-instructor'], 'barn-1', expect.anything())
  })

  it('should_dedupe_instructor_ids_before_resolving_names', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([
      feeRow({ id: 'lr-1', riderId: 'mem-rider-1' }),
      feeRow({ id: 'lr-2', riderId: 'mem-rider-2' }),
    ])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    await getOutstandingCancellationFees('barn-1')

    expect(resolveMemberNames).toHaveBeenCalledWith(['mem-rider-1', 'mem-rider-2', 'mem-instructor'], 'barn-1', expect.anything())
  })

  it('should_map_id_lessonId_lessonAt_and_fee_through', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0]).toMatchObject({ id: 'lr-1', lessonId: 'lesson-1', lessonAt: '2026-06-10T10:00:00Z', fee: 75 })
  })

  it('should_include_resolved_rider_name', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-rider', 'Alice Rider']]))

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0].riderName).toBe('Alice Rider')
  })

  it('should_fall_back_to_rider_id_when_name_not_resolved', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0].riderName).toBe('mem-rider')
  })

  it('should_include_resolved_instructor_name', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-instructor', 'Jane Doe']]))

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0].instructorName).toBe('Jane Doe')
  })

  it('should_return_null_instructor_name_when_instructorId_is_null', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow({ instructorId: null })])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0].instructorName).toBeNull()
  })

  it('should_return_null_instructor_name_when_not_found_in_membership_map', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const result = await getOutstandingCancellationFees('barn-1')

    expect(result[0].instructorName).toBeNull()
  })

  it('should_throw_when_getOutstandingCancellationFeeRows_rejects', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockRejectedValue(new Error('rows error'))

    await expect(getOutstandingCancellationFees('barn-1')).rejects.toThrow('rows error')
  })

  it('should_throw_when_resolveMemberNames_rejects', async () => {
    vi.mocked(getOutstandingCancellationFeeRows).mockResolvedValue([feeRow()])
    vi.mocked(resolveMemberNames).mockRejectedValue(new Error('resolve error'))

    await expect(getOutstandingCancellationFees('barn-1')).rejects.toThrow('resolve error')
  })
})

describe('mergeOutstandingItems', () => {
  it('should_map_a_lesson_row_to_an_outstanding_item', () => {
    const result = mergeOutstandingItems(
      [{ id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-06-10T10:00:00Z', instructor_name: 'Jane Doe', rider_names: ['Alice'], fee: 75 }],
      [], [], 'America/New_York'
    )

    expect(result).toEqual([
      { id: 'lesson-1', itemType: 'lesson', date: { at: '2026-06-10T10:00:00Z', tz: 'America/New_York' }, instructorName: 'Jane Doe', riderNames: ['Alice'], fee: 75 },
    ])
  })

  it('should_map_a_charge_row_to_an_outstanding_item', () => {
    const result = mergeOutstandingItems(
      [],
      [{ id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-06-01'), kind: 'board', riderName: 'Alice Rider', fee: 500 }],
      [], 'America/New_York'
    )

    expect(result).toEqual([
      { id: 'charge-1', itemType: 'board', date: calendarDate('2026-06-01'), instructorName: null, riderNames: ['Alice Rider'], fee: 500, linkId: 'agreement-1' },
    ])
  })

  it('should_map_a_lease_charge_row_with_lease_item_type', () => {
    const result = mergeOutstandingItems(
      [],
      [{ id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-06-01'), kind: 'lease', riderName: 'Alice Rider', fee: 200 }],
      [], 'America/New_York'
    )

    expect(result[0].itemType).toBe('lease')
  })

  it('should_sort_merged_items_by_date_ascending', () => {
    const result = mergeOutstandingItems(
      [{ id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-06-15T10:00:00Z', instructor_name: null, rider_names: [], fee: 75 }],
      [{ id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-06-01'), kind: 'board', riderName: 'Alice Rider', fee: 500 }],
      [], 'America/New_York'
    )

    expect(result.map((r) => r.id)).toEqual(['charge-1', 'lesson-1'])
  })

  it('should_return_empty_array_when_both_inputs_are_empty', () => {
    expect(mergeOutstandingItems([], [], [], 'America/New_York')).toEqual([])
  })

  it('should_map_a_cancellation_fee_row_to_an_outstanding_item', () => {
    const result = mergeOutstandingItems(
      [], [],
      [{ id: 'lr-1', lessonId: 'lesson-1', lessonAt: '2026-06-05T10:00:00Z', instructorName: 'Jane Doe', riderName: 'Alice Rider', fee: 50 }],
      'America/New_York'
    )

    expect(result).toEqual([
      { id: 'lr-1', itemType: 'cancellation_fee', date: { at: '2026-06-05T10:00:00Z', tz: 'America/New_York' }, instructorName: 'Jane Doe', riderNames: ['Alice Rider'], fee: 50, linkId: 'lesson-1' },
    ])
  })

  it('should_sort_cancellation_fee_items_alongside_lessons_and_charges', () => {
    const result = mergeOutstandingItems(
      [{ id: 'lesson-1', barn_id: 'barn-1', lesson_at: '2026-06-20T10:00:00Z', instructor_name: null, rider_names: [], fee: 75 }],
      [{ id: 'charge-1', agreementId: 'agreement-1', period: calendarDate('2026-06-01'), kind: 'board', riderName: 'Alice Rider', fee: 500 }],
      [{ id: 'lr-1', lessonId: 'lesson-2', lessonAt: '2026-06-10T10:00:00Z', instructorName: null, riderName: 'Bob Rider', fee: 50 }],
      'America/New_York'
    )

    expect(result.map((r) => r.id)).toEqual(['charge-1', 'lr-1', 'lesson-1'])
  })

})

describe('mergeOutstandingItems instant branding', () => {
  const lesson = { id: 'l-1', barn_id: 'barn-1', lesson_at: '2026-07-15T20:00:00Z', instructor_name: null, rider_names: [], fee: 50 }

  it('should_brand_a_lesson_rows_date_with_the_barns_timezone', () => {
    const [item] = mergeOutstandingItems([lesson], [], [], 'America/New_York')

    expect(item.date).toEqual({ at: '2026-07-15T20:00:00Z', tz: 'America/New_York' })
  })

  it('should_leave_a_charge_rows_date_only_period_unbranded', () => {
    const charge = { id: 'c-1', kind: 'board' as const, period: calendarDate('2026-07-01'), riderName: 'Ann', fee: 10, agreementId: 'a-1' }

    const [item] = mergeOutstandingItems([], [charge], [], 'America/New_York')

    expect(item.date).toBe('2026-07-01')
  })
})
