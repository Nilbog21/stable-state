import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getAdminMembership: vi.fn(),
  getPendingMemberships: vi.fn(),
  getActiveMemberships: vi.fn(),
}))
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

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '@/lib/db/barns'
import {
  getUserMembership,
  getAdminMembership,
  getPendingMemberships,
  getActiveMemberships,
} from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import ApprovalsPage from '../page'

const mockBarn = { id: 'barn-1', name: 'Green Acres', slug: 'green-acres', created_at: '' }
const mockUser = { id: 'user-1' }

const managerMembership = {
  id: 'mem-mgr', user_id: 'user-1', barn_id: 'barn-1',
  role: 'manager' as const, status: 'active' as const, created_at: '2026-01-01T00:00:00Z',
}
const adminMembership = {
  id: 'mem-adm', user_id: 'user-1', barn_id: null,
  role: 'admin' as const, status: 'active' as const, created_at: '2026-01-01T00:00:00Z',
}
const pendingMembership = {
  id: 'mem-pending', user_id: 'user-2', barn_id: 'barn-1',
  role: 'trainer' as const, status: 'pending' as const, created_at: '2026-01-02T00:00:00Z',
}
const activeMembership = {
  id: 'mem-active', user_id: 'user-3', barn_id: 'barn-1',
  role: 'trainer' as const, status: 'active' as const, created_at: '2026-01-03T00:00:00Z',
}

const mockProfiles = [
  { user_id: 'user-2', first_name: 'Jane', last_name: 'Doe', created_at: '' },
  { user_id: 'user-3', first_name: 'Bob', last_name: 'Smith', created_at: '' },
]

function setupAuth(user: typeof mockUser | null = mockUser) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

describe('ApprovalsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
    vi.mocked(getPendingMemberships).mockResolvedValue([])
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
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

  it('should_redirect_to_login_when_user_is_not_manager_or_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(null)
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

  it('should_not_render_active_members_section_for_manager', async () => {
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText(/active members/i)).toBeNull()
  })

  it('should_render_active_members_section_for_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue(mockProfiles)
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/active members/i)).toBeDefined()
  })

  it('should_render_no_active_members_message_when_removable_is_empty', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/no active members/i)).toBeDefined()
  })

  it('should_render_remove_button_for_non_self_active_members_as_admin', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getAdminMembership).mockResolvedValue(adminMembership)
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMembership])
    vi.mocked(getProfilesByUserIds).mockResolvedValue(mockProfiles)
    const jsx = await ApprovalsPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
    expect(screen.getByText('Bob Smith')).toBeDefined()
  })
})
