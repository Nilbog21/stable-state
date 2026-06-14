import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { setupAuth } from '@/test/mocks/auth'

vi.mock('@/app/actions/auth', () => ({
  signInWithGoogle: vi.fn(),
  signOut: vi.fn(),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import LoginPage from '../page'

describe('LoginPage', () => {
  beforeEach(() => {
    setupAuth(null)
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
})
