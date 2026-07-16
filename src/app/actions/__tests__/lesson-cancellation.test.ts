import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockMembership, makeLessonDetail } from '@/test/fixtures'
import type { PaymentType } from '@/lib/db/types'
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

vi.mock('@/lib/db/barn-memberships', () => ({
  getInstructorsByBarn: vi.fn(),
  getActiveMembersWithProfiles: vi.fn(),
  getActiveManagerUserIds: vi.fn(),
}))

vi.mock('@/lib/db/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/notifications')>()),
  createNotification: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { cancelLesson, getLessonById } from '@/lib/db/lessons'
import { cancelRiderParticipation } from '@/lib/db/lesson-participants'
import { getActiveManagerUserIds } from '@/lib/db/barn-memberships'
import { createNotification } from '@/lib/db/notifications'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cancelLessonAction, cancelRiderParticipationAction } from '../lesson-cancellation'

const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })

const futureIso = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
const pastIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

describe('cancelLessonAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(cancelLesson).mockReset()
    vi.mocked(cancelRiderParticipation).mockReset()
    vi.mocked(getActiveManagerUserIds).mockReset()
    vi.mocked(createNotification).mockReset()
    vi.mocked(createClient).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null }, [], 'instructor-1')
    )
    vi.mocked(cancelLesson).mockResolvedValue(undefined)
    vi.mocked(cancelRiderParticipation).mockResolvedValue(false)
    vi.mocked(getActiveManagerUserIds).mockResolvedValue([])
    vi.mocked(createNotification).mockResolvedValue(undefined)
    vi.mocked(createClient).mockResolvedValue({} as any)
  })

  it('should_redirect_to_lessons_list_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_not_call_cancelLesson_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).not.toHaveBeenCalled()
  })

  it('should_redirect_to_lessons_list_when_trainer_is_not_the_instructor', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: 'other-trainer', lesson_at: futureIso }))
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_call_cancelLesson_when_manager_cancels_eligible_lesson', async () => {
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, true)
  })

  it('should_call_cancelLesson_when_trainer_cancels_own_eligible_lesson', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: mockTrainerMembership.id, lesson_at: futureIso }))
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, true)
  })

  it('should_redirect_without_calling_cancelLesson_when_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: futureIso, cancelled_at: '2026-01-01T00:00:00Z' })
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).not.toHaveBeenCalled()
  })

  it('should_redirect_without_calling_cancelLesson_when_past_and_paid', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: pastIso, payment_type: 'cash', cancelled_at: null })
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).not.toHaveBeenCalled()
  })

  it('should_allow_cancellation_of_future_paid_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: futureIso, payment_type: 'cash', cancelled_at: null })
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).toHaveBeenCalled()
  })

  it('should_allow_cancellation_of_past_unpaid_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ lesson_at: pastIso, payment_type: null, cancelled_at: null })
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).toHaveBeenCalled()
  })

  it('should_trim_and_pass_notes_when_provided', async () => {
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ notes: '  Trainer sick  ' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', 'Trainer sick', true)
  })

  it('should_pass_null_notes_when_textarea_whitespace_only', async () => {
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ notes: '   ' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, true)
  })

  it('should_pass_is_late_false_when_cancel_type_is_instructor_for_normal_lesson', async () => {
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'instructor' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, false)
  })

  it('should_pass_is_late_true_when_cancel_type_is_rider_and_within_24_hours', async () => {
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: soonIso, payment_type: null, cancelled_at: null }, [], 'instructor-1')
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, true)
  })

  it('should_pass_is_late_false_when_cancel_type_is_rider_and_more_than_24_hours_out', async () => {
    const farIso = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: farIso, payment_type: null, cancelled_at: null }, [], 'instructor-1')
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, false)
  })

  it('should_default_to_rider_type_when_cancel_type_field_is_missing_for_normal_lesson', async () => {
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: soonIso, payment_type: null, cancelled_at: null }, [], 'instructor-1')
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, true)
  })

  it('should_call_cancelLesson_for_group_lesson_when_cancel_type_is_instructor', async () => {
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: soonIso, payment_type: null, cancelled_at: null },
        [],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'instructor' }))
    expect(cancelLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', null, false)
  })

  it('should_delegate_to_cancelRiderParticipation_for_group_lesson_when_cancel_type_is_rider_with_valid_rider_id', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider', rider_id: 'rider-mem-1' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, expect.any(Boolean))
  })

  it('should_not_call_cancelLesson_when_delegating_to_rider_cancellation', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider', rider_id: 'rider-mem-1' }))
    expect(cancelLesson).not.toHaveBeenCalled()
  })

  it('should_redirect_to_lesson_detail_after_delegated_rider_cancellation', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider', rider_id: 'rider-mem-1' }))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_not_call_cancelLesson_when_group_rider_selected_but_rider_id_missing', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelLesson).not.toHaveBeenCalled()
  })

  it('should_not_call_cancelRiderParticipation_when_group_rider_selected_but_rider_id_missing', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_redirect_to_lesson_detail_when_group_rider_selected_but_rider_id_missing', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_type: 'group', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-1'
      )
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({ cancel_type: 'rider' }))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_notify_barn_managers_when_trainer_cancels', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: mockTrainerMembership.id, lesson_at: futureIso }))
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'manager-1', type: 'lesson_cancelled' }),
      expect.anything()
    )
  })

  it('should_notify_instructor_when_manager_cancels', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: futureIso }, [], 'instructor-1'))
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'instructor-1', type: 'lesson_cancelled' }),
      expect.anything()
    )
  })

  it('should_not_notify_instructor_when_instructor_user_id_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: null, lesson_at: futureIso }, [], null))
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('should_notify_first_enrolled_rider_with_linked_account', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: futureIso }, ['rider-1', 'rider-2'], 'instructor-1')
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rider-1' }), expect.anything())
  })

  it('should_notify_second_enrolled_rider_with_linked_account', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: futureIso }, ['rider-1', 'rider-2'], 'instructor-1')
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rider-2' }), expect.anything())
  })

  it('should_not_notify_riders_with_null_user_id', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetail({ instructor_id: null, lesson_at: futureIso }, [null], null)
    )
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('should_link_notification_to_the_lesson_detail_page', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ instructor_id: 'mem-instructor-1', lesson_at: futureIso }, [], 'instructor-1'))
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ link: '/barn/barn-slug/lessons/lesson-1' }),
      expect.anything()
    )
  })

  it('should_redirect_to_lesson_detail_after_successful_cancellation', async () => {
    await cancelLessonAction('barn-1', 'barn-slug', 'lesson-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })
})

function makeLessonDetailWithRiders(
  overrides: Partial<ReturnType<typeof createMockLesson>> & { payment_type?: PaymentType | null } = {},
  riders: { id: string; user_id: string | null; cancelled_at?: string | null }[] = [],
  instructorUserId: string | null = null
) {
  const { payment_type = null, ...lessonOverrides } = overrides
  return {
    ...createMockLesson(lessonOverrides),
    payment_type,
    instructor_name: null,
    instructor_user_id: instructorUserId,
    lesson_horses: [],
    lesson_riders: riders.map((r) => ({
      rider_notes: null,
      private_notes: null,
      cancellation_notes: null,
      cancelled_at: r.cancelled_at ?? null,
      barn_membership: { id: r.id, user_id: r.user_id, name: 'Rider' },
    })),
  }
}

const mockRiderMembership = createMockMembership({ role: 'rider' })

describe('cancelRiderParticipationAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getLessonById).mockReset()
    vi.mocked(cancelRiderParticipation).mockReset()
    vi.mocked(getActiveManagerUserIds).mockReset()
    vi.mocked(createNotification).mockReset()
    vi.mocked(createClient).mockReset()
    vi.mocked(redirect).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    vi.mocked(cancelRiderParticipation).mockResolvedValue(false)
    vi.mocked(getActiveManagerUserIds).mockResolvedValue([])
    vi.mocked(createNotification).mockResolvedValue(undefined)
    vi.mocked(createClient).mockResolvedValue({} as any)
  })

  it('should_redirect_to_detail_page_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_not_call_cancelRiderParticipation_when_lesson_not_found', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_redirect_without_calling_cancelRiderParticipation_when_whole_lesson_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { lesson_at: futureIso, cancelled_at: '2026-01-01T00:00:00Z' },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_redirect_when_trainer_is_not_the_instructor', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'other-trainer', lesson_at: futureIso, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_call_cancelRiderParticipation_when_trainer_cancels_own_lesson_rider', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: mockTrainerMembership.id, lesson_at: futureIso, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalled()
  })

  it('should_redirect_when_target_rider_not_found_in_lesson', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'nonexistent-rider', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_redirect_when_rider_tries_to_cancel_another_riders_participation', async () => {
    guardAs(mockRiderMembership)
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_call_cancelRiderParticipation_when_rider_cancels_own_participation', async () => {
    guardAs(mockRiderMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: futureIso, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalled()
  })

  it('should_call_cancelRiderParticipation_for_manager_regardless_of_instructor', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalled()
  })

  it('should_redirect_without_calling_cancelRiderParticipation_when_participation_already_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { lesson_at: futureIso, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1', cancelled_at: '2026-01-01T00:00:00Z' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_redirect_without_calling_cancelRiderParticipation_when_past_and_paid', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { lesson_at: pastIso, payment_type: 'cash', cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).not.toHaveBeenCalled()
  })

  it('should_allow_cancellation_of_future_paid_participation', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { lesson_at: futureIso, payment_type: 'cash', cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalled()
  })

  it('should_allow_cancellation_of_past_unpaid_participation', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { lesson_at: pastIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalled()
  })

  it('should_pass_is_late_false_when_cancel_type_is_instructor', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ cancel_type: 'instructor' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, false)
  })

  it('should_pass_is_late_true_when_cancel_type_is_rider_and_within_24_hours', async () => {
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: soonIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, true)
  })

  it('should_pass_is_late_false_when_cancel_type_is_rider_and_more_than_24_hours_out', async () => {
    const farIso = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: farIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ cancel_type: 'rider' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, false)
  })

  it('should_ignore_cancel_type_instructor_when_actor_role_is_rider', async () => {
    guardAs(mockRiderMembership)
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: soonIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ cancel_type: 'instructor' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, true)
  })

  it('should_default_to_rider_type_when_cancel_type_field_is_missing', async () => {
    const soonIso = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString()
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: soonIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, true)
  })

  it('should_notify_instructor_when_rider_self_cancels', async () => {
    // Regression coverage for #845: getLessonById used to resolve a null instructor_user_id
    // for a rider caller (nested barn_memberships embed blocked by RLS), which silently
    // dropped the instructor from resolveCancellationRecipients here. This action trusts
    // whatever getLessonById resolves — it has no embed-based lookup of its own — so a
    // non-null instructor_user_id (as getLessonById now correctly returns even for a rider
    // caller, see lessons.test.ts) is sufficient to prove the instructor gets notified.
    guardAs(mockRiderMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }],
        'instructor-1'
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'instructor-1', type: 'rider_participation_cancelled' }), expect.anything())
  })

  it('should_notify_managers_when_rider_self_cancels', async () => {
    guardAs(mockRiderMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'mem-instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }],
        'instructor-1'
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager-1', type: 'rider_participation_cancelled' }), expect.anything())
  })

  it('should_notify_managers_when_rider_self_cancels_and_instructor_id_is_null', async () => {
    guardAs(mockRiderMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: null, lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }]
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager-1', type: 'rider_participation_cancelled' }), expect.anything())
  })

  it('should_not_notify_a_second_recipient_when_instructor_id_is_null', async () => {
    guardAs(mockRiderMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: null, lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'user-1' }]
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('should_notify_affected_rider_when_trainer_cancels_on_behalf', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: mockTrainerMembership.id, lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rider-user-1', type: 'rider_participation_cancelled' }), expect.anything())
  })

  it('should_notify_managers_when_trainer_cancels_on_behalf', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: mockTrainerMembership.id, lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager-1', type: 'rider_participation_cancelled' }), expect.anything())
  })

  it('should_notify_affected_rider_when_manager_cancels_on_behalf', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rider-user-1' }), expect.anything())
  })

  it('should_not_notify_a_second_recipient_when_manager_cancels_on_behalf', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledTimes(1)
  })

  it('should_skip_rider_notification_when_affected_rider_user_id_is_null', async () => {
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: null }]
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).not.toHaveBeenCalled()
  })

  it('should_trim_and_pass_notes_when_provided', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ notes: '  called in sick  ' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', 'called in sick', expect.any(Boolean))
  })

  it('should_pass_null_notes_when_textarea_whitespace_only', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({ notes: '   ' }))
    expect(cancelRiderParticipation).toHaveBeenCalledWith('lesson-1', 'barn-1', 'rider-mem-1', null, expect.any(Boolean))
  })

  it('should_link_notification_to_the_lesson_detail_page', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ link: '/barn/barn-slug/lessons/lesson-1' }),
      expect.anything()
    )
  })

  it('should_redirect_to_detail_page_after_success', async () => {
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_not_send_lesson_cancelled_notification_when_no_cascade', async () => {
    vi.mocked(cancelRiderParticipation).mockResolvedValue(false)
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'lesson_cancelled' }), expect.anything())
  })

  it('should_send_lesson_cancelled_notification_to_instructor_when_cascade_occurs', async () => {
    vi.mocked(cancelRiderParticipation).mockResolvedValue(true)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-user-1'
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'instructor-user-1', type: 'lesson_cancelled' }),
      expect.anything()
    )
  })

  it('should_send_lesson_cancelled_notification_to_enrolled_riders_when_cascade_occurs', async () => {
    vi.mocked(cancelRiderParticipation).mockResolvedValue(true)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: 'instructor-1', lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }],
        'instructor-user-1'
      )
    )
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'rider-user-1', type: 'lesson_cancelled' }),
      expect.anything()
    )
  })

  it('should_send_lesson_cancelled_notification_to_managers_when_trainer_cascade_occurs', async () => {
    guardAs(mockTrainerMembership)
    vi.mocked(cancelRiderParticipation).mockResolvedValue(true)
    vi.mocked(getLessonById).mockResolvedValue(
      makeLessonDetailWithRiders(
        { instructor_id: mockTrainerMembership.id, lesson_at: futureIso, payment_type: null, cancelled_at: null },
        [{ id: 'rider-mem-1', user_id: 'rider-user-1' }]
      )
    )
    vi.mocked(getActiveManagerUserIds).mockResolvedValue(['manager-1'])
    await cancelRiderParticipationAction('barn-1', 'barn-slug', 'lesson-1', 'rider-mem-1', makeFormData({}))
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'manager-1', type: 'lesson_cancelled' }),
      expect.anything()
    )
  })
})
