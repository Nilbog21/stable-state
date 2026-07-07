import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockProfile } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { upsertProfile, getProfilesByUserIds, updateContactInfo, getProfileByUserId, getProfileById, updateProfile } from '../profiles'

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
      { onConflict: 'user_id' }
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

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        upsert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe', injectedClient)

    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_for_db_operation', async () => {
    vi.mocked(createClient).mockReset()
    const mockFrom = vi.fn().mockReturnValue({
      upsert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await upsertProfile('user-1', 'test@example.com', 'Jane', 'Doe', injectedClient)

    expect(mockFrom).toHaveBeenCalled()
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

describe('getProfileByUserId', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_profile_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileByUserId('user-1')

    expect(result).toEqual(mockProfile)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileByUserId('user-999')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getProfileByUserId('user-1')).rejects.toThrow('query failed')
  })

  it('should_query_by_user_id', async () => {
    const mockEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await getProfileByUserId('user-42')

    expect(mockEq).toHaveBeenCalledWith('user_id', 'user-42')
  })
})

describe('getProfileById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_profile_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileById('profile-1')

    expect(result).toEqual(mockProfile)
  })

  it('should_return_null_when_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getProfileById('profile-999')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('query failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: dbError }),
          }),
        }),
      }),
    } as any)

    await expect(getProfileById('profile-1')).rejects.toThrow('query failed')
  })

  it('should_query_by_id', async () => {
    const mockEq = vi.fn().mockReturnValue({
      maybeSingle: vi.fn().mockResolvedValue({ data: mockProfile, error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await getProfileById('profile-42')

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-42')
  })
})

describe('updateProfile', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_all_profile_fields', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateProfile('profile-1', {
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      emergency_contact_name: 'Bob',
      emergency_contact_phone: '555-5678',
    })

    expect(mockUpdate).toHaveBeenCalledWith({
      first_name: 'Jane',
      last_name: 'Doe',
      phone: '555-1234',
      emergency_contact_name: 'Bob',
      emergency_contact_phone: '555-5678',
    })
  })

  it('should_filter_by_profile_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({ eq: mockEq }),
      }),
    } as any)

    await updateProfile('profile-99', { first_name: 'Jane', last_name: 'Doe' })

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-99')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(updateProfile('profile-1', { first_name: 'Jane', last_name: 'Doe' })).rejects.toThrow('update failed')
  })
})

describe('updateContactInfo', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_update_with_contact_fields', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateContactInfo('profile-1', { phone: '555-1234' })

    expect(mockUpdate).toHaveBeenCalledWith({ phone: '555-1234' })
  })

  it('should_filter_by_profile_id', async () => {
    const mockEq = vi.fn().mockResolvedValue({ error: null })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ update: mockUpdate }),
    } as any)

    await updateContactInfo('profile-99', { emergency_contact_name: 'Jane' })

    expect(mockEq).toHaveBeenCalledWith('id', 'profile-99')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = new Error('update failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: dbError }),
        }),
      }),
    } as any)

    await expect(updateContactInfo('profile-1', { phone: '555-0000' })).rejects.toThrow('update failed')
  })
})
