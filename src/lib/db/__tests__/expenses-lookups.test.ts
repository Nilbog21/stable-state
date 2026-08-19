import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getRecentRecipients,
  getRecentExpenseTypes,
  getMostCommonTypeForRecipient,
} from '../expenses'
import { calendarDate } from '@/lib/local-day'

describe('getRecentRecipients', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_empty_array_when_no_expenses', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual([])
  })

  it('should_rank_recipient_with_recent_activity_above_one_with_only_old_activity', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    const { select } = makeChain([
      { recipient: 'Old Vet', expense_date: calendarDate('2025-01-01') },
      { recipient: 'Recent Vet', expense_date: calendarDate('2026-07-01') },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual(['Recent Vet', 'Old Vet'])
  })

  it('should_tiebreak_by_total_count_when_recent_counts_equal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    const { select } = makeChain([
      { recipient: 'Frequent', expense_date: calendarDate('2025-01-01') },
      { recipient: 'Frequent', expense_date: calendarDate('2025-02-01') },
      { recipient: 'Rare', expense_date: calendarDate('2025-01-01') },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual(['Frequent', 'Rare'])
  })

  it('should_tiebreak_alphabetically_when_all_counts_equal', async () => {
    const { select } = makeChain([
      { recipient: 'Zebra Farrier', expense_date: calendarDate('2025-01-01') },
      { recipient: 'Apple Vet', expense_date: calendarDate('2025-01-01') },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual(['Apple Vet', 'Zebra Farrier'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getRecentRecipients('barn-1')).rejects.toThrow('db error')
  })
})

describe('getRecentExpenseTypes', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_empty_array_when_no_expenses', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentExpenseTypes('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentExpenseTypes('barn-1')

    expect(result).toEqual([])
  })

  it('should_order_by_frequency_descending', async () => {
    const { select } = makeChain([
      { expense_type: 'Veterinary' },
      { expense_type: 'Farrier' },
      { expense_type: 'Farrier' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentExpenseTypes('barn-1')

    expect(result).toEqual(['Farrier', 'Veterinary'])
  })

  it('should_tiebreak_alphabetically_when_counts_equal', async () => {
    const { select } = makeChain([
      { expense_type: 'Veterinary' },
      { expense_type: 'Farrier' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentExpenseTypes('barn-1')

    expect(result).toEqual(['Farrier', 'Veterinary'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getRecentExpenseTypes('barn-1')).rejects.toThrow('db error')
  })
})

describe('getMostCommonTypeForRecipient', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ order: mockOrder })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect, mockOrder }
  }

  it('should_return_null_when_recipient_has_no_expenses', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')

    expect(result).toBeNull()
  })

  it('should_return_null_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')

    expect(result).toBeNull()
  })

  it('should_return_most_frequent_type', async () => {
    const { select } = makeChain([
      { expense_type: 'Veterinary' },
      { expense_type: 'Farrier' },
      { expense_type: 'Veterinary' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')

    expect(result).toBe('Veterinary')
  })

  it('should_return_first_occurring_type_on_tie', async () => {
    const { select } = makeChain([
      { expense_type: 'Veterinary' },
      { expense_type: 'Farrier' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')

    expect(result).toBe('Veterinary')
  })

  it('should_order_by_expense_date_ascending_for_deterministic_tiebreak', async () => {
    const { select, mockOrder } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')

    expect(mockOrder).toHaveBeenCalledWith('expense_date', { ascending: true })
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getMostCommonTypeForRecipient('barn-1', 'Dr. Smith')).rejects.toThrow('db error')
  })
})

