import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

vi.mock('../horses', () => ({
  resolveHorseNames: vi.fn(),
}))

vi.mock('../member-names', () => ({
  resolveMemberNames: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getRiderEnrolledLessonIds,
} from '../lesson-participants'

describe('getRiderEnrolledLessonIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_empty_array_when_user_has_no_rider_membership_in_barn', async () => {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null, error: null })
    const mockEqStatus = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEqRole = vi.fn().mockReturnValue({ eq: mockEqStatus })
    const mockEqUserId = vi.fn().mockReturnValue({ eq: mockEqRole })
    const mockEqBarnId = vi.fn().mockReturnValue({ eq: mockEqUserId })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEqBarnId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ select: mockSelect }),
    } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
    const injectedClient = { from: mockFrom } as any

    await getRiderEnrolledLessonIds('barn-1', 'user-1', injectedClient)

    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_return_empty_array_when_rider_has_no_enrollments', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
  })

  it('should_return_lesson_ids_for_enrolled_rider', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({
            data: [{ lesson_id: 'lesson-1' }, { lesson_id: 'lesson-2' }],
            error: null,
          }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual(['lesson-1', 'lesson-2'])
  })

  it('should_treat_null_enrollments_data_as_empty', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    const result = await getRiderEnrolledLessonIds('barn-1', 'user-1')

    expect(result).toEqual([])
  })

  it('should_throw_when_barn_memberships_query_fails', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('membership error') }),
                }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(
      getRiderEnrolledLessonIds('barn-1', 'user-1')
    ).rejects.toThrow('membership error')
  })

  it('should_throw_when_lesson_riders_query_fails', async () => {
    const mockFrom = vi.fn()
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'membership-1' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    })
    mockFrom.mockReturnValueOnce({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: new Error('enrollment error') }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ from: mockFrom } as any)

    await expect(
      getRiderEnrolledLessonIds('barn-1', 'user-1')
    ).rejects.toThrow('enrollment error')
  })
})

