import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug, updateBarnDefaultBoardFee, setInstructorCut, updateExhaustionThresholds, updateBarnTimezone, updateScheduleBufferMinutes } from '../barns'

const mockBarn = createMockBarn()

describe('getBarnBySlug', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_barn_when_slug_exists', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: mockBarn,
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const result = await getBarnBySlug('green-acres')

    expect(result).toEqual(mockBarn)
  })

  it('should_return_null_when_slug_does_not_exist', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: null,
              error: null,
            }),
          }),
        }),
      }),
    } as any)

    const result = await getBarnBySlug('unknown-slug')

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

    await expect(getBarnBySlug('some-slug')).rejects.toThrow('query failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockClient = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockBarn, error: null }),
          }),
        }),
      }),
    } as any

    const result = await getBarnBySlug('injected-slug', mockClient)

    expect(result).toEqual(mockBarn)
  })
})

describe('updateBarnDefaultBoardFee', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    return { update: mockUpdate, mockUpdate, mockEq }
  }

  it('should_update_default_board_fee_and_return_updated_barn', async () => {
    const { update } = makeChain({ ...mockBarn, default_board_fee: 1200 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    const result = await updateBarnDefaultBoardFee('barn-1', 1200)

    expect(result).toEqual({ ...mockBarn, default_board_fee: 1200 })
  })

  it('should_scope_update_by_barn_id', async () => {
    const { update, mockEq } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateBarnDefaultBoardFee('barn-1', 1200)

    expect(mockEq).toHaveBeenCalledWith('id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateBarnDefaultBoardFee('barn-1', 1200)).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const { update } = makeChain(mockBarn)
    const mockClient = { from: vi.fn().mockReturnValue({ update }) } as any

    const result = await updateBarnDefaultBoardFee('barn-1', 1200, mockClient)

    expect(result).toEqual(mockBarn)
  })
})

describe('updateExhaustionThresholds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    return { update: mockUpdate, mockUpdate, mockEq }
  }

  it('should_update_exhaustion_thresholds_and_return_updated_barn', async () => {
    const { update } = makeChain({ ...mockBarn, exhaustion_threshold_moderate: 4, exhaustion_threshold_high: 10 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    const result = await updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 })

    expect(result).toEqual({ ...mockBarn, exhaustion_threshold_moderate: 4, exhaustion_threshold_high: 10 })
  })

  it('should_pass_moderate_and_high_to_update', async () => {
    const { update, mockUpdate } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 })

    expect(mockUpdate).toHaveBeenCalledWith({
      exhaustion_threshold_moderate: 4,
      exhaustion_threshold_high: 10,
    })
  })

  it('should_scope_update_by_barn_id', async () => {
    const { update, mockEq } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 })

    expect(mockEq).toHaveBeenCalledWith('id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 })).rejects.toThrow('db error')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    const { update } = makeChain(mockBarn)
    const mockClient = { from: vi.fn().mockReturnValue({ update }) } as any

    await updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 }, mockClient)

    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_use_injected_client_when_provided', async () => {
    const { update } = makeChain(mockBarn)
    const mockClient = { from: vi.fn().mockReturnValue({ update }) } as any

    const result = await updateExhaustionThresholds('barn-1', { moderate: 4, high: 10 }, mockClient)

    expect(result).toEqual(mockBarn)
  })
})

describe('updateScheduleBufferMinutes', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    return { update: mockUpdate, mockUpdate, mockEq }
  }

  it('should_update_schedule_buffer_minutes_and_return_updated_barn', async () => {
    const { update } = makeChain({ ...mockBarn, schedule_buffer_minutes: 45 })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    const result = await updateScheduleBufferMinutes('barn-1', 45)

    expect(result).toEqual({ ...mockBarn, schedule_buffer_minutes: 45 })
  })

  it('should_pass_minutes_to_update', async () => {
    const { update, mockUpdate } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateScheduleBufferMinutes('barn-1', 45)

    expect(mockUpdate).toHaveBeenCalledWith({ schedule_buffer_minutes: 45 })
  })

  it('should_scope_update_by_barn_id', async () => {
    const { update, mockEq } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateScheduleBufferMinutes('barn-1', 45)

    expect(mockEq).toHaveBeenCalledWith('id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateScheduleBufferMinutes('barn-1', 45)).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const { update } = makeChain(mockBarn)
    const mockClient = { from: vi.fn().mockReturnValue({ update }) } as any

    const result = await updateScheduleBufferMinutes('barn-1', 45, mockClient)

    expect(result).toEqual(mockBarn)
  })
})

describe('updateBarnTimezone', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq = vi.fn().mockReturnValue({ select: mockSelect })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq })
    return { update: mockUpdate, mockUpdate, mockEq }
  }

  it('should_update_timezone_and_return_updated_barn', async () => {
    const { update } = makeChain({ ...mockBarn, timezone: 'America/Los_Angeles' })
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    const result = await updateBarnTimezone('barn-1', 'America/Los_Angeles')

    expect(result).toEqual({ ...mockBarn, timezone: 'America/Los_Angeles' })
  })

  it('should_pass_timezone_to_update', async () => {
    const { update, mockUpdate } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateBarnTimezone('barn-1', 'America/Los_Angeles')

    expect(mockUpdate).toHaveBeenCalledWith({ timezone: 'America/Los_Angeles' })
  })

  it('should_scope_update_by_barn_id', async () => {
    const { update, mockEq } = makeChain(mockBarn)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await updateBarnTimezone('barn-1', 'America/Los_Angeles')

    expect(mockEq).toHaveBeenCalledWith('id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { update } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(updateBarnTimezone('barn-1', 'America/Los_Angeles')).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const { update } = makeChain(mockBarn)
    const mockClient = { from: vi.fn().mockReturnValue({ update }) } as any

    const result = await updateBarnTimezone('barn-1', 'America/Los_Angeles', mockClient)

    expect(result).toEqual(mockBarn)
    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('setInstructorCut', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_correct_arguments', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await setInstructorCut('barn-1', 30)

    expect(mockRpc).toHaveBeenCalledWith('set_instructor_cut', { p_barn_id: 'barn-1', p_value: 30 })
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const dbError = new Error('not authorized')
    vi.mocked(createClient).mockResolvedValue({
      rpc: vi.fn().mockResolvedValue({ error: dbError }),
    } as any)

    await expect(setInstructorCut('barn-1', 30)).rejects.toThrow('not authorized')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as any

    await setInstructorCut('barn-1', 30, mockClient)

    expect(createClient).not.toHaveBeenCalled()
    expect(mockRpc).toHaveBeenCalledWith('set_instructor_cut', { p_barn_id: 'barn-1', p_value: 30 })
  })
})
