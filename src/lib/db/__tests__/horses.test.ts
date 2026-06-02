import { describe, it, expect, vi } from 'vitest'
import { createMockHorse } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getHorsesByBarn, createHorse, updateHorse } from '../horses'

const mockHorses = [
  createMockHorse({ id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01', updated_at: '2026-01-01' }),
  createMockHorse({ id: 'horse-2', name: 'Shadow', created_at: '2026-01-02', updated_at: '2026-01-02' }),
]

describe('getHorsesByBarn', () => {
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

describe('createHorse', () => {
  const newHorse = createMockHorse({ id: 'horse-3', name: 'Blaze', created_at: '2026-01-03', updated_at: '2026-01-03' })

  it('should_create_horse_in_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: newHorse, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createHorse('barn-1', 'Blaze')

    expect(result).toEqual(newHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(createHorse('barn-1', 'Blaze')).rejects.toThrow('db error')
  })
})

describe('updateHorse', () => {
  const updatedHorse = createMockHorse({ id: 'horse-1', name: 'Blaze Updated' })

  it('should_return_updated_horse_on_success', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: updatedHorse, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await updateHorse('horse-1', 'Blaze Updated')

    expect(result).toEqual(updatedHorse)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateHorse('horse-1', 'Blaze Updated')).rejects.toThrow('db error')
  })
})
