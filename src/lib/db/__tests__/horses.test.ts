import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getHorsesByBarn } from '../horses'

const mockHorses = [
  { id: 'horse-1', barn_id: 'barn-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' },
  { id: 'horse-2', barn_id: 'barn-1', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' },
]

describe('getHorsesByBarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_horses_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockHorses, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual(mockHorses)
  })

  it('should_return_empty_array_when_no_horses', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getHorsesByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(getHorsesByBarn('barn-1')).rejects.toThrow('db error')
  })
})
