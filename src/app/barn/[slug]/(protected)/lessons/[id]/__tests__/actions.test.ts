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
import { updateAllNotesAction } from '../actions'

const mockBarn = createMockBarn()
const mockMembership = createMockMembership({ role: 'trainer' })

describe('updateAllNotesAction', () => {
  let formData: FormData

  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateLessonHorseNotes).mockReset()
    vi.mocked(updateLessonRiderNotes).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockMembership,
    })
    vi.mocked(updateLessonHorseNotes).mockResolvedValue({} as any)
    vi.mocked(updateLessonRiderNotes).mockResolvedValue({} as any)
    formData = new FormData()
    formData.append('horseIds', 'horse-1')
    formData.set('horse_notes_horse-1', 'good horse')
    formData.append('riderIds', 'rider-1')
    formData.set('rider_notes_rider-1', 'good position')
    formData.set('private_notes_rider-1', 'private info')
  })

  it('should_call_requireMembership_with_trainer_and_manager', async () => {
    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['trainer', 'manager'])
  })

  it('should_call_updateLessonHorseNotes_for_each_horse', async () => {
    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', mockBarn.id, 'good horse')
  })

  it('should_call_updateLessonRiderNotes_for_each_rider', async () => {
    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, 'good position', 'private info')
  })

  it('should_pass_null_for_empty_horse_notes', async () => {
    formData.set('horse_notes_horse-1', '')

    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonHorseNotes).toHaveBeenCalledWith('lesson-1', 'horse-1', mockBarn.id, null)
  })

  it('should_pass_null_for_empty_rider_notes', async () => {
    formData.set('rider_notes_rider-1', '')

    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, null, 'private info')
  })

  it('should_pass_null_for_empty_private_notes', async () => {
    formData.set('private_notes_rider-1', '')

    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonRiderNotes).toHaveBeenCalledWith('lesson-1', 'rider-1', mockBarn.id, 'good position', null)
  })

  it('should_handle_multiple_horses_and_riders', async () => {
    formData.append('horseIds', 'horse-2')
    formData.set('horse_notes_horse-2', 'second horse')
    formData.append('riderIds', 'rider-2')
    formData.set('rider_notes_rider-2', 'second rider')
    formData.set('private_notes_rider-2', '')

    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(updateLessonHorseNotes).toHaveBeenCalledTimes(2)
  })

  it('should_revalidate_lesson_path_after_update', async () => {
    await updateAllNotesAction('green-acres', 'lesson-1', formData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/lessons/lesson-1')
  })
})
