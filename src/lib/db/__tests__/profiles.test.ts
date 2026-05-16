import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { upsertProfile } from '../profiles'

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
})
