import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLessonDetail, createMockLessonSeries, createMockMembership, makeLessonDetail } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'
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
import { collectLessonPayment, deleteLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { updateCancellationFeePaymentType } from '@/lib/db/lesson-participants'
import { getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import { redirect } from 'next/navigation'
import { deleteLessonAction, updatePaymentTypeAction, updateCancellationFeePaymentTypeAction, stopLessonSeriesAction } from '../lessons'

const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })

const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('deleteLessonAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(deleteLesson).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: futureIso, payment_type: null, cancelled_at: null })
    )
    vi.mocked(deleteLesson).mockResolvedValue(undefined)
  })

  it('should_require_manager_membership', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_redirect_to_lessons_list_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_not_call_deleteLesson_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(deleteLesson).not.toHaveBeenCalled()
  })

  it('should_call_deleteLesson_for_an_upcoming_unpaid_lesson', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', false)
  })

  it('should_call_deleteLesson_for_a_past_paid_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: pastIso, payment_type: 'cash', cancelled_at: null })
    )
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', false)
  })

  it('should_call_deleteLesson_for_an_already_cancelled_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: pastIso, cancelled_at: '2026-01-01T00:00:00Z' })
    )
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', false)
  })

  it('should_redirect_to_lessons_list_after_successful_delete', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_pass_delete_collected_transactions_true_when_checkbox_is_checked', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ alsoDeleteTransactions: 'on' }))
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', true)
  })

  it('should_pass_delete_collected_transactions_false_when_checkbox_is_absent', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', false)
  })
})

describe('updatePaymentTypeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(updateLesson).mockReset()
    vi.mocked(collectLessonPayment).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(collectLessonPayment).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_and_trainer_roles', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-slug', 'cash')
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager', 'trainer'])
  })

  it('should_return_error_when_trainer_lesson_not_found', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(null)
    const result = await updatePaymentTypeAction('lesson-1', 'barn-slug', 'venmo')
    expect(result).toEqual({ error: 'lesson not found' })
  })

  it('should_return_error_when_trainer_is_not_instructor', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLessonDetail({ instructor_id: 'other-trainer' }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-slug', 'venmo')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_no_error_when_trainer_is_instructor', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLessonDetail({ instructor_id: mockTrainerMembership.id }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-slug', 'venmo')
    expect(result).toEqual({ error: null })
  })

  it('should_return_no_error_when_user_is_manager', async () => {
    const result = await updatePaymentTypeAction('lesson-1', 'barn-slug', 'cash')
    expect(result).toEqual({ error: null })
  })

  it('should_not_call_getLessonById_when_user_is_manager', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-slug', 'cash')
    expect(getLessonById).not.toHaveBeenCalled()
  })

  it('should_call_collectLessonPayment_with_lesson_barn_and_payment_type', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-slug', 'cash')
    expect(collectLessonPayment).toHaveBeenCalledWith('lesson-1', 'barn-1', 'cash')
  })

  it('should_call_collectLessonPayment_with_null_payment_type', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-slug', null)
    expect(collectLessonPayment).toHaveBeenCalledWith('lesson-1', 'barn-1', null)
  })

  it('should_return_error_when_collectLessonPayment_throws', async () => {
    vi.mocked(collectLessonPayment).mockRejectedValue(new Error('rpc error'))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-slug', 'cash')
    expect(result).toEqual({ error: 'Failed to update payment type' })
  })

  it('should_never_call_updateLesson', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLessonDetail({ instructor_id: mockTrainerMembership.id }))
    await updatePaymentTypeAction('lesson-1', 'barn-slug', 'venmo')
    expect(updateLesson).not.toHaveBeenCalled()
  })
})

describe('updateCancellationFeePaymentTypeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateCancellationFeePaymentType).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(updateCancellationFeePaymentType).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role_only', async () => {
    await updateCancellationFeePaymentTypeAction('barn-slug', 'lesson-rider-1', 'cash')
    expect(requireMembership).toHaveBeenCalledWith('barn-slug', ['manager'])
  })

  it('should_call_updateCancellationFeePaymentType_with_lesson_rider_id_barn_and_payment_type', async () => {
    await updateCancellationFeePaymentTypeAction('barn-slug', 'lesson-rider-1', 'cash')
    expect(updateCancellationFeePaymentType).toHaveBeenCalledWith('lesson-rider-1', 'barn-1', 'cash')
  })

  it('should_call_updateCancellationFeePaymentType_with_null_payment_type', async () => {
    await updateCancellationFeePaymentTypeAction('barn-slug', 'lesson-rider-1', null)
    expect(updateCancellationFeePaymentType).toHaveBeenCalledWith('lesson-rider-1', 'barn-1', null)
  })

  it('should_return_no_error_on_success', async () => {
    const result = await updateCancellationFeePaymentTypeAction('barn-slug', 'lesson-rider-1', 'cash')
    expect(result).toEqual({ error: null })
  })

  it('should_return_error_when_updateCancellationFeePaymentType_throws', async () => {
    vi.mocked(updateCancellationFeePaymentType).mockRejectedValue(new Error('rpc error'))
    const result = await updateCancellationFeePaymentTypeAction('barn-slug', 'lesson-rider-1', 'cash')
    expect(result).toEqual({ error: 'Failed to update payment type' })
  })
})

describe('stopLessonSeriesAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getSeriesById).mockReset()
    vi.mocked(stopLessonSeries).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getSeriesById).mockResolvedValue(createMockLessonSeries({ instructor_id: mockTrainerMembership.id }))
    vi.mocked(stopLessonSeries).mockResolvedValue(undefined)
  })

  it('should_call_stopLessonSeries_when_manager_stops_any_series', async () => {
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(stopLessonSeries).toHaveBeenCalledWith('series-1', 'barn-1')
  })

  it('should_redirect_to_lesson_edit_page_when_manager_stops_series', async () => {
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1/edit')
  })

  it('should_call_stopLessonSeries_when_trainer_stops_own_series', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getSeriesById).mockResolvedValue(createMockLessonSeries({ instructor_id: mockTrainerMembership.id }))
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(stopLessonSeries).toHaveBeenCalledWith('series-1', 'barn-1')
  })

  it('should_not_call_stopLessonSeries_when_trainer_does_not_own_series', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getSeriesById).mockResolvedValue(createMockLessonSeries({ instructor_id: 'other-trainer' }))
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(stopLessonSeries).not.toHaveBeenCalled()
  })

  it('should_still_redirect_when_trainer_does_not_own_series', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getSeriesById).mockResolvedValue(createMockLessonSeries({ instructor_id: 'other-trainer' }))
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1/edit')
  })

  it('should_not_call_stopLessonSeries_when_series_not_found', async () => {
    vi.mocked(getSeriesById).mockResolvedValue(null)
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(stopLessonSeries).not.toHaveBeenCalled()
  })

  it('should_still_redirect_when_series_not_found', async () => {
    vi.mocked(getSeriesById).mockResolvedValue(null)
    await stopLessonSeriesAction('barn-slug', 'lesson-1', 'series-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1/edit')
  })
})
