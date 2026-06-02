import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockLesson, createMockMembership } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  createLesson: vi.fn(),
  addHorseToLesson: vi.fn(),
  addRiderToLesson: vi.fn(),
  deleteLesson: vi.fn(),
  createLessonWithParticipants: vi.fn(),
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
import { createLessonWithParticipants, deleteLesson } from '@/lib/db/lessons'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { createHorse, getHorsesByBarn } from '@/lib/db/horses'
import { createRider, getRidersByBarn } from '@/lib/db/riders'
import { redirect } from 'next/navigation'
import { submitLesson, deleteLessonAction } from '../lessons'

const mockLesson = createMockLesson({ fee: null, lesson_at: '2026-05-17T10:00', submitted_at: '2026-05-17T10:05:00Z' })
const mockTrainerMembership = createMockMembership({ created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })
const mockAdminMembership = createMockMembership({ role: 'admin', created_at: '2026-01-01T00:00:00Z' })

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
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ barnId: 'barn-1', instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [3] })
    )
  })

  it('should_add_rider_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderId: 'rider-1' })
    )
  })

  it('should_redirect_after_successful_submission', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
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
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
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
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'trainer-99' })
    )
  })

  it('should_use_instructor_id_from_formData_when_user_is_an_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockAdminMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      createMockMembership({ id: 'mem-99', user_id: 'trainer-99', created_at: '2026-01-01T00:00:00Z' }),
    ])
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'trainer-99',
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
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson_for_each_selected_horse', async () => {
    const fd = makeFormData({ horse_id: ['horse-1', 'horse-2'], rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1', 'horse-2'], exertionLevels: [3, 3] })
    )
  })

  it('should_create_new_horse_and_add_to_lesson_when_new_horse_name_is_provided', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Blaze')
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-new'], exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_when_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', 'exertion_horse-1': '5', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ horseIds: ['horse-1'], exertionLevels: [5] })
    )
  })

  it('should_default_exertion_level_to_3_when_not_provided_in_form', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ exertionLevels: [3] })
    )
  })

  it('should_pass_exertion_level_for_newly_created_horse', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
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
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
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
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createRider).toHaveBeenCalledWith('barn-1', 'Carol')
    expect(createLessonWithParticipants).toHaveBeenCalledWith(
      expect.objectContaining({ riderId: 'rider-new' })
    )
  })

  it('should_return_error_when_non_manager_tries_to_create_new_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockTrainerMembership, role: 'trainer' })
    const fd = makeFormData({ horse_id: 'horse-1', new_rider_name: 'Carol', lesson_at: '2026-05-17T10:00' })
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

  it('should_call_deleteLesson_when_user_is_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockManagerMembership, role: 'admin' as const })
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
