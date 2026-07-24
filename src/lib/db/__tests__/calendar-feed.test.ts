import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getOrCreateCalendarFeedToken, regenerateCalendarFeedToken, getCalendarFeedData } from '../calendar-feed'

describe('getOrCreateCalendarFeedToken', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_return_existing_token_without_updating', async () => {
    const update = vi.fn()
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { calendar_feed_token: 'existing-tok' }, error: null }),
            }),
          }),
        }),
        update,
      }),
    } as any)
    const result = await getOrCreateCalendarFeedToken('mem-1', 'barn-1')
    expect(result).toBe('existing-tok')
    expect(update).not.toHaveBeenCalled()
  })

  it('should_generate_and_persist_token_when_none_exists', async () => {
    const update = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: { calendar_feed_token: 'new-tok' }, error: null }),
          }),
        }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: { calendar_feed_token: null }, error: null }),
            }),
          }),
        }),
        update,
      }),
    } as any)
    const result = await getOrCreateCalendarFeedToken('mem-1', 'barn-1')
    expect(result).toBe('new-tok')
    expect(update).toHaveBeenCalled()
  })

  it('should_throw_when_select_fails', async () => {
    const dbError = new Error('select failed')
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: null, error: dbError }),
            }),
          }),
        }),
      }),
    } as any)
    await expect(getOrCreateCalendarFeedToken('mem-1', 'barn-1')).rejects.toThrow('select failed')
  })
})

describe('regenerateCalendarFeedToken', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_return_new_token_string', async () => {
    const newToken = 'fresh-token'
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { calendar_feed_token: newToken }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)
    const result = await regenerateCalendarFeedToken('mem-1', 'barn-1')
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
    await expect(regenerateCalendarFeedToken('mem-1', 'barn-1')).rejects.toThrow('update failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const injectedClient = {
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: { calendar_feed_token: 'tok' }, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any
    await regenerateCalendarFeedToken('mem-1', 'barn-1', injectedClient)
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})

describe('getCalendarFeedData', () => {
  beforeEach(() => { vi.mocked(createClient).mockReset() })

  it('should_map_valid_feed_row_to_camel_case', async () => {
    const rpc = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({
        data: {
          valid: true,
          barn_name: 'Sunny Acres',
          items: [
            { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
          ],
        },
        error: null,
      }),
    })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    const result = await getCalendarFeedData('tok-abc')
    expect(result).toEqual({
      valid: true,
      barnName: 'Sunny Acres',
      items: [
        { itemType: 'lesson', id: 'l-1', title: 'Custom', startsAt: '2026-08-01T14:00:00Z', durationMinutes: 60, notes: null },
      ],
    })
    expect(rpc).toHaveBeenCalledWith('get_calendar_feed', { p_token: 'tok-abc' })
  })

  it('should_map_invalid_token_row', async () => {
    const rpc = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { valid: false, barn_name: null, items: [] }, error: null }),
    })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    const result = await getCalendarFeedData('bad-tok')
    expect(result).toEqual({ valid: false, barnName: null, items: [] })
  })

  it('should_throw_when_rpc_fails', async () => {
    const dbError = new Error('rpc failed')
    const rpc = vi.fn().mockReturnValue({ single: vi.fn().mockResolvedValue({ data: null, error: dbError }) })
    vi.mocked(createClient).mockResolvedValue({ rpc } as any)
    await expect(getCalendarFeedData('tok-abc')).rejects.toThrow('rpc failed')
  })

  it('should_not_call_createClient_when_client_is_injected', async () => {
    vi.mocked(createClient).mockReset()
    const rpc = vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: { valid: false, barn_name: null, items: [] }, error: null }),
    })
    await getCalendarFeedData('tok-abc', { rpc } as any)
    expect(vi.mocked(createClient)).not.toHaveBeenCalled()
  })
})
