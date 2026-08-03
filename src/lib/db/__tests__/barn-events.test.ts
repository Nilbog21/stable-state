import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getEventsByBarn, getEventById, getEventsByIds, createEvent, updateEvent, deleteEvent } from '../barn-events'
import type { Role } from '../types'

const mockEvent = {
  id: 'event-1',
  barn_id: 'barn-1',
  title: 'Costume Party',
  event_at: '2026-10-31T22:00:00Z',
  notes: null,
  visible_to_roles: ['manager', 'trainer', 'rider'],
  created_at: '2026-06-13T00:00:00Z',
}

// What the three branded readers return: the same row with its zone attached.
const brandedMockEvent = { ...mockEvent, event_at: { at: mockEvent.event_at, tz: 'America/New_York' } }

const mockInput = {
  title: 'Costume Party',
  eventAt: '2026-10-31T22:00:00Z',
  notes: null,
  visibleToRoles: ['manager', 'trainer', 'rider'] as Role[],
}

describe('getEventsByBarn', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_events_for_barn', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [mockEvent], error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getEventsByBarn('barn-1', 'America/New_York')

    expect(result).toEqual([brandedMockEvent])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    const result = await getEventsByBarn('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(getEventsByBarn('barn-1', 'America/New_York')).rejects.toThrow('db error')
  })
})

describe('getEventById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_return_event_when_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getEventById('event-1', 'barn-1', 'America/New_York')

    expect(result).toEqual(brandedMockEvent)
  })

  it('should_return_null_when_event_not_found', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await getEventById('event-1', 'barn-1', 'America/New_York')

    expect(result).toBeNull()
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(getEventById('event-1', 'barn-1', 'America/New_York')).rejects.toThrow('db error')
  })
})

describe('getEventsByIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeEventsChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIn }
  }

  it('should_return_empty_array_without_querying_when_ids_is_empty', async () => {
    const result = await getEventsByIds('barn-1', [], 'America/New_York')

    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_scope_the_query_to_barn_id', async () => {
    const { select, mockEq } = makeEventsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getEventsByIds('barn-1', ['event-1'], 'America/New_York')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_the_provided_ids', async () => {
    const { select, mockIn } = makeEventsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getEventsByIds('barn-1', ['event-1', 'event-2'], 'America/New_York')

    expect(mockIn).toHaveBeenCalledWith('id', ['event-1', 'event-2'])
  })

  it('should_return_the_matching_events', async () => {
    const { select } = makeEventsChain([mockEvent])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getEventsByIds('barn-1', ['event-1'], 'America/New_York')

    expect(result).toEqual([brandedMockEvent])
  })

  it('should_treat_null_data_as_empty', async () => {
    const { select } = makeEventsChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getEventsByIds('barn-1', ['event-1'], 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeEventsChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getEventsByIds('barn-1', ['event-1'], 'America/New_York')).rejects.toThrow('db error')
  })
})

describe('createEvent', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_insert_event_and_return_created_row', async () => {
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockEvent, error: null }),
      }),
    })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: mockInsert }),
    } as any)

    const result = await createEvent('barn-1', mockInput)

    expect(result).toEqual(mockEvent)
    expect(mockInsert).toHaveBeenCalledWith({
      barn_id: 'barn-1',
      title: 'Costume Party',
      event_at: '2026-10-31T22:00:00Z',
      notes: null,
      visible_to_roles: ['manager', 'trainer', 'rider'],
    })
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

    await expect(createEvent('barn-1', mockInput)).rejects.toThrow('db error')
  })

  it('should_throw_when_data_is_null_and_no_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    } as any)

    await expect(createEvent('barn-1', mockInput)).rejects.toThrow('No data returned')
  })
})

describe('updateEvent', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_update_event_and_return_updated_row', async () => {
    const updatedEvent = { ...mockEvent, title: 'Halloween Bash' }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: updatedEvent, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    const result = await updateEvent('event-1', 'barn-1', { ...mockInput, title: 'Halloween Bash' })

    expect(result).toEqual(updatedEvent)
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: new Error('db error') }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateEvent('event-1', 'barn-1', mockInput)).rejects.toThrow('db error')
  })

  it('should_throw_when_data_is_null_and_no_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        }),
      }),
    } as any)

    await expect(updateEvent('event-1', 'barn-1', mockInput)).rejects.toThrow('No data returned')
  })
})

describe('deleteEvent', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_delete_event_filtered_by_id_and_barn', async () => {
    const mockEqBarn = vi.fn().mockResolvedValue({ error: null })
    const mockEqId = vi.fn().mockReturnValue({ eq: mockEqBarn })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEqId })
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ delete: mockDelete }),
    } as any)

    await deleteEvent('event-1', 'barn-1')

    expect(mockEqId).toHaveBeenCalledWith('id', 'event-1')
    expect(mockEqBarn).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        delete: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: new Error('db error') }),
          }),
        }),
      }),
    } as any)

    await expect(deleteEvent('event-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('getEventsByBarn instant branding', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_brand_event_at_with_the_barns_timezone', async () => {
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            order: vi.fn().mockResolvedValue({ data: [mockEvent], error: null }),
          }),
        }),
      }),
    } as any)

    const [result] = await getEventsByBarn('barn-1', 'America/New_York')

    expect(result.event_at).toEqual({ at: '2026-10-31T22:00:00Z', tz: 'America/New_York' })
  })
})
