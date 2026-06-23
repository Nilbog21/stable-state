import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockLessonTier } from '@/test/fixtures'

vi.mock('@/lib/auth/guard', () => ({
  requireMembership: vi.fn(),
}))

vi.mock('@/lib/db/lesson-tiers', () => ({
  createTier: vi.fn(),
  updateTier: vi.fn(),
  setDefaultTier: vi.fn(),
  getTierById: vi.fn(),
  deactivateTier: vi.fn(),
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
import {
  createTier,
  updateTier,
  setDefaultTier,
  getTierById,
  deactivateTier,
} from '@/lib/db/lesson-tiers'
import { revalidatePath } from 'next/cache'
import {
  createTierAction,
  updateTierAction,
  setDefaultTierAction,
  deactivateTierAction,
} from '../actions'

const mockBarn = createMockBarn()
const mockManagerMembership = createMockMembership({ role: 'manager', status: 'active' })

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

describe('createTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(createTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(createTier).mockResolvedValue(createMockLessonTier())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_createTier_when_manager', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75)
  })

  it('should_revalidate_settings_path_after_createTier', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })

  it('should_pass_null_price_when_price_field_is_blank', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: '' }))

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', null)
  })

  it('should_return_early_when_name_is_blank', async () => {
    await createTierAction('green-acres', makeFormData({ name: '', price: '75' }))

    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_pass_null_price_when_price_is_non_numeric_string', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: 'abc' }))

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', null)
  })
})

describe('updateTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(updateTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(updateTier).mockResolvedValue(createMockLessonTier())
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_updateTier_when_manager', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, { name: 'Gold', price: 90 })
  })

  it('should_revalidate_settings_path_after_updateTier', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })

  it('should_pass_null_price_when_price_field_is_blank', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '' }))

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, { name: 'Gold', price: null })
  })

  it('should_return_early_when_name_is_blank', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: '', price: '90' }))

    expect(updateTier).not.toHaveBeenCalled()
  })
})

describe('setDefaultTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(setDefaultTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(setDefaultTier).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await setDefaultTierAction('green-acres', 'tier-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_call_setDefaultTier_when_manager', async () => {
    await setDefaultTierAction('green-acres', 'tier-1')

    expect(setDefaultTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
  })

  it('should_revalidate_settings_path_after_setDefaultTier', async () => {
    await setDefaultTierAction('green-acres', 'tier-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('deactivateTierAction', () => {
  beforeEach(() => {
    vi.mocked(requireMembership).mockReset()
    vi.mocked(getTierById).mockReset()
    vi.mocked(deactivateTier).mockReset()
    mockRedirect.mockClear()
    vi.mocked(revalidatePath).mockReset()
    vi.mocked(requireMembership).mockResolvedValue({
      user: { id: 'user-1' } as any,
      barn: mockBarn,
      membership: mockManagerMembership,
    })
    vi.mocked(getTierById).mockResolvedValue(createMockLessonTier({ id: 'tier-1', is_default: false }))
    vi.mocked(deactivateTier).mockResolvedValue(undefined)
  })

  it('should_call_requireMembership_with_manager_role', async () => {
    await deactivateTierAction('green-acres', 'tier-1')

    expect(requireMembership).toHaveBeenCalledWith('green-acres', ['manager'])
  })

  it('should_redirect_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_url_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_not_call_deactivateTier_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow()
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_error_url_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith(
      '/barn/green-acres/settings?error=cannot_deactivate_default&errorTierId=tier-1'
    )
  })

  it('should_not_call_deactivateTier_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow()
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_call_deactivateTier_when_tier_is_not_default', async () => {
    await deactivateTierAction('green-acres', 'tier-1')

    expect(deactivateTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
  })

  it('should_revalidate_settings_path_after_deactivateTier', async () => {
    await deactivateTierAction('green-acres', 'tier-1')

    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})
