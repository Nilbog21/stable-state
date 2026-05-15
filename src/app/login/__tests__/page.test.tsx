import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/app/actions/auth', () => ({
  signInWithGoogle: vi.fn(),
}))

import LoginPage from '../page'

describe('LoginPage', () => {
  it('should_render_sign_in_with_google_button', () => {
    render(<LoginPage />)
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeDefined()
  })

  it('should_render_app_name', () => {
    render(<LoginPage />)
    expect(screen.getByText(/stable state/i)).toBeDefined()
  })
})
