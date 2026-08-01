import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorse, createMockMembership } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/db/barn-memberships', () => ({
  getInstructorsByBarn: vi.fn(),
  getActiveMembersWithProfiles: vi.fn(),
}))

vi.mock('@/lib/db/horses', () => ({
  getHorsesByBarn: vi.fn(),
}))

import { getInstructorsByBarn, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getHorsesByBarn } from '@/lib/db/horses'
import { parseLessonFormData } from '../lesson-form-parsing'

const mockTrainerMembership = createMockMembership({ role: 'trainer', created_at: '2026-01-01T00:00:00Z' })
const mockManagerMembership = createMockMembership({ role: 'manager', created_at: '2026-01-01T00:00:00Z' })

describe('parseLessonFormData', () => {
  beforeEach(() => {
    vi.mocked(getInstructorsByBarn).mockReset()
    vi.mocked(getHorsesByBarn).mockReset()
    vi.mocked(getActiveMembersWithProfiles).mockReset()
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'mem-1', userId: 'user-1', name: 'Alice', isManaged: false, inviteToken: null },
    ])
  })

  it('should_return_error_when_lesson_type_is_invalid', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'advanced' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'invalid lesson type' })
  })

  it('should_return_error_when_no_rider_selected', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_return_rider_required_for_group_lesson_with_zero_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'rider required' })
  })

  it('should_return_error_when_normal_lesson_has_multiple_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: ['mem-1', 'mem-2'], lesson_at: '2026-05-17T10:00', lesson_type: 'normal' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'normal lesson requires exactly 1 rider' })
  })

  it('should_return_error_when_group_lesson_has_fewer_than_two_riders', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', lesson_type: 'group' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'group lesson requires at least 2 riders' })
  })

  it('should_return_error_when_lesson_at_is_missing', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'date and time required' })
  })

  it('should_return_error_when_no_horse_selected', async () => {
    const fd = makeFormData({ fee: '50', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'horse required' })
  })

  it('should_return_error_when_both_horse_id_and_new_horse_name_are_provided', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', new_horse_name: 'Blaze', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'select a horse or add a new one, not both' })
  })

  it('should_return_error_when_manager_submits_invalid_instructor_id', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'not-a-trainer' })
    const result = await parseLessonFormData(fd, 'barn-1', mockManagerMembership)
    expect(result).toEqual({ error: 'Invalid instructor' })
  })

  it('should_use_valid_instructor_when_manager_selects_one', async () => {
    vi.mocked(getInstructorsByBarn).mockResolvedValue([{ membershipId: 'mem-trainer-99', userId: 'user-99', name: 'Bob Trainer' }])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'mem-trainer-99' })
    const result = await parseLessonFormData(fd, 'barn-1', mockManagerMembership)
    expect('data' in result && result.data.instructorId).toBe('mem-trainer-99')
  })

  it('should_ignore_formData_instructor_id_and_use_own_membership_id_when_trainer', async () => {
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', instructor_id: 'mem-trainer-99' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect('data' in result && result.data.instructorId).toBe(mockTrainerMembership.id)
  })

  it('should_return_error_when_horse_does_not_belong_to_barn', async () => {
    vi.mocked(getHorsesByBarn).mockResolvedValue([
      createMockHorse({ id: 'other-horse', name: 'Other', created_at: '2026-01-01', updated_at: '2026-01-01' }),
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'horse not found in this barn' })
  })

  it('should_return_error_when_rider_does_not_belong_to_barn', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([
      { membershipId: 'other-mem', userId: 'user-99', name: 'Other', isManaged: false, inviteToken: null },
    ])
    const fd = makeFormData({ fee: '50', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'rider not found in this barn' })
  })

  it('should_return_error_when_fee_is_missing', async () => {
    const fd = makeFormData({ horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_return_error_when_fee_is_negative', async () => {
    const fd = makeFormData({ fee: '-10', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'fee is required' })
  })

  it('should_return_parsed_data_on_valid_input', async () => {
    const fd = makeFormData({ fee: '75.5', horse_id: 'horse-1', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00', tier_name: 'Standard', jumping: 'true', payment_type: 'venmo' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({
      data: {
        horseIds: ['horse-1'],
        newHorseName: null,
        newHorseExertionLevel: 3,
        exertionLevels: new Map([['horse-1', 3]]),
        riderIds: ['mem-1'],
        lessonAt: '2026-05-17T10:00',
        fee: 75.5,
        lessonType: 'normal',
        jumping: true,
        paymentType: 'venmo',
        tierName: 'Standard',
        instructorId: mockTrainerMembership.id,
      },
    })
  })

  it('should_include_new_horse_name_in_parsed_data', async () => {
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockManagerMembership)
    expect('data' in result && result.data.newHorseName).toBe('Blaze')
  })

  it('should_include_new_horse_exertion_level_in_parsed_data', async () => {
    const fd = makeFormData({ fee: '50', new_horse_name: 'Blaze', new_horse_exertion_level: '4', rider_id: 'mem-1', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockManagerMembership)
    expect('data' in result && result.data.newHorseExertionLevel).toBe(4)
  })

  it('should_return_rider_required_when_both_horse_and_rider_are_missing', async () => {
    const fd = makeFormData({ fee: '50', lesson_at: '2026-05-17T10:00' })
    const result = await parseLessonFormData(fd, 'barn-1', mockTrainerMembership)
    expect(result).toEqual({ error: 'rider required' })
  })
})
