import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import { getEventsByBarn, getEventById, createEvent, updateEvent, deleteEvent } from '../barn-events'
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

    const result = await getEventsByBarn('barn-1')

    expect(result).toEqual([mockEvent])
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

    const result = await getEventsByBarn('barn-1')

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

    await expect(getEventsByBarn('barn-1')).rejects.toThrow('db error')
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

    const result = await getEventById('event-1', 'barn-1')

    expect(result).toEqual(mockEvent)
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

    const result = await getEventById('event-1', 'barn-1')

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

    await expect(getEventById('event-1', 'barn-1')).rejects.toThrow('db error')
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
