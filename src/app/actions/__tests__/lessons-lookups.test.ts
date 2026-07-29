import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockHorse, createMockMembership, createMockScheduleItem } from '@/test/fixtures'
import { guardAs } from '@/test/mocks/guard'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  cancelLesson: vi.fn(),
  collectLessonPayment: vi.fn(),
  deleteLesson: vi.fn(),
  getLessonById: vi.fn(),
  updateLesson: vi.fn(),
}))

vi.mock('@/lib/db/lesson-participants', () => ({
  createLessonWithParticipants: vi.fn(),
  updateLessonWithParticipants: vi.fn(),
  updateLessonHorseNotes: vi.fn(),
  updateLessonRiderNotes: vi.fn(),
  cancelRiderParticipation: vi.fn(),
  updateCancellationFeePaymentType: vi.fn(),
}))

vi.mock('@/lib/db/lesson-series', () => ({
  createLessonSeries: vi.fn(),
  getSeriesById: vi.fn(),
  stopLessonSeries: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getInstructorsByBarn: vi.fn(),
  getActiveMembersWithProfiles: vi.fn(),
  getActiveManagerUserIds: vi.fn(),
  getMembershipByIdForBarn: vi.fn(),
}))

vi.mock('@/lib/db/schedule', () => ({
  getNearbyInstructorMembershipIds: vi.fn(),
  getScheduleForRange: vi.fn(),
}))

vi.mock('@/lib/db/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/notifications')>()),
  createNotification: vi.fn(),
  getUnreadNotificationCount: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
  getHorsesByBarn: vi.fn(),
  getHorsesByIds: vi.fn(),
  getHorseProjectedExhaustion: vi.fn(),
  resolveExhaustionThresholds: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { getScheduleForRange } from '@/lib/db/schedule'
import { getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { getProjectedExhaustionForBarn, getScheduleRangeForBarn } from '../lessons'

const mockBarn = createMockBarn()
const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })

describe('getProjectedExhaustionForBarn', () => {
  const mockThresholds = { high: 11, moderate: 5 }
  const mockRows = [{ lessonAt: '2026-05-17T10:00:00Z', exertionLevel: 3 }]
  const mockHorseIds = ['horse-1', 'horse-2']

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getHorsesByIds).mockReset()
    vi.mocked(getHorseProjectedExhaustion).mockReset()
    vi.mocked(resolveExhaustionThresholds).mockReset()
    guardAs(mockTrainerMembership)
    vi.mocked(getHorsesByIds).mockResolvedValue([
      createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
      createMockHorse({ id: 'horse-2', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
    ])
    vi.mocked(getHorseProjectedExhaustion).mockResolvedValue(mockRows)
    vi.mocked(resolveExhaustionThresholds).mockReturnValue(mockThresholds)
  })

  it('should_return_a_map_keyed_by_horse_id', async () => {
    const result = await getProjectedExhaustionForBarn('barn-slug', null, '2026-05-17T10:00', mockHorseIds)
    expect(result).toEqual({
      'horse-1': { existingRows: mockRows, thresholds: mockThresholds },
      'horse-2': { existingRows: mockRows, thresholds: mockThresholds },
    })
  })

  it('should_pass_exclude_lesson_id_to_getHorseProjectedExhaustion_when_provided', async () => {
    await getProjectedExhaustionForBarn('barn-slug', 'lesson-1', '2026-05-17T10:00', mockHorseIds)
    expect(vi.mocked(getHorseProjectedExhaustion).mock.calls[0][3]).toBe('lesson-1')
  })

  it('should_pass_undefined_exclude_lesson_id_when_null', async () => {
    await getProjectedExhaustionForBarn('barn-slug', null, '2026-05-17T10:00', mockHorseIds)
    expect(vi.mocked(getHorseProjectedExhaustion).mock.calls[0][3]).toBeUndefined()
  })

  it('should_require_manager_or_trainer_membership', async () => {
    await getProjectedExhaustionForBarn('barn-slug', null, '2026-05-17T10:00', mockHorseIds)
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager', 'trainer'])
  })

  it('should_pass_the_given_horse_ids_to_getHorsesByIds', async () => {
    await getProjectedExhaustionForBarn('barn-slug', null, '2026-05-17T10:00', mockHorseIds)
    expect(getHorsesByIds).toHaveBeenCalledWith(mockHorseIds, mockBarn.id)
  })

  it('should_include_an_inactive_assigned_horse_id_in_the_returned_map', async () => {
    vi.mocked(getHorsesByIds).mockResolvedValue([
      createMockHorse({ id: 'horse-3', name: 'Retired', is_active: false, created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const result = await getProjectedExhaustionForBarn('barn-slug', null, '2026-05-17T10:00', ['horse-3'])
    expect(result['horse-3']).toEqual({ existingRows: mockRows, thresholds: mockThresholds })
  })
})

describe('getScheduleRangeForBarn', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getScheduleForRange).mockReset()
    guardAs(mockTrainerMembership)
    vi.mocked(getScheduleForRange).mockResolvedValue([])
  })

  it('should_require_manager_or_trainer_membership', async () => {
    await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager', 'trainer'])
  })

  it('should_scope_the_read_to_the_resolved_barn', async () => {
    await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')
    expect(vi.mocked(getScheduleForRange).mock.calls[0][0]).toBe(mockBarn.id)
  })

  it('should_convert_the_from_date_to_a_barn_local_midnight_instant', async () => {
    // createMockBarn's timezone is America/New_York — 2026-03-01T00:00 EST is 05:00Z.
    await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')
    expect(vi.mocked(getScheduleForRange).mock.calls[0][1]).toBe('2026-03-01T05:00:00.000Z')
  })

  it('should_convert_the_to_date_to_a_barn_local_midnight_instant', async () => {
    // 2026-04-12T00:00 EDT (post spring-forward) is 04:00Z, not 05:00Z.
    await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')
    expect(vi.mocked(getScheduleForRange).mock.calls[0][2]).toBe('2026-04-12T04:00:00.000Z')
  })

  it('should_pass_the_barn_timezone_through', async () => {
    await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')
    expect(vi.mocked(getScheduleForRange).mock.calls[0][3]).toBe(mockBarn.timezone)
  })

  it('should_return_the_schedule_items_it_read', async () => {
    const items = [createMockScheduleItem({ id: 'l1' })]
    vi.mocked(getScheduleForRange).mockResolvedValue(items)

    expect(await getScheduleRangeForBarn('barn-slug', '2026-03-01', '2026-04-12')).toBe(items)
  })
})
