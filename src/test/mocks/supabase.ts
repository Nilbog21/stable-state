import { vi } from 'vitest'
import { createClient } from '@/lib/supabase/server'

export function mockSupabaseSelect(data: unknown, error: unknown = null) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  } as any)
}

export function mockSupabaseInsert(data: unknown, error: unknown = null) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  } as any)
}

export function mockSupabaseUpsert(data: unknown, error: unknown = null) {
  vi.mocked(createClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data, error }),
        }),
      }),
    }),
  } as any)
}
