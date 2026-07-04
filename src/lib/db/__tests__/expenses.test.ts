import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockHorseExpense } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  getExpensesByBarn,
  getExpenseById,
  createExpense,
  updateExpense,
  deleteExpense,
  getUpcomingExpenses,
  getExpenseFinancialSummary,
  getHorseExpenseDetail,
  getRecentRecipients,
  getRecentExpenseTypes,
  getMostCommonTypeForRecipient,
} from '../expenses'

describe('getExpensesByBarn', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockOrder = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ order: mockOrder })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockOrder }
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
    const mockEq2 = vi.fn().mockResolvedValue({ data, error })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
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

describe('createExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeInsertChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockInsert = vi.fn().mockReturnValue({ select: mockSelect })
    return { insert: mockInsert, mockInsert }
  }

  function makeJunctionInsertChain(error: Error | null = null) {
    const mockInsert = vi.fn().mockResolvedValue({ error })
    return { insert: mockInsert, mockInsert }
  }

  it('should_insert_expense_with_provided_fields', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false,
    })

    expect(mockInsert).toHaveBeenCalledWith({
      barn_id: 'barn-1', expense_date: '2026-07-01', expense_time: null, amount: null,
      recipient: 'Dr. Smith', expense_type: 'Unspecified', notes: null, applies_to_all_horses: false,
    })
  })

  it('should_default_expense_type_to_unspecified_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockInsert.mock.calls[0][0].expense_type).toBe('Unspecified')
  })

  it('should_use_provided_expense_type_when_given', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', expenseType: 'Farrier', appliesToAllHorses: false })

    expect(mockInsert.mock.calls[0][0].expense_type).toBe('Farrier')
  })

  it('should_default_expense_time_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockInsert.mock.calls[0][0].expense_time).toBeNull()
  })

  it('should_default_amount_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockInsert.mock.calls[0][0].amount).toBeNull()
  })

  it('should_default_notes_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const { insert, mockInsert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockInsert.mock.calls[0][0].notes).toBeNull()
  })

  it('should_insert_expense_horses_junction_rows_when_not_applies_to_all_horses', async () => {
    const expense = createMockHorseExpense()
    const { insert } = makeInsertChain(expense)
    const { insert: junctionInsert, mockInsert: mockJunctionInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { insert }
      return { insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await createExpense('barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: ['horse-1', 'horse-2'],
    })

    expect(mockJunctionInsert).toHaveBeenCalledWith([
      { barn_id: 'barn-1', expense_id: expense.id, horse_id: 'horse-1' },
      { barn_id: 'barn-1', expense_id: expense.id, horse_id: 'horse-2' },
    ])
  })

  it('should_skip_junction_insert_when_applies_to_all_horses_is_true', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const { insert } = makeInsertChain(expense)
    const { insert: junctionInsert, mockInsert: mockJunctionInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { insert }
      return { insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await createExpense('barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: true, horseIds: ['horse-1'],
    })

    expect(mockJunctionInsert).not.toHaveBeenCalled()
  })

  it('should_skip_junction_insert_when_horse_ids_is_undefined', async () => {
    const expense = createMockHorseExpense()
    const { insert } = makeInsertChain(expense)
    const { insert: junctionInsert, mockInsert: mockJunctionInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { insert }
      return { insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockJunctionInsert).not.toHaveBeenCalled()
  })

  it('should_skip_junction_insert_when_horse_ids_is_empty', async () => {
    const expense = createMockHorseExpense()
    const { insert } = makeInsertChain(expense)
    const { insert: junctionInsert, mockInsert: mockJunctionInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { insert }
      return { insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: [] })

    expect(mockJunctionInsert).not.toHaveBeenCalled()
  })

  it('should_return_inserted_expense_row', async () => {
    const expense = createMockHorseExpense()
    const { insert } = makeInsertChain(expense)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    const result = await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_expense_insert_errors', async () => {
    const { insert } = makeInsertChain(null, new Error('insert error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ insert }) } as any)

    await expect(
      createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('insert error')
  })

  it('should_throw_when_junction_insert_errors', async () => {
    const expense = createMockHorseExpense()
    const { insert } = makeInsertChain(expense)
    const { insert: junctionInsert } = makeJunctionInsertChain(new Error('junction insert error'))
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { insert }
      return { insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(
      createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: ['horse-1'] })
    ).rejects.toThrow('junction insert error')
  })
})

describe('updateExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeUpdateChain(data: unknown | null, error: Error | null = null) {
    const mockSingle = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ single: mockSingle })
    const mockEq2 = vi.fn().mockReturnValue({ select: mockSelect })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockUpdate = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { update: mockUpdate, mockUpdate }
  }

  function makeDeleteChain(error: Error | null = null) {
    const mockEq2 = vi.fn().mockResolvedValue({ error })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { delete: mockDelete, mockDelete }
  }

  function makeJunctionInsertChain(error: Error | null = null) {
    const mockInsert = vi.fn().mockResolvedValue({ error })
    return { insert: mockInsert, mockInsert }
  }

  it('should_update_expense_fields', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const { update, mockUpdate } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'New Vet', appliesToAllHorses: false })

    expect(mockUpdate).toHaveBeenCalledWith({
      expense_date: '2026-07-01', expense_time: null, amount: null,
      recipient: 'New Vet', expense_type: 'Unspecified', notes: null, applies_to_all_horses: false,
    })
  })

  it('should_delete_existing_horse_assignments_before_replacing', async () => {
    const expense = createMockHorseExpense()
    const { update } = makeUpdateChain(expense)
    const { delete: del, mockDelete } = makeDeleteChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockDelete).toHaveBeenCalled()
  })

  it('should_insert_new_horse_assignments_when_not_applies_to_all_horses', async () => {
    const expense = createMockHorseExpense()
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const { insert: junctionInsert, mockInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del, insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await updateExpense('expense-1', 'barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: ['horse-1'],
    })

    expect(mockInsert).toHaveBeenCalledWith([{ barn_id: 'barn-1', expense_id: 'expense-1', horse_id: 'horse-1' }])
  })

  it('should_skip_new_horse_assignment_insert_when_applies_to_all_horses_is_true', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const { insert: junctionInsert, mockInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del, insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await updateExpense('expense-1', 'barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: true, horseIds: ['horse-1'],
    })

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('should_skip_new_horse_assignment_insert_when_horse_ids_empty', async () => {
    const expense = createMockHorseExpense()
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const { insert: junctionInsert, mockInsert } = makeJunctionInsertChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del, insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: [] })

    expect(mockInsert).not.toHaveBeenCalled()
  })

  it('should_return_updated_expense_row', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'New Vet', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_update_errors', async () => {
    const { update } = makeUpdateChain(null, new Error('update error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ update }) } as any)

    await expect(
      updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('update error')
  })

  it('should_throw_when_delete_errors', async () => {
    const expense = createMockHorseExpense()
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain(new Error('delete error'))
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(
      updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('delete error')
  })

  it('should_throw_when_junction_insert_errors', async () => {
    const expense = createMockHorseExpense()
    const { update } = makeUpdateChain(expense)
    const { delete: del } = makeDeleteChain()
    const { insert: junctionInsert } = makeJunctionInsertChain(new Error('junction insert error'))
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return { update }
      return { delete: del, insert: junctionInsert }
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(
      updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, horseIds: ['horse-1'] })
    ).rejects.toThrow('junction insert error')
  })
})

describe('deleteExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(error: Error | null = null) {
    const mockEq2 = vi.fn().mockResolvedValue({ error })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockDelete = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { delete: mockDelete, mockDelete }
  }

  it('should_delete_expense', async () => {
    const { delete: del, mockDelete } = makeChain()
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ delete: del }) } as any)

    await deleteExpense('expense-1', 'barn-1')

    expect(mockDelete).toHaveBeenCalled()
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { delete: del } = makeChain(new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ delete: del }) } as any)

    await expect(deleteExpense('expense-1', 'barn-1')).rejects.toThrow('db error')
  })
})

describe('getUpcomingExpenses', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLte = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lte: mockLte })
    const mockIs = vi.fn().mockReturnValue({ gte: mockGte })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockGte, mockLte }
  }

  it('should_return_empty_array_when_no_rows_in_date_range', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result).toEqual([])
  })

  it('should_filter_amount_is_null_at_query_level', async () => {
    const { select, mockIs } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(mockIs).toHaveBeenCalledWith('amount', null)
  })

  it('should_include_row_within_window', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-03', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result).toEqual([expense])
  })

  it('should_exclude_row_dated_before_window', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-06-20', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result).toEqual([])
  })

  it('should_default_null_expense_time_to_end_of_day', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-08', expense_time: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-09T00:00:00.000Z')

    expect(result).toEqual([expense])
  })

  it('should_exclude_null_time_row_dated_on_or_after_window_end', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-08', expense_time: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result).toEqual([])
  })

  it('should_sort_ascending_by_combined_datetime', async () => {
    const later = createMockHorseExpense({ id: 'expense-2', expense_date: '2026-07-05', expense_time: '10:00:00' })
    const earlier = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-02', expense_time: '09:00:00' })
    const { select } = makeChain([later, earlier])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'expense-2'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getUpcomingExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z')).rejects.toThrow('db error')
  })
})

describe('getExpenseFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeHorsesChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
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

  it('should_return_zero_total_and_empty_breakdown_when_no_expenses_in_range', async () => {
    const { select } = makeExpensesChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 0, breakdown: [] })
  })

  it('should_return_zero_total_when_data_is_null', async () => {
    const { select } = makeExpensesChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.totalExpenses).toBe(0)
  })

  it('should_exclude_expenses_with_null_amount_from_total', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: null })
    const { select } = makeExpensesChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 0, breakdown: [] })
  })

  it('should_use_junction_rows_for_non_barn_wide_expense_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-1' }])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_skip_expense_horses_query_when_all_expenses_are_barn_wide', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const junctionFn = vi.fn()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      junctionFn()
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(junctionFn).not.toHaveBeenCalled()
  })

  it('should_split_barn_wide_expense_across_active_horses', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horseA = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horseB = { id: 'horse-2', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horseA, horseB])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }, { id: 'horse-2', name: 'Shadow' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.find((b) => b.horseId === 'horse-1')?.totalExpenses).toBe(50)
  })

  it('should_exclude_horse_created_after_expense_date_from_barn_wide_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-07-15T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_exclude_horse_created_later_same_day_as_expense_from_barn_wide_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-07-10T12:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_include_horse_created_before_expense_date_in_barn_wide_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-07-01T12:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_exclude_horse_deactivated_before_expense_date_from_barn_wide_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-06-01T00:00:00Z' }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_include_horse_deactivated_after_expense_date_in_barn_wide_split', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-08-01T00:00:00Z' }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_count_barn_wide_expense_in_total_but_exclude_from_breakdown_when_zero_applicable_horses', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    const horse = { id: 'horse-1', created_at: '2026-08-15T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([horse])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_sort_breakdown_by_total_expenses_descending', async () => {
    const expenseA = createMockHorseExpense({ id: 'expense-a', amount: 50, applies_to_all_horses: false })
    const expenseB = createMockHorseExpense({ id: 'expense-b', amount: 200, applies_to_all_horses: false })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expenseA, expenseB])
      if (table === 'horses') return makeHorsesChain([])
      if (table === 'expense_horses') return makeJunctionChain([
        { expense_id: 'expense-a', horse_id: 'horse-1' },
        { expense_id: 'expense-b', horse_id: 'horse-2' },
      ])
      return makeNamesChain([{ id: 'horse-1', name: 'A' }, { id: 'horse-2', name: 'B' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.horseId)).toEqual(['horse-2', 'horse-1'])
  })

  it('should_throw_when_horse_expenses_query_errors', async () => {
    const { select } = makeExpensesChain(null, new Error('expenses error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_horses_query_errors', async () => {
    const expense = createMockHorseExpense({ amount: 100 })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeHorsesChain(null, new Error('horses error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('horses error')
  })

  it('should_throw_when_expense_horses_query_errors', async () => {
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      if (table === 'horses') return makeHorsesChain([])
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('junction error')
  })
})

describe('getHorseExpenseDetail', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  function makeHorseLookupChain(data: unknown | null, error: Error | null = null) {
    const mockMaybeSingle = vi.fn().mockResolvedValue({ data, error })
    const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle })
    const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 })
    return { select: mockSelect }
  }

  function makeExpensesChain(data: unknown[] | null, error: Error | null = null) {
    const mockLt = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lt: mockLt })
    const mockEq = vi.fn().mockReturnValue({ gte: mockGte })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeBarnHorsesChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function makeJunctionChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  it('should_return_empty_rows_and_zero_total_when_horse_not_found', async () => {
    const { select } = makeHorseLookupChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'horse-1', rows: [], total: 0 })
  })

  it('should_return_empty_rows_and_zero_total_when_no_expenses_in_range', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      return makeExpensesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], total: 0 })
  })

  it('should_include_row_for_junction_linked_expense', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-10' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-1' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([{ expenseId: 'expense-1', expenseDate: '2026-07-10', amount: 100, horseCount: 1, splitAmount: 100 }])
  })

  it('should_exclude_row_when_horse_not_in_junction_for_non_barn_wide_expense', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-10' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-2' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_include_row_for_barn_wide_expense_when_horse_active_on_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    // the horse lookup and the barn-wide-horses fetch both hit 'horses' but with different select shapes;
    // dispatch by call order since the table name alone can't distinguish them
    let horsesCallCount = 0
    const fromFn2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn2 } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([{ expenseId: 'expense-1', expenseDate: '2026-07-10', amount: 100, horseCount: 1, splitAmount: 100 }])
  })

  it('should_exclude_row_for_barn_wide_expense_when_horse_deactivated_before_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-06-01T00:00:00Z' }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_exclude_row_for_barn_wide_expense_when_horse_created_after_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-07-20T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_compute_horse_count_from_all_applicable_horses_for_barn_wide_row', async () => {
    const horse1 = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horse2 = { id: 'horse-2', name: 'Shadow', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse1)
        return makeBarnHorsesChain([horse1, horse2])
      }
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(2)
  })

  it('should_compute_split_amount_as_amount_divided_by_horse_count', async () => {
    const horse1 = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horse2 = { id: 'horse-2', name: 'Shadow', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse1)
        return makeBarnHorsesChain([horse1, horse2])
      }
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_sum_total_from_row_split_amounts', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expenseA = createMockHorseExpense({ id: 'expense-a', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-05' })
    const expenseB = createMockHorseExpense({ id: 'expense-b', amount: 60, applies_to_all_horses: false, expense_date: '2026-07-15' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeExpensesChain([expenseA, expenseB])
      return makeJunctionChain([
        { expense_id: 'expense-a', horse_id: 'horse-1' },
        { expense_id: 'expense-b', horse_id: 'horse-1' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.total).toBe(160)
  })

  it('should_throw_when_horse_query_errors', async () => {
    const { select } = makeHorseLookupChain(null, new Error('horse error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('horse error')
  })

  it('should_throw_when_expenses_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      return makeExpensesChain(null, new Error('expenses error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_barn_horses_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain(null, new Error('barn horses error'))
      }
      return makeExpensesChain([expense])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('barn horses error')
  })

  it('should_throw_when_expense_horses_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const expense = createMockHorseExpense({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeExpensesChain([expense])
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('junction error')
  })
})

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
      { recipient: 'Old Vet', expense_date: '2025-01-01' },
      { recipient: 'Recent Vet', expense_date: '2026-07-01' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual(['Recent Vet', 'Old Vet'])
  })

  it('should_tiebreak_by_total_count_when_recent_counts_equal', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-15T00:00:00Z'))
    const { select } = makeChain([
      { recipient: 'Frequent', expense_date: '2025-01-01' },
      { recipient: 'Frequent', expense_date: '2025-02-01' },
      { recipient: 'Rare', expense_date: '2025-01-01' },
    ])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getRecentRecipients('barn-1')

    expect(result).toEqual(['Frequent', 'Rare'])
  })

  it('should_tiebreak_alphabetically_when_all_counts_equal', async () => {
    const { select } = makeChain([
      { recipient: 'Zebra Farrier', expense_date: '2025-01-01' },
      { recipient: 'Apple Vet', expense_date: '2025-01-01' },
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
