import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorseExpense } from '@/test/fixtures'
import type { HorseExpense } from '../types'

// Shape of an `expense`-kind TransactionRow as returned by (mocked) getTransactionRows
// (#865) — amount is stored negative in the ledger (signed convention, matches
// instructor_payout), so this flips it back to the positive magnitude the raw
// HorseExpense fixture already uses. `appliesToAllHorses` is a test-only convenience
// field (not part of TransactionRow) so call sites can build the horse_expenses
// follow-up lookup row without re-specifying the value.
function mockExpenseTxRow(overrides: Partial<HorseExpense> = {}) {
  const e = createMockHorseExpense(overrides)
  return {
    id: `txn-${e.id}`,
    kind: 'expense' as const,
    amount: -(e.amount as number),
    collected: true,
    paymentType: null,
    membershipId: null,
    horseId: null,
    lessonId: null,
    lessonRiderId: null,
    agreementChargeId: null,
    expenseId: e.id,
    occurredAt: `${e.expense_date}T00:00:00+00:00`,
    appliesToAllHorses: e.applies_to_all_horses,
    recipient: e.recipient,
    expenseType: e.expense_type,
  }
}

function makeHorseExpensesLookupChain(data: unknown[] | null, error: Error | null = null) {
  const mockIn = vi.fn().mockResolvedValue({ data, error })
  const mockEq = vi.fn().mockReturnValue({ in: mockIn })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  return { select: mockSelect }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))
// partial mock: getTransactionRows is stubbed per-test, but positiveAmount is real
// business logic used inside expenses.ts and must not be auto-mocked away
vi.mock('../transactions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../transactions')>()
  return { ...actual, getTransactionRows: vi.fn() }
})

import { createClient } from '@/lib/supabase/server'
import { getTransactionRows } from '../transactions'
import { getExpenseFinancialSummary, getHorseExpenseDetail, getRecipientExpenseSummary, getRecipientExpenseDetail } from '../expense-finances'

describe('getExpenseFinancialSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  // 'horses' is queried twice with different select shapes: the barn-wide-split fetch
  // (select includes 'created_at') and resolveHorseNames (select is 'id, name'); branch on the shape
  function makeHorsesChain(barnHorsesData: unknown[] | null, namesData: unknown[] | null = [], barnHorsesError: Error | null = null) {
    const mockSelect = vi.fn().mockImplementation((cols: string) => {
      if (cols.includes('created_at')) {
        const mockEq = vi.fn().mockResolvedValue({ data: barnHorsesData, error: barnHorsesError })
        return { eq: mockEq }
      }
      const mockIn = vi.fn().mockResolvedValue({ data: namesData, error: null })
      const mockEq = vi.fn().mockReturnValue({ in: mockIn })
      return { eq: mockEq }
    })
    return { select: mockSelect }
  }

  function makeJunctionChain(data: unknown[] | null, error: Error | null = null) {
    const mockIn = vi.fn().mockResolvedValue({ data, error })
    const mockEq = vi.fn().mockReturnValue({ in: mockIn })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect }
  }

  function horseExpensesLookupRow(row: ReturnType<typeof mockExpenseTxRow>) {
    return { id: row.expenseId, applies_to_all_horses: row.appliesToAllHorses }
  }

  it('should_return_zero_total_and_empty_breakdown_when_no_expenses_in_range', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 0, breakdown: [] })
  })

  it('should_use_junction_rows_for_non_barn_wide_expense_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      if (table === 'horses') return makeHorsesChain([], [{ id: 'horse-1', name: 'Thunderbolt' }])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-1' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_skip_expense_horses_query_when_all_expenses_are_barn_wide', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const junctionFn = vi.fn()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      if (table === 'horses') return makeHorsesChain([horse], [{ id: 'horse-1', name: 'Thunderbolt' }])
      junctionFn()
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(junctionFn).not.toHaveBeenCalled()
  })

  it('should_split_barn_wide_expense_across_active_horses', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horseA = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horseB = { id: 'horse-2', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horseA, horseB], [{ id: 'horse-1', name: 'Thunderbolt' }, { id: 'horse-2', name: 'Shadow' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.find((b) => b.horseId === 'horse-1')?.totalExpenses).toBe(50)
  })

  it('should_exclude_horse_created_after_expense_date_from_barn_wide_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-07-15T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_exclude_horse_created_later_same_day_as_expense_from_barn_wide_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-07-10T12:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_include_horse_created_before_expense_date_in_barn_wide_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-07-01T12:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse], [{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_exclude_horse_deactivated_before_expense_date_from_barn_wide_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-06-01T00:00:00Z' }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([])
  })

  it('should_include_horse_deactivated_after_expense_date_in_barn_wide_split', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-08-01T00:00:00Z' }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse], [{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-1', horseName: 'Thunderbolt', totalExpenses: 100 }])
  })

  it('should_count_barn_wide_expense_in_total_but_exclude_from_breakdown_when_zero_applicable_horses', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const horse = { id: 'horse-1', created_at: '2026-08-15T00:00:00Z', deactivated_at: null }
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain([horse])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_sort_breakdown_by_total_expenses_descending', async () => {
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 50, applies_to_all_horses: false })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 200, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)])
      if (table === 'horses') return makeHorsesChain([], [{ id: 'horse-1', name: 'A' }, { id: 'horse-2', name: 'B' }])
      return makeJunctionChain([
        { expense_id: 'expense-a', horse_id: 'horse-1' },
        { expense_id: 'expense-b', horse_id: 'horse-2' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown.map((b) => b.horseId)).toEqual(['horse-2', 'horse-1'])
  })

  it('should_treat_null_barn_horses_data_as_empty', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      if (table === 'horses') return makeHorsesChain([])
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found_in_breakdown', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      if (table === 'horses') return makeHorsesChain([], [])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-orphan' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result.breakdown).toEqual([{ horseId: 'horse-orphan', horseName: 'horse-orphan', totalExpenses: 100 }])
  })

  it('should_fall_back_to_not_barn_wide_when_horse_expenses_lookup_has_no_match', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([])
      if (table === 'horses') return makeHorsesChain([{ id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_treat_null_horse_expenses_lookup_data_as_empty', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain(null)
      if (table === 'horses') return makeHorsesChain([{ id: 'horse-1', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('expenses error'))

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_count_an_orphaned_expense_transaction_toward_total_but_exclude_it_from_the_breakdown', async () => {
    // expenseId is null when the source horse_expenses row was hard-deleted
    // (deleteExpense has no transactions cleanup) after the expense was collected.
    const orphanedRow = { ...mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false }), expenseId: null }
    vi.mocked(getTransactionRows).mockResolvedValue([orphanedRow])
    const horseExpensesFn = vi.fn()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') { horseExpensesFn(); return makeHorseExpensesLookupChain([]) }
      if (table === 'horses') return makeHorsesChain([])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseFinancialSummary('barn-1', startDate, endDate)

    expect(result).toEqual({ totalExpenses: 100, breakdown: [] })
    expect(horseExpensesFn).not.toHaveBeenCalled()
  })

  it('should_throw_when_horse_expenses_lookup_query_errors', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100 })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain(null, new Error('horse_expenses error')))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('horse_expenses error')
  })

  it('should_throw_when_horses_query_errors', async () => {
    const row = mockExpenseTxRow({ amount: 100 })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeHorsesChain(null, [], new Error('horses error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseFinancialSummary('barn-1', startDate, endDate)).rejects.toThrow('horses error')
  })

  it('should_throw_when_expense_horses_query_errors', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
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
    vi.mocked(getTransactionRows).mockReset()
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

  function horseExpensesLookupRow(row: ReturnType<typeof mockExpenseTxRow>) {
    return { id: row.expenseId, applies_to_all_horses: row.appliesToAllHorses }
  }

  it('should_return_empty_rows_and_zero_total_when_horse_not_found', async () => {
    const { select } = makeHorseLookupChain(null)
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue({ select }) } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'horse-1', rows: [], total: 0 })
  })

  it('should_return_empty_rows_and_zero_total_when_no_expenses_in_range', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    vi.mocked(getTransactionRows).mockResolvedValue([])
    const fromFn = vi.fn().mockReturnValue(makeHorseLookupChain(horse))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result).toEqual({ horseName: 'Thunderbolt', rows: [], total: 0 })
  })

  it('should_include_row_for_junction_linked_expense', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-1' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([{ expenseId: 'expense-1', expenseDate: '2026-07-10', amount: 100, horseCount: 1, splitAmount: 100 }])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_exclude_row_when_horse_not_in_junction_for_non_barn_wide_expense', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([{ expense_id: 'expense-1', horse_id: 'horse-2' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_include_row_for_barn_wide_expense_when_horse_active_on_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    // the horse lookup and the barn-wide-horses fetch both hit 'horses' but with different select shapes;
    // dispatch by call order since the table name alone can't distinguish them
    let horsesCallCount = 0
    const fromFn2 = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn2 } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([{ expenseId: 'expense-1', expenseDate: '2026-07-10', amount: 100, horseCount: 1, splitAmount: 100 }])
  })

  it('should_exclude_row_for_barn_wide_expense_when_horse_deactivated_before_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: '2026-06-01T00:00:00Z' }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_exclude_row_for_barn_wide_expense_when_horse_created_after_expense_date', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-07-20T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain([horse])
      }
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows).toEqual([])
  })

  it('should_compute_horse_count_from_all_applicable_horses_for_barn_wide_row', async () => {
    const horse1 = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horse2 = { id: 'horse-2', name: 'Shadow', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse1)
        return makeBarnHorsesChain([horse1, horse2])
      }
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].horseCount).toBe(2)
  })

  it('should_compute_split_amount_as_amount_divided_by_horse_count', async () => {
    const horse1 = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const horse2 = { id: 'horse-2', name: 'Shadow', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse1)
        return makeBarnHorsesChain([horse1, horse2])
      }
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)

    expect(result.rows[0].splitAmount).toBe(50)
  })

  it('should_sum_total_from_row_split_amounts', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 100, applies_to_all_horses: false, expense_date: '2026-07-05' })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 60, applies_to_all_horses: false, expense_date: '2026-07-15' })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)])
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

  it('should_propagate_error_from_getTransactionRows', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('expenses error'))
    const fromFn = vi.fn().mockReturnValue(makeHorseLookupChain(horse))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_barn_horses_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: true, expense_date: '2026-07-10' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    let horsesCallCount = 0
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') {
        horsesCallCount += 1
        if (horsesCallCount === 1) return makeHorseLookupChain(horse)
        return makeBarnHorsesChain(null, new Error('barn horses error'))
      }
      return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('barn horses error')
  })

  it('should_throw_when_horse_expenses_lookup_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      return makeHorseExpensesLookupChain(null, new Error('horse_expenses error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('horse_expenses error')
  })

  it('should_throw_when_expense_horses_query_errors', async () => {
    const horse = { id: 'horse-1', name: 'Thunderbolt', created_at: '2026-01-01T00:00:00Z', deactivated_at: null }
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, applies_to_all_horses: false })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'horses') return makeHorseLookupChain(horse)
      if (table === 'horse_expenses') return makeHorseExpensesLookupChain([horseExpensesLookupRow(row)])
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getHorseExpenseDetail('barn-1', 'horse-1', startDate, endDate)).rejects.toThrow('junction error')
  })
})

describe('getRecipientExpenseSummary', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  function horseExpensesLookupRow(row: ReturnType<typeof mockExpenseTxRow>) {
    return { id: row.expenseId, applies_to_all_horses: row.appliesToAllHorses, recipient: row.recipient, expense_type: row.expenseType }
  }

  it('should_return_empty_array_when_no_expenses_in_range', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])

    const result = await getRecipientExpenseSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_group_multiple_expenses_under_the_same_recipient', async () => {
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 50, recipient: 'Dr. Smith' })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 30, recipient: 'Dr. Smith' })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseSummary('barn-1', startDate, endDate)

    expect(result).toEqual([{ recipient: 'Dr. Smith', totalExpenses: 80 }])
  })

  it('should_sort_breakdown_by_total_expenses_descending', async () => {
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 30, recipient: 'Feed Co' })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 90, recipient: 'Dr. Smith' })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseSummary('barn-1', startDate, endDate)

    expect(result.map((r) => r.recipient)).toEqual(['Dr. Smith', 'Feed Co'])
  })

  it('should_skip_an_orphaned_expense_transaction_with_no_resolvable_recipient', async () => {
    const orphanedRow = { ...mockExpenseTxRow({ id: 'expense-1', amount: 100 }), expenseId: null }
    vi.mocked(getTransactionRows).mockResolvedValue([orphanedRow])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseSummary('barn-1', startDate, endDate)

    expect(result).toEqual([])
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('expenses error'))

    await expect(getRecipientExpenseSummary('barn-1', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_horse_expenses_lookup_query_errors', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100 })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain(null, new Error('horse_expenses error')))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getRecipientExpenseSummary('barn-1', startDate, endDate)).rejects.toThrow('horse_expenses error')
  })
})

describe('getRecipientExpenseDetail', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
    vi.mocked(getTransactionRows).mockReset()
  })

  const startDate = new Date('2026-07-01T00:00:00Z')
  const endDate = new Date('2026-08-01T00:00:00Z')

  function horseExpensesLookupRow(row: ReturnType<typeof mockExpenseTxRow>) {
    return { id: row.expenseId, applies_to_all_horses: row.appliesToAllHorses, recipient: row.recipient, expense_type: row.expenseType }
  }

  it('should_return_empty_rows_and_zero_total_when_no_expenses_in_range', async () => {
    vi.mocked(getTransactionRows).mockResolvedValue([])

    const result = await getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)

    expect(result).toEqual({ rows: [], total: 0 })
  })

  it('should_filter_rows_to_exact_recipient_match_only', async () => {
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 50, recipient: 'Dr. Smith', expense_type: 'Veterinary', expense_date: '2026-07-05' })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 30, recipient: 'Feed Co', expense_date: '2026-07-06' })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)

    expect(result.rows).toEqual([{ expenseId: 'expense-a', expenseDate: '2026-07-05', expenseType: 'Veterinary', amount: 50 }])
  })

  it('should_compute_total_as_sum_of_row_amounts', async () => {
    const rowA = mockExpenseTxRow({ id: 'expense-a', amount: 50, recipient: 'Dr. Smith', expense_date: '2026-07-05' })
    const rowB = mockExpenseTxRow({ id: 'expense-b', amount: 30, recipient: 'Dr. Smith', expense_date: '2026-07-15' })
    vi.mocked(getTransactionRows).mockResolvedValue([rowA, rowB])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([horseExpensesLookupRow(rowA), horseExpensesLookupRow(rowB)]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)

    expect(result.total).toBe(80)
  })

  it('should_return_empty_rows_and_zero_total_when_recipient_has_no_expenses_that_month', async () => {
    const row = mockExpenseTxRow({ id: 'expense-a', amount: 50, recipient: 'Feed Co' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain([horseExpensesLookupRow(row)]))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)

    expect(result).toEqual({ rows: [], total: 0 })
  })

  it('should_propagate_error_from_getTransactionRows', async () => {
    vi.mocked(getTransactionRows).mockRejectedValue(new Error('expenses error'))

    await expect(getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)).rejects.toThrow('expenses error')
  })

  it('should_throw_when_horse_expenses_lookup_query_errors', async () => {
    const row = mockExpenseTxRow({ id: 'expense-1', amount: 100, recipient: 'Dr. Smith' })
    vi.mocked(getTransactionRows).mockResolvedValue([row])
    const fromFn = vi.fn().mockReturnValue(makeHorseExpensesLookupChain(null, new Error('horse_expenses error')))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getRecipientExpenseDetail('barn-1', 'Dr. Smith', startDate, endDate)).rejects.toThrow('horse_expenses error')
  })
})
