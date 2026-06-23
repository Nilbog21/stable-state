import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'
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

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { requireMembership } from '../guard'

const mockBarn = createMockBarn()
const mockUser = createMockUser()

describe('requireMembership', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    setupAuth(mockUser)
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'manager', status: 'active' }))
  })

  it('should_redirect_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_barn_login_url_when_unauthenticated', async () => {
    setupAuth(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_barn_login_url_when_barn_not_found', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_membership_not_found', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_barn_login_url_when_membership_not_found', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_membership_is_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_barn_login_url_when_membership_is_inactive', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_role_not_in_allowed_roles', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', status: 'active' }))

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_barn_login_url_when_role_not_in_allowed_roles', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', status: 'active' }))

    await expect(requireMembership('green-acres', ['manager'])).rejects.toThrow()
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_return_user_when_manager_allowed', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'manager', status: 'active' }))

    const result = await requireMembership('green-acres', ['manager'])

    expect(result.user).toMatchObject({ id: mockUser.id })
  })

  it('should_return_barn_when_manager_allowed', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'manager', status: 'active' }))

    const result = await requireMembership('green-acres', ['manager'])

    expect(result.barn).toEqual(mockBarn)
  })

  it('should_return_membership_when_manager_allowed', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'manager', status: 'active' }))

    const result = await requireMembership('green-acres', ['manager'])

    expect(result.membership.role).toBe('manager')
  })

  it('should_return_user_barn_and_membership_when_trainer_allowed', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'trainer', status: 'active' }))

    const result = await requireMembership('green-acres', ['manager', 'trainer'])

    expect(result.membership.role).toBe('trainer')
  })

  it('should_return_user_barn_and_membership_when_rider_allowed', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ role: 'rider', status: 'active' }))

    const result = await requireMembership('green-acres', ['manager', 'trainer', 'rider'])

    expect(result.membership.role).toBe('rider')
  })
})
