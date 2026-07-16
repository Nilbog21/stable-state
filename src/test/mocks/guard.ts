import { vi } from 'vitest'
import { requireMembership } from '@/lib/auth/guard'
import { createMockBarn, createMockMembership } from '@/test/fixtures'

export function guardAs(membership: ReturnType<typeof createMockMembership>, barn = createMockBarn()) {
  vi.mocked(requireMembership).mockResolvedValue({
    user: { id: 'user-1' } as any,
    barn,
    membership,
  })
}
