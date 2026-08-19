import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse, createMockLesson, createMockMembership, makeLessonDetail } from '@/test/fixtures'
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
import { getLessonById, updateLesson } from '@/lib/db/lessons'
import { updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes } from '@/lib/db/lesson-participants'
import { getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { updateLessonAction } from '../lessons'

const mockLesson = createMockLesson({ fee: 100, lesson_at: '2026-05-17T10:00', submitted_at: '2026-05-17T10:05:00Z' })
const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })

// makeLessonDetail always returns an empty lesson_horses, so the attached-horse cases graft the
// junction row on. Cancelled, matching the beforeEach default, so these stay about horses only.
function lessonWithAttachedHorse(horseId: string) {
  return {
    ...makeLessonDetail({ cancelled_at: '2026-05-01T00:00:00Z' }),
    lesson_horses: [{ horse_notes: null, horses: { id: horseId, name: 'Willow' } }],
  }
}

describe('updateLessonAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateLessonWithParticipants).mockReset()
    vi.mocked(updateLessonHorseNotes).mockReset()
    vi.mocked(updateLessonRiderNotes).mockReset()
    vi.mocked(updateLesson).mockReset()
    vi.mocked(getInstructorsByBarn).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(createHorse).mockReset()
    vi.mocked(redirect).mockReset()
    vi.mocked(getLessonById).mockReset()
    guardAs(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    vi.mocked(updateLessonWithParticipants).mockResolvedValue(mockLesson)
    vi.mocked(updateLessonHorseNotes).mockResolvedValue({} as any)
    vi.mocked(updateLessonRiderNotes).mockResolvedValue({} as any)
    vi.mocked(updateLesson).mockResolvedValue(mockLesson)
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ cancelled_at: '2026-05-01T00:00:00Z' }))
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
    ])
  })

  it('should_return_error_when_horse_id_is_missing', async () => {
    const fd = makeFormData({ fee: '50', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_horse_id_is_missing', async () => {
    const fd = makeFormData({ fee: '50', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  // #1276: the edit page re-injects the lesson's deactivated horses into the form as checked,
  // enabled options, so the parser has to accept back what the form handed out. Only the ids
  // this lesson already carries are widened — a deactivated horse it never had is still rejected.
  it('should_save_a_lesson_whose_attached_horse_is_no_longer_active', async () => {
    vi.mocked(getLessonById).mockResolvedValue(lessonWithAttachedHorse('inactive-horse'))
    const fd = makeFormData({ fee: '50', horse_id: 'inactive-horse', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(vi.mocked(updateLessonWithParticipants).mock.calls[0][0].horseIds).toEqual(['inactive-horse'])
  })

  it('should_return_error_when_an_inactive_horse_is_not_attached_to_the_lesson', async () => {
    vi.mocked(getLessonById).mockResolvedValue(lessonWithAttachedHorse('inactive-horse'))
    const fd = makeFormData({ fee: '50', horse_id: 'stranger-horse', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  // A junction row whose horse the caller can't read comes back with `horses: null`; the widened
  // id set has to skip it rather than push an undefined into itself.
  it('should_return_error_when_the_lessons_only_junction_row_has_no_readable_horse', async () => {
    vi.mocked(getLessonById).mockResolvedValue({
      ...makeLessonDetail({ cancelled_at: '2026-05-01T00:00:00Z' }),
      lesson_horses: [{ horse_notes: null, horses: null }],
    })
    const fd = makeFormData({ fee: '50', horse_id: 'inactive-horse', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_return_error_when_the_lesson_being_edited_no_longer_exists', async () => {
    vi.mocked(getLessonById).mockResolvedValue(null)
    const fd = makeFormData({ fee: '50', horse_id: 'inactive-horse', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_return_error_when_rider_id_is_missing_for_normal_lesson', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_rider_id_is_missing_for_normal_lesson', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_lesson_at_is_missing', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'date and time required' })
  })

  it('should_return_error_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid lesson type' })
  })

  it('should_not_call_updateLessonWithParticipants_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'normal lesson requires exactly 1 rider' })
  })

  it('should_not_call_updateLessonWithParticipants_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_group_lesson_has_fewer_than_2_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
  })

  it('should_return_rider_required_for_group_lesson_with_zero_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_group_lesson_has_fewer_than_2_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_horse_not_in_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'other-horse', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_not_call_updateLessonWithParticipants_when_horse_not_in_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'other-horse', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_not_in_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_not_call_updateLessonWithParticipants_when_rider_not_in_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_instructor_is_invalid', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'not-a-trainer', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Invalid instructor' })
  })

  it('should_not_call_updateLessonWithParticipants_when_instructor_is_invalid', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'not-a-trainer', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_call_updateLessonWithParticipants_with_correct_args', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', fee: '75', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
        barnId: 'barn-1',
        lessonAt: '2026-05-17T10:00',
        horseIds: ['horse-1'],
        riderIds: ['mem-1'],
        fee: 75,
      })
    )
  })

  it('should_redirect_to_lesson_detail_after_success', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_return_error_when_updateLessonWithParticipants_throws', async () => {
    vi.mocked(updateLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to update lesson' })
  })

  it('should_not_redirect_when_updateLessonWithParticipants_throws', async () => {
    vi.mocked(updateLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_pass_payment_type_from_form', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', payment_type: 'venmo', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: 'venmo' })
    )
  })

  it('should_pass_null_payment_type_when_field_is_blank', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', payment_type: '', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: null })
    )
  })

  it('should_pass_jumping_true_when_field_is_true', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', jumping: 'true', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: true })
    )
  })

  it('should_pass_jumping_false_when_field_is_absent', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: false })
    )
  })

  it('should_return_error_when_fee_field_is_empty', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_fee_field_is_empty', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_accept_zero_fee_on_update', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', fee: '0' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ fee: 0 })
    )
  })

  it('should_return_error_when_fee_is_non_numeric_string_on_update', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', fee: 'abc' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_fee_is_non_numeric_string', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', fee: 'abc' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_use_valid_instructor_when_manager_selects_one', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([{ membershipId: 'mem-trainer-99', userId: 'user-99', name: 'Bob Trainer' }])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'mem-trainer-99', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'mem-trainer-99' })
    )
  })

  it('should_use_custom_tier_name_fallback_when_tier_name_not_in_form', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ tierName: 'Custom' })
    )
  })

  it('should_not_call_createHorse_when_a_manager_submits_a_new_horse_name', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', new_horse_name: 'Midnight', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_call_updateLessonWithParticipants_when_trainer_submits_valid_lesson', async () => {
    guardAs(mockTrainerMembership)
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalled()
  })

  it('should_ignore_formData_instructor_id_and_use_own_membership_id_when_trainer_updates_lesson', async () => {
    guardAs(mockTrainerMembership)
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'other-trainer', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: mockTrainerMembership.id })
    )
  })

  it('should_return_horse_required_when_a_trainer_submits_only_a_new_horse_name', async () => {
    guardAs(mockTrainerMembership)
    const fd = makeFormData({ fee: '50', new_horse_name: 'Midnight', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_save_horse_notes_when_noteHorseId_present', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-1')
    fd.set('horse_notes_horse-1', 'watch left lead')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', 'watch left lead')
  })

  it('should_pass_null_for_empty_horse_notes', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-1')
    fd.set('horse_notes_horse-1', '')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', null)
  })

  it('should_save_rider_notes_when_noteRiderId_present', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteRiderId', 'mem-1')
    fd.set('rider_notes_mem-1', 'good position')
    fd.set('private_notes_mem-1', 'private info')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'mem-1', 'barn-1', 'good position', 'private info')
  })

  it('should_pass_null_for_empty_rider_and_private_notes', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteRiderId', 'mem-1')
    fd.set('rider_notes_mem-1', '')
    fd.set('private_notes_mem-1', '')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'mem-1', 'barn-1', null, null)
  })

  it('should_not_call_updateLessonHorseNotes_when_no_note_ids_present', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonHorseNotes).not.toHaveBeenCalled()
  })

  it('should_not_call_updateLessonRiderNotes_when_no_note_ids_present', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonRiderNotes).not.toHaveBeenCalled()
  })

  it('should_skip_horse_notes_for_removed_horse', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-2')
    fd.set('horse_notes_horse-2', 'stale notes')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonHorseNotes).not.toHaveBeenCalled()
  })

  it('should_skip_rider_notes_for_removed_rider', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteRiderId', 'mem-2')
    fd.set('rider_notes_mem-2', 'stale notes')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonRiderNotes).not.toHaveBeenCalled()
  })

  it('should_save_cancellation_notes_when_field_present', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.set('cancellation_notes', 'weather')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', { cancellation_notes: 'weather' })
  })

  it('should_pass_null_for_blank_cancellation_notes', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.set('cancellation_notes', '   ')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', { cancellation_notes: null })
  })

  it('should_not_call_updateLesson_for_cancellation_notes_when_field_absent', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLesson).not.toHaveBeenCalled()
  })

  it('should_return_error_when_saving_cancellation_notes_on_a_lesson_that_is_not_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ cancelled_at: null }))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.set('cancellation_notes', 'weather')
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'lesson is not cancelled' })
  })

  it('should_not_call_updateLesson_for_cancellation_notes_when_lesson_is_not_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ cancelled_at: null }))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.set('cancellation_notes', 'weather')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLesson).not.toHaveBeenCalled()
  })

  it('should_not_call_updateLessonWithParticipants_when_lesson_is_not_cancelled', async () => {
    vi.mocked(getLessonById).mockResolvedValue(makeLessonDetail({ cancelled_at: null }))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.set('cancellation_notes', 'weather')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_notes_phase_fails', async () => {
    vi.mocked(updateLessonHorseNotes).mockRejectedValue(new Error('notes db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-1')
    fd.set('horse_notes_horse-1', 'watch left lead')
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Lesson updated, but notes could not be saved' })
  })

  it('should_not_redirect_when_notes_phase_fails', async () => {
    vi.mocked(updateLessonHorseNotes).mockRejectedValue(new Error('notes db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-1')
    fd.set('horse_notes_horse-1', 'watch left lead')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_log_the_underlying_error_when_participants_phase_fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(updateLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to update lesson:', 'db error')
    consoleSpy.mockRestore()
  })

  it('should_log_the_underlying_error_when_notes_phase_fails', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(updateLessonHorseNotes).mockRejectedValue(new Error('notes db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    fd.append('noteHorseId', 'horse-1')
    fd.set('horse_notes_horse-1', 'watch left lead')
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(consoleSpy).toHaveBeenCalledWith('Failed to save lesson notes:', 'notes db error')
    consoleSpy.mockRestore()
  })

})
