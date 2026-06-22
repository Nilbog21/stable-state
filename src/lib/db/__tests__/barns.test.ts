import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug } from '../barns'

const mockBarn = createMockBarn()

describe('getBarnBySlug', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
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

  it('should_use_injected_client_when_provided', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockBarn, error: null }),
          }),
        }),
      }),
    } as any

    const result = await getBarnBySlug('injected-slug', mockClient)

    expect(result).toEqual(mockBarn)
  })
})
