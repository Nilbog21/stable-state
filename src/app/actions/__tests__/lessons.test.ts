import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockMembership } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  createLesson: vi.fn(),
  deleteLesson: vi.fn(),
  getLessonById: vi.fn(),
  updateLesson: vi.fn(),
}))

vi.mock('@/lib/db/lesson-participants', () => ({
  addHorseToLesson: vi.fn(),
  addRiderToLesson: vi.fn(),
  createLessonWithParticipants: vi.fn(),
  updateLessonWithParticipants: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getActiveTrainerMembershipsByBarn: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
  getHorsesByBarn: vi.fn(),
}))

vi.mock('@/lib/db/riders', () => ({
  createRider: vi.fn(),
  getRidersByBarn: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { deleteLesson, getLessonById, updateLesson } from '@/lib/db/lessons'
import { createLessonWithParticipants, updateLessonWithParticipants } from '@/lib/db/lesson-participants'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { createRider, getRidersByBarn } from '@/lib/db/riders'
import { redirect } from 'next/navigation'
import { submitLesson, deleteLessonAction, updateLessonAction, updatePaymentTypeAction } from '../lessons'

const mockLesson = createMockLesson({ fee: null, lesson_at: '2026-05-17T10:00', submitted_at: '2026-05-17T10:05:00Z' })
const mockTrainerMembership = createMockMembership({ created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })
describe('submitLesson', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    vi.mocked(createLessonWithParticipants).mockResolvedValue(mockLesson)
    vi.mocked(createRider).mockResolvedValue({} as any)
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'horse-2', barn_id: 'barn-1', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' },
    ])
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
  })

  it('should_return_error_when_no_horse_selected', async () => {
    const fd = makeFormData({ rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_no_rider_selected', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_create_lesson_with_instructor_set_to_current_user', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ barnId: 'barn-1', instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [3] })
    )
  })

  it('should_add_rider_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['rider-1'] })
    )
  })

  it('should_redirect_after_successful_submission', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_return_error_when_lesson_at_is_missing', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'date and time required' })
  })

  it('should_return_error_when_user_is_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: null },
          error: null,
        }),
      },
    } as any)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', created_at: '2026-01-01T00:00:00Z' }))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_createLessonWithParticipants_throws', async () => {
    vi.mocked(createLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to submit lesson' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_use_instructor_id_from_formData_when_user_is_a_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      createMockMembership({ id: 'mem-99', user_id: 'trainer-99', created_at: '2026-01-01T00:00:00Z' }),
    ])
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'trainer-99',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'trainer-99' })
    )
  })

  it('should_use_instructor_id_from_formData_when_user_is_a_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      createMockMembership({ id: 'mem-99', user_id: 'trainer-99', created_at: '2026-01-01T00:00:00Z' }),
    ])
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'trainer-99',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'trainer-99' })
    )
  })

  it('should_use_current_user_id_when_user_is_a_trainer', async () => {
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'trainer-99',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'user-1' })
    )
  })

  it('should_return_error_when_manager_submits_invalid_instructor_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'not-a-trainer',
    })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Invalid instructor' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_use_current_user_id_when_manager_omits_instructor_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      tier_name: 'Standard',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson_for_each_selected_horse', async () => {
    const fd = makeFormData({ horse_id: ['horse-1', 'horse-2'], rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1', 'horse-2'], exertionLevels: [3, 3] })
    )
  })

  it('should_create_new_horse_and_add_to_lesson_when_new_horse_name_is_provided', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Blaze')
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-new'], exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_when_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', 'exertion_horse-1': '5', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [5] })
    )
  })

  it('should_default_exertion_level_to_3_when_not_provided_in_form', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_for_newly_created_horse', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ exertionLevels: [4] })
    )
  })

  it('should_return_error_when_no_horse_ids_and_no_new_horse_name', async () => {
    const fd = makeFormData({ rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_non_manager_tries_to_create_new_horse', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' }))
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized to add horses' })
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_return_error_when_no_rider_selected_and_no_new_rider_name', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_return_error_when_both_rider_id_and_new_rider_name_are_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'select a rider or add a new one, not both' })
  })

  it('should_return_error_when_both_horse_id_and_new_horse_name_are_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'select a horse or add a new one, not both' })
  })

  it('should_create_new_rider_and_add_to_lesson_when_new_rider_name_is_provided', async () => {
    const newRider = { id: 'rider-new', barn_id: 'barn-1', name: 'Carol', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createRider).mockResolvedValue(newRider)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createRider).toHaveBeenCalledWith('barn-1', 'Carol')
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['rider-new'] })
    )
  })

  it('should_return_error_when_non_manager_tries_to_create_new_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockTrainerMembership, role: 'trainer' })
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized to add riders' })
    expect(createRider).not.toHaveBeenCalled()
  })

  it('should_return_error_when_horse_does_not_belong_to_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      { id: 'other-horse', barn_id: 'barn-1', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_does_not_belong_to_barn', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'other-rider', barn_id: 'barn-1', name: 'Other', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_multiple_rider_ids_for_group_lesson', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'rider-2', barn_id: 'barn-1', name: 'Bob', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['rider-1', 'rider-2'] })
    )
  })

  it('should_return_error_when_any_rider_does_not_belong_to_barn', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-unknown'], lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_riderIds_array_when_new_rider_created', async () => {
    const newRider = { id: 'rider-new', barn_id: 'barn-1', name: 'Carol', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createRider).mockResolvedValue(newRider)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['rider-new'] })
    )
  })

  it('should_return_error_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'normal lesson requires exactly 1 rider' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_group_lesson_has_fewer_than_two_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_group_lesson_uses_new_rider_name', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_does_not_belong_to_barn_on_new_horse_path', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'other-rider', barn_id: 'barn-1', name: 'Other', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_parsed_fee_to_createLessonWithParticipants_when_fee_is_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', fee: '75.50' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ fee: 75.5 })
    )
  })

  it('should_pass_lesson_type_to_createLessonWithParticipants', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
      { id: 'rider-2', barn_id: 'barn-1', name: 'Bob', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ lessonType: 'group' })
    )
  })

  it('should_default_lesson_type_to_normal_when_not_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ lessonType: 'normal' })
    )
  })

  it('should_return_error_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid lesson type' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_jumping_true_to_createLessonWithParticipants_when_jumping_form_field_is_true', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', jumping: 'true', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: true })
    )
  })

  it('should_pass_jumping_false_to_createLessonWithParticipants_when_jumping_form_field_is_absent', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: false })
    )
  })

  it('should_return_error_when_custom_tier_selected_with_no_fee', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom', is_custom: 'true' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'fee required for custom tier' })
    expect(createLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_pass_tier_name_to_createLessonWithParticipants', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ tierName: 'Standard' })
    )
  })

  it('should_treat_empty_string_rider_id_as_no_rider_when_new_rider_name_is_provided', async () => {
    const newRider = { id: 'rider-new', barn_id: 'barn-1', name: 'Carol', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createRider).mockResolvedValue(newRider)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: '', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00', tier_name: 'Standard' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).not.toEqual({ error: 'select a rider or add a new one, not both' })
    expect(createRider).toHaveBeenCalledWith('barn-1', 'Carol')
  })
})

describe('deleteLessonAction', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1' } },
          error: null,
        }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(deleteLesson).mockResolvedValue(undefined)
  })

  it('should_return_error_when_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      },
    } as any)
    const result = await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const result = await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const result = await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockTrainerMembership, role: 'rider' as const })
    const result = await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_call_deleteLesson_when_user_is_manager', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(deleteLesson).toHaveBeenCalledWith('lesson-1', 'barn-1')
  })

  it('should_redirect_after_deletion_when_manager', async () => {
    await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons')
  })

  it('should_return_error_when_deleteLesson_throws', async () => {
    vi.mocked(deleteLesson).mockRejectedValue(new Error('db error'))
    const result = await deleteLessonAction('barn-1', 'barn-slug', 'lesson-1')
    expect(result).toEqual({ error: 'Failed to delete lesson' })
    expect(redirect).not.toHaveBeenCalled()
  })
})

describe('updateLessonAction', () => {
  beforeEach(() => {
    vi.mocked(updateLessonWithParticipants).mockReset()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    vi.mocked(updateLessonWithParticipants).mockResolvedValue(mockLesson)
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'rider-1', barn_id: 'barn-1', name: 'Alice', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
  })

  it('should_return_error_when_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as any)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_not_call_updateLessonWithParticipants_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_not_call_updateLessonWithParticipants_when_user_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', created_at: '2026-01-01T00:00:00Z' }))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_not_call_updateLessonWithParticipants_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', created_at: '2026-01-01T00:00:00Z' }))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_horse_id_is_missing', async () => {
    const fd = makeFormData({ rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_horse_id_is_missing', async () => {
    const fd = makeFormData({ rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_id_is_missing_for_normal_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_not_call_updateLessonWithParticipants_when_rider_id_is_missing_for_normal_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_lesson_at_is_missing', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'date and time required' })
  })

  it('should_return_error_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'invalid lesson type' })
  })

  it('should_not_call_updateLessonWithParticipants_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'normal lesson requires exactly 1 rider' })
  })

  it('should_not_call_updateLessonWithParticipants_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: ['rider-1', 'rider-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_group_lesson_has_fewer_than_2_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
  })

  it('should_not_call_updateLessonWithParticipants_when_group_lesson_has_fewer_than_2_riders', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_horse_not_in_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      { id: 'other-horse', barn_id: 'barn-1', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_not_call_updateLessonWithParticipants_when_horse_not_in_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      { id: 'other-horse', barn_id: 'barn-1', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_rider_not_in_barn', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'other-rider', barn_id: 'barn-1', name: 'Other', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_not_call_updateLessonWithParticipants_when_rider_not_in_barn', async () => {
    vi.mocked(getRidersByBarn).mockResolvedValue([
      { id: 'other-rider', barn_id: 'barn-1', name: 'Other', user_id: null, created_at: '2026-01-01', updated_at: '2026-01-01' },
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_return_error_when_instructor_is_invalid', async () => {
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', instructor_id: 'not-a-trainer', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Invalid instructor' })
  })

  it('should_not_call_updateLessonWithParticipants_when_instructor_is_invalid', async () => {
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', instructor_id: 'not-a-trainer', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).not.toHaveBeenCalled()
  })

  it('should_call_updateLessonWithParticipants_with_correct_args', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', fee: '75', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({
        lessonId: 'lesson-1',
        barnId: 'barn-1',
        lessonAt: '2026-05-17T10:00',
        horseIds: ['horse-1'],
        riderIds: ['rider-1'],
        fee: 75,
      })
    )
  })

  it('should_redirect_to_lesson_detail_after_success', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(redirect).toHaveBeenCalledWith('/barn/barn-slug/lessons/lesson-1')
  })

  it('should_return_error_when_updateLessonWithParticipants_throws', async () => {
    vi.mocked(updateLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to update lesson' })
  })

  it('should_not_redirect_when_updateLessonWithParticipants_throws', async () => {
    vi.mocked(updateLessonWithParticipants).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_pass_payment_type_from_form', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', payment_type: 'venmo', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: 'venmo' })
    )
  })

  it('should_pass_null_payment_type_when_field_is_blank', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', payment_type: '', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ paymentType: null })
    )
  })

  it('should_pass_jumping_true_when_field_is_true', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', jumping: 'true', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: true })
    )
  })

  it('should_pass_jumping_false_when_field_is_absent', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ jumping: false })
    )
  })

  it('should_pass_null_fee_when_fee_field_is_empty', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ fee: null })
    )
  })

  it('should_use_valid_trainer_instructor_when_manager_selects_one', async () => {
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      createMockMembership({ id: 'mem-99', user_id: 'trainer-99', created_at: '2026-01-01T00:00:00Z' }),
    ])
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', instructor_id: 'trainer-99', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'trainer-99' })
    )
  })

  it('should_use_custom_tier_name_fallback_when_tier_name_not_in_form', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ tierName: 'Custom' })
    )
  })

  it('should_create_new_horse_when_new_horse_name_is_submitted', async () => {
    vi.mocked(createHorse).mockResolvedValue({ id: 'new-horse-1', barn_id: 'barn-1', name: 'Midnight', created_at: '', updated_at: '' })
    const fd = makeFormData({ new_horse_name: 'Midnight', new_horse_exertion_level: '3', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Midnight')
  })

  it('should_call_updateLessonWithParticipants_with_new_horse_id', async () => {
    vi.mocked(createHorse).mockResolvedValue({ id: 'new-horse-1', barn_id: 'barn-1', name: 'Midnight', created_at: '', updated_at: '' })
    const fd = makeFormData({ new_horse_name: 'Midnight', new_horse_exertion_level: '3', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['new-horse-1'] })
    )
  })

  it('should_not_call_createHorse_when_existing_horse_id_is_submitted', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createHorse).not.toHaveBeenCalled()
  })

  it('should_return_error_when_both_new_horse_name_and_existing_horse_id_are_submitted', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', new_horse_name: 'Midnight', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'select a horse or add a new one, not both' })
  })

  it('should_create_new_rider_when_new_rider_name_is_submitted', async () => {
    vi.mocked(createRider).mockResolvedValue({ id: 'new-rider-1', barn_id: 'barn-1', name: 'Charlie', user_id: null, created_at: '', updated_at: '' })
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Charlie', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createRider).toHaveBeenCalledWith('barn-1', 'Charlie')
  })

  it('should_call_updateLessonWithParticipants_with_new_rider_id', async () => {
    vi.mocked(createRider).mockResolvedValue({ id: 'new-rider-1', barn_id: 'barn-1', name: 'Charlie', user_id: null, created_at: '', updated_at: '' })
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Charlie', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(updateLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderIds: ['new-rider-1'] })
    )
  })

  it('should_not_call_createRider_when_existing_rider_id_is_submitted', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(createRider).not.toHaveBeenCalled()
  })

  it('should_return_error_when_both_new_rider_name_and_existing_rider_id_are_submitted', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', new_rider_name: 'Charlie', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).toEqual({ error: 'select a rider or add a new one, not both' })
  })

  it('should_treat_empty_string_rider_id_as_no_rider_when_new_rider_name_is_provided', async () => {
    vi.mocked(createRider).mockResolvedValue({ id: 'new-rider-1', barn_id: 'barn-1', name: 'Charlie', user_id: null, created_at: '', updated_at: '' })
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: '', new_rider_name: 'Charlie', lesson_at: '2026-05-17T10:00', tier_name: 'Custom' })
    const result = await updateLessonAction('lesson-1', 'barn-slug', 'barn-1', { error: null }, fd)
    expect(result).not.toEqual({ error: 'select a rider or add a new one, not both' })
    expect(createRider).toHaveBeenCalledWith('barn-1', 'Charlie')
  })
})

describe('updatePaymentTypeAction', () => {
  beforeEach(() => {
    vi.mocked(getLessonById).mockReset()
    vi.mocked(updateLesson).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(createClient).mockReset()
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
    } as any)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(updateLesson).mockResolvedValue(mockLesson)
  })

  it('should_return_error_when_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as any)
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'not authenticated' })
  })

  it('should_return_error_when_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_user_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider' }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_trainer_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'trainer', status: 'pending' }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_error_when_trainer_lesson_not_found', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(null)
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'lesson not found' })
  })

  it('should_return_error_when_trainer_is_not_instructor', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLesson({ instructor_id: 'other-trainer' }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: 'not authorized' })
  })

  it('should_return_no_error_when_trainer_is_instructor', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLesson({ instructor_id: 'user-1' }))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(result).toEqual({ error: null })
  })

  it('should_call_updateLesson_with_payment_type_when_trainer_is_instructor', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getLessonById).mockResolvedValue(createMockLesson({ instructor_id: 'user-1' }))
    await updatePaymentTypeAction('lesson-1', 'barn-1', 'venmo')
    expect(updateLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', { payment_type: 'venmo' })
  })

  it('should_return_no_error_when_user_is_manager', async () => {
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'cash')
    expect(result).toEqual({ error: null })
  })

  it('should_not_call_getLessonById_when_user_is_manager', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-1', 'cash')
    expect(getLessonById).not.toHaveBeenCalled()
  })

  it('should_call_updateLesson_with_payment_type_when_user_is_manager', async () => {
    await updatePaymentTypeAction('lesson-1', 'barn-1', 'cash')
    expect(updateLesson).toHaveBeenCalledWith('lesson-1', 'barn-1', { payment_type: 'cash' })
  })

  it('should_return_error_when_update_throws', async () => {
    vi.mocked(updateLesson).mockRejectedValue(new Error('db error'))
    const result = await updatePaymentTypeAction('lesson-1', 'barn-1', 'cash')
    expect(result).toEqual({ error: 'Failed to update payment type' })
  })
})
