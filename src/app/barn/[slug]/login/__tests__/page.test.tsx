import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { createMockBarn } from '@/test/fixtures'

vi.mock('@/lib/db/barns', () => ({
  getBarnBySlug: vi.fn(),
}))

vi.mock('next/navigation', () => ({
  notFound: vi.fn(),
}))

vi.mock('@/app/actions/auth', () => ({
  signInWithGoogleForBarn: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { getBarnBySlug } from '@/lib/db/barns'
import { notFound } from 'next/navigation'
import { cookies } from 'next/headers'
import BarnLoginPage from '../page'

const mockBarn = createMockBarn()

function mockPrefCookie(value?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'remember_me_pref' && value !== undefined ? { name, value } : undefined,
  } as any)
}

describe('BarnLoginPage', () => {
  beforeEach(() => {
    vi.mocked(cookies).mockReset()
    mockPrefCookie()
  })

  it('should_render_login_page_with_barn_name_when_slug_is_valid', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

    const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByText(/green acres/i)).toBeDefined()
  })

  it('should_render_sign_in_button_when_slug_is_valid', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)

    const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
    render(jsx)

    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_call_notFound_when_barn_slug_does_not_exist', async () => {
    vi.mocked(getBarnBySlug).mockResolvedValue(null)
    vi.mocked(notFound).mockImplementation(() => {
      throw new Error('NEXT_NOT_FOUND')
    })

    await expect(
      BarnLoginPage({ params: Promise.resolve({ slug: 'unknown-slug' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  describe('keep me logged in checkbox', () => {
    beforeEach(() => {
      vi.mocked(getBarnBySlug).mockResolvedValue(mockBarn)
    })

    it('should_render_checkbox_checked_when_no_pref_cookie', async () => {
      const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('should_render_checkbox_unchecked_when_pref_cookie_is_0', async () => {
      mockPrefCookie('0')
      const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('should_render_checkbox_checked_when_pref_cookie_is_1', async () => {
      mockPrefCookie('1')
      const jsx = await BarnLoginPage({ params: Promise.resolve({ slug: 'green-acres' }), searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })
  })
})
