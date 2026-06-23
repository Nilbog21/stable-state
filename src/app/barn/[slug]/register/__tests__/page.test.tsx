import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn, createMockMembership } from '@/test/fixtures'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/lib/db/auth', () => ({ getAuthenticatedUser: vi.fn() }))
vi.mock('@/lib/db/barns', () => ({ getBarnBySlug: vi.fn() }))
vi.mock('@/lib/db/barn-memberships', () => ({ getUserMembership: vi.fn() }))
vi.mock('../actions', () => ({ registerForBarn: vi.fn() }))
vi.mock('../RegisterForm', () => ({ RegisterForm: vi.fn(() => null) }))

const mockNotFound = vi.hoisted(() => vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }))
const mockRedirect = vi.hoisted(() => vi.fn((url: string) => {
  throw Object.assign(new Error('NEXT_REDIRECT'), { digest: `NEXT_REDIRECT;replace;${url}` })
}))
vi.mock('next/navigation', () => ({ notFound: mockNotFound, redirect: mockRedirect }))

import { getBarnBySlug } from '@/lib/db/barns'
import { getUserMembership } from '@/lib/db/barn-memberships'
import BarnRegisterPage from '../page'

const mockBarn = createMockBarn()

function makeUser(meta: Record<string, string> = {}) {
  return { id: 'user-1', user_metadata: meta }
}

describe('BarnRegisterPage', () => {
  beforeEach(() => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    setupAuth(makeUser({ full_name: 'Jane Doe' }))
    vi.mocked(getUserMembership).mockResolvedValue(null)
  })

  it('should_call_notFound_when_barn_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    await expect(BarnRegisterPage({ params: Promise.resolve({ slug: 'unknown' }) })).rejects.toThrow('NEXT_NOT_FOUND')
    expect(mockNotFound).toHaveBeenCalled()
  })

  it('should_redirect_to_login_when_user_is_not_authenticated', async () => {
    setupAuth(null)
    await expect(BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/login')
  })

  it('should_redirect_to_barn_home_when_user_has_active_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership())
    await expect(BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/')
  })

  it('should_redirect_to_pending_when_user_has_pending_membership', async () => {
    vi.mocked(getUserMembership).mockResolvedValue(createMockMembership({ status: 'pending' }))
    await expect(BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(mockRedirect).toHaveBeenCalledWith('/barn/green-acres/pending')
  })

  it('should_render_join_barn_heading_for_new_user', async () => {
    const jsx = await BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })

  it('should_extract_first_and_last_name_from_full_name_metadata', async () => {
    setupAuth(makeUser({ full_name: 'Jane Doe' }))
    const jsx = await BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })

  it('should_use_given_name_and_family_name_when_no_full_name', async () => {
    setupAuth(makeUser({ given_name: 'Jane', family_name: 'Smith' }))
    const jsx = await BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })

  it('should_render_with_empty_names_when_no_user_metadata', async () => {
    setupAuth(makeUser())
    const jsx = await BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })

  it('should_render_correctly_when_user_metadata_is_null', async () => {
    setupAuth({ id: 'user-1', user_metadata: null })
    const jsx = await BarnRegisterPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)
    expect(screen.getByRole('heading', { name: /join green acres/i })).toBeDefined()
  })
})
