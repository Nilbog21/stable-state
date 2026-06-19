import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockLessonTier, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getPendingMemberships: vi.fn(),
  getActiveMemberships: vi.fn(),
}))
vi.mock('@/lib/db/profiles', () => ({ getProfilesByUserIds: vi.fn() }))
vi.mock('../actions', () => ({
  createTierAction: vi.fn(),
  updateTierAction: vi.fn(),
  setDefaultTierAction: vi.fn(),
  deactivateTierAction: vi.fn(),
  approveMembershipAction: vi.fn(),
  rejectMembershipAction: vi.fn(),
  removeMembershipAction: vi.fn(),
}))
vi.mock('../DeactivateButton', () => ({
  DeactivateButton: ({ action }: { action: () => Promise<void> }) => (
    <form action={action}><button type="submit">Deactivate</button></form>
  ),
}))
vi.mock('../InviteLink', () => ({
  default: ({ slug }: { slug: string }) => (
    <div data-testid="invite-link" data-slug={slug}>Invite Link</div>
  ),
}))

const mockNotFound = vi.hoisted(() =>
  vi.fn(() => { throw new Error('NEXT_NOT_FOUND') })
)
const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getAllTiersByBarn } from '@/lib/db/lesson-tiers'
import { getPendingMemberships, getActiveMemberships } from '@/lib/db/barn-memberships'
import { getProfilesByUserIds } from '@/lib/db/profiles'
import SettingsPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })

describe('SettingsPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getAllTiersByBarn).mockReset()
    vi.mocked(getPendingMemberships).mockReset()
    vi.mocked(getActiveMemberships).mockReset()
    vi.mocked(getProfilesByUserIds).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getAllTiersByBarn).mockResolvedValue([])
    vi.mocked(getPendingMemberships).mockResolvedValue([])
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'unknown' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)

    await expect(
      SettingsPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_REDIRECT')

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_manage_barn_heading', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Manage Barn')
  })

  it('should_render_active_tier_in_list', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByDisplayValue('Standard')).toBeDefined()
  })

  it('should_render_inactive_tier_in_list', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-2', name: 'Premium', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByDisplayValue('Premium')).toBeDefined()
  })

  it('should_render_default_badge_for_default_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_default: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/default/i)).toBeDefined()
  })

  it('should_render_inactive_status_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-2', name: 'Premium', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/inactive/i)).toBeDefined()
  })

  it('should_render_add_tier_form', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /add tier/i })).toBeDefined()
  })

  it('should_render_empty_price_input_when_tier_price_is_null', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', price: null }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const priceInputs = screen
      .getAllByDisplayValue('')
      .filter((el) => (el as HTMLInputElement).name === 'price' && !(el as HTMLInputElement).id)
    expect(priceInputs.length).toBe(1)
  })

  it('should_render_save_button_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /^save$/i })).toBeDefined()
  })

  it('should_not_render_save_button_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.queryByRole('button', { name: /^save$/i })).toBeNull()
  })

  it('should_render_disabled_name_input_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByDisplayValue('Standard') as HTMLInputElement
    expect(input.disabled).toBe(true)
  })

  it('should_display_error_message_when_error_search_param_matches_tier_id', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_default: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({
        error: 'cannot_deactivate_default',
        errorTierId: 'tier-1',
      }),
    })
    render(jsx)

    expect(screen.getByText(/cannot deactivate the default tier/i)).toBeDefined()
  })

  it('should_render_invite_link_section', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByTestId('invite-link')).toBeDefined()
  })

  it('should_render_no_pending_requests_message_when_none_exist', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/no pending requests/i)).toBeDefined()
  })

  it('should_render_approve_button_for_pending_member', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    const profile = createMockProfile({ user_id: 'user-2', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /approve/i })).toBeDefined()
  })

  it('should_render_reject_button_for_pending_member', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    const profile = createMockProfile({ user_id: 'user-2', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /reject/i })).toBeDefined()
  })

  it('should_render_profile_name_for_pending_member', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    const profile = createMockProfile({ user_id: 'user-2', first_name: 'Jane', last_name: 'Doe' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_active_members_section', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /active members/i })).toBeDefined()
  })

  it('should_render_no_active_members_message_when_removable_is_empty', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/no active members/i)).toBeDefined()
  })

  it('should_show_unknown_for_pending_member_with_no_matching_profile', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-99', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Unknown')).toBeDefined()
  })

  it('should_render_remove_button_for_non_self_active_member', async () => {
    const activeMember = createMockMembership({ id: 'mem-a', user_id: 'user-3', created_at: '2026-01-01T00:00:00Z' })
    const profile = createMockProfile({ user_id: 'user-3', first_name: 'Bob', last_name: 'Smith' })
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_render_profile_name_for_active_member', async () => {
    const activeMember = createMockMembership({ id: 'mem-a', user_id: 'user-3', created_at: '2026-01-01T00:00:00Z' })
    const profile = createMockProfile({ user_id: 'user-3', first_name: 'Bob', last_name: 'Smith' })
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
    vi.mocked(getProfilesByUserIds).mockResolvedValue([profile])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Bob Smith')).toBeDefined()
  })
})
