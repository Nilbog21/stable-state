import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/lessons', () => ({
  createLesson: vi.fn(),
  addHorseToLesson: vi.fn(),
  addRiderToLesson: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createLesson, addHorseToLesson, addRiderToLesson } from '@/lib/db/lessons'
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

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
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
    expect(addHorseToLesson).toHaveBeenCalledWith('lesson-1', 'horse-1', 'barn-1')
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
})
