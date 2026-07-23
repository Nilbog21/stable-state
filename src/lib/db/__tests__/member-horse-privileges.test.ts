import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockMemberHorsePrivilege } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getHorsePrivileges,
  grantHorsePrivilege,
  updateHorsePrivilegeDocumentAccess,
  updateHorsePrivilegeLessonAccess,
  revokeHorsePrivilege,
} from '../member-horse-privileges'

describe('getHorsePrivileges', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_privileges_for_horse', async () => {
    const rows = [createMockMemberHorsePrivilege({ id: 'privilege-1' }), createMockMemberHorsePrivilege({ id: 'privilege-2' })]
    const mockEqHorseId = vi.fn().mockResolvedValue({ data: rows, error: null })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqHorseId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqBarnId }) }),
    } as any)

    const result = await getHorsePrivileges('horse-1', 'barn-1')

    expect(result).toEqual(rows)
  })

  it('should_scope_query_to_barn_and_horse', async () => {
    const mockEqHorseId = vi.fn().mockResolvedValue({ data: [], error: null })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqHorseId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqBarnId }) }),
    } as any)

    await getHorsePrivileges('horse-1', 'barn-1')

    expect(mockEqBarnId).toHaveBeenCalledWith('barn_id', 'barn-1')
    expect(mockEqHorseId).toHaveBeenCalledWith('horse_id', 'horse-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const mockEqHorseId = vi.fn().mockResolvedValue({ data: null, error: new Error('db error') })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqHorseId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ eq: mockEqBarnId }) }),
    } as any)

    await expect(getHorsePrivileges('horse-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('grantHorsePrivilege', () => {
  const newPrivilege = createMockMemberHorsePrivilege({ id: 'privilege-3', member_id: 'mem-3' })

  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_insert_a_default_privilege_row', async () => {
    const insert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: newPrivilege, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    const result = await grantHorsePrivilege('horse-1', 'barn-1', 'mem-3')

    expect(insert).toHaveBeenCalledWith({ barn_id: 'barn-1', horse_id: 'horse-1', member_id: 'mem-3' })
    expect(result).toEqual(newPrivilege)
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

    await expect(grantHorsePrivilege('horse-1', 'barn-1', 'mem-3')).rejects.toThrow('db error')
  })
})

describe('updateHorsePrivilegeDocumentAccess', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_document_privileges', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateHorsePrivilegeDocumentAccess('privilege-1', 'barn-1', 'write')

    expect(update).toHaveBeenCalledWith({ document_privileges: 'write' })
  })

  it('should_scope_update_to_barn_and_privilege_id', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const update = vi.fn().mockReturnValue({ eq: mockEq1 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateHorsePrivilegeDocumentAccess('privilege-1', 'barn-1', 'read')

    expect(mockEq1).toHaveBeenCalledWith('id', 'privilege-1')
    expect(mockEq2).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('update error') }) }),
        }),
      }),
    } as any)

    await expect(updateHorsePrivilegeDocumentAccess('privilege-1', 'barn-1', 'none')).rejects.toThrow('update error')
  })
})

describe('updateHorsePrivilegeLessonAccess', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_lesson_read_privileges', async () => {
    const mockEq2 = vi.fn().mockResolvedValue({ error: null })
    const update = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue({ eq: mockEq2 }) })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateHorsePrivilegeLessonAccess('privilege-1', 'barn-1', true)

    expect(update).toHaveBeenCalledWith({ lesson_read_privileges: true })
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: new Error('update error') }) }),
        }),
      }),
    } as any)

    await expect(updateHorsePrivilegeLessonAccess('privilege-1', 'barn-1', false)).rejects.toThrow('update error')
  })
})

describe('revokeHorsePrivilege', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_the_revoke_horse_privilege_rpc', async () => {
    const rpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)

    await revokeHorsePrivilege('privilege-1', 'barn-1')

    expect(rpc).toHaveBeenCalledWith('revoke_horse_privilege', {
      p_privilege_id: 'privilege-1',
      p_barn_id: 'barn-1',
    })
  })

  it('should_throw_on_supabase_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: new Error('rpc error') }),
    } as any)

    await expect(revokeHorsePrivilege('privilege-1', 'barn-1')).rejects.toThrow('rpc error')
  })
})
