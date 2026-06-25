import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile } from '@/test/fixtures'

afterEach(cleanup)

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfileByUserId: vi.fn(),
}))

vi.mock('@/lib/db/barn-memberships', () => ({
  getBarnMembershipsForUser: vi.fn(),
}))

vi.mock('../ProfileForm', () => ({
  ProfileForm: vi.fn((props: { heading: string }) => <h1>{props.heading}</h1>),
}))

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw Object.assign(new Error('NEXT_REDIRECT'), {
      digest: `NEXT_REDIRECT;replace;${url}`,
    })
  })
)

vi.mock('next/navigation', () => ({
  redirect: mockRedirect,
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('../actions', () => ({
  updateProfileAction: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { getProfileByUserId } from '@/lib/db/profiles'
import { getBarnMembershipsForUser } from '@/lib/db/barn-memberships'
import { ProfileForm } from '../ProfileForm'
import ProfilePage from '../page'
import ProfileCompletePage from '../complete/page'

const mockProfile = createMockProfile()

function mockAuth(user: { id: string; email: string } | null) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    mockRedirect.mockClear()
  })

  it('should_redirect_to_login_when_not_authenticated', async () => {
    mockAuth(null)

    await expect(ProfilePage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
  })

  it('should_redirect_to_login_when_profile_not_found', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(null)

    await expect(ProfilePage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
  })

  it('should_render_profile_form_when_authenticated_with_profile', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)

    const jsx = await ProfilePage({ searchParams: Promise.resolve({}) })
    render(jsx as React.ReactElement)

    expect(screen.getByRole('heading', { name: /edit profile/i })).toBeDefined()
  })
})

describe('ProfilePage - redirectAfterSave', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(getBarnMembershipsForUser).mockReset()
    vi.mocked(ProfileForm).mockClear()
    mockRedirect.mockClear()
  })

  it('should_pass_redirect_to_barn_slug_when_user_has_one_active_membership', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'green-acres' }), membership: createMockMembership({ status: 'active' }) },
    ])
    render((await ProfilePage()) as React.ReactElement)
    const [props] = vi.mocked(ProfileForm).mock.calls[0]
    expect(props.redirectAfterSave).toBe('/barn/green-acres')
  })

  it('should_pass_redirect_to_barns_when_user_has_multiple_active_memberships', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ id: 'barn-1', slug: 'barn-1-slug' }), membership: createMockMembership({ status: 'active' }) },
      { barn: createMockBarn({ id: 'barn-2', slug: 'barn-2-slug' }), membership: createMockMembership({ id: 'mem-2', barn_id: 'barn-2', status: 'active' }) },
    ])
    render((await ProfilePage()) as React.ReactElement)
    const [props] = vi.mocked(ProfileForm).mock.calls[0]
    expect(props.redirectAfterSave).toBe('/barns')
  })

  it('should_pass_redirect_to_barns_when_user_has_no_active_memberships', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([])
    render((await ProfilePage()) as React.ReactElement)
    const [props] = vi.mocked(ProfileForm).mock.calls[0]
    expect(props.redirectAfterSave).toBe('/barns')
  })

  it('should_pass_redirect_to_barn_slug_when_barn_param_is_present', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)
    vi.mocked(getBarnMembershipsForUser).mockResolvedValue([
      { barn: createMockBarn({ slug: 'barn-a' }), membership: createMockMembership({ status: 'active' }) },
      { barn: createMockBarn({ id: 'barn-2', slug: 'barn-b' }), membership: createMockMembership({ id: 'mem-2', barn_id: 'barn-2', status: 'active' }) },
    ])
    render((await ProfilePage({ searchParams: Promise.resolve({ barn: 'barn-a' }) })) as React.ReactElement)
    const [props] = vi.mocked(ProfileForm).mock.calls[0]
    expect(props.redirectAfterSave).toBe('/barn/barn-a')
  })
})

describe('ProfileCompletePage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
    mockRedirect.mockClear()
  })

  it('should_redirect_to_login_when_not_authenticated', async () => {
    mockAuth(null)

    await expect(ProfileCompletePage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
  })

  it('should_redirect_to_login_when_profile_not_found', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(null)

    await expect(ProfileCompletePage()).rejects.toMatchObject({ digest: expect.stringContaining('/login') })
  })

  it('should_render_complete_your_profile_heading_when_authenticated_with_profile', async () => {
    mockAuth({ id: 'user-1', email: 'user@example.com' })
    vi.mocked(getProfileByUserId).mockResolvedValue(mockProfile)

    const jsx = await ProfileCompletePage()
    render(jsx as React.ReactElement)

    expect(screen.getByRole('heading', { name: /complete your profile/i })).toBeDefined()
  })
})
