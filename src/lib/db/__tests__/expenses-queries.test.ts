import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockHorseExpense } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getExpensesByBarn,
  getExpenseById,
  getOutstandingExpenses,
  getExpensesByIds,
} from '../expenses'

describe('getExpensesByBarn', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder2 = vi.fn().mockResolvedValue({ data, error })
    const mockOrder = vi.fn().mockReturnValue({ order: mockOrder2 })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockOrder, mockOrder2 }
  }

  function makeJunctionChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeNamesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_empty_array_when_no_expenses', async () => {
    const { select } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_expenses_data_is_null', async () => {
    const { select } = makeExpensesChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result).toEqual([])
  })

  it('should_order_by_expense_date_descending', async () => {
    const { select, mockOrder } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getExpensesByBarn('barn-1')

    expect(mockOrder).toHaveBeenCalledWith('expense_date', { ascending: false })
  })

  it('should_tiebreak_same_day_expenses_by_created_at_descending', async () => {
    const { select, mockOrder2 } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getExpensesByBarn('barn-1')

    expect(mockOrder2).toHaveBeenCalledWith('created_at', { ascending: false })
  })

  it('should_attach_horse_names_from_junction_rows', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-1' }])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_empty_horse_arrays_for_barn_wide_expense', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-orphan' }])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_names).toEqual(['horse-orphan'])
  })

  it('should_throw_when_expenses_query_errors', async () => {
    const { select } = makeExpensesChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getExpensesByBarn('barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_junction_query_errors', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpensesByBarn('barn-1')).rejects.toThrow('junction error')
  })
})

describe('getExpenseById', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeExpenseChain(data: unknown | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  function makeJunctionChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeNamesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_null_when_not_found', async () => {
    const { select } = makeExpenseChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result).toBeNull()
  })

  it('should_return_expense_with_horse_names_when_found', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpenseChain(expense)
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-1' }])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_empty_horse_arrays_when_no_junction_rows', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpenseChain(expense)
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_ids).toEqual([])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpenseChain(expense)
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_ids).toEqual([])
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpenseChain(expense)
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-orphan' }])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_names).toEqual(['horse-orphan'])
  })

  it('should_throw_when_expense_query_errors', async () => {
    const { select } = makeExpenseChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getExpenseById('expense-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_throw_when_junction_query_errors', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpenseChain(expense)
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseById('expense-1', 'barn-1')).rejects.toThrow('junction error')
  })
})

describe('getOutstandingExpenses', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-10T12:00:00.000Z'))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockOr = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ or: mockOr })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockOr }
  }

  it('should_return_empty_array_when_no_rows', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_filter_amount_null_or_payment_type_null_at_query_level', async () => {
    const { select, mockOr } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(mockOr).toHaveBeenCalledWith('amount.is.null,payment_type.is.null')
  })

  it('should_scope_query_to_barn_id', async () => {
    const { select, mockEq } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_include_row_whose_combined_datetime_is_before_now', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-09', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([expense])
  })

  it('should_exclude_row_whose_combined_datetime_is_after_now', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-11', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_default_null_expense_time_to_end_of_day_when_checking_past_due', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-10', expense_time: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_include_null_time_row_once_its_day_has_fully_passed', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-09', expense_time: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([expense])
  })

  it('should_include_amount_set_row_that_is_past_due_and_unpaid', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-09', expense_time: '10:00:00', amount: 150, payment_type: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([expense])
  })

  it('should_sort_ascending_by_combined_datetime', async () => {
    const later = createMockHorseExpense({ id: 'expense-2', expense_date: '2026-07-08', expense_time: '10:00:00' })
    const earlier = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-02', expense_time: '09:00:00' })
    const { select } = makeChain([later, earlier])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'expense-2'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getOutstandingExpenses('barn-1', 'America/New_York')).rejects.toThrow('db error')
  })

  it('should_exclude_a_row_a_naive_utc_comparison_would_wrongly_flag_as_past_due', async () => {
    // Entered as 10:00 AM barn-local (EDT, UTC-4) — that's 2026-07-10T14:00:00Z, still
    // after fake "now" (2026-07-10T12:00:00Z). A naive `...Z` cast would read the digits
    // as 10:00 AM UTC (2026-07-10T10:00:00Z), which is before "now" and would wrongly
    // flag it as already past due.
    const expense = createMockHorseExpense({ expense_date: '2026-07-10', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })
})

describe('getExpensesByIds', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIn }
  }

  function makeJunctionChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeNamesChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_empty_array_without_querying_when_ids_is_empty', async () => {
    const result = await getExpensesByIds('barn-1', [])

    expect(result).toEqual([])
    expect(createClient).not.toHaveBeenCalled()
  })

  it('should_scope_the_query_to_barn_id', async () => {
    const { select, mockEq } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getExpensesByIds('barn-1', ['expense-1'])

    expect(mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_filter_by_the_provided_ids', async () => {
    const { select, mockIn } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getExpensesByIds('barn-1', ['expense-1', 'expense-2'])

    expect(mockIn).toHaveBeenCalledWith('id', ['expense-1', 'expense-2'])
  })

  it('should_attach_horse_names_from_junction_rows', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-1' }])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByIds('barn-1', ['expense-1'])

    expect(result[0].horse_names).toEqual(['Thunderbolt'])
  })

  it('should_treat_null_data_as_empty', async () => {
    const { select } = makeExpensesChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpensesByIds('barn-1', ['expense-1'])

    expect(result).toEqual([])
  })

  it('should_throw_when_supabase_returns_an_error', async () => {
    const { select } = makeExpensesChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getExpensesByIds('barn-1', ['expense-1'])).rejects.toThrow('db error')
  })
})
