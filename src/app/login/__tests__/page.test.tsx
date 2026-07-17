import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/app/actions/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/db/auth', () => ({
  getAuthenticatedUser: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}))

import { getAuthenticatedUser } from '@/lib/db/auth'
import { cookies } from 'next/headers'
import LoginPage from '../page'

function mockPrefCookie(value?: string) {
  vi.mocked(cookies).mockResolvedValue({
    get: (name: string) =>
      name === 'remember_me_pref' && value !== undefined ? { name, value } : undefined,
  } as any)
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedUser).mockReset()
    vi.mocked(cookies).mockReset()
    setupAuth(null)
    mockPrefCookie()
  })

  it('should_render_sign_in_with_google_button', async () => {
    const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_render_app_name', async () => {
    const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByText(/stable state/i)).toBeDefined()
  })

  it('should_render_privacy_policy_link', async () => {
    const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByRole('link', { name: /privacy policy/i })).toHaveProperty(
      'href',
      expect.stringContaining('/privacy')
    )
  })

  it('should_show_no_barns_guidance_when_param_true_and_user_authenticated', async () => {
    setupAuth()
    const jsx = await LoginPage({ searchParams: Promise.resolve({ no_barns: 'true' }) })
    render(jsx)
    expect(screen.getByText(/not a member of any barn/i)).toBeDefined()
  })

  it('should_hide_sign_in_button_when_no_barns_param_true_and_user_authenticated', async () => {
    setupAuth()
    const jsx = await LoginPage({ searchParams: Promise.resolve({ no_barns: 'true' }) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /sign in/i })).toBeNull()
  })

  it('should_show_sign_in_button_when_no_barns_param_true_but_user_not_authenticated', async () => {
    setupAuth(null)
    const jsx = await LoginPage({ searchParams: Promise.resolve({ no_barns: 'true' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_show_sign_in_button_when_no_barns_param_absent', async () => {
    setupAuth()
    const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_show_sign_out_button_when_no_barns_param_is_true', async () => {
    setupAuth()
    const jsx = await LoginPage({ searchParams: Promise.resolve({ no_barns: 'true' }) })
    render(jsx)
    expect(screen.getByRole('button', { name: /sign out/i })).toBeDefined()
  })

  it('should_not_show_sign_out_button_when_no_barns_param_is_absent', async () => {
    setupAuth()
    const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
    render(jsx)
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull()
  })

  describe('keep me logged in checkbox', () => {
    it('should_render_checkbox_checked_when_no_pref_cookie', async () => {
      const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })

    it('should_render_checkbox_unchecked_when_pref_cookie_is_0', async () => {
      mockPrefCookie('0')
      const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(false)
    })

    it('should_render_checkbox_checked_when_pref_cookie_is_1', async () => {
      mockPrefCookie('1')
      const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
      render(jsx)
      const checkbox = screen.getByRole('checkbox', { name: /keep me logged in/i }) as HTMLInputElement
      expect(checkbox.checked).toBe(true)
    })
  })

  describe('connection status', () => {
    afterEach(() => {
      vi.unstubAllEnvs()
    })

    it('should_show_connected_indicator_when_supabase_url_is_set', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
      const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
      render(jsx)
      expect(screen.getByText(/supabase connected/i)).toBeDefined()
    })

    it('should_show_env_vars_not_set_when_supabase_url_is_missing', async () => {
      vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
      const jsx = await LoginPage({ searchParams: Promise.resolve({}) })
      render(jsx)
      expect(screen.getByText(/supabase env vars not set/i)).toBeDefined()
    })
  })
})
