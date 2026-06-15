import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockLessonTier } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
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

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
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
const mockManagerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

function makeFormData(fields: Record<string, string>): FormData {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.append(k, v)
  return fd
}

describe('createTierAction', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(createTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(createTier).mockResolvedValue(createMockLessonTier())
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(
      createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'trainer' })
    )

    await expect(
      createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(createTier).not.toHaveBeenCalled()
  })

  it('should_call_createTier_and_revalidate_settings_path', async () => {
    await createTierAction('green-acres', makeFormData({ name: 'Premium', price: '75' }))

    expect(createTier).toHaveBeenCalledWith(mockBarn.id, 'Premium', 75)
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
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(updateTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(updateTier).mockResolvedValue(createMockLessonTier())
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(
      updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(
      updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(updateTier).not.toHaveBeenCalled()
  })

  it('should_call_updateTier_and_revalidate_settings_path', async () => {
    await updateTierAction('green-acres', 'tier-1', makeFormData({ name: 'Gold', price: '90' }))

    expect(updateTier).toHaveBeenCalledWith('tier-1', mockBarn.id, { name: 'Gold', price: 90 })
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
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(setDefaultTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(setDefaultTier).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(setDefaultTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(setDefaultTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(setDefaultTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(setDefaultTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'rider' })
    )

    await expect(setDefaultTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(setDefaultTier).not.toHaveBeenCalled()
  })

  it('should_call_setDefaultTier_and_revalidate_settings_path', async () => {
    await setDefaultTierAction('green-acres', 'tier-1')

    expect(setDefaultTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})

describe('deactivateTierAction', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getTierById).mockReset()
    vi.mocked(deactivateTier).mockReset()
    vi.mocked(revalidatePath).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(mockManagerMembership)
    vi.mocked(getTierById).mockResolvedValue(createMockLessonTier({ id: 'tier-1', is_default: false }))
    vi.mocked(deactivateTier).mockResolvedValue(undefined)
  })

  it('should_redirect_to_login_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_tier_not_found', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_redirect_with_error_when_tier_is_default', async () => {
    vi.mocked(getTierById).mockResolvedValue(
      createMockLessonTier({ id: 'tier-1', is_default: true })
    )

    await expect(deactivateTierAction('green-acres', 'tier-1')).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith(
      '/barn/green-acres/settings?error=cannot_deactivate_default&errorTierId=tier-1'
    )
    expect(deactivateTier).not.toHaveBeenCalled()
  })

  it('should_deactivate_and_revalidate_when_tier_is_not_default', async () => {
    await deactivateTierAction('green-acres', 'tier-1')

    expect(deactivateTier).toHaveBeenCalledWith('tier-1', mockBarn.id)
    expect(revalidatePath).toHaveBeenCalledWith('/barn/green-acres/settings')
  })
})
