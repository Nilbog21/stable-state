import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'
import { withBlocker } from '@/test/navigation-blocker-harness'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getActiveMembersWithProfiles: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({ getProfileByUserId: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, getActiveMembersWithProfiles } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import MembersPage from '../page'

describe('MembersPage — navigation dirty state', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(createMockBarn())
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ id: 'mem-mgr', role: 'manager' }))
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile({ user_id: 'user-1' }))
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
  })

  it('should_set_dirty_when_add_member_first_name_typed', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(withBlocker(jsx))
    fireEvent.change(screen.getAllByPlaceholderText('First name')[0], { target: { value: 'Alice' } })
    expect(screen.getByTestId('dirty').textContent).toBe('dirty')
  })
})
