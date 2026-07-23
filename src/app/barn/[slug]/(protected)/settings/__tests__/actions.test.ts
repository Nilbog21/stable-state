import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockLessonTier, createMockBarnEvent } from '@/test/fixtures'
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
}))

vi.mock('@/lib/db/barn-events', () => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
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

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guard'
import {
  createTier,
  updateTier,
  setDefaultTier,
  getTierById,
  deactivateTier,
  reactivateTier,
} from '@/lib/db/lesson-tiers'
import { updateBarnDefaultBoardFee, setInstructorCut, updateExhaustionThresholds, updateBarnTimezone } from '@/lib/db/barns'
import { createEvent, updateEvent, deleteEvent } from '@/lib/db/barn-events'
import {
  createTierAction,
  updateTierAction,
  deactivateTierAction,
  reactivateTierAction,
  updateDefaultBoardFeeAction,
  updateInstructorCutAction,
  updateExhaustionThresholdsAction,
  updateBarnTimezoneAction,
  createEventAction,
  updateEventAction,
  deleteEventAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('createTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createTier).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createTier).mockResolvedValue(createMockLessonTier())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_createTier_when_manager', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, null, 10)
  })

  it('should_redirect_to_settings_after_createTier', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })

  it('should_return_error_when_price_is_blank', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '' , instructor_cut: '10' }))

    expect(result.error).toBe('Price is required')
  })

  it('should_not_call_createTier_when_price_is_blank', async () => {
    await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '' , instructor_cut: '10' }))

    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_accept_zero_price', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '0' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 0, false, null, null, 10)
  })

  it('should_return_error_when_price_is_negative', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '-5' , instructor_cut: '10' }))

    expect(result.error).toBe('Price is required')
  })

  it('should_return_error_when_name_is_blank', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: '', price: '75' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required')
  })

  it('should_not_call_createTier_when_name_is_blank', async () => {
    await createTierAction('green-acres', { error: null }, makeFormData({ name: '', price: '75' , instructor_cut: '10' }))

    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_name_is_whitespace_only', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: '   ', price: '75' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required')
  })

  it('should_not_call_createTier_when_name_is_whitespace_only', async () => {
    await createTierAction('green-acres', { error: null }, makeFormData({ name: '   ', price: '75' , instructor_cut: '10' }))

    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_price_is_non_numeric_string', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: 'abc' , instructor_cut: '10' }))

    expect(result.error).toBe('Price is required')
  })

  it('should_return_combined_error_when_name_and_price_are_both_blank', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: '', price: '' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required, Price is required')
  })

  it('should_pass_default_jumping_true_when_field_is_true', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', default_jumping: 'true' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, true, 10)
  })

  it('should_pass_default_jumping_false_when_field_is_false', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', default_jumping: 'false' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, false, 10)
  })

  it('should_pass_default_exertion_level_when_field_is_valid', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', default_exertion_level: '3' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, 3, null, 10)
  })

  it('should_pass_null_default_exertion_when_field_is_out_of_range', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', default_exertion_level: '9' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, null, 10)
  })

  it('should_return_error_when_instructor_cut_is_blank', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: '' }))

    expect(result.error).toBe('Instructor cut is required')
  })

  it('should_not_call_createTier_when_instructor_cut_is_blank', async () => {
    await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: '' }))

    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_instructor_cut_is_negative', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: '-5' }))

    expect(result.error).toBe('Instructor cut is required')
  })

  it('should_return_error_when_instructor_cut_is_non_numeric_string', async () => {
    const result = await createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: 'abc' }))

    expect(result.error).toBe('Instructor cut is required')
  })

  it('should_accept_zero_instructor_cut', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: '0' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, null, 0)
  })

  it('should_pass_instructor_cut_to_createTier', async () => {
    await expect(
      createTierAction('green-acres', { error: null }, makeFormData({ name: 'Premium', price: '75', instructor_cut: '30' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75, false, null, null, 30)
  })
})

describe('updateTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateTier).mockReset()
    vi.mocked(setDefaultTier).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateTier).mockResolvedValue(createMockLessonTier())
    vi.mocked(setDefaultTier).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateTier_when_manager', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, { name: 'Gold', price: 90, default_jumping: null, default_exertion_level: null, instructor_cut: 10 })
  })

  it('should_redirect_to_settings_after_updateTier', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })

  it('should_return_error_when_price_is_blank', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '' , instructor_cut: '10' }))

    expect(result.error).toBe('Price is required')
  })

  it('should_not_call_updateTier_when_price_is_blank', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '' , instructor_cut: '10' }))

    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_price_is_negative', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '-5' , instructor_cut: '10' }))

    expect(result.error).toBe('Price is required')
  })

  it('should_accept_zero_price', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '0' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, { name: 'Gold', price: 0, default_jumping: null, default_exertion_level: null, instructor_cut: 10 })
  })

  it('should_return_error_when_name_is_blank', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: '', price: '90' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required')
  })

  it('should_not_call_updateTier_when_name_is_blank', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: '', price: '90' , instructor_cut: '10' }))

    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_name_is_whitespace_only', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: '   ', price: '90' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required')
  })

  it('should_not_call_updateTier_when_name_is_whitespace_only', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: '   ', price: '90' , instructor_cut: '10' }))

    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_return_combined_error_when_name_and_price_are_both_blank', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: '', price: '' , instructor_cut: '10' }))

    expect(result.error).toBe('Name is required, Price is required')
  })

  it('should_pass_default_jumping_true_when_field_is_true', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', default_jumping: 'true' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, expect.objectContaining({ default_jumping: true }))
  })

  it('should_pass_default_jumping_false_when_field_is_false', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', default_jumping: 'false' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, expect.objectContaining({ default_jumping: false }))
  })

  it('should_pass_default_exertion_level_when_field_is_valid', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', default_exertion_level: '4' , instructor_cut: '10' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, expect.objectContaining({ default_exertion_level: 4 }))
  })

  it('should_call_setDefaultTier_when_set_as_default_is_checked', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', set_as_default: 'on' , instructor_cut: '10' })).catch(() => {})

    expect(setDefaultTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
  })

  it('should_not_call_setDefaultTier_when_set_as_default_is_unchecked', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90' , instructor_cut: '10' })).catch(() => {})

    expect(setDefaultTier).not.toHaveBeenCalled()
  })

  it('should_not_call_setDefaultTier_when_tier_is_inactive', async () => {
    vi.mocked(updateTier).mockResolvedValueOnce(createMockLessonTier({ is_active: false }))
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', set_as_default: 'on' , instructor_cut: '10' })).catch(() => {})

    expect(setDefaultTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_instructor_cut_is_blank', async () => {
    const result = await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', instructor_cut: '' }))

    expect(result.error).toBe('Instructor cut is required')
  })

  it('should_not_call_updateTier_when_instructor_cut_is_blank', async () => {
    await updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', instructor_cut: '' }))

    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_accept_zero_instructor_cut', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', instructor_cut: '0' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, expect.objectContaining({ instructor_cut: 0 }))
  })

  it('should_pass_instructor_cut_to_updateTier', async () => {
    await expect(
      updateTierAction('green-acres', 'tier-1', { error: null }, makeFormData({ name: 'Gold', price: '90', instructor_cut: '35' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, expect.objectContaining({ instructor_cut: 35 }))
  })
})

describe('deactivateTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getTierById).mockReset()
    vi.mocked(deactivateTier).mockReset()
    mockRedirect.mockClear()
    vi.mocked(revalidatePath).mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getTierById).mockResolvedValue(createMockLessonTier({ id: 'tier-1', is_default: false }))
    vi.mocked(deactivateTier).mockResolvedValue(undefined)
  })

  const emptyState = { error: null }
  const emptyFormData = new FormData()

  it('should_call_requireMembership_with_manager_role', async () => {
    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(
      deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_url_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(
      deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)
    ).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_not_call_deactivateTier_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(
      deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)
    ).rejects.toThrow()
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_return_error_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    const result = await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(result.error).toMatch(/default tier/i)
  })

  it('should_not_redirect_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('should_not_call_deactivateTier_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_call_deactivateTier_when_tier_is_not_default', async () => {
    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(deactivateTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
  })

  it('should_revalidate_settings_and_tier_page_after_deactivateTier', async () => {
    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings/tiers/tier-1')
  })

  it('should_not_redirect_after_deactivateTier', async () => {
    await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('should_return_null_error_after_successful_deactivateTier', async () => {
    const result = await deactivateTierAction('green-acres', 'tier-1', emptyState, emptyFormData)

    expect(result.error).toBeNull()
  })
})

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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
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

describe('reactivateTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(reactivateTier).mockReset()
    mockRedirect.mockClear()
    vi.mocked(revalidatePath).mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(reactivateTier).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await reactivateTierAction('green-acres', 'tier-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_reactivateTier_when_manager', async () => {
    await reactivateTierAction('green-acres', 'tier-1')

    expect(reactivateTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
  })

  it('should_revalidate_settings_and_tier_page_after_reactivateTier', async () => {
    await reactivateTierAction('green-acres', 'tier-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings/tiers/tier-1')
  })

  it('should_not_redirect_after_reactivateTier', async () => {
    await reactivateTierAction('green-acres', 'tier-1')

    expect(mockRedirect).not.toHaveBeenCalled()
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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
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

describe('createEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createEvent).mockResolvedValue(createMockBarnEvent())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_return_error_when_title_is_missing', async () => {
    const result = await createEventAction('green-acres', { error: null }, makeFormData({ event_at: '2026-10-31T22:00:00.000Z' }))

    expect(result.error).toBe('Title is required')
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('should_return_error_when_event_at_is_missing', async () => {
    const result = await createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party' }))

    expect(result.error).toBe('Date is required')
    expect(createEvent).not.toHaveBeenCalled()
  })

  it('should_default_notes_to_null_when_blank', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ notes: null }))
  })

  it('should_pass_trimmed_notes_when_present', async () => {
    await expect(
      createEventAction(
        'green-acres',
        { error: null },
        makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z', notes: '  Bring candy  ' })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ notes: 'Bring candy' }))
  })

  it('should_filter_out_invalid_role_values_from_visible_to_roles', async () => {
    await expect(
      createEventAction(
        'green-acres',
        { error: null },
        makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z', visible_to_roles: ['manager', 'bogus'] })
      )
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ visibleToRoles: ['manager'] }))
  })

  it('should_default_visible_to_roles_to_empty_array_when_none_submitted', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(createEvent).toHaveBeenCalledWith(mockBarn.id, expect.objectContaining({ visibleToRoles: [] }))
  })

  it('should_redirect_to_settings_after_create', async () => {
    await expect(
      createEventAction('green-acres', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('updateEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateEvent).mockResolvedValue(createMockBarnEvent())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_return_error_when_title_is_missing', async () => {
    const result = await updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ event_at: '2026-10-31T22:00:00.000Z' }))

    expect(result.error).toBe('Title is required')
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('should_return_error_when_event_at_is_missing', async () => {
    const result = await updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party' }))

    expect(result.error).toBe('Date is required')
    expect(updateEvent).not.toHaveBeenCalled()
  })

  it('should_call_updateEvent_with_event_id_and_barn_id', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(updateEvent).toHaveBeenCalledWith('event-1', mockBarn.id, expect.objectContaining({ title: 'Costume Party' }))
  })

  it('should_redirect_to_settings_after_update', async () => {
    await expect(
      updateEventAction('green-acres', 'event-1', { error: null }, makeFormData({ title: 'Costume Party', event_at: '2026-10-31T22:00:00.000Z' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('deleteEventAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(deleteEvent).mockReset()
    mockRedirect.mockClear()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(deleteEvent).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_deleteEvent_with_event_id_and_barn_id', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(deleteEvent).toHaveBeenCalledWith('event-1', mockBarn.id)
  })

  it('should_redirect_to_settings_after_delete', async () => {
    await expect(deleteEventAction('green-acres', 'event-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})
