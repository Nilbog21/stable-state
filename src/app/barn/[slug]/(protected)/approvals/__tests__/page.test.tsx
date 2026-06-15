import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getPendingMemberships: vi.fn(),
  getActiveMemberships: vi.fn(),
}))
vi.mock('@/lib/db/effective-membership', () => ({ getEffectiveMembership: vi.fn() }))
vi.mock('@/lib/db/profiles', () => ({ getProfilesByUserIds: vi.fn() }))
vi.mock('../actions', () => ({
  approveMembershipAction: vi.fn(),
  rejectMembershipAction: vi.fn(),
  removeMembershipAction: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import {
  getPendingMemberships,
  getActiveMemberships,
} from '@/lib/db/barn-memberships'
import { getEffectiveMembership } from '@/lib/db/effective-membership'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import ApprovalsPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager', created_at: '2026-01-01T00:00:00Z' })
const pendingMembership = createMockMembership({ id: 'mem-pending', user_id: 'user-2', status: 'pending', created_at: '2026-01-02T00:00:00Z' })
const activeMembership = createMockMembership({ id: 'mem-active', user_id: 'user-3', created_at: '2026-01-03T00:00:00Z' })

const mockProfiles = [
  createMockProfile({ user_id: 'user-2', first_name: 'Jane', last_name: 'Doe' }),
  createMockProfile({ user_id: 'user-3', first_name: 'Bob', last_name: 'Smith' }),
]

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getEffectiveMembership).mockResolvedValue(managerMembership)
    vi.mocked(getPendingMemberships).mockResolvedValue([])
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    Object.defineProperty(window, 'location', {
      value: { origin: 'https://example.com' },
      writable: true,
      configurable: true,
    })
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(ApprovalsPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getEffectiveMembership).mockResolvedValue(null)
    await expect(ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_barn_name_in_heading', async () => {
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_render_no_pending_requests_message_when_none_exist', async () => {
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no pending requests/i)).toBeDefined()
  })

  it('should_render_pending_member_row_with_approve_and_reject_buttons', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue(mockProfiles)
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /approve/i })).toBeDefined()
    expect(screen.getByRole('button', { name: /reject/i })).toBeDefined()
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_show_unknown_for_pending_member_with_no_matching_profile', async () => {
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Unknown')).toBeDefined()
  })

  it('should_render_active_members_section_for_manager', async () => {
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue(mockProfiles)
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/active members/i)).toBeDefined()
  })

  it('should_render_no_active_members_message_when_removable_is_empty', async () => {
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no active members/i)).toBeDefined()
  })

  it('should_render_remove_button_for_non_self_active_members', async () => {
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue(mockProfiles)
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
    expect(screen.getByText('Bob Smith')).toBeDefined()
  })

  it('should_render_invite_link_section', async () => {
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/invite link/i)).toBeDefined()
  })
})
