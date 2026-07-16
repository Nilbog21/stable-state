import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockLessonTier } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getPendingMemberships: vi.fn(),
  getActiveMemberships: vi.fn(),
}))
vi.mock('@/lib/db/member-names', () => ({
  resolveMemberNames: vi.fn(),
}))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('../approvals/actions', () => ({
  approveMembershipAction: vi.fn(),
  rejectMembershipAction: vi.fn(),
  removeMembershipAction: vi.fn(),
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
import { resolveMemberNames } from '@/lib/db/member-names'
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
    vi.mocked(resolveMemberNames).mockReset()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getAllTiersByBarn).mockResolvedValue([])
    vi.mocked(getPendingMemberships).mockResolvedValue([])
    vi.mocked(getActiveMemberships).mockResolvedValue([])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())
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

  it('should_render_tier_name_as_text_in_list', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Standard')).toBeDefined()
  })

  it('should_render_active_status_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Active')).toBeDefined()
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

    expect(screen.getByText('Inactive')).toBeDefined()
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

    expect(screen.getAllByText('Default').length).toBe(2)
  })

  it('should_render_dollar_price_when_tier_price_is_set', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', price: 50 }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('$50')).toBeDefined()
  })

  it('should_render_edit_link_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const link = screen.getByRole('link', { name: /^edit$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings/tiers/tier-1')
  })

  it('should_render_edit_link_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-2', name: 'Premium', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const link = screen.getByRole('link', { name: /^edit$/i }) as HTMLAnchorElement
    expect(link.href).toContain('/barn/green-acres/settings/tiers/tier-2')
  })

  it('should_render_add_tier_link_navigating_to_new_page', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const [link] = screen.getAllByRole('link', { name: /add tier/i }) as HTMLAnchorElement[]
    expect(link.href).toContain('/barn/green-acres/settings/tiers/new')
  })

  it('should_not_render_add_tier_link_inside_summary', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    const [link] = screen.getAllByRole('link', { name: /add tier/i })
    const summary = heading.closest('summary') as HTMLElement
    expect(summary.contains(link)).toBe(false)
  })

  it('should_render_add_tier_link_within_lesson_tiers_section', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    const [link] = screen.getAllByRole('link', { name: /add tier/i })
    const sectionWrapper = heading.closest('details')!.parentElement as HTMLElement
    expect(sectionWrapper.contains(link)).toBe(true)
  })

  it('should_render_pending_requests_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /pending requests/i }).className).toContain('uppercase')
  })

  it('should_render_lesson_tiers_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /lesson tiers/i }).className).toContain('uppercase')
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
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-p', 'Jane Doe']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /approve/i })).toBeDefined()
  })

  it('should_render_reject_button_for_pending_member', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-p', 'Jane Doe']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /reject/i })).toBeDefined()
  })

  it('should_render_profile_name_for_pending_member', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-p', 'Jane Doe']]))

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

  it('should_render_active_members_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /active members/i }).className).toContain('uppercase')
  })

  it('should_render_no_active_members_message_when_removable_is_empty', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/no active members/i)).toBeDefined()
  })

  it('should_render_membership_id_for_pending_member_when_name_unresolved', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-99', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('mem-p')).toBeDefined()
  })

  it('should_render_remove_button_for_non_self_active_member', async () => {
    const activeMember = createMockMembership({ id: 'mem-a', user_id: 'user-3', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-a', 'Bob Smith']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('button', { name: /remove/i })).toBeDefined()
  })

  it('should_render_profile_name_for_active_member', async () => {
    const activeMember = createMockMembership({ id: 'mem-a', user_id: 'user-3', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-a', 'Bob Smith']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Bob Smith')).toBeDefined()
  })

  describe('joined date timezone', () => {
    let originalTz: string | undefined

    beforeEach(() => {
      originalTz = process.env.TZ
      process.env.TZ = 'America/New_York'
    })

    afterEach(() => {
      process.env.TZ = originalTz
    })

    it('should_render_joined_date_in_the_viewers_local_timezone_not_utc', async () => {
      // 2026-01-02T02:00:00Z is 9:00 PM EST on Jan 1 — a UTC-anchored formatter
      // would show Jan 2 instead.
      const activeMember = createMockMembership({ id: 'mem-a', user_id: 'user-3', created_at: '2026-01-02T02:00:00Z' })
      vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
      vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-a', 'Bob Smith']]))

      const jsx = await SettingsPage({
        params: Promise.resolve({ slug: 'green-acres' }),
        searchParams: Promise.resolve({}),
      })
      render(jsx)

      expect(screen.getByText('Jan 1, 2026')).toBeDefined()
    })
  })

  it('should_render_membership_id_for_active_member_when_name_unresolved', async () => {
    const activeMember = createMockMembership({ id: 'mem-b', user_id: 'user-4', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getActiveMemberships).mockResolvedValue([activeMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map())

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('mem-b')).toBeDefined()
  })

  it('should_render_real_name_for_managed_unclaimed_active_member', async () => {
    const managedMember = createMockMembership({ id: 'mem-c', user_id: null as any, created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getActiveMemberships).mockResolvedValue([managedMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-c', 'Casey Managed']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText('Casey Managed')).toBeDefined()
  })

  it('should_render_default_instructor_cut_heading', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /default instructor cut/i })).toBeDefined()
  })

  it('should_render_instructor_cut_input_with_barn_default_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/default per-lesson instructor cut/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.default_instructor_cut))
  })

  it('should_render_instructor_cut_does_not_affect_past_lessons_helper_text', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/doesn't affect past lessons/i)).toBeDefined()
  })

  it('should_render_default_board_fee_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/monthly fee/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.default_board_fee))
  })

  it('should_render_non_retroactive_helper_text', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByText(/applies to new boarding agreements only/i)).toBeDefined()
  })

  it('should_render_barn_timezone_select_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const select = screen.getByLabelText(/timezone/i) as HTMLSelectElement
    expect(select.value).toBe(mockBarn.timezone)
  })

  it('should_render_barn_timezone_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /barn timezone/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_exhaustion_thresholds_heading_in_label_style', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    expect(screen.getByRole('heading', { name: /horse exhaustion thresholds/i }).className).toContain('uppercase')
  })

  it('should_render_moderate_threshold_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/moderate threshold/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.exhaustion_threshold_moderate))
  })

  it('should_render_high_threshold_input_with_current_value', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const input = screen.getByLabelText(/high threshold/i) as HTMLInputElement
    expect(input.value).toBe(String(mockBarn.exhaustion_threshold_high))
  })

  it('should_render_pending_requests_section_open_when_pending_count_is_positive', async () => {
    const pendingMember = createMockMembership({ id: 'mem-p', user_id: 'user-2', status: 'pending', created_at: '2026-01-01T00:00:00Z' })
    vi.mocked(getPendingMemberships).mockResolvedValue([pendingMember])
    vi.mocked(resolveMemberNames).mockResolvedValue(new Map([['mem-p', 'Jane Doe']]))

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /pending requests/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(true)
  })

  it('should_render_pending_requests_section_closed_when_pending_count_is_zero', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /pending requests/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_active_members_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /active members/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_default_instructor_cut_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /default instructor cut/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_exhaustion_thresholds_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /horse exhaustion thresholds/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_lesson_tiers_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /lesson tiers/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })

  it('should_render_default_board_fee_section_closed_by_default', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const heading = screen.getByRole('heading', { name: /default board fee/i })
    expect((heading.closest('details') as HTMLDetailsElement).open).toBe(false)
  })
})
