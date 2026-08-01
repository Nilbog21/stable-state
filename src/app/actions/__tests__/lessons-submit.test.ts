import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockHorse, createMockLesson, createMockMembership } from '@/test/fixtures'
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
import { createLessonWithParticipants } from '@/lib/db/lesson-participants'
import { createLessonSeries } from '@/lib/db/lesson-series'
import { getInstructorsByBarn, getActiveMembersWithProfiles, getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getNearbyInstructorMembershipIds } from '@/lib/db/schedule'
import { createNotification, getUnreadNotificationCount } from '@/lib/db/notifications'
import { createClient } from '@/lib/supabase/server'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { submitLesson } from '../lessons'

const mockBarn = createMockBarn()
const mockLesson = createMockLesson({ fee: 100, lesson_at: '2026-05-17T10:00', submitted_at: '2026-05-17T10:05:00Z' })
const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })

describe('submitLesson', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getInstructorsByBarn).mockReset()
    vi.mocked(createLessonWithParticipants).mockReset()
    vi.mocked(createLessonSeries).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(getNearbyInstructorMembershipIds).mockReset()
    vi.mocked(getMembershipByIdForBarn).mockReset()
    vi.mocked(createNotification).mockReset()
    vi.mocked(getUnreadNotificationCount).mockReset()
    vi.mocked(createClient).mockReset()
    guardAs(mockTrainerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    vi.mocked(createLessonWithParticipants).mockResolvedValue(mockLesson)
    vi.mocked(createLessonSeries).mockResolvedValue(mockLesson)
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
      createMockHorse({ id: 'horse-2', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
    ])
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
    ])
    vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue([])
    vi.mocked(getMembershipByIdForBarn).mockResolvedValue(null)
    vi.mocked(createNotification).mockResolvedValue(undefined)
    vi.mocked(getUnreadNotificationCount).mockResolvedValue(0)
    vi.mocked(createClient).mockResolvedValue({} as any)
  })

  it('should_return_error_when_no_horse_selected', async () => {
    const fd = makeFormData({ fee: '50', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_no_rider_selected', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_create_lesson_with_instructor_set_to_callers_own_membership_id', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ barnId: 'barn-1', instructorId: mockTrainerMembership.id })
    )
  })

  it('should_add_horse_to_lesson', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [3] })
    )
  })

  it('should_add_rider_to_lesson', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['mem-1'] })
    )
  })

  it('should_redirect_after_successful_submission', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_return_error_when_lesson_at_is_missing', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'date and time required' })
  })

  it('should_return_error_when_createLessonWithParticipants_throws', async () => {
    vi.mocked(createLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to submit lesson' })
  })

  it('should_not_redirect_when_createLessonWithParticipants_throws', async () => {
    vi.mocked(createLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_call_createLessonSeries_with_correct_params_when_is_recurring_true', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'true' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonSeries).toHaveBeenCalledWith(
      expect.objectContaining({ barnId: 'barn-1', instructorId: mockTrainerMembership.id, horseIds: ['horse-1'], riderIds: ['mem-1'] })
    )
  })

  it('should_not_call_createLessonWithParticipants_when_is_recurring_true', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'true' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_call_createLessonWithParticipants_when_is_recurring_is_absent', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalled()
  })

  it('should_not_call_createLessonSeries_when_is_recurring_is_absent', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonSeries).not.toHaveBeenCalled()
  })

  it('should_call_createLessonWithParticipants_when_is_recurring_false', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'false' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalled()
  })

  it('should_not_call_createLessonSeries_when_is_recurring_false', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'false' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonSeries).not.toHaveBeenCalled()
  })

  it('should_redirect_after_successful_recurring_submission', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'true' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_return_error_when_createLessonSeries_throws', async () => {
    vi.mocked(createLessonSeries).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'true' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to submit lesson' })
  })

  it('should_use_instructor_id_from_formData_when_user_is_a_manager', async () => {
    guardAs(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([{ membershipId: 'mem-trainer-99', userId: 'user-99', name: 'Bob Trainer' }])
    const fd = makeFormData({ fee: '50',
      horse_id: 'horse-1',
      rider_id: 'mem-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'mem-trainer-99',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'mem-trainer-99' })
    )
  })

  it('should_ignore_formData_instructor_id_and_use_own_membership_id_when_user_is_a_trainer', async () => {
    const fd = makeFormData({ fee: '50',
      horse_id: 'horse-1',
      rider_id: 'mem-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'mem-trainer-99',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: mockTrainerMembership.id })
    )
  })

  it('should_return_error_when_manager_submits_invalid_instructor_id', async () => {
    guardAs(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    const fd = makeFormData({ fee: '50',
      horse_id: 'horse-1',
      rider_id: 'mem-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'not-a-trainer',
    })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Invalid instructor' })
  })

  it('should_not_call_createLessonWithParticipants_when_instructor_is_invalid', async () => {
    guardAs(mockManagerMembership)
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    const fd = makeFormData({ fee: '50',
      horse_id: 'horse-1',
      rider_id: 'mem-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'not-a-trainer',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_use_own_membership_id_when_manager_omits_instructor_id', async () => {
    guardAs(mockManagerMembership)
    const fd = makeFormData({ fee: '50',
      horse_id: 'horse-1',
      rider_id: 'mem-1',
      lesson_at: '2026-05-17T10:00',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: mockManagerMembership.id })
    )
  })

  it('should_add_horse_to_lesson_for_each_selected_horse', async () => {
    const fd = makeFormData({ fee: '50', horse_id: ['horse-1', 'horse-2'], rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1', 'horse-2'], exertionLevels: [3, 3] })
    )
  })

  it('should_create_new_horse_and_add_to_lesson_when_new_horse_name_is_provided', async () => {
    const newHorse = createMockHorse({ id: 'horse-new', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' })
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    guardAs(mockManagerMembership)
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Blaze', mockManagerMembership.id)
  })

  it('should_include_new_horse_id_in_lesson_participants', async () => {
    const newHorse = createMockHorse({ id: 'horse-new', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' })
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    guardAs(mockManagerMembership)
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-new'], exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_when_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', 'exertion_horse-1': '5', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [5] })
    )
  })

  it('should_default_exertion_level_to_3_when_not_provided_in_form', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_for_newly_created_horse', async () => {
    const newHorse = createMockHorse({ id: 'horse-new', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' })
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    guardAs(mockManagerMembership)
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ exertionLevels: [4] })
    )
  })

  it('should_return_error_when_no_horse_ids_and_no_new_horse_name', async () => {
    const fd = makeFormData({ fee: '50', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_non_manager_tries_to_create_new_horse', async () => {
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized to add horses' })
  })

  it('should_not_call_createHorse_when_trainer_submits_new_horse', async () => {
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_return_error_when_no_rider_selected', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_return_error_when_both_horse_id_and_new_horse_name_are_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'select a horse or add a new one, not both' })
  })

  it('should_return_error_when_horse_does_not_belong_to_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'other-horse', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_not_call_createLessonWithParticipants_when_horse_not_in_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'other-horse', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_does_not_belong_to_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_not_call_createLessonWithParticipants_when_rider_not_in_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_multiple_rider_ids_for_group_lesson', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
      { membershipId: 'mem-2', userId: 'user-2', name: 'Bob', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['mem-1', 'mem-2'] })
    )
  })

  it('should_return_error_when_any_rider_does_not_belong_to_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-unknown'], lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_not_call_createLessonWithParticipants_when_unknown_rider_in_group', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-unknown'], lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'normal lesson requires exactly 1 rider' })
  })

  it('should_not_call_createLessonWithParticipants_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_group_lesson_has_fewer_than_two_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
  })

  it('should_not_call_createLessonWithParticipants_when_group_lesson_has_fewer_than_two_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_does_not_belong_to_barn_on_new_horse_path', async () => {
    guardAs(mockManagerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_not_call_createLessonWithParticipants_when_rider_not_in_barn_on_new_horse_path', async () => {
    guardAs(mockManagerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_parsed_fee_to_createLessonWithParticipants_when_fee_is_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', fee: '75.50' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ fee: 75.5 })
    )
  })

  it('should_pass_lesson_type_to_createLessonWithParticipants', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
      { membershipId: 'mem-2', userId: 'user-2', name: 'Bob', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ lessonType: 'group' })
    )
  })

  it('should_default_lesson_type_to_normal_when_not_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ lessonType: 'normal' })
    )
  })

  it('should_return_error_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid lesson type' })
  })

  it('should_not_call_createLessonWithParticipants_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_jumping_true_to_createLessonWithParticipants_when_jumping_form_field_is_true', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', jumping: 'true', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: true })
    )
  })

  it('should_pass_jumping_false_to_createLessonWithParticipants_when_jumping_form_field_is_absent', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: false })
    )
  })

  it('should_return_error_when_custom_tier_selected_with_no_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', is_custom: 'true' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_not_call_createLessonWithParticipants_when_custom_tier_has_no_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', is_custom: 'true' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_named_tier_selected_with_no_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_not_call_createLessonWithParticipants_when_named_tier_has_no_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_accept_zero_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', fee: '0' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ fee: 0 })
    )
  })

  it('should_return_error_when_fee_is_non_numeric_string', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', fee: 'abc' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_not_call_createLessonWithParticipants_when_fee_is_non_numeric_string', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', fee: 'abc' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_tier_name_to_createLessonWithParticipants', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ tierName: 'Standard' })
    )
  })

  it('should_pass_payment_type_to_createLessonWithParticipants_when_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', payment_type: 'venmo' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: 'venmo' })
    )
  })

  it('should_pass_null_payment_type_to_createLessonWithParticipants_when_not_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: null })
    )
  })

  describe('nearby-instructor notification', () => {
    const fd = () => makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })

    it('should_look_up_nearby_instructors_using_the_created_lessons_data', async () => {
      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(getNearbyInstructorMembershipIds).toHaveBeenCalledWith(
        'barn-1', mockLesson.id, mockLesson.lesson_at, mockLesson.instructor_id, mockBarn.schedule_buffer_minutes
      )
    })

    it('should_not_look_up_nearby_instructors_when_lesson_creation_throws', async () => {
      vi.mocked(createLessonWithParticipants).mockRejectedValue(new Error('db error'))

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(getNearbyInstructorMembershipIds).not.toHaveBeenCalled()
    })

    it('should_not_notify_when_no_nearby_instructors_are_found', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue([])

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(createNotification).not.toHaveBeenCalled()
    })

    it('should_notify_the_resolved_user_id_of_a_nearby_instructor', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue(['mem-other'])
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(createMockMembership({ id: 'mem-other', user_id: 'user-other' }))

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-other', barnId: 'barn-1', type: 'instructor_lesson_nearby' }),
        expect.anything()
      )
    })

    it('should_not_notify_when_the_nearby_instructor_membership_has_no_user_id', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue(['mem-other'])
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(null)

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(createNotification).not.toHaveBeenCalled()
    })

    it('should_still_redirect_when_the_notification_lookup_throws', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockRejectedValue(new Error('lookup failed'))

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
    })

    it('should_add_1_to_the_recipients_existing_unread_count_instead_of_overwriting_it', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue(['mem-other'])
      vi.mocked(getMembershipByIdForBarn).mockResolvedValue(createMockMembership({ id: 'mem-other', user_id: 'user-other' }))
      vi.mocked(getUnreadNotificationCount).mockResolvedValue(2)

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ title: '3 new lessons scheduled nearby' }),
        expect.anything()
      )
    })

    it('should_still_notify_a_later_recipient_when_an_earlier_recipients_membership_lookup_throws', async () => {
      vi.mocked(getNearbyInstructorMembershipIds).mockResolvedValue(['mem-broken', 'mem-other'])
      vi.mocked(getMembershipByIdForBarn).mockImplementation(async (id: string) => {
        if (id === 'mem-broken') throw new Error('db error')
        return createMockMembership({ id: 'mem-other', user_id: 'user-other' })
      })

      await submitLesson('barn-1', 'barn-slug', { error: null }, fd())

      expect(createNotification).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-other' }),
        expect.anything()
      )
    })
  })
})
