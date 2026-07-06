import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockBarn } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getBarnBySlug, updateBarnDefaultBoardFee, setInstructorCut } from '../barns'

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
