import { vi } from 'vitest'
import { getAuthenticatedUser } from '@/lib/db/auth'
import { createMockUser } from '@/test/fixtures'

export function setupAuth(user: Record<string, unknown> | null = createMockUser()) {
  vi.mocked(getAuthenticatedUser).mockResolvedValue(user as any)
}
