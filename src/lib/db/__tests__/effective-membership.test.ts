import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockMembership } from '@/test/fixtures'

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
}))

import { cookies } from 'next/headers'
import { getUserMembership, getAdminMembership } from '@/lib/db/barn-memberships'
import { getEffectiveMembership } from '../effective-membership'

const adminMembership = createMockMembership({ barn_id: null, role: 'admin' })
const barnMembership = createMockMembership({ role: 'trainer' })

function mockCookies(value: string | undefined) {
  vi.mocked(cookies).mockResolvedValue({
    get: vi.fn().mockReturnValue(value ? { value } : undefined),
  } as any)
}

beforeEach(() => {
  vi.mocked(getUserMembership).mockResolvedValue(null)
  vi.mocked(getAdminMembership).mockResolvedValue(null)
  vi.stubEnv('NODE_ENV', 'development')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('getEffectiveMembership', () => {
  describe('dev mode override', () => {
    it('should_return_synthetic_membership_when_admin_has_role_override_cookie', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies('manager')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result?.role).toBe('manager')
      expect(result?.barn_id).toBe('barn-1')
      expect(result?.status).toBe('active')
    })

    it('should_return_synthetic_membership_for_trainer_override', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies('trainer')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result?.role).toBe('trainer')
    })

    it('should_return_synthetic_membership_for_rider_override', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies('rider')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result?.role).toBe('rider')
    })

    it('should_return_real_admin_membership_when_no_cookie_set', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(adminMembership)
    })

    it('should_ignore_cookie_when_real_role_is_not_admin', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(barnMembership)
      vi.mocked(getAdminMembership).mockResolvedValue(null)
      mockCookies('manager')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(barnMembership)
    })

    it('should_ignore_invalid_cookie_values', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies('superuser')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(adminMembership)
    })
  })

  describe('production mode', () => {
    it('should_ignore_cookie_in_production_and_return_real_membership', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies('manager')

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(adminMembership)
    })
  })

  describe('membership resolution', () => {
    it('should_return_barn_membership_when_user_has_barn_role', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(barnMembership)
      vi.mocked(getAdminMembership).mockResolvedValue(null)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(barnMembership)
    })

    it('should_fall_back_to_admin_membership_when_no_barn_membership', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toEqual(adminMembership)
    })

    it('should_return_null_when_no_membership_exists', async () => {
      vi.mocked(getUserMembership).mockResolvedValue(null)
      vi.mocked(getAdminMembership).mockResolvedValue(null)
      mockCookies(undefined)

      const result = await getEffectiveMembership('user-1', 'barn-1')

      expect(result).toBeNull()
    })
  })
})
