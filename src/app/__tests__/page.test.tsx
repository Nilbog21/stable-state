import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'

afterEach(cleanup)

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import Home from '../page'

function makeSupabase(error: unknown = null) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ error }),
    },
  }
}

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_render_stable_state_heading', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase() as any)
    const jsx = await Home()
    render(jsx)
    expect(screen.getByRole('heading', { name: /stable state/i })).toBeDefined()
  })

  it('should_show_connected_status_when_supabase_has_no_error', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase(null) as any)
    const jsx = await Home()
    render(jsx)
    expect(screen.getByText(/supabase connected/i)).toBeDefined()
  })

  it('should_show_env_vars_message_when_supabase_returns_error', async () => {
    vi.mocked(createClient).mockResolvedValue(makeSupabase(new Error('not configured')) as any)
    const jsx = await Home()
    render(jsx)
    expect(screen.getByText(/supabase env vars not set/i)).toBeDefined()
  })
})
