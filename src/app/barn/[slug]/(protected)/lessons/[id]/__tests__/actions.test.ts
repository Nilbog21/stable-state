import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lesson-participants', () => ({
  updateLessonRiderNotes: vi.fn(),
  updateLessonHorseNotes: vi.fn(),
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { updateLessonRiderNotes, updateLessonHorseNotes } from '@/lib/db/lesson-participants'
import { revalidatePath } from 'next/cache'
import { updateRiderNotesAction, updateHorseNotesAction } from '../actions'

const mockBarn = createMockBarn()
const mockMembership = createMockMembership({ role: 'trainer' })

describe('updateRiderNotesAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateLessonRiderNotes).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockMembership,
    })
    vi.mocked(updateLessonRiderNotes).mockResolvedValue({} as any)
    formData = new FormData()
    formData.set('riderNotes', 'great lesson')
    formData.set('privateNotes', 'private info')
  })

  it('should_call_requireMembership_with_trainer_and_manager', async () => {
    await updateRiderNotesAction('green-acres', 'lesson-1', 'rider-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['trainer', 'manager'])
  })

  it('should_call_updateLessonRiderNotes_with_correct_args', async () => {
    await updateRiderNotesAction('green-acres', 'lesson-1', 'rider-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, 'great lesson', 'private info')
  })

  it('should_pass_null_for_empty_rider_notes', async () => {
    formData.set('riderNotes', '')

    await updateRiderNotesAction('green-acres', 'lesson-1', 'rider-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, null, 'private info')
  })

  it('should_pass_null_for_empty_private_notes', async () => {
    formData.set('privateNotes', '')

    await updateRiderNotesAction('green-acres', 'lesson-1', 'rider-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, 'great lesson', null)
  })

  it('should_revalidate_lesson_path_after_update', async () => {
    await updateRiderNotesAction('green-acres', 'lesson-1', 'rider-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/lessons/lesson-1')
  })
})

describe('updateHorseNotesAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateLessonHorseNotes).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockMembership,
    })
    vi.mocked(updateLessonHorseNotes).mockResolvedValue({} as any)
    formData = new FormData()
    formData.set('horseNotes', 'good horse today')
  })

  it('should_call_requireMembership_with_trainer_and_manager', async () => {
    await updateHorseNotesAction('green-acres', 'lesson-1', 'horse-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['trainer', 'manager'])
  })

  it('should_call_updateLessonHorseNotes_with_correct_args', async () => {
    await updateHorseNotesAction('green-acres', 'lesson-1', 'horse-1', formData)

    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', mockBarn.id, 'good horse today')
  })

  it('should_pass_null_for_empty_horse_notes', async () => {
    formData.set('horseNotes', '')

    await updateHorseNotesAction('green-acres', 'lesson-1', 'horse-1', formData)

    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', mockBarn.id, null)
  })

  it('should_revalidate_lesson_path_after_update', async () => {
    await updateHorseNotesAction('green-acres', 'lesson-1', 'horse-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/lessons/lesson-1')
  })
})
