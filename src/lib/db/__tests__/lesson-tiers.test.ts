import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getTiersByBarn, createTier, updateTier, deactivateTier, setDefaultTier } from '../lesson-tiers'

const mockTier = {
  id: 'tier-1',
  barn_id: 'barn-1',
  name: 'Standard',
  price: 50,
  is_default: false,
  is_active: true,
  created_at: '2026-06-13T00:00:00Z',
}

describe('getTiersByBarn', () => {
  it('should_return_tiers_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [mockTier], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getTiersByBarn('barn-1')

    expect(result).toEqual([mockTier])
  })

  it('should_return_empty_array_when_no_tiers', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getTiersByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getTiersByBarn('barn-1')

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

    await expect(getTiersByBarn('barn-1')).rejects.toThrow('db error')
  })
})

describe('createTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_insert_tier_and_return_created_row', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTier, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createTier('barn-1', 'Standard', 50)

    expect(result).toEqual(mockTier)
  })

  it('should_include_is_default_false_when_not_specified', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockTier, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createTier('barn-1', 'Standard', 50)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: false })
    )
  })

  it('should_include_is_default_true_when_specified', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockTier, is_default: true }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createTier('barn-1', 'Standard', 50, true)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ is_default: true })
    )
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

    await expect(createTier('barn-1', 'Standard', 50)).rejects.toThrow('db error')
  })
})

describe('updateTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_update_tier_and_return_updated_row', async () => {
    const updatedTier = { ...mockTier, name: 'Premium', price: 75 }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedTier, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await updateTier('tier-1', 'barn-1', { name: 'Premium', price: 75 })

    expect(result).toEqual(updatedTier)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateTier('tier-1', 'barn-1', { name: 'Premium' })).rejects.toThrow('db error')
  })
})

describe('deactivateTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_set_is_active_false_for_tier', async () => {
    const mockEqBarn = vi.fn().mockResolvedValue({ error: null })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEqId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await deactivateTier('tier-1', 'barn-1')

    expect(mockUpdate).toHaveBeenCalledWith({ is_active: false })
    expect(mockEqId).toHaveBeenCalledWith('id', 'tier-1')
    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(deactivateTier('tier-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('setDefaultTier', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_unset_all_defaults_then_set_target_as_default', async () => {
    const mockEqBarnUnset = vi.fn().mockResolvedValue({ error: null })
    const mockUpdateUnset = vi.fn().mockReturnValue({ eq: mockEqBarnUnset })

    const mockEqBarnSet = vi.fn().mockResolvedValue({ error: null })
    const mockEqIdSet = vi.fn().mockReturnValue({ eq: mockEqBarnSet })
    const mockUpdateSet = vi.fn().mockReturnValue({ eq: mockEqIdSet })

    const mockFrom = vi.fn()
      .mockReturnValueOnce({ update: mockUpdateUnset })
      .mockReturnValueOnce({ update: mockUpdateSet })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await setDefaultTier('tier-1', 'barn-1')

    expect(mockUpdateUnset).toHaveBeenCalledWith({ is_default: false })
    expect(mockEqBarnUnset).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockUpdateSet).toHaveBeenCalledWith({ is_default: true })
    expect(mockEqIdSet).toHaveBeenCalledWith('id', 'tier-1')
    expect(mockEqBarnSet).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_first_update_returns_an_error', async () => {
    const mockEqBarnUnset = vi.fn().mockResolvedValue({ error: new Error('db error') })
    const mockUpdateUnset = vi.fn().mockReturnValue({ eq: mockEqBarnUnset })
    const mockFrom = vi.fn().mockReturnValue({ update: mockUpdateUnset })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(setDefaultTier('tier-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_second_update_returns_an_error', async () => {
    const mockEqBarnUnset = vi.fn().mockResolvedValue({ error: null })
    const mockUpdateUnset = vi.fn().mockReturnValue({ eq: mockEqBarnUnset })

    const mockEqBarnSet = vi.fn().mockResolvedValue({ error: new Error('db error') })
    const mockEqIdSet = vi.fn().mockReturnValue({ eq: mockEqBarnSet })
    const mockUpdateSet = vi.fn().mockReturnValue({ eq: mockEqIdSet })

    const mockFrom = vi.fn()
      .mockReturnValueOnce({ update: mockUpdateUnset })
      .mockReturnValueOnce({ update: mockUpdateSet })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(setDefaultTier('tier-1', 'barn-1')).rejects.toThrow('db error')
  })
})
