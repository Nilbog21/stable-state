import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockHorse, createMockLesson, createMockLessonDetail, createMockLessonSeries, createMockMembership, makeLessonDetail } from '@/test/fixtures'
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
}))

vi.mock('@/lib/db/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/db/notifications')>()),
  createNotification: vi.fn(),
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
import { createLessonWithParticipants, updateLessonWithParticipants, updateLessonHorseNotes, updateLessonRiderNotes, updateCancellationFeePaymentType } from '@/lib/db/lesson-participants'
import { createLessonSeries, getSeriesById, stopLessonSeries } from '@/lib/db/lesson-series'
import { getInstructorsByBarn, getActiveMembersWithProfiles, getMembershipByIdForBarn } from '@/lib/db/barn-memberships'
import { getNearbyInstructorMembershipIds } from '@/lib/db/schedule'
import { createNotification } from '@/lib/db/notifications'
import { createClient } from '@/lib/supabase/server'
import { createHorse, getHorsesByBarn, getHorsesByIds, getHorseProjectedExhaustion, resolveExhaustionThresholds } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { submitLesson, deleteLessonAction, updateLessonAction, updatePaymentTypeAction, updateCancellationFeePaymentTypeAction, stopLessonSeriesAction, getProjectedExhaustionForBarn } from '../lessons'

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

  it('should_forward_instructor_cut_from_form_to_createLessonWithParticipants', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', instructor_cut: '30' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorCut: 30 })
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

  it('should_forward_instructor_cut_from_form_to_createLessonSeries', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', is_recurring: 'true', instructor_cut: '30' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonSeries).toHaveBeenCalledWith(
      expect.objectContaining({ instructorCut: 30 })
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
  })
})

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

  it('should_forward_instructor_cut_from_form_to_updateLessonWithParticipants', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', fee: '75', tier_name: 'Custom', instructor_cut: '30' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorCut: 30 })
    )
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

  it('should_create_new_horse_when_new_horse_name_is_submitted', async () => {
    vi.mocked(createHorse).mockResolvedValue(createMockHorse({ id: 'new-horse-1', name: 'Midnight', created_at: '', updated_at: '' }))
    const fd = makeFormData({ fee: '50', new_horse_name: 'Midnight', new_horse_exertion_level: '3', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Midnight', mockManagerMembership.id)
  })

  it('should_call_updateLessonWithParticipants_with_new_horse_id', async () => {
    vi.mocked(createHorse).mockResolvedValue(createMockHorse({ id: 'new-horse-1', name: 'Midnight', created_at: '', updated_at: '' }))
    const fd = makeFormData({ fee: '50', new_horse_name: 'Midnight', new_horse_exertion_level: '3', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['new-horse-1'] })
    )
  })

  it('should_not_call_createHorse_when_existing_horse_id_is_submitted', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_return_error_when_both_new_horse_name_and_existing_horse_id_are_submitted', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', new_horse_name: 'Midnight', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'select a horse or add a new one, not both' })
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

  it('should_return_error_when_trainer_tries_to_add_new_horse', async () => {
    guardAs(mockTrainerMembership)
    const fd = makeFormData({ fee: '50', new_horse_name: 'Midnight', new_horse_exertion_level: '3', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized to add horses' })
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
