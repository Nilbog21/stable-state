import { vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'
import { createMockUser } from '@/test/fixtures'

export function setupAuth(user = createMockUser()) {
  vi.mocked(createClient).mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user } }) },
  } as any)
}
