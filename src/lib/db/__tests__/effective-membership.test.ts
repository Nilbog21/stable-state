import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockMembership } from '@/test/fixtures'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
}))

import { cookies } from 'next/headers'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getEffectiveMembership } from '../effective-membership'

const managerMembership = createMockMembership({ role: 'manager' })
const barnMembership = createMockMembership({ role: 'trainer' })

function mockCookies(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(value ? { value } : undefined),
  } as any)
}

beforeEach(() => {
  vi.mocked(getUserMembership).mockResolvedValue(null)
  vi.stubEnv('NODE_ENV', 'development')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getEffectiveMembership', () => {
  describe('dev mode override', () => {
    it('should_return_synthetic_membership_when_manager_has_role_override_cookie', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies('trainer')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result?.role).toBe('trainer')
      expect(result?.barn_id).toBe('barn-1')
      expect(result?.status).toBe('active')
    })

    it('should_return_synthetic_membership_for_rider_override', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies('rider')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result?.role).toBe('rider')
    })

    it('should_return_real_manager_membership_when_no_cookie_set', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(managerMembership)
    })

    it('should_ignore_cookie_when_real_role_is_not_manager', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(barnMembership)
      mockCookies('rider')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(barnMembership)
    })

    it('should_ignore_invalid_cookie_values', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies('superuser')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(managerMembership)
    })

    it('should_ignore_manager_cookie_since_manager_is_not_overridable', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies('manager')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(managerMembership)
    })
  })

  describe('production mode', () => {
    it('should_ignore_cookie_in_production_and_return_real_membership', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
      mockCookies('trainer')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(managerMembership)
    })
  })

  describe('membership resolution', () => {
    it('should_return_barn_membership_when_user_has_barn_role', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(barnMembership)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(barnMembership)
    })

    it('should_return_null_when_no_membership_exists', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toBeNull()
    })
  })
})
