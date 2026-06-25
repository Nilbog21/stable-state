import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('../../../actions', () => ({
  createTierAction: vi.fn(),
}))
vi.mock('../../TierForm', () => ({
  TierForm: ({ mode }: { mode: string }) => (
    <div data-testid="tier-form" data-mode={mode}>TierForm</div>
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
import TierNewPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })

describe('TierNewPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      TierNewPage({ params: Promise.resolve({ slug: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_fn_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await TierNewPage({ params: Promise.resolve({ slug: 'unknown' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    await expect(
      TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    try { await TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'trainer', status: 'active' })
    )

    await expect(
      TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'trainer', status: 'active' })
    )

    try { await TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_render_tier_form_in_new_mode', async () => {
    const jsx = await TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    const form = screen.getByTestId('tier-form')
    expect(form.getAttribute('data-mode')).toBe('new')
  })

  it('should_render_new_tier_heading', async () => {
    const jsx = await TierNewPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('New Tier')
  })
})
