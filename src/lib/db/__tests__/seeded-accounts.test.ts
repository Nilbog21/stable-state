import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('@/lib/db/profiles', () => ({
  upsertProfile: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { upsertProfile } from '@/lib/db/profiles'
import { createSeededAccount, activateSeededAccount } from '../seeded-accounts'

describe('createSeededAccount', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_upsert_with_correct_payload', async () => {
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ upsert: mockUpsert }),
    } as any)

    await createSeededAccount('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager')

    expect(mockUpsert).toHaveBeenCalledWith(
      { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' },
      { onConflict: 'email' }
    )
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: dbError }),
      }),
    } as any)

    await expect(
      createSeededAccount('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager')
    ).rejects.toThrow('insert failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockResolvedValue({ error: null }),
      }),
    } as any

    await createSeededAccount('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('activateSeededAccount', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(upsertProfile).mockReset()
    vi.mocked(upsertProfile).mockResolvedValue({ id: 'profile-1' } as any)
  })

  function makeClient(seededData: unknown, membershipUpsertError: unknown = null, deleteError: unknown = null) {
    return {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: seededData }),
              }),
            }),
            delete: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ error: deleteError }),
            }),
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: membershipUpsertError }) }
      }),
    } as any
  }

  it('should_return_early_when_no_seeded_account_found', async () => {
    vi.mocked(createClient).mockResolvedValue(makeClient(null))

    await activateSeededAccount('user-1', 'unknown@example.com')

    expect(vi.mocked(upsertProfile)).not.toHaveBeenCalled()
  })

  it('should_call_upsertProfile_when_seeded_account_found', async () => {
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    vi.mocked(createClient).mockResolvedValue(makeClient(seeded))

    await activateSeededAccount('user-1', 'manager@example.com')

    expect(vi.mocked(upsertProfile)).toHaveBeenCalledWith('user-1', 'manager@example.com', 'Dev', 'Manager', expect.anything())
  })

  it('should_upsert_active_membership_when_seeded_account_found', async () => {
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: seeded }) }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await activateSeededAccount('user-1', 'manager@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', barn_id: 'barn-1', role: 'manager', status: 'active', can_instruct: false }),
      expect.objectContaining({ onConflict: 'user_id,barn_id' })
    )
  })

  it('should_set_can_instruct_true_when_role_is_trainer', async () => {
    const seeded = { email: 'trainer@example.com', first_name: 'Alex', last_name: 'Trainer', barn_id: 'barn-1', role: 'trainer' }
    const mockUpsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: seeded }) }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { upsert: mockUpsert }
      }),
    } as any)

    await activateSeededAccount('user-1', 'trainer@example.com')

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ can_instruct: true }),
      expect.anything()
    )
  })

  it('should_delete_seeded_account_after_activation', async () => {
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    const mockDeleteEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: seeded }) }) }),
            delete: vi.fn().mockReturnValue({ eq: mockDeleteEq }),
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as any)

    await activateSeededAccount('user-1', 'manager@example.com')

    expect(mockDeleteEq).toHaveBeenCalledWith('email', 'manager@example.com')
  })

  it('should_throw_when_membership_upsert_fails', async () => {
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    const dbError = new Error('upsert failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(seeded, dbError))

    await expect(activateSeededAccount('user-1', 'manager@example.com')).rejects.toThrow('upsert failed')
  })

  it('should_throw_when_delete_fails', async () => {
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    const dbError = new Error('delete failed')
    vi.mocked(createClient).mockResolvedValue(makeClient(seeded, null, dbError))

    await expect(activateSeededAccount('user-1', 'manager@example.com')).rejects.toThrow('delete failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const seeded = { email: 'manager@example.com', first_name: 'Dev', last_name: 'Manager', barn_id: 'barn-1', role: 'manager' }
    const injectedClient = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'seeded_accounts') {
          return {
            select: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: seeded }) }) }),
            delete: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
          }
        }
        return { upsert: vi.fn().mockResolvedValue({ error: null }) }
      }),
    } as any

    await activateSeededAccount('user-1', 'manager@example.com', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})
