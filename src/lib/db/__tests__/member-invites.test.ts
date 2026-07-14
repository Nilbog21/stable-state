import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { createManagedMember, claimManagedMember, revokeInviteToken } from '../member-invites'

describe('createManagedMember', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_return_membership_id_on_success', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'mem-99', error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    const result = await createManagedMember('barn-1', 'Alex', 'Smith', 'rider')
    expect(result).toEqual({ membershipId: 'mem-99' })
  })

  it('should_call_rpc_with_correct_args', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'mem-99', error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await createManagedMember('barn-1', 'Alex', 'Smith', 'rider')
    expect(rpc).toHaveBeenCalledWith('create_managed_member', {
      p_barn_id: 'barn-1',
      p_first_name: 'Alex',
      p_last_name: 'Smith',
      p_role: 'rider',
    })
  })

  it('should_pass_role_in_rpc_args', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'mem-99', error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await createManagedMember('barn-1', 'Alex', 'Smith', 'trainer')
    expect(rpc).toHaveBeenCalledWith('create_managed_member', {
      p_barn_id: 'barn-1',
      p_first_name: 'Alex',
      p_last_name: 'Smith',
      p_role: 'trainer',
    })
  })

  it('should_throw_when_rpc_fails', async () => {
    const dbError = new Error('rpc failed')
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: dbError }) } as any)
    await expect(createManagedMember('barn-1', 'Alex', 'Smith', 'rider')).rejects.toThrow('rpc failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const rpc = vi.fn().mockResolvedValue({ data: 'mem-99', error: null })
    await createManagedMember('barn-1', 'Alex', 'Smith', 'rider', { rpc } as any)
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('claimManagedMember', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_call_claim_managed_member_rpc_with_correct_args', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await claimManagedMember('tok-abc', 'user-99', 'user@example.com')
    expect(rpc).toHaveBeenCalledWith('claim_managed_member', {
      p_token: 'tok-abc',
      p_user_id: 'user-99',
      p_email: 'user@example.com',
    })
  })

  it('should_throw_on_token_not_found', async () => {
    const dbError = new Error('token_not_found')
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: dbError }) } as any)
    await expect(claimManagedMember('bad-tok', 'user-99', 'u@e.com')).rejects.toThrow('token_not_found')
  })

  it('should_throw_on_user_already_claimed', async () => {
    const dbError = new Error('user_already_claimed')
    vi.mocked(createClient).mockResolvedValue({ rpc: vi.fn().mockResolvedValue({ error: dbError }) } as any)
    await expect(claimManagedMember('tok-abc', 'user-99', 'u@e.com')).rejects.toThrow('user_already_claimed')
  })

  it('should_pass_null_email_to_rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await claimManagedMember('tok-abc', 'user-99', null)
    expect(rpc).toHaveBeenCalledWith('claim_managed_member', {
      p_token: 'tok-abc',
      p_user_id: 'user-99',
      p_email: null,
    })
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const rpc = vi.fn().mockResolvedValue({ error: null })
    await claimManagedMember('tok-abc', 'user-99', 'u@e.com', { rpc } as any)
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('revokeInviteToken', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_return_new_token_string', async () => {
    const newToken = 'aaaa-bbbb-cccc'
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { invite_token: newToken }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)
    const result = await revokeInviteToken('mem-1', 'barn-1')
    expect(result).toBe(newToken)
  })

  it('should_throw_when_update_fails', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
              }),
            }),
          }),
        }),
      }),
    } as any)
    await expect(revokeInviteToken('mem-1', 'barn-1')).rejects.toThrow('update failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { invite_token: 'new-tok' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any
    await revokeInviteToken('mem-1', 'barn-1', injectedClient)
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})
