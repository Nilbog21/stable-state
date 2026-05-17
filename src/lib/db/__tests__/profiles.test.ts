import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { upsertProfile, getProfilesByUserIds } from '../profiles'

const mockProfile = { user_id: 'user-1', first_name: 'Jane', last_name: 'Doe', created_at: '' }

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
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should_upsert_profile_with_provided_name', async () => {
    const mock = makeSupabaseMock(mockProfile)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'Jane', 'Doe')

    expect(mock.from).toHaveBeenCalledWith('profiles')
    expect(mock._mocks.upsert).toHaveBeenCalledWith(
      { user_id: 'user-1', first_name: 'Jane', last_name: 'Doe' },
      { onConflict: 'user_id' }
    )
    expect(result).toEqual(mockProfile)
  })

  it('should_update_existing_profile_on_conflict', async () => {
    const updated = { ...mockProfile, first_name: 'Janet' }
    const mock = makeSupabaseMock(updated)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    const result = await upsertProfile('user-1', 'Janet', 'Doe')

    expect(result).toEqual(updated)
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const dbError = { message: 'unique constraint violation', code: '23505' }
    const mock = makeSupabaseMock(null, dbError)
    vi.mocked(createClient).mockResolvedValue(mock as any)

    await expect(upsertProfile('user-1', 'Jane', 'Doe')).rejects.toEqual(dbError)
  })
})

const mockProfiles = [
  { user_id: 'user-1', first_name: 'Jane', last_name: 'Doe', created_at: '' },
  { user_id: 'user-2', first_name: 'John', last_name: 'Smith', created_at: '' },
]

describe('getProfilesByUserIds', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

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
})
