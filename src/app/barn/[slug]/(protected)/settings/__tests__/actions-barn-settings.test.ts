import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { makeFormData } from '@/test/utils/forms'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lesson-tiers', () => ({
  createTier: vi.fn(),
  updateTier: vi.fn(),
  setDefaultTier: vi.fn(),
  getTierById: vi.fn(),
  deactivateTier: vi.fn(),
  reactivateTier: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  updateBarnDefaultBoardFee: vi.fn(),
  setInstructorCut: vi.fn(),
  updateExhaustionThresholds: vi.fn(),
  updateBarnTimezone: vi.fn(),
  updateScheduleBufferMinutes: vi.fn(),
}))

vi.mock('@/lib/db/barn-events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}))

vi.mock('@/lib/db/document-backup', () => ({
  buildDocumentsBackupZip: vi.fn(),
}))

vi.mock('@/lib/db/backup', () => ({
  buildBarnDataBackupBuffer: vi.fn(),
}))

vi.mock('@/lib/db/document-storage', () => ({
  uploadFile: vi.fn(),
  getSignedUrl: vi.fn(),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
}))

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}))

import { requireMembership } from '@/lib/auth/guard'
import { updateBarnDefaultBoardFee, setInstructorCut, updateExhaustionThresholds, updateBarnTimezone, updateScheduleBufferMinutes } from '@/lib/db/barns'
import {
  updateDefaultBoardFeeAction,
  updateInstructorCutAction,
  updateExhaustionThresholdsAction,
  updateScheduleBufferMinutesAction,
  updateBarnTimezoneAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('updateInstructorCutAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setInstructorCut).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setInstructorCut).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '30' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setInstructorCut_with_parsed_value', async () => {
    await expect(
      updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '30' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(setInstructorCut).toHaveBeenCalledWith(mockBarn.id, 30)
  })

  it('should_redirect_to_settings_after_setInstructorCut', async () => {
    await expect(
      updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '30' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=instructor-cut')
  })

  it('should_allow_zero', async () => {
    await expect(
      updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '0' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(setInstructorCut).toHaveBeenCalledWith(mockBarn.id, 0)
  })

  it('should_return_early_when_blank', async () => {
    await updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '' }))

    expect(setInstructorCut).not.toHaveBeenCalled()
  })

  it('should_return_early_when_negative', async () => {
    await updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: '-5' }))

    expect(setInstructorCut).not.toHaveBeenCalled()
  })

  it('should_return_early_when_non_numeric', async () => {
    await updateInstructorCutAction('green-acres', makeFormData({ instructor_cut: 'abc' }))

    expect(setInstructorCut).not.toHaveBeenCalled()
  })
})

describe('updateExhaustionThresholdsAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateExhaustionThresholds).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateExhaustionThresholds).mockResolvedValue(mockBarn)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateExhaustionThresholdsAction(
        'green-acres',
        { error: null },
        makeFormData({ moderate: '4', high: '10' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateExhaustionThresholds_with_parsed_values', async () => {
    await expect(
      updateExhaustionThresholdsAction(
        'green-acres',
        { error: null },
        makeFormData({ moderate: '4', high: '10' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateExhaustionThresholds).toHaveBeenCalledWith(mockBarn.id, { moderate: 4, high: 10 })
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateExhaustionThresholdsAction(
        'green-acres',
        { error: null },
        makeFormData({ moderate: '4', high: '10' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=exhaustion-thresholds')
  })

  it('should_accept_zero_moderate', async () => {
    await expect(
      updateExhaustionThresholdsAction(
        'green-acres',
        { error: null },
        makeFormData({ moderate: '0', high: '10' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateExhaustionThresholds).toHaveBeenCalledWith(mockBarn.id, { moderate: 0, high: 10 })
  })

  it('should_return_error_when_moderate_equals_high', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '10', high: '10' })
    )

    expect(result.error).toBe('Moderate threshold must be less than high threshold')
  })

  it('should_not_call_updateExhaustionThresholds_when_moderate_equals_high', async () => {
    await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '10', high: '10' })
    )

    expect(updateExhaustionThresholds).not.toHaveBeenCalled()
  })

  it('should_return_error_when_moderate_is_greater_than_high', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '11', high: '10' })
    )

    expect(result.error).toBe('Moderate threshold must be less than high threshold')
  })

  it('should_return_error_when_moderate_is_blank', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '', high: '10' })
    )

    expect(result.error).toBe('Thresholds must be numbers ≥ 0')
  })

  it('should_return_error_when_high_is_non_numeric', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '4', high: 'abc' })
    )

    expect(result.error).toBe('Thresholds must be numbers ≥ 0')
  })

  it('should_return_error_when_moderate_is_negative', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '-1', high: '10' })
    )

    expect(result.error).toBe('Thresholds must be numbers ≥ 0')
  })

  it('should_return_error_when_moderate_has_trailing_non_digit_characters', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '4abc', high: '10' })
    )

    expect(result.error).toBe('Thresholds must be numbers ≥ 0')
  })

  it('should_return_error_when_high_is_a_decimal', async () => {
    const result = await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '4', high: '10.5' })
    )

    expect(result.error).toBe('Thresholds must be numbers ≥ 0')
  })

  it('should_not_call_updateExhaustionThresholds_when_validation_fails', async () => {
    await updateExhaustionThresholdsAction(
      'green-acres',
      { error: null },
      makeFormData({ moderate: '', high: '10' })
    )

    expect(updateExhaustionThresholds).not.toHaveBeenCalled()
  })
})

describe('updateScheduleBufferMinutesAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateScheduleBufferMinutes).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateScheduleBufferMinutes).mockResolvedValue(mockBarn)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: '45' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateScheduleBufferMinutes_with_parsed_minutes', async () => {
    await expect(
      updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: '45' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateScheduleBufferMinutes).toHaveBeenCalledWith(mockBarn.id, 45)
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: '45' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=schedule-buffer')
  })

  it('should_return_early_when_minutes_is_blank', async () => {
    await updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: '' }))

    expect(updateScheduleBufferMinutes).not.toHaveBeenCalled()
  })

  it('should_return_early_when_minutes_is_non_numeric', async () => {
    await updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: 'abc' }))

    expect(updateScheduleBufferMinutes).not.toHaveBeenCalled()
  })

  it('should_return_early_when_minutes_is_negative', async () => {
    await updateScheduleBufferMinutesAction('green-acres', makeFormData({ schedule_buffer_minutes: '-5' }))

    expect(updateScheduleBufferMinutes).not.toHaveBeenCalled()
  })
})

describe('updateDefaultBoardFeeAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateBarnDefaultBoardFee).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateBarnDefaultBoardFee).mockResolvedValue(mockBarn)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: '1200' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateBarnDefaultBoardFee_with_parsed_fee', async () => {
    await expect(
      updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: '1200' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateBarnDefaultBoardFee).toHaveBeenCalledWith(mockBarn.id, 1200)
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: '1200' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=board-fee')
  })

  it('should_return_early_when_fee_is_blank', async () => {
    await updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: '' }))

    expect(updateBarnDefaultBoardFee).not.toHaveBeenCalled()
  })

  it('should_return_early_when_fee_is_non_numeric', async () => {
    await updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: 'abc' }))

    expect(updateBarnDefaultBoardFee).not.toHaveBeenCalled()
  })

  it('should_return_early_when_fee_is_negative', async () => {
    await updateDefaultBoardFeeAction('green-acres', makeFormData({ default_board_fee: '-5' }))

    expect(updateBarnDefaultBoardFee).not.toHaveBeenCalled()
  })
})

describe('updateBarnTimezoneAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateBarnTimezone).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateBarnTimezone).mockResolvedValue(mockBarn)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateBarnTimezoneAction('green-acres', makeFormData({ timezone: 'America/Los_Angeles' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateBarnTimezone_with_submitted_value', async () => {
    await expect(
      updateBarnTimezoneAction('green-acres', makeFormData({ timezone: 'America/Los_Angeles' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateBarnTimezone).toHaveBeenCalledWith(mockBarn.id, 'America/Los_Angeles')
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateBarnTimezoneAction('green-acres', makeFormData({ timezone: 'America/Los_Angeles' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=timezone')
  })

  it('should_return_early_when_timezone_is_blank', async () => {
    await updateBarnTimezoneAction('green-acres', makeFormData({ timezone: '' }))

    expect(updateBarnTimezone).not.toHaveBeenCalled()
  })

  it('should_return_early_when_timezone_field_is_absent', async () => {
    await updateBarnTimezoneAction('green-acres', makeFormData({}))

    expect(updateBarnTimezone).not.toHaveBeenCalled()
  })

  it('should_return_early_when_timezone_is_not_in_the_allowed_list', async () => {
    await updateBarnTimezoneAction('green-acres', makeFormData({ timezone: 'Europe/London' }))

    expect(updateBarnTimezone).not.toHaveBeenCalled()
  })
})

