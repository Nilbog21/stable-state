import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockRider } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getRidersByBarn, createRider } from '../riders'

const mockRiders = [
  createMockRider({ id: 'rider-1', name: 'Alice', created_at: '2026-01-01', updated_at: '2026-01-01' }),
  createMockRider({ id: 'rider-2', name: 'Bob', created_at: '2026-01-02', updated_at: '2026-01-02' }),
]

describe('getRidersByBarn', () => {
  it('should_return_riders_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: mockRiders, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getRidersByBarn('barn-1')

    expect(result).toEqual(mockRiders)
  })

  it('should_return_empty_array_when_no_riders', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getRidersByBarn('barn-1')

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

    await expect(getRidersByBarn('barn-1')).rejects.toThrow('db error')
  })
})

const mockNewRider = { id: 'rider-3', barn_id: 'barn-1', name: 'Carol', created_at: '2026-01-03', updated_at: '2026-01-03' }

describe('createRider', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_insert_rider_and_return_created_row', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockNewRider, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createRider('barn-1', 'Carol')

    expect(result).toEqual(mockNewRider)
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

    await expect(createRider('barn-1', 'Carol')).rejects.toThrow('db error')
  })

  it('should_include_user_id_in_insert_when_provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockNewRider, user_id: 'user-1' }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createRider('barn-1', 'Carol', 'user-1')

    expect(mockInsert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Carol', user_id: 'user-1' })
  })

  it('should_omit_user_id_from_insert_when_not_provided', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockNewRider, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createRider('barn-1', 'Carol')

    expect(mockInsert).toHaveBeenCalledWith({ barn_id: 'barn-1', name: 'Carol' })
  })
})
