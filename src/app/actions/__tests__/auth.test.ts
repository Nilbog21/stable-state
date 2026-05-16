import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { signInWithGoogle, signOut, signInWithGoogleForBarn } from '../auth'

describe('signInWithGoogle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_signInWithOAuth_with_google_provider', async () => {
    const mockSignInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithOAuth: mockSignInWithOAuth },
    } as any)

    await signInWithGoogle()

    expect(mockSignInWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' })
    )
  })

  it('should_redirect_to_oauth_url_on_success', async () => {
    const oauthUrl = 'https://accounts.google.com/oauth?client_id=xxx'
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: oauthUrl },
          error: null,
        }),
      },
    } as any)

    await signInWithGoogle()

    expect(redirect).toHaveBeenCalledWith(oauthUrl)
  })

  it('should_redirect_to_error_page_when_oauth_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: null },
          error: { message: 'oauth error' },
        }),
      },
    } as any)

    await signInWithGoogle()

    expect(redirect).toHaveBeenCalledWith('/login?error=oauth_failed')
  })
})

describe('signInWithGoogleForBarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_include_barn_slug_in_callback_redirect_url', async () => {
    const mockSignInWithOAuth = vi.fn().mockResolvedValue({
      data: { url: 'https://accounts.google.com/oauth' },
      error: null,
    })
    vi.mocked(createClient).mockResolvedValue({
      auth: { signInWithOAuth: mockSignInWithOAuth },
    } as any)

    await signInWithGoogleForBarn('green-acres')

    const callArgs = mockSignInWithOAuth.mock.calls[0][0]
    expect(callArgs.options.redirectTo).toContain('barn=green-acres')
  })

  it('should_redirect_to_oauth_url_on_success', async () => {
    const oauthUrl = 'https://accounts.google.com/oauth?client_id=xxx'
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: oauthUrl },
          error: null,
        }),
      },
    } as any)

    await signInWithGoogleForBarn('green-acres')

    expect(redirect).toHaveBeenCalledWith(oauthUrl)
  })

  it('should_redirect_to_login_error_when_slug_contains_invalid_characters', async () => {
    await signInWithGoogleForBarn('../../etc')

    expect(redirect).toHaveBeenCalledWith('/login?error=invalid_barn')
  })

  it('should_redirect_to_barn_login_error_page_when_oauth_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithOAuth: vi.fn().mockResolvedValue({
          data: { url: null },
          error: { message: 'oauth error' },
        }),
      },
    } as any)

    await signInWithGoogleForBarn('green-acres')

    expect(redirect).toHaveBeenCalledWith('/barn/green-acres/login?error=oauth_failed')
  })
})

describe('signOut', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_call_supabase_signOut', async () => {
    const mockSignOut = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut: mockSignOut },
    } as any)

    await signOut()

    expect(mockSignOut).toHaveBeenCalled()
  })

  it('should_redirect_to_login_after_sign_out', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { signOut: vi.fn().mockResolvedValue({ error: null }) },
    } as any)

    await signOut()

    expect(redirect).toHaveBeenCalledWith('/login')
  })
})
