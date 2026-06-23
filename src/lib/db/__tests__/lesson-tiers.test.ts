import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getTiersByBarn, createTier, updateTier, deactivateTier, setDefaultTier, getAllTiersByBarn, getTierById } from '../lesson-tiers'

const mockTier = {
  id: 'tier-1',
  barn_id: 'barn-1',
  name: 'Standard',
  price: 50,
  is_default: false,
  is_active: true,
  created_at: '2026-06-13T00:00:00Z',
  default_exertion_level: null,
  default_jumping: null,
}

describe('getTiersByBarn', () => {
  it('should_return_tiers_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [mockTier], error: null }),
            }),
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
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
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
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
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
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
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

  it('should_throw_when_data_is_null_and_no_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    await expect(createTier('barn-1', 'Standard', 50)).rejects.toThrow('No data returned')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockTier, error: null }),
          }),
        }),
      }),
    } as any

    await createTier('barn-1', 'Standard', 50, false, null, null, injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockTier, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await createTier('barn-1', 'Standard', 50, false, null, null, injectedClient)

    expect(mockFrom).toHaveBeenCalled()
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

  it('should_throw_when_data_is_null_and_no_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateTier('tier-1', 'barn-1', { name: 'Premium' })).rejects.toThrow('No data returned')
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

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await setDefaultTier('tier-1', 'barn-1')

    expect(mockRpc).toHaveBeenCalledWith('set_default_tier', { p_tier_id: 'tier-1', p_barn_id: 'barn-1' })
  })

  it('should_throw_when_rpc_returns_an_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(setDefaultTier('tier-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('getAllTiersByBarn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_all_tiers_including_inactive', async () => {
    const inactiveTier = { ...mockTier, id: 'tier-2', is_active: false }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [mockTier, inactiveTier], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getAllTiersByBarn('barn-1')

    expect(result).toEqual([mockTier, inactiveTier])
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

    const result = await getAllTiersByBarn('barn-1')

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

    await expect(getAllTiersByBarn('barn-1')).rejects.toThrow('db error')
  })
})

describe('getTierById', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_tier_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockTier, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getTierById('tier-1', 'barn-1')

    expect(result).toEqual(mockTier)
  })

  it('should_return_null_when_tier_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getTierById('tier-1', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getTierById('tier-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('createTier with defaults', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_include_default_exertion_level_in_insert_payload', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockTier, default_exertion_level: 3 }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createTier('barn-1', 'Standard', 50, false, 3, null)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ default_exertion_level: 3 })
    )
  })

  it('should_include_default_jumping_in_insert_payload', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockTier, default_jumping: true }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createTier('barn-1', 'Standard', 50, false, null, true)

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ default_jumping: true })
    )
  })

  it('should_include_null_defaults_when_not_specified', async () => {
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
      expect.objectContaining({ default_exertion_level: null, default_jumping: null })
    )
  })
})

describe('updateTier with defaults', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_include_default_exertion_level_in_update_payload', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { ...mockTier, default_exertion_level: 4 }, error: null }),
          }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateTier('tier-1', 'barn-1', { default_exertion_level: 4 })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ default_exertion_level: 4 })
    )
  })

  it('should_include_default_jumping_in_update_payload', async () => {
    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { ...mockTier, default_jumping: false }, error: null }),
          }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateTier('tier-1', 'barn-1', { default_jumping: false })

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ default_jumping: false })
    )
  })
})
