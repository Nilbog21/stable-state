import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { createMockProfile } from '@/test/fixtures'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  getProfileByUserId: vi.fn(),
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

import { createClient } from '@/lib/supabase/server'
import { getProfileByUserId } from '@/lib/db/profiles'
import ProfilePage from '../page'
import ProfileCompletePage from '../complete/page'

const mockProfile = createMockProfile()

function mockAuth(user: { id: string; email: string } | null) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}

describe('ProfilePage', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getProfileByUserId).mockReset()
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

    const jsx = await ProfilePage()
    render(jsx as React.ReactElement)

    expect(screen.getByRole('heading', { name: /edit profile/i })).toBeDefined()
  })
})

describe('ProfileCompletePage', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
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
