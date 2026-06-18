import { describe, it, expect, vi } from 'vitest'
import { createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { upsertProfile, getProfilesByUserIds, seedManagerProfile } from '../profiles'

const mockProfile = createMockProfile()

function makeSupabaseMock(returnData: unknown, returnError: unknown = null) {
  const single = vi.fn().mockResolvedValue({ data: returnData, error: returnError })
  const select = vi.fn().mockReturnValue({ single })
  const upsert = vi.fn().mockReturnValue({ select })
  return {
    from: vi.fn().mockReturnValue({ upsert }),
    _mocks: { upsert, select, single },
  }
}

describe('upsertProfile', () => {
  it('should_call_from_profiles_table', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(mock.from).toHaveBeenCalledWith('profiles')
  })

  it('should_upsert_with_correct_payload', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(mock._mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', email: 'test@example.com', first_name: 'Jane', last_name: 'Doe' },
      { onConflict: 'email' }
    )
  })

  it('should_return_upserted_profile', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')

    expect(result).toEqual(mockProfile)
  })

  it('should_throw_when_data_is_null', async () => {
    const mock = makeSupabaseMock(null)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await expect(upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')).rejects.toThrow('upsert returned no row')
  })

  it('should_update_existing_profile_on_conflict', async () => {
    const updated = createMockProfile({ first_name: 'Janet' })
    const mock = makeSupabaseMock(updated)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'test@example.com', 'Janet', 'Doe')

    expect(result).toEqual(updated)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = { message: 'unique constraint violation', code: '23505' }
    const mock = makeSupabaseMock(null, dbError)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await expect(upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe')).rejects.toEqual(dbError)
  })
})

const mockProfiles = [
  createMockProfile({ user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' }),
  createMockProfile({ user_id: 'user-2', first_name: 'John', last_name: 'Smith' }),
]

describe('getProfilesByUserIds', () => {
  it('should_return_profiles_for_given_user_ids', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: mockProfiles, error: null }),
        }),
      }),
    } as any)

    const result = await getProfilesByUserIds(['user-1', 'user-2'])

    expect(result).toEqual(mockProfiles)
  })

  it('should_return_empty_array_for_empty_input', async () => {
    const result = await getProfilesByUserIds([])

    expect(result).toEqual([])
  })

  it('should_query_profiles_by_user_id_in_list', async () => {
    const mockIn = vi.fn().mockResolvedValue({ data: mockProfiles, error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ in: mockIn }),
      }),
    } as any)

    await getProfilesByUserIds(['user-1', 'user-2'])

    expect(mockIn).toHaveBeenCalledWith('user_id', ['user-1', 'user-2'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: dbError }),
        }),
      }),
    } as any)

    await expect(getProfilesByUserIds(['user-1'])).rejects.toThrow('query failed')
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    } as any)

    const result = await getProfilesByUserIds(['user-1'])

    expect(result).toEqual([])
  })
})

describe('seedManagerProfile', () => {
  it('should_insert_pre_auth_profile_with_email_barn_and_role', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await seedManagerProfile('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager')

    expect(mockInsert).toHaveBeenCalledWith({
      email: 'manager@example.com',
      first_name: 'Dev',
      last_name: 'Manager',
      barn_id: 'barn-1',
      role: 'manager',
    })
  })

  it('should_not_include_user_id_in_insert', async () => {
    const mockInsert = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    await seedManagerProfile('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager')

    expect(mockInsert).toHaveBeenCalledWith(
      expect.not.objectContaining({ user_id: expect.anything() })
    )
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('insert failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: dbError }),
      }),
    } as any)

    await expect(
      seedManagerProfile('manager@example.com', 'Dev', 'Manager', 'barn-1', 'manager')
    ).rejects.toThrow('insert failed')
  })
})
