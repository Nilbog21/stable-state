import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockUser } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getAuthenticatedUser } from '../auth'

describe('getAuthenticatedUser', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_user_when_authenticated', async () => {
    const mockUser = createMockUser()
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: mockUser } }) },
    } as any)

    const result = await getAuthenticatedUser()

    expect(result).toEqual(mockUser)
  })

  it('should_return_null_when_not_authenticated', async () => {
    vi.mocked(createClient).mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    } as any)

    const result = await getAuthenticatedUser()

    expect(result).toBeNull()
  })
})
