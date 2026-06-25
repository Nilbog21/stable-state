import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership, createMockLessonTier } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('@/lib/db/lesson-tiers', () => ({ getTierById: vi.fn() }))
vi.mock('../../../actions', () => ({
  updateTierAction: vi.fn(),
  deactivateTierAction: vi.fn(),
  reactivateTierAction: vi.fn(),
}))
vi.mock('../../TierForm', () => ({
  TierForm: ({ mode, initialTier }: { mode: string; initialTier?: { name: string } }) => (
    <div data-testid="tier-form" data-mode={mode} data-tier-name={initialTier?.name}>
      TierForm
    </div>
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
import { getTierById } from '@/lib/db/lesson-tiers'
import TierEditPage from '../page'

const mockBarn = createMockBarn()
const managerMembership = createMockMembership({ role: 'manager', status: 'active' })
const mockTier = createMockLessonTier({ id: 'tier-1', name: 'Standard' })

describe('TierEditPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockReset()
    vi.mocked(getUserMembership).mockReset()
    vi.mocked(getTierById).mockReset()
    mockNotFound.mockClear()
    mockRedirect.mockClear()
    setupAuth()
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    vi.mocked(getUserMembership).mockResolvedValue(managerMembership)
    vi.mocked(getTierById).mockResolvedValue(mockTier)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    await expect(
      TierEditPage({ params: Promise.resolve({ slug: 'unknown', id: 'tier-1' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_fn_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)

    try { await TierEditPage({ params: Promise.resolve({ slug: 'unknown', id: 'tier-1' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    await expect(
      TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)

    try { await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'trainer', status: 'active' })
    )

    await expect(
      TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) })
    ).rejects.toThrow('NEXT_REDIRECT')
  })

  it('should_redirect_to_login_when_user_is_not_manager', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(
      createMockMembership({ role: 'trainer', status: 'active' })
    )

    try { await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) }) } catch {}

    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_call_notFound_when_tier_does_not_exist', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    await expect(
      TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'unknown' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')
  })

  it('should_call_notFound_fn_when_tier_does_not_exist', async () => {
    vi.mocked(getTierById).mockResolvedValue(null)

    try { await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'unknown' }) }) } catch {}

    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_render_tier_form_in_edit_mode', async () => {
    const jsx = await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) })
    render(jsx)

    const form = screen.getByTestId('tier-form')
    expect(form.getAttribute('data-mode')).toBe('edit')
  })

  it('should_pass_tier_data_to_form', async () => {
    const jsx = await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) })
    render(jsx)

    const form = screen.getByTestId('tier-form')
    expect(form.getAttribute('data-tier-name')).toBe('Standard')
  })

  it('should_render_edit_tier_heading', async () => {
    const jsx = await TierEditPage({ params: Promise.resolve({ slug: 'green-acres', id: 'tier-1' }) })
    render(jsx)

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Edit Tier')
  })
})
