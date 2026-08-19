import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockProfile, createMockUser } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/profiles', () => ({ getProfileByUserId: vi.fn() }))
vi.mock('../actions', () => ({ acceptInvite: vi.fn(), signOutAndReturnToInvite: vi.fn() }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import { getProfileByUserId } from '@/lib/db/profiles'
import BarnRegisterPage from '../page'

const mockBarn = createMockBarn()

function renderPage(slug: string, token?: string, error?: string) {
  return BarnRegisterPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({ ...(token ? { token } : {}), ...(error ? { error } : {}) }),
  })
}

describe('BarnRegisterPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth(createMockUser())
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(getProfileByUserId).mockReset()
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile())
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(renderPage('unknown', 'tok-1')).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_invalid_invite_message_when_token_is_missing', async () => {
    const jsx = await renderPage('green-acres')
    render(jsx)
    expect(screen.getByText(/invalid or has expired/i)).toBeDefined()
  })

  it('should_not_call_getAuthenticatedUser_when_token_is_missing', async () => {
    const { getAuthenticatedUser } = await import('@/lib/db/auth')
    await renderPage('green-acres')
    expect(getAuthenticatedUser).not.toHaveBeenCalled()
  })

  it('should_render_invalid_invite_message_when_error_param_is_present', async () => {
    const jsx = await renderPage('green-acres', 'tok-1', '1')
    render(jsx)
    expect(screen.getByText(/invalid or has expired/i)).toBeDefined()
  })

  it('should_redirect_to_login_with_token_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(renderPage('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login?token=tok-1')
  })

  it('should_redirect_to_barn_home_when_user_has_active_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership())
    await expect(renderPage('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/')
  })

  it('should_render_join_barn_heading', async () => {
    const jsx = await renderPage('green-acres', 'tok-1')
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })

  it('should_render_accept_invite_button', async () => {
    const jsx = await renderPage('green-acres', 'tok-1')
    render(jsx)
    expect(screen.getByRole('button', { name: /accept invite/i })).toBeDefined()
  })

  it('should_render_accept_invite_button_even_when_user_has_no_email', async () => {
    setupAuth({ id: 'user-1', email: null })
    const jsx = await renderPage('green-acres', 'tok-1')
    render(jsx)
    expect(screen.getByRole('button', { name: /accept invite/i })).toBeDefined()
  })
})

// #1641. The claimant is shown which account is about to be bound, because this page is the last
// point before a single-use token is spent on it. The demo case gets its own screen rather than
// being left to the RPC — the RPC's rejection would surface as "This invite link is invalid or
// has expired", which is the worst possible message when the invite is fine and the session is
// wrong.
describe('BarnRegisterPage signed-in identity', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset().mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockReset().mockResolvedValue(null)
    vi.mocked(getProfileByUserId).mockReset().mockResolvedValue(createMockProfile())
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    setupAuth(createMockUser())
  })

  it('should_name_the_signed_in_account_above_the_accept_button', async () => {
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByText(/Jane Doe/)).toBeDefined()
    expect(screen.getByText(/user@example.com/)).toBeDefined()
  })

  it('should_offer_a_sign_out_control_on_the_join_screen', async () => {
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })

  it('should_fall_back_to_the_email_alone_when_there_is_no_profile_row', async () => {
    vi.mocked(getProfileByUserId).mockResolvedValue(null)
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByText(/user@example.com/)).toBeDefined()
    expect(screen.getByRole('button', { name: /accept invite/i })).toBeDefined()
  })

  it('should_name_the_account_without_undefined_when_the_session_has_no_email', async () => {
    setupAuth({ id: 'user-1', email: null })
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByText(/no email address/)).toBeDefined()
  })

  it('should_render_the_demo_screen_when_the_session_is_the_demo_account', async () => {
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile({ is_demo: true }))
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByRole('heading', { name: /demo account/i })).toBeDefined()
  })

  it('should_not_render_the_accept_button_when_the_session_is_the_demo_account', async () => {
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile({ is_demo: true }))
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.queryByRole('button', { name: /accept invite/i })).toBeNull()
  })

  it('should_offer_a_sign_out_control_on_the_demo_screen', async () => {
    vi.mocked(getProfileByUserId).mockResolvedValue(createMockProfile({ is_demo: true }))
    render(await renderPage('green-acres', 'tok-1'))
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })
})
