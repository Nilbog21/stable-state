import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockMembership } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createActiveMembership,
  deleteMembership,
  setCanInstruct,
} from '../barn-memberships'

const mockMembership = createMockMembership()

describe('createActiveMembership', () => {
  it('should_insert_an_active_membership_with_the_given_role', async () => {
    const single = vi.fn().mockResolvedValue({ data: { ...mockMembership, role: 'manager', status: 'active' }, error: null })
    const insert = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) })
    const mockClient = { from: vi.fn().mockReturnValue({ insert }) } as any

    const result = await createActiveMembership('user-1', 'profile-1', 'barn-1', 'manager', mockClient)

    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      profile_id: 'profile-1',
      barn_id: 'barn-1',
      role: 'manager',
      status: 'active',
    })
    expect(result).toEqual({ ...mockMembership, role: 'manager', status: 'active' })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    const single = vi.fn().mockResolvedValue({ data: null, error: dbError })
    const mockClient = {
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) }),
    } as any

    await expect(createActiveMembership('user-1', 'profile-1', 'barn-1', 'manager', mockClient)).rejects.toThrow('insert failed')
  })

  it('should_use_default_client_when_none_provided', async () => {
    const single = vi.fn().mockResolvedValue({ data: mockMembership, error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) }) }),
    } as any)

    await createActiveMembership('user-1', 'profile-1', 'barn-1', 'manager')

    expect(createClient).toHaveBeenCalled()
  })
})

describe('deleteMembership', () => {
  it('should_delete_membership_by_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: mockDelete }),
    } as any)

    await deleteMembership('mem-1')

    expect(mockDelete).toHaveBeenCalled()
    expect(mockEq).toHaveBeenCalledWith('id', 'mem-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('delete failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(deleteMembership('mem-1')).rejects.toThrow('delete failed')
  })
})

describe('setCanInstruct', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await setCanInstruct('mem-1', 'barn-1', true)

    expect(mockRpc).toHaveBeenCalledWith('set_can_instruct', {
      p_membership_id: 'mem-1',
      p_barn_id: 'barn-1',
      p_value: true,
    })
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const dbError = new Error('not authorized')
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: dbError }),
    } as any)

    await expect(setCanInstruct('mem-1', 'barn-1', true)).rejects.toThrow('not authorized')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as any

    await setCanInstruct('mem-1', 'barn-1', false, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('set_can_instruct', {
      p_membership_id: 'mem-1',
      p_barn_id: 'barn-1',
      p_value: false,
    })
  })
})
