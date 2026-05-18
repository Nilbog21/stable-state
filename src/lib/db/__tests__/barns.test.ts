import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '../barns'

const mockBarn = {
  id: 'barn-1',
  name: 'Green Acres',
  slug: 'green-acres',
  created_at: '2026-05-16T00:00:00Z',
}

describe('getBarnBySlug', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_barn_when_slug_exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockBarn,
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const result = await getBarnBySlug('green-acres')

    expect(result).toEqual(mockBarn)
  })

  it('should_return_null_when_slug_does_not_exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const result = await getBarnBySlug('unknown-slug')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getBarnBySlug('some-slug')).rejects.toThrow('query failed')
  })
})
