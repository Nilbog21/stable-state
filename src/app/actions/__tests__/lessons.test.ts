import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  createLesson: vi.fn(),
  addHorseToLesson: vi.fn(),
  addRiderToLesson: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getActiveTrainerMembershipsByBarn: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  createHorse: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createLesson, addHorseToLesson, addRiderToLesson } from '@/lib/db/lessons'
import { getUserMembership, getActiveTrainerMembershipsByBarn } from '@/lib/db/barn-memberships'
import { createHorse } from '@/lib/db/horses'
import { redirect } from 'next/navigation'
import { submitLesson } from '../lessons'

const mockLesson = {
  id: 'lesson-1',
  barn_id: 'barn-1',
  instructor_id: 'user-1',
  fee: null,
  lesson_at: '2026-05-17T10:00',
  submitted_at: '2026-05-17T10:05:00Z',
}

const mockTrainerMembership = {
  id: 'mem-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
}

const mockManagerMembership = {
  ...mockTrainerMembership,
  role: 'manager' as const,
}

function makeFormData(fields: Record<string, string | string[]>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) {
      for (const val of v) fd.append(k, val)
    } else {
      fd.append(k, v)
    }
  }
  return fd
}

describe('submitLesson', () => {
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
    vi.mocked(getUserMembership).mockResolvedValue(mockTrainerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([])
    vi.mocked(createLesson).mockResolvedValue(mockLesson)
    vi.mocked(addHorseToLesson).mockResolvedValue({} as any)
    vi.mocked(addRiderToLesson).mockResolvedValue({} as any)
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
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({ barnId: 'barn-1', instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', 3)
  })

  it('should_add_rider_to_lesson', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addRiderToLesson).toHaveBeenCalledWith('lesson-1', 'rider-1', 'barn-1')
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

  it('should_return_error_when_createLesson_throws', async () => {
    vi.mocked(createLesson).mockRejectedValue(new Error('db error'))
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'Failed to submit lesson' })
    expect(redirect).not.toHaveBeenCalled()
  })

  it('should_use_instructor_id_from_formData_when_user_is_a_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getActiveTrainerMembershipsByBarn).mockResolvedValue([
      { ...mockTrainerMembership, id: 'mem-99', user_id: 'trainer-99' },
    ])
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
      instructor_id: 'trainer-99',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLesson).toHaveBeenCalledWith(
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
    expect(createLesson).toHaveBeenCalledWith(
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
    expect(createLesson).not.toHaveBeenCalled()
  })

  it('should_use_current_user_id_when_manager_omits_instructor_id', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({
      horse_id: 'horse-1',
      rider_id: 'rider-1',
      lesson_at: '2026-05-17T10:00',
    })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createLesson).toHaveBeenCalledWith(
      expect.objectContaining({ instructorId: 'user-1' })
    )
  })

  it('should_add_horse_to_lesson_for_each_selected_horse', async () => {
    const fd = makeFormData({ horse_id: ['horse-1', 'horse-2'], rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', 3)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-2', 'barn-1', 3)
    expect(addHorseToLesson).toHaveBeenCalledTimes(2)
  })

  it('should_create_new_horse_and_add_to_lesson_when_new_horse_name_is_provided', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(createHorse).toHaveBeenCalledWith('barn-1', 'Blaze')
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-new', 'barn-1', 3)
  })

  it('should_pass_exertion_level_to_addHorseToLesson_when_provided', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', 'exertion_horse-1': '5', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', 5)
  })

  it('should_default_exertion_level_to_3_when_not_provided_in_form', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1', 3)
  })

  it('should_pass_exertion_level_for_newly_created_horse', async () => {
    const newHorse = { id: 'horse-new', barn_id: 'barn-1', name: 'Blaze', created_at: '2026-01-01', updated_at: '2026-01-01' }
    vi.mocked(createHorse).mockResolvedValue(newHorse)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    const fd = makeFormData({ new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-new', 'barn-1', 4)
  })

  it('should_return_error_when_no_horse_ids_and_no_new_horse_name', async () => {
    const fd = makeFormData({ rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_non_manager_tries_to_create_new_horse', async () => {
    vi.mocked(getUserMembership).mockResolvedValue({ ...mockTrainerMembership, role: 'trainer' })
    const fd = makeFormData({ new_horse_name: 'Blaze', rider_id: 'rider-1', lesson_at: '2026-05-17T10:00' })
    const result = await submitLesson('barn-1', 'barn-slug', { error: null }, fd)
    expect(result).toEqual({ error: 'not authorized to add horses' })
    expect(createHorse).not.toHaveBeenCalled()
  })
})
