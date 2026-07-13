import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockUser } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({
  getUserMembership: vi.fn(),
  claimManagedMember: vi.fn(),
}))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership, claimManagedMember } from '@/lib/db/barn-memberships'
import BarnRegisterPage from '../page'

const mockBarn = createMockBarn()

function renderPage(slug: string, token?: string) {
  return BarnRegisterPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(token ? { token } : {}),
  })
}

describe('BarnRegisterPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(claimManagedMember).mockReset()
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth(createMockUser())
    vi.mocked(getUserMembership).mockResolvedValue(null)
    vi.mocked(claimManagedMember).mockResolvedValue(undefined)
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

  it('should_redirect_to_pending_when_user_has_pending_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await expect(renderPage('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_render_invalid_invite_message_when_user_has_no_email', async () => {
    setupAuth({ id: 'user-1', email: null })
    const jsx = await renderPage('green-acres', 'tok-1')
    render(jsx)
    expect(screen.getByText(/invalid or has expired/i)).toBeDefined()
  })

  it('should_claim_membership_with_token_user_id_and_email', async () => {
    setupAuth(createMockUser({ id: 'user-1', email: 'jane@example.com' }))
    await renderPage('green-acres', 'tok-1').catch(() => {})
    expect(claimManagedMember).toHaveBeenCalledWith('tok-1', 'user-1', 'jane@example.com')
  })

  it('should_redirect_to_barn_home_after_successful_claim', async () => {
    await expect(renderPage('green-acres', 'tok-1')).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/')
  })

  it('should_render_invalid_invite_message_when_claim_fails', async () => {
    vi.mocked(claimManagedMember).mockRejectedValue(new Error('token_not_found'))
    const jsx = await renderPage('green-acres', 'tok-1')
    render(jsx)
    expect(screen.getByText(/invalid or has expired/i)).toBeDefined()
  })
})
