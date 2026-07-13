import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

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

const mockBarn = createMockBarn()
const mockProfile = createMockProfile({ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' })
const managerMembership = createMockMembership({ id: 'mem-mgr', role: 'manager' })
const trainerMembership = createMockMembership({ id: 'mem-trn', role: 'trainer' })
const riderMembership = createMockMembership({ id: 'mem-rdr', role: 'rider' })

const mockTrainers = [
  { membershipId: 'mem-t1', userId: 'u-t1', name: 'Alice Trainer', isManaged: false, inviteToken: null },
  { membershipId: 'mem-t2', userId: 'u-t2', name: 'Bob Trainer', isManaged: false, inviteToken: null },
]
const mockRiders = [
  { membershipId: 'mem-r1', userId: 'u-r1', name: 'Carol Rider', isManaged: false, inviteToken: null },
  { membershipId: 'mem-r2', userId: 'u-r2', name: 'Dave Rider', isManaged: false, inviteToken: null },
]
const mockManagers = [
  { membershipId: 'mem-m1', userId: 'u-m1', name: 'Eve Manager', isManaged: false, inviteToken: null },
]

describe('MembersPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth()
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(MembersPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_user_has_no_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(null)
    await expect(MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_login_when_membership_is_pending', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await expect(MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_members_heading', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /members/i })).toBeDefined()
  })

  it('should_render_you_card_for_manager', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_you_card_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_you_card_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Jane Doe')).toBeDefined()
  })

  it('should_render_you_heading_in_text_sm', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /^you$/i }).className).toContain('text-sm')
  })

  it('should_link_you_card_to_own_detail_page', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const youLink = screen.getByRole('link', { name: /jane doe/i })
    expect((youLink as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-mgr$/)
  })

  it('should_render_trainers_section_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /trainers/i })).toBeDefined()
  })

  it('should_render_trainers_heading_in_text_sm', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /trainers/i }).className).toContain('text-sm')
  })

  it('should_render_first_trainer_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Alice Trainer')).toBeDefined()
  })

  it('should_render_second_trainer_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Bob Trainer')).toBeDefined()
  })

  it('should_render_riders_section_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /riders/i })).toBeDefined()
  })

  it('should_render_riders_heading_in_text_sm', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /riders/i }).className).toContain('text-sm')
  })

  it('should_render_first_rider_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Carol Rider')).toBeDefined()
  })

  it('should_render_second_rider_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Dave Rider')).toBeDefined()
  })

  it('should_link_trainer_card_to_detail_page', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? mockTrainers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /alice trainer/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-t1$/)
  })

  it('should_link_rider_card_to_detail_page', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? mockRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /carol rider/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-r1$/)
  })

  it('should_render_trainers_section_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue(mockRiders)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /trainers/i })).toBeDefined()
  })

  it('should_render_riders_section_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue(mockRiders)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /riders/i })).toBeDefined()
  })

  it('should_render_trainers_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /trainers/i })).toBeDefined()
  })

  it('should_render_riders_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /riders/i })).toBeDefined()
  })

  it('should_fetch_managers_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'manager')
  })

  it('should_fetch_trainers_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'trainer')
  })

  it('should_fetch_riders_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'rider')
  })

  it('should_fetch_managers_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'manager')
  })

  it('should_fetch_trainers_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'trainer')
  })

  it('should_fetch_riders_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'rider')
  })

  it('should_fetch_managers_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'manager')
  })

  it('should_fetch_trainers_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'trainer')
  })

  it('should_fetch_riders_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'rider')
  })

  it('should_show_you_label_on_you_card', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText(/you/i)).toBeDefined()
  })

  it('should_display_email_when_profile_is_null', async () => {
    vi.mocked(getProfileByUserId).mockResolvedValue(null)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('user@example.com')).toBeDefined()
  })

  it('should_display_you_fallback_when_profile_and_email_are_null', async () => {
    setupAuth({ id: 'user-1', email: null })
    vi.mocked(getProfileByUserId).mockResolvedValue(null)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getAllByText('You').length).toBeGreaterThan(0)
  })

  it('should_show_empty_state_in_trainers_section_when_no_trainers', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No trainers yet')).toBeDefined()
  })

  it('should_show_empty_state_in_riders_section_when_no_riders_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No riders yet')).toBeDefined()
  })

  it('should_show_empty_state_in_riders_section_when_no_riders_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No riders yet')).toBeDefined()
  })

  it('should_fetch_managers_for_manager', async () => {
    await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    expect(vi.mocked(getActiveMembersWithProfiles)).toHaveBeenCalledWith('barn-1', 'manager')
  })

  it('should_render_managers_section_for_manager', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'manager' ? mockManagers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /managers/i })).toBeDefined()
  })

  it('should_render_managers_heading_in_text_sm', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'manager' ? mockManagers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /managers/i }).className).toContain('text-sm')
  })

  it('should_render_manager_name_card', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'manager' ? mockManagers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Eve Manager')).toBeDefined()
  })

  it('should_link_manager_card_to_detail_page', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'manager' ? mockManagers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /eve manager/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-m1$/)
  })

  it('should_exclude_caller_from_managers_section', async () => {
    const callerAsManager = { membershipId: 'mem-mgr', userId: 'user-1', name: 'Jane Doe', isManaged: false, inviteToken: null }
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'manager' ? [callerAsManager, ...mockManagers] : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /jane doe/i })
    expect(links).toHaveLength(1)
  })

  it('should_show_empty_state_in_managers_section_when_no_other_managers', async () => {
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('No managers yet')).toBeDefined()
  })

  it('should_render_managers_section_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    vi.mocked(getActiveMembersWithProfiles).mockResolvedValue([])
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /managers/i })).toBeDefined()
  })

  it('should_render_managers_section_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /managers/i })).toBeDefined()
  })

  it('should_exclude_caller_from_trainers_section_when_caller_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const callerAsTrainer = { membershipId: 'mem-trn', userId: 'user-1', name: 'Jane Doe', isManaged: false, inviteToken: null }
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? [callerAsTrainer, ...mockTrainers] : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /jane doe/i })
    expect(links).toHaveLength(1)
  })

  it('should_exclude_caller_from_riders_section_when_caller_is_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const callerAsRider = { membershipId: 'mem-rdr', userId: 'user-1', name: 'Jane Doe', isManaged: false, inviteToken: null }
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? [callerAsRider, ...mockRiders] : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const links = screen.getAllByRole('link', { name: /jane doe/i })
    expect(links).toHaveLength(1)
  })

  it('should_not_render_add_rider_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add rider/i })).toBeNull()
  })

  it('should_not_render_add_rider_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add rider/i })).toBeNull()
  })

  it('should_not_render_add_trainer_form_for_rider', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add trainer/i })).toBeNull()
  })

  it('should_not_render_unlinked_badge_when_invite_token_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const managedRiderNoToken = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: null },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiderNoToken : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Unlinked')).toBeNull()
  })

  it('should_render_plain_card_link_when_invite_token_is_null', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(riderMembership)
    const managedRiderNoToken = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: null },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiderNoToken : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /ghost rider/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-m1$/)
  })

  it('should_render_unlinked_badge_for_managed_rider', async () => {
    const managedRiders = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: 'tok-1' },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Unlinked')).toBeDefined()
  })

  it('should_not_render_unlinked_badge_for_managed_rider_when_viewer_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const managedRiders = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: 'tok-1' },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByText('Unlinked')).toBeNull()
  })

  it('should_not_render_revoke_button_for_managed_rider_when_viewer_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const managedRiders = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: 'tok-1' },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /revoke/i })).toBeNull()
  })

  it('should_render_plain_card_link_for_managed_rider_when_viewer_is_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const managedRiders = [
      { membershipId: 'mem-m1', userId: null, name: 'Ghost Rider', isManaged: true, inviteToken: 'tok-1' },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'rider' ? managedRiders : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    const link = screen.getByRole('link', { name: /ghost rider/i })
    expect((link as HTMLAnchorElement).href).toMatch(/\/barn\/green-acres\/members\/mem-m1$/)
  })

  it('should_render_add_trainer_form_for_manager', async () => {
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /add trainer/i })).toBeDefined()
  })

  it('should_not_render_add_trainer_form_for_trainer', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(trainerMembership)
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /add trainer/i })).toBeNull()
  })

  it('should_render_unlinked_badge_for_managed_trainer', async () => {
    const managedTrainers = [
      { membershipId: 'mem-t1', userId: null, name: 'Ghost Trainer', isManaged: true, inviteToken: 'tok-2' },
    ]
    vi.mocked(getActiveMembersWithProfiles).mockImplementation(async (_, role) =>
      role === 'trainer' ? managedTrainers : []
    )
    const jsx = await MembersPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByText('Unlinked')).toBeDefined()
  })
})
