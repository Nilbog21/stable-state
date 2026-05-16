import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

vi.mock('@/app/actions/auth', () => ({
  signInWithGoogleForBarn: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { notFound } from 'next/navigation'
import BarnLoginPage from '../page'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-05-16T00:00:00Z',
}

describe('BarnLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_render_login_page_with_barn_name_when_slug_is_valid', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

    const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_render_sign_in_button_when_slug_is_valid', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

    const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }) })
    render(jsx)

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_call_notFound_when_barn_slug_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      BarnLoginPage({ params: Promise.resolve({ slug: 'unknown-slug' }) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })
})
