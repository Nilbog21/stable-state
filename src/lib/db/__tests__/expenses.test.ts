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
  getUpcomingScheduledExpenses,
  getOutstandingExpenses,
  getRecentRecipients,
  getRecentExpenseTypes,
  getMostCommonTypeForRecipient,
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

describe('createExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_provided_fields', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false,
      expenseTime: '14:00', amount: 100, expenseType: 'Farrier', notes: 'note', horseIds: ['horse-1'],
    })

    expect(mockRpc).toHaveBeenCalledWith('create_expense_with_horses', {
      p_barn_id: 'barn-1', p_expense_date: '2026-07-01', p_recipient: 'Dr. Smith', p_applies_to_all_horses: false,
      p_expense_time: '14:00', p_amount: 100, p_expense_type: 'Farrier', p_notes: 'note', p_horse_ids: ['horse-1'],
      p_payment_type: null, p_occurred_at: null,
    })
  })

  it('should_default_expense_type_to_unspecified_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_type).toBe('Unspecified')
  })

  it('should_default_expense_time_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_time).toBeNull()
  })

  it('should_default_amount_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_amount).toBeNull()
  })

  it('should_default_notes_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_notes).toBeNull()
  })

  it('should_default_horse_ids_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: true })

    expect(mockRpc.mock.calls[0][1].p_horse_ids).toBeNull()
  })

  it('should_return_rpc_data', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await createExpense(
      'barn-1',
      { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false },
      mockClient
    )

    expect(result).toEqual(expense)
  })

  it('should_forward_payment_type_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, paymentType: 'venmo' })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBe('venmo')
  })

  it('should_default_payment_type_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBeNull()
  })

  it('should_forward_occurred_at_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false,
      occurredAt: '2026-07-01T18:00:00.000Z',
    })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBe('2026-07-01T18:00:00.000Z')
  })

  it('should_default_occurred_at_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBeNull()
  })
})

describe('updateExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_provided_fields', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', {
      expenseDate: '2026-07-01', recipient: 'New Vet', appliesToAllHorses: false,
      expenseTime: '14:00', amount: 100, expenseType: 'Farrier', notes: 'note', horseIds: ['horse-1'],
    })

    expect(mockRpc).toHaveBeenCalledWith('update_expense_with_horses', {
      p_expense_id: 'expense-1', p_barn_id: 'barn-1', p_expense_date: '2026-07-01', p_recipient: 'New Vet',
      p_applies_to_all_horses: false, p_expense_time: '14:00', p_amount: 100, p_expense_type: 'Farrier',
      p_notes: 'note', p_horse_ids: ['horse-1'], p_payment_type: null, p_occurred_at: null,
    })
  })

  it('should_default_expense_type_to_unspecified_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_type).toBe('Unspecified')
  })

  it('should_default_expense_time_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_time).toBeNull()
  })

  it('should_default_amount_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_amount).toBeNull()
  })

  it('should_default_notes_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_notes).toBeNull()
  })

  it('should_default_horse_ids_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: true })

    expect(mockRpc.mock.calls[0][1].p_horse_ids).toBeNull()
  })

  it('should_return_rpc_data', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'New Vet', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await updateExpense(
      'expense-1',
      'barn-1',
      { expenseDate: '2026-07-01', recipient: 'New Vet', appliesToAllHorses: false },
      mockClient
    )

    expect(result).toEqual(expense)
  })

  it('should_forward_payment_type_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false, paymentType: 'cash' })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBe('cash')
  })

  it('should_default_payment_type_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBeNull()
  })

  it('should_forward_occurred_at_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', {
      expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false,
      occurredAt: '2026-07-01T18:00:00.000Z',
    })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBe('2026-07-01T18:00:00.000Z')
  })

  it('should_default_occurred_at_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: '2026-07-01', recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBeNull()
  })
})

describe('deleteExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_the_delete_expense_with_transactions_rpc_with_default_params', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteExpense('expense-1', 'barn-1')

    expect(mockRpc).toHaveBeenCalledWith('delete_expense_with_transactions', {
      p_expense_id: 'expense-1',
      p_barn_id: 'barn-1',
      p_delete_collected: false,
    })
  })

  it('should_pass_delete_collected_transactions_true_through_to_the_rpc', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await deleteExpense('expense-1', 'barn-1', true)

    expect(mockRpc).toHaveBeenCalledWith('delete_expense_with_transactions',
      expect.objectContaining({ p_delete_collected: true })
    )
  })

  it('should_throw_when_supabase_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: new Error('db error') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(deleteExpense('expense-1', 'barn-1')).rejects.toThrow('db error')
  })

  it('should_use_injected_client_when_provided', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as any

    await deleteExpense('expense-1', 'barn-1', false, mockClient)

    expect(mockRpc).toHaveBeenCalled()
  })

  it('should_not_call_createClient_when_client_injected', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ error: null })
    const mockClient = { rpc: mockRpc } as any

    await deleteExpense('expense-1', 'barn-1', false, mockClient)

    expect(createClient).not.toHaveBeenCalled()
  })
})

describe('getUpcomingScheduledExpenses', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  function makeChain(data: unknown[] | null, error: Error | null = null) {
    const mockLte = vi.fn().mockResolvedValue({ data, error })
    const mockGte = vi.fn().mockReturnValue({ lte: mockLte })
    const mockNot = vi.fn().mockReturnValue({ gte: mockGte })
    const mockIs = vi.fn().mockReturnValue({ not: mockNot })
    const mockEq = vi.fn().mockReturnValue({ is: mockIs })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq, mockIs, mockNot, mockGte, mockLte }
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

  it('should_return_empty_array_when_no_rows_in_date_range', async () => {
    const { select } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    const { select } = makeChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_filter_amount_is_null_at_query_level', async () => {
    const { select, mockIs } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(mockIs).toHaveBeenCalledWith('amount', null)
  })

  it('should_filter_expense_time_not_null_at_query_level', async () => {
    const { select, mockNot } = makeChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(mockNot).toHaveBeenCalledWith('expense_time', 'is', null)
  })

  it('should_include_row_within_window', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-03', expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual([expense.id])
  })

  it('should_exclude_row_dated_before_window', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-06-20', expense_time: '10:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_defensively_exclude_row_with_null_expense_time', async () => {
    const expense = createMockHorseExpense({ expense_date: '2026-07-03', expense_time: null })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_break_combined_datetime_ties_by_created_at', async () => {
    const older = createMockHorseExpense({ id: 'expense-older', expense_date: '2026-07-03', expense_time: '10:00:00', created_at: '2026-07-01T00:00:00.000Z' })
    const newer = createMockHorseExpense({ id: 'expense-newer', expense_date: '2026-07-03', expense_time: '10:00:00', created_at: '2026-07-02T00:00:00.000Z' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([newer, older])
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual(['expense-older', 'expense-newer'])
  })

  it('should_sort_ascending_by_combined_datetime', async () => {
    const later = createMockHorseExpense({ id: 'expense-2', expense_date: '2026-07-05', expense_time: '10:00:00' })
    const earlier = createMockHorseExpense({ id: 'expense-1', expense_date: '2026-07-02', expense_time: '09:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([later, earlier])
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'expense-2'])
  })

  it('should_attach_horse_names_from_junction_rows', async () => {
    const expense = createMockHorseExpense({ expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-1' }])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result[0].horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_empty_horse_arrays_for_barn_wide_expense', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true, expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense({ expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found', async () => {
    const expense = createMockHorseExpense({ expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      if (table === 'expense_horses') return makeJunctionChain([{ expense_id: expense.id, horse_id: 'horse-orphan' }])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(result[0].horse_names).toEqual(['horse-orphan'])
  })

  it('should_return_empty_array_without_querying_horses_when_no_expenses_in_window', async () => {
    const { select } = makeChain([])
    const fromFn = vi.fn().mockReturnValue({ select })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')

    expect(fromFn).toHaveBeenCalledTimes(1)
  })

  it('should_throw_when_expenses_query_errors', async () => {
    const { select } = makeChain(null, new Error('db error'))
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    await expect(getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')).rejects.toThrow('db error')
  })

  it('should_throw_when_junction_query_errors', async () => {
    const expense = createMockHorseExpense({ expense_time: '10:00:00' })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeChain([expense])
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getUpcomingScheduledExpenses('barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T00:00:00.000Z', 'America/New_York')).rejects.toThrow('junction error')
  })

  it('should_exclude_a_row_a_naive_utc_comparison_would_wrongly_include', async () => {
    // Entered as 8:00 PM barn-local (EDT, UTC-4) on the window's last day — that's
    // 2026-07-09T00:00:00Z, after the window end below. A naive `...Z` cast would read
    // the digits as 8:00 PM UTC (2026-07-08T20:00:00Z), which is still before the
    // window end and would wrongly include it.
    const expense = createMockHorseExpense({ expense_date: '2026-07-08', expense_time: '20:00:00' })
    const { select } = makeChain([expense])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getUpcomingScheduledExpenses(
      'barn-1', '2026-07-01T00:00:00.000Z', '2026-07-08T22:00:00.000Z', 'America/New_York'
    )

    expect(result).toEqual([])
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
