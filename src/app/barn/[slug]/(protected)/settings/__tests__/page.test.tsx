import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockLessonTier, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  getPendingMemberships: vi.fn(),
  getActiveMemberships: vi.fn(),
}))
vi.mock('@/lib/db/lesson-tiers', () => ({ getAllTiersByBarn: vi.fn() }))
vi.mock('@/lib/db/profiles', () => ({ getProfilesByUserIds: vi.fn() }))
vi.mock('../actions', () => ({
  createTierAction: vi.fn(),
  updateTierAction: vi.fn(),
  setDefaultTierAction: vi.fn(),
  deactivateTierAction: vi.fn(),
}))
vi.mock('../approvals/actions', () => ({
  approveMembershipAction: vi.fn(),
  rejectMembershipAction: vi.fn(),
  removeMembershipAction: vi.fn(),
}))
vi.mock('../TierRow', () => ({
  TierRow: ({ tier, formId, showError }: { tier: import('@/lib/db/types').LessonTier; formId?: string; showError?: boolean }) => (
    <>
      <tr>
        <td>
          <input type="text" name="name" form={formId} defaultValue={tier.name} disabled={!tier.is_active} />
          {tier.is_default && <span>Default</span>}
        </td>
        <td>
          <input type="number" name="price" form={formId} defaultValue={tier.price ?? ''} disabled={!tier.is_active} />
        </td>
        <td>
          {tier.is_active ? <span>Active</span> : <span>Inactive</span>}
          {showError && <p>Cannot deactivate the default tier</p>}
        </td>
        <td>{tier.is_active && <button type="submit" form={formId}>Save</button>}</td>
        <td></td>
      </tr>
      <tr>
        <td colSpan={5}>
          <label htmlFor={`jumping-${tier.id}`}>Jumping</label>
          <select id={`jumping-${tier.id}`} name="default_jumping" form={formId} defaultValue={tier.default_jumping === null ? '' : String(tier.default_jumping)} disabled={!tier.is_active}>
            <option value="">— no default</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </select>
          <label htmlFor={`exertion-${tier.id}`}>Exertion</label>
          <select id={`exertion-${tier.id}`} name="default_exertion_level" form={formId} defaultValue={tier.default_exertion_level === null ? '' : String(tier.default_exertion_level)} disabled={!tier.is_active}>
            <option value="">— no default</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </td>
      </tr>
    </>
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

    expect(screen.getByText('Default')).toBeDefined()
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

  it('should_render_jumping_select_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    // Two jumping selects: one from TierRow, one from Add Tier form
    const jumpingSelects = screen.getAllByRole('combobox', { name: /jumping/i })
    expect(jumpingSelects.length).toBeGreaterThanOrEqual(2)
  })

  it('should_render_exertion_select_for_active_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    // Two exertion selects: one from TierRow, one from Add Tier form
    const exertionSelects = screen.getAllByRole('combobox', { name: /exertion/i })
    expect(exertionSelects.length).toBeGreaterThanOrEqual(2)
  })

  it('should_render_jumping_and_exertion_selects_disabled_for_inactive_tier', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: false }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    // TierRow renders first (disabled); Add Tier form renders second (enabled)
    const jumpingSelects = screen.getAllByRole('combobox', { name: /jumping/i }) as HTMLSelectElement[]
    const exertionSelects = screen.getAllByRole('combobox', { name: /exertion/i }) as HTMLSelectElement[]
    expect(jumpingSelects[0].disabled).toBe(true)
    expect(exertionSelects[0].disabled).toBe(true)
  })

  it('should_pre_fill_jumping_select_when_tier_has_default_jumping_true', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true, default_jumping: true }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const jumpingSelects = screen.getAllByRole('combobox', { name: /jumping/i }) as HTMLSelectElement[]
    expect(jumpingSelects.some((s) => s.value === 'true')).toBe(true)
  })

  it('should_pre_fill_exertion_select_when_tier_has_default_exertion', async () => {
    vi.mocked(getAllTiersByBarn).mockResolvedValue([
      createMockLessonTier({ id: 'tier-1', name: 'Standard', is_active: true, default_exertion_level: 3 }),
    ])

    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const exertionSelects = screen.getAllByRole('combobox', { name: /exertion/i }) as HTMLSelectElement[]
    expect(exertionSelects.some((s) => s.value === '3')).toBe(true)
  })

  it('should_render_jumping_and_exertion_selects_in_add_tier_form', async () => {
    const jsx = await SettingsPage({
      params: Promise.resolve({ slug: 'green-acres' }),
      searchParams: Promise.resolve({}),
    })
    render(jsx)

    const selects = screen.getAllByRole('combobox')
    expect(selects.length).toBeGreaterThanOrEqual(2)
    expect(selects.some((s) => (s as HTMLSelectElement).name === 'default_jumping')).toBe(true)
    expect(selects.some((s) => (s as HTMLSelectElement).name === 'default_exertion_level')).toBe(true)
  })
})
