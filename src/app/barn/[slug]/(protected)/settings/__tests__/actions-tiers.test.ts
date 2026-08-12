import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockLessonTier } from '@/test/fixtures'
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
import {
  createTierAction,
  updateTierAction,
  deactivateTierAction,
  reactivateTierAction,
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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=tiers')
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

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/settings?saved=tiers')
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

