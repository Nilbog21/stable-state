import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getUserMembership,
  createPendingMembership,
  seedManagerAccount,
  applySeededMembership,
} from '../barn-memberships'

const mockMembership = {
  id: 'mem-1',
  user_id: 'user-1',
  barn_id: 'barn-1',
  role: 'trainer' as const,
  status: 'active' as const,
  created_at: '2026-05-16T00:00:00Z',
}

describe('getUserMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_return_membership_when_user_has_active_barn_membership', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: mockMembership,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getUserMembership('user-1')

    expect(result).toEqual(mockMembership)
  })

  it('should_return_null_when_no_membership_exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            limit: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getUserMembership('user-1')

    expect(result).toBeNull()
  })

  it('should_query_by_barn_id_when_provided', async () => {
    const mockEq = vi.fn()
    const chainable = {
      eq: mockEq,
      maybeSingle: vi.fn().mockResolvedValue({ data: mockMembership, error: null }),
    }
    mockEq.mockReturnValue(chainable)
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue(chainable),
      }),
    } as any)

    await getUserMembership('user-1', 'barn-1')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })
})

describe('createPendingMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_insert_membership_with_pending_status', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: { ...mockMembership, status: 'pending' }, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await createPendingMembership('user-1', 'barn-1', 'trainer')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'pending' })
    )
  })

  it('should_return_the_created_membership', async () => {
    const pending = { ...mockMembership, status: 'pending' as const }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: pending, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await createPendingMembership('user-1', 'barn-1', 'trainer')

    expect(result).toEqual(pending)
  })
})

describe('seedManagerAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_insert_email_and_role_into_seeded_accounts', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await seedManagerAccount('manager@example.com', 'barn-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'manager@example.com', role: 'manager' })
    )
  })

  it('should_associate_manager_seed_with_barn_id', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await seedManagerAccount('manager@example.com', 'barn-1')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({ barn_id: 'barn-1' })
    )
  })
})

describe('applySeededMembership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_upsert_active_membership_when_email_is_in_seeded_accounts', async () => {
    const seeded = { email: 'admin@example.com', role: 'admin', barn_id: null }
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: seeded, error: null }),
              }),
            }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applySeededMembership('user-1', 'admin@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', role: 'admin', status: 'active' }),
      expect.anything()
    )
  })

  it('should_not_upsert_when_email_is_not_in_seeded_accounts', async () => {
    const mockUpsert = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await applySeededMembership('user-1', 'unknown@example.com')

    expect(mockUpsert).not.toHaveBeenCalled()
  })
})
