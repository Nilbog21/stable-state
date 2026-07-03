import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getBarnMembershipsForUser: vi.fn(),
  getActiveMemberships: vi.fn(),
  claimManagedMember: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfileByUserId: vi.fn(),
  getProfilesByUserIds: vi.fn(),
}))

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('@/lib/db/notifications', () => ({
  createNotification: vi.fn(),
  deleteNotificationByType: vi.fn(),
}))

const mockCookiesSet = vi.fn()
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string | URL) => ({
    url: url.toString(),
    status: 302,
    cookies: { set: mockCookiesSet },
  }))
)
vi.mock('next/server', () => ({
  NextResponse: {
    redirect: mockRedirect,
  },
}))

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { getUserMembership, getBarnMembershipsForUser, getActiveMemberships, claimManagedMember } from '@/lib/db/barn-memberships'
import { getBarnBySlug } from '@/lib/db/barns'
import { getProfileByUserId, getProfilesByUserIds } from '@/lib/db/profiles'
import { createNotification, deleteNotificationByType } from '@/lib/db/notifications'
import { GET } from '../route'

const mockBarn = createMockBarn()
const mockMembership = createMockMembership({ id: 'm1' })

import { createMockProfile } from '@/test/fixtures'

const completeProfile = createMockProfile({
  phone: '555-1234',
  emergency_contact_name: 'Bob',
  emergency_contact_phone: '555-5678',
})

describe('GET /auth/callback', () => {
  beforeEach(() => {
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(createNotification).mockReset()
    vi.mocked(createNotification).mockResolvedValue(undefined)
    vi.mocked(deleteNotificationByType).mockReset()
    vi.mocked(deleteNotificationByType).mockResolvedValue(undefined)
    vi.mocked(getActiveMemberships).mockReset()
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    vi.mocked(getProfilesByUserIds).mockReset()
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    vi.mocked(claimManagedMember).mockReset()
    vi.mocked(claimManagedMember).mockResolvedValue(undefined)
    mockCookiesSet.mockReset()
    mockRedirect.mockImplementation((url: string | URL) => ({
      url: url.toString(),
      status: 302,
      cookies: { set: mockCookiesSet },
    }))
  })

  it('should_exchange_code_for_session_when_code_is_present', async () => {
    const mockExchange = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: { exchangeCodeForSession: mockExchange },
    } as any)
    vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=test-code')
    await GET(request as any)

    expect(mockExchange).toHaveBeenCalledWith('test-code')
  })

  it('should_redirect_to_error_page_when_no_code_is_present', async () => {
    const request = new Request('http://localhost:3000/auth/callback')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })

  it('should_redirect_to_error_page_when_session_exchange_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        exchangeCodeForSession: vi.fn().mockResolvedValue({
          error: { message: 'exchange failed' },
        }),
      },
    } as any)

    const request = new Request('http://localhost:3000/auth/callback?code=bad-code')
    await GET(request as any)

    expect(mockRedirect).toHaveBeenCalledWith(
      'http://localhost:3000/login?error=auth_callback_failed'
    )
  })

  describe('without barn param', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockReset()
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: 'user@barn.com' } as any)
    })

    it('should_redirect_to_barn_home_when_single_active_membership', async () => {
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres')
    })

    it('should_redirect_to_barns_when_multiple_active_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barns')
    })

    it('should_redirect_to_barn_pending_when_single_pending_membership', async () => {
      const barn = createMockBarn({ slug: 'green-acres' })
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn, membership: createMockMembership({ status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/pending')
    })

    it('should_redirect_to_barns_when_multiple_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'pending' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barns')
    })

    it('should_redirect_to_login_no_barns_when_no_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/login?no_barns=true')
    })

    it('should_redirect_to_login_no_barns_when_user_is_null', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/login?no_barns=true')
    })

    it('should_redirect_to_active_barn_when_user_has_mixed_active_and_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'active-barn' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'pending-barn' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/active-barn')
    })

    it('should_set_barn_session_cookie_for_active_barn_when_mixed_active_and_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'active-barn' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'pending-barn' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_active-barn',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/active-barn/' })
      )
    })

    it('should_not_set_barn_session_cookie_for_pending_barn_when_mixed_active_and_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'active-barn' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'pending-barn' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalledWith(
        'barn_session_pending-barn',
        expect.any(String),
        expect.any(Object)
      )
    })

    it('should_set_barn_session_cookie_when_single_active_membership', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/green-acres/' })
      )
    })

    it('should_set_barn_session_cookie_for_first_barn_when_multiple_active_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_barn-one',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/barn-one/' })
      )
    })

    it('should_set_barn_session_cookie_for_second_barn_when_multiple_active_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_barn-two',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/barn-two/' })
      )
    })

    it('should_not_set_barn_session_cookie_when_single_pending_membership', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('should_not_set_barn_session_cookie_when_multiple_pending_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'pending' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'pending' }) },
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('should_not_set_barn_session_cookie_when_no_memberships', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    describe('profile completeness check', () => {
      beforeEach(() => {
        vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
          { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
        ])
      })

      it('should_redirect_to_profile_complete_when_phone_is_null', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete?barn=green-acres')
      })

      it('should_redirect_to_profile_complete_when_emergency_contact_name_is_null', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: '555-1234', emergency_contact_name: null, emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete?barn=green-acres')
      })

      it('should_redirect_to_profile_complete_when_emergency_contact_phone_is_null', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: '555-1234', emergency_contact_name: 'Bob', emergency_contact_phone: null })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete?barn=green-acres')
      })

      it('should_not_redirect_to_profile_complete_when_all_contact_fields_are_present', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).not.toHaveBeenCalledWith(expect.stringContaining('/profile/complete'))
      })

      it('should_redirect_to_profile_complete_when_profile_is_null', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(null)

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete?barn=green-acres')
      })

      it('should_redirect_to_profile_complete_when_multiple_active_memberships_and_phone_is_null', async () => {
        vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
          { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
          { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
        ])
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete')
      })

      it('should_not_redirect_to_profile_complete_on_db_error_and_proceed_to_barn', async () => {
        vi.mocked(getProfileByUserId).mockRejectedValue(new Error('db error'))

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockRedirect).not.toHaveBeenCalledWith('http://localhost:3000/profile/complete')
        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres')
      })

      it('should_set_barn_session_cookie_when_incomplete_profile_and_single_active_membership', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockCookiesSet).toHaveBeenCalledWith(
          'barn_session_green-acres',
          'user-1',
          expect.objectContaining({ httpOnly: true, path: '/barn/green-acres/' })
        )
      })

      it('should_set_barn_session_cookie_for_first_barn_when_incomplete_profile_and_multiple_active_memberships', async () => {
        vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
          { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
          { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
        ])
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockCookiesSet).toHaveBeenCalledWith(
          'barn_session_barn-one',
          'user-1',
          expect.objectContaining({ httpOnly: true, path: '/barn/barn-one/' })
        )
      })

      it('should_set_barn_session_cookie_for_second_barn_when_incomplete_profile_and_multiple_active_memberships', async () => {
        vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
          { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
          { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
        ])
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code')
        await GET(request as any)

        expect(mockCookiesSet).toHaveBeenCalledWith(
          'barn_session_barn-two',
          'user-1',
          expect.objectContaining({ httpOnly: true, path: '/barn/barn-two/' })
        )
      })
    })
  })

  describe('with barn param', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockReset()
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: 'trainer@barn.com' } as any)
    })

    it('should_set_barn_session_cookie_when_user_has_active_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/green-acres/' })
      )
    })

    it('should_redirect_to_barn_home_when_user_has_active_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/')
    })

    it('should_redirect_to_register_when_user_has_no_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/barn/green-acres/register'
      )
    })

    it('should_redirect_to_pending_page_when_user_has_pending_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'm1', status: 'pending' }) as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/barn/green-acres/pending'
      )
    })

    it('should_not_set_session_cookie_for_pending_membership', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'm1', status: 'pending' }) as any)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalled()
    })

    it('should_redirect_to_login_error_when_barn_slug_is_not_found', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(null)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=unknown-barn')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith(
        'http://localhost:3000/login?error=auth_callback_failed'
      )
    })

    it('should_redirect_to_profile_complete_when_barn_login_and_phone_is_null', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/profile/complete?barn=green-acres')
    })

    it('should_redirect_to_barn_home_when_barn_login_and_profile_is_complete', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/')
    })

    it('should_redirect_to_barn_home_on_profile_db_error_when_barn_login', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)
      vi.mocked(getProfileByUserId).mockRejectedValue(new Error('db error'))

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/')
    })

    it('should_set_barn_session_cookie_when_barn_login_and_profile_is_incomplete', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ httpOnly: true, path: '/barn/green-acres/' })
      )
    })

    it('should_treat_membership_as_null_when_user_is_null_after_exchange', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue(null)
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

      const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
      await GET(request as any)

      expect(getUserMembership).not.toHaveBeenCalled()
      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/register')
    })

    describe('notification generation', () => {
      beforeEach(() => {
        vi.mocked(createClient).mockReset()
        vi.mocked(createClient).mockResolvedValue({
          auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
        } as any)
        vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: 'user@barn.com' } as any)
        vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
        vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)
      })

      it('should_create_incomplete_profile_notification_when_phone_is_null_with_barn_param', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(
          createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
        )

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
          userId: 'user-1',
          barnId: mockBarn.id,
          type: 'incomplete_profile',
        }))
      })

      it('should_not_create_incomplete_profile_notification_when_profile_is_complete_with_barn_param', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'incomplete_profile' }))
      })

      it('should_create_member_incomplete_profile_notification_when_manager_with_incomplete_members_with_barn_param', async () => {
        vi.mocked(getUserMembership).mockResolvedValue(
          createMockMembership({ id: 'm1', role: 'manager' }) as any
        )
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
        vi.mocked(getActiveMemberships).mockResolvedValue([
          createMockMembership({ id: 'm2', user_id: 'member-1', role: 'rider' }),
        ])
        vi.mocked(getProfilesByUserIds).mockResolvedValue([
          createMockProfile({ user_id: 'member-1', phone: null }),
        ])

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
          userId: 'user-1',
          barnId: mockBarn.id,
          type: 'member_incomplete_profile',
        }))
      })

      it('should_not_block_login_when_notification_creation_fails_with_barn_param', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
        vi.mocked(createNotification).mockRejectedValue(new Error('db error'))

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres/')
      })

      it('should_delete_incomplete_profile_notification_when_profile_is_complete_with_barn_param', async () => {
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(deleteNotificationByType).toHaveBeenCalledWith('user-1', mockBarn.id, 'incomplete_profile')
      })

      it('should_delete_member_incomplete_profile_notification_when_all_members_are_complete_with_barn_param', async () => {
        vi.mocked(getUserMembership).mockResolvedValue(
          createMockMembership({ id: 'm1', role: 'manager' }) as any
        )
        vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
        vi.mocked(getActiveMemberships).mockResolvedValue([
          createMockMembership({ id: 'm2', user_id: 'member-1', role: 'rider' }),
        ])
        vi.mocked(getProfilesByUserIds).mockResolvedValue([
          createMockProfile({
            user_id: 'member-1',
            phone: '555-9999',
            emergency_contact_name: 'Alice',
            emergency_contact_phone: '555-8888',
          }),
        ])

        const request = new Request('http://localhost:3000/auth/callback?code=code&barn=green-acres')
        await GET(request as any)

        expect(deleteNotificationByType).toHaveBeenCalledWith('user-1', mockBarn.id, 'member_incomplete_profile')
      })
    })
  })

  describe('notification generation without barn param', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockReset()
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: 'user@barn.com' } as any)
    })

    it('should_create_incomplete_profile_notification_when_phone_is_null', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        barnId: 'barn-1',
        type: 'incomplete_profile',
      }))
    })

    it('should_create_incomplete_profile_notification_for_first_barn_when_multiple_active', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ barnId: 'b1', type: 'incomplete_profile' }))
    })

    it('should_create_incomplete_profile_notification_for_second_barn_when_multiple_active', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ id: 'b1', slug: 'barn-one' }), membership: createMockMembership({ id: 'm1', status: 'active' }) },
        { barn: createMockBarn({ id: 'b2', slug: 'barn-two' }), membership: createMockMembership({ id: 'm2', status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({ barnId: 'b2', type: 'incomplete_profile' }))
    })

    it('should_not_create_incomplete_profile_notification_when_profile_is_complete', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'incomplete_profile' }))
    })

    it('should_create_member_incomplete_profile_notification_when_manager_with_incomplete_members', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'manager' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(getActiveMemberships).mockResolvedValue([
        createMockMembership({ id: 'm2', user_id: 'member-1', role: 'rider' }),
      ])
      vi.mocked(getProfilesByUserIds).mockResolvedValue([
        createMockProfile({ user_id: 'member-1', phone: null }),
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        barnId: 'barn-1',
        type: 'member_incomplete_profile',
      }))
    })

    it('should_not_create_member_incomplete_profile_notification_when_user_is_trainer', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'trainer' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'member_incomplete_profile' }))
    })

    it('should_not_create_member_incomplete_profile_notification_when_all_members_are_complete', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'manager' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(getActiveMemberships).mockResolvedValue([
        createMockMembership({ id: 'm2', user_id: 'member-1', role: 'rider' }),
      ])
      vi.mocked(getProfilesByUserIds).mockResolvedValue([
        createMockProfile({
          user_id: 'member-1',
          phone: '555-9999',
          emergency_contact_name: 'Alice',
          emergency_contact_phone: '555-8888',
        }),
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'member_incomplete_profile' }))
    })

    it('should_not_create_member_incomplete_profile_notification_when_no_other_members', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'manager' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(getActiveMemberships).mockResolvedValue([
        createMockMembership({ user_id: 'user-1', role: 'manager' }),
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(createNotification).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'member_incomplete_profile' }))
    })

    it('should_not_block_login_when_notification_creation_fails', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(createNotification).mockRejectedValue(new Error('db error'))

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockRedirect).toHaveBeenCalledWith('http://localhost:3000/barn/green-acres')
    })

    it('should_delete_incomplete_profile_notification_when_profile_is_complete', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(deleteNotificationByType).toHaveBeenCalledWith('user-1', 'barn-1', 'incomplete_profile')
    })

    it('should_delete_member_incomplete_profile_notification_when_all_members_are_complete', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'manager' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(getActiveMemberships).mockResolvedValue([
        createMockMembership({ id: 'm2', user_id: 'member-1', role: 'rider' }),
      ])
      vi.mocked(getProfilesByUserIds).mockResolvedValue([
        createMockProfile({
          user_id: 'member-1',
          phone: '555-9999',
          emergency_contact_name: 'Alice',
          emergency_contact_phone: '555-8888',
        }),
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(deleteNotificationByType).toHaveBeenCalledWith('user-1', 'barn-1', 'member_incomplete_profile')
    })

    it('should_delete_member_incomplete_profile_notification_when_no_other_members', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn(), membership: createMockMembership({ status: 'active', role: 'manager' }) },
      ])
      vi.mocked(getProfileByUserId).mockResolvedValue(completeProfile)
      vi.mocked(getActiveMemberships).mockResolvedValue([
        createMockMembership({ user_id: 'user-1', role: 'manager' }),
      ])

      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(deleteNotificationByType).toHaveBeenCalledWith('user-1', 'barn-1', 'member_incomplete_profile')
    })
  })

  describe('remember me cookie handling', () => {
    function makeRequest(url: string, cookies: Record<string, string> = {}) {
      return {
        url,
        cookies: {
          get: (name: string) => (name in cookies ? { name, value: cookies[name] } : undefined),
        },
      } as any
    }

    beforeEach(() => {
      vi.mocked(createClient).mockReset()
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-1', email: 'user@barn.com' } as any)
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
        { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
      ])
    })

    it('should_set_barn_session_cookie_with_max_age_when_remember_me_is_1', async () => {
      const request = makeRequest('http://localhost:3000/auth/callback?code=code', { remember_me: '1' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ maxAge: 2592000 })
      )
    })

    it('should_set_barn_session_cookie_without_max_age_when_remember_me_is_0', async () => {
      const request = makeRequest('http://localhost:3000/auth/callback?code=code', { remember_me: '0' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.not.objectContaining({ maxAge: expect.anything() })
      )
    })

    it('should_set_barn_session_cookie_without_max_age_when_remember_me_is_absent', async () => {
      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.not.objectContaining({ maxAge: expect.anything() })
      )
    })

    it('should_clear_remember_me_cookie_when_present', async () => {
      const request = makeRequest('http://localhost:3000/auth/callback?code=code', { remember_me: '1' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith('remember_me', '', { maxAge: 0, path: '/' })
    })

    it('should_clear_remember_me_cookie_when_value_is_0', async () => {
      const request = makeRequest('http://localhost:3000/auth/callback?code=code', { remember_me: '0' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith('remember_me', '', { maxAge: 0, path: '/' })
    })

    it('should_not_clear_remember_me_cookie_when_absent', async () => {
      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)

      expect(mockCookiesSet).not.toHaveBeenCalledWith('remember_me', expect.anything(), expect.anything())
    })

    it('should_set_barn_session_cookie_with_max_age_when_remember_me_is_1_with_barn_param', async () => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
      vi.mocked(getUserMembership).mockResolvedValue(mockMembership as any)

      const request = makeRequest('http://localhost:3000/auth/callback?code=code&barn=green-acres', { remember_me: '1' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ maxAge: 2592000 })
      )
    })

    it('should_set_barn_session_cookie_with_max_age_when_remember_me_is_1_and_profile_incomplete', async () => {
      vi.mocked(getProfileByUserId).mockResolvedValue(
        createMockProfile({ phone: null, emergency_contact_name: 'Bob', emergency_contact_phone: '555-5678' })
      )

      const request = makeRequest('http://localhost:3000/auth/callback?code=code', { remember_me: '1' })
      await GET(request)

      expect(mockCookiesSet).toHaveBeenCalledWith(
        'barn_session_green-acres',
        'user-1',
        expect.objectContaining({ maxAge: 2592000 })
      )
    })
  })

  describe('invite token claim', () => {
    beforeEach(() => {
      vi.mocked(createClient).mockResolvedValue({
        auth: { exchangeCodeForSession: vi.fn().mockResolvedValue({ error: null }) },
      } as any)
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-99', email: 'new@example.com' } as any)
    })

    it('should_call_claimManagedMember_when_token_param_present', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
      const request = new Request('http://localhost:3000/auth/callback?code=code&token=tok-123')
      await GET(request as any)
      expect(claimManagedMember).toHaveBeenCalledWith('tok-123', 'user-99', 'new@example.com')
    })

    it('should_redirect_to_error_when_claim_throws_user_already_claimed', async () => {
      vi.mocked(claimManagedMember).mockRejectedValue(new Error('user_already_claimed'))
      const request = new Request('http://localhost:3000/auth/callback?code=code&token=tok-123')
      await GET(request as any)
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('invite_claim_failed'))
    })

    it('should_redirect_to_error_when_claim_throws_token_not_found', async () => {
      vi.mocked(claimManagedMember).mockRejectedValue(new Error('token_not_found'))
      const request = new Request('http://localhost:3000/auth/callback?code=code&token=bad-tok')
      await GET(request as any)
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('invite_claim_failed'))
    })

    it('should_not_call_claimManagedMember_when_no_token_param', async () => {
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
      const request = new Request('http://localhost:3000/auth/callback?code=code')
      await GET(request as any)
      expect(claimManagedMember).not.toHaveBeenCalled()
    })

    it('should_call_claim_with_null_when_user_email_is_null', async () => {
      vi.mocked(getAuthenticatedUser).mockResolvedValue({ id: 'user-99', email: null } as any)
      vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
      const request = new Request('http://localhost:3000/auth/callback?code=code&token=tok-123')
      await GET(request as any)
      expect(claimManagedMember).toHaveBeenCalledWith('tok-123', 'user-99', null)
    })

    it('should_redirect_to_barn_login_on_claim_error_when_barn_slug_present', async () => {
      vi.mocked(claimManagedMember).mockRejectedValue(new Error('token_not_found'))
      const request = new Request('http://localhost:3000/auth/callback?code=code&token=bad-tok&barn=green-acres')
      await GET(request as any)
      expect(mockRedirect).toHaveBeenCalledWith(expect.stringContaining('/barn/green-acres/login'))
    })
  })
})
