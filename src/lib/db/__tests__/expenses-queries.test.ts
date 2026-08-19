import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createMockAppointment, createMockHorseExpense } from '@/test/fixtures'

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
import { calendarDate } from '@/lib/local-day'

// appointment_costs lookup (#1148): select → eq(barn_id) → in(appointment_id) → resolves.
// A trainer's session gets zero rows back from it, not an error — appointment_costs is
// manager-only RLS while appointments itself is manager + trainer.
function makeCostChain(data: unknown[] | null, error: Error | null = null) {
  const mockIn = vi.fn().mockResolvedValue({ data, error })
  const mockEq = vi.fn().mockReturnValue({ in: mockIn })
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  return { select: mockSelect }
}

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
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses') return makeJunctionChain([{ appointment_id: expense.id, horse_id: 'horse-1' }])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_names).toEqual(['Thunderbolt'])
  })

  // #1286: appointment_horses carries only horse_id, so the junction query can't be ordered
  // by horse name at the DB — the names arrive from resolveHorseNames afterwards. Sorted
  // here instead, alphabetically, matching getHorsesByBarn's ORDER BY h.name.
  it('should_order_horse_names_alphabetically', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses')
        return makeJunctionChain([
          { appointment_id: expense.id, horse_id: 'horse-z' },
          { appointment_id: expense.id, horse_id: 'horse-a' },
        ])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([
        { id: 'horse-z', name: 'Zephyr' },
        { id: 'horse-a', name: 'Apollo' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_names).toEqual(['Apollo', 'Zephyr'])
  })

  it('should_keep_horse_ids_aligned_with_alphabetically_ordered_names', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses')
        return makeJunctionChain([
          { appointment_id: expense.id, horse_id: 'horse-z' },
          { appointment_id: expense.id, horse_id: 'horse-a' },
        ])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([
        { id: 'horse-z', name: 'Zephyr' },
        { id: 'horse-a', name: 'Apollo' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual(['horse-a', 'horse-z'])
  })

  it('should_break_a_horse_name_tie_on_horse_id', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses')
        return makeJunctionChain([
          { appointment_id: expense.id, horse_id: 'horse-z' },
          { appointment_id: expense.id, horse_id: 'horse-a' },
        ])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([
        { id: 'horse-z', name: 'Duke' },
        { id: 'horse-a', name: 'Duke' },
      ])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual(['horse-a', 'horse-z'])
  })

  it('should_return_empty_horse_arrays_for_barn_wide_expense', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses') return makeJunctionChain([])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpensesByBarn('barn-1')

    expect(result[0].horse_ids).toEqual([])
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses') return makeJunctionChain([{ appointment_id: expense.id, horse_id: 'horse-orphan' }])
      if (table === 'appointment_costs') return makeCostChain([])
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
      if (table === 'appointments') return makeExpensesChain([expense])
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
      if (table === 'appointments') return makeExpenseChain(expense)
      if (table === 'appointment_horses') return makeJunctionChain([{ appointment_id: expense.id, horse_id: 'horse-1' }])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([{ id: 'horse-1', name: 'Thunderbolt' }])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_names).toEqual(['Thunderbolt'])
  })

  it('should_return_empty_horse_arrays_when_no_junction_rows', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpenseChain(expense)
      if (table === 'appointment_horses') return makeJunctionChain([])
      if (table === 'appointment_costs') return makeCostChain([])
      return makeNamesChain([])
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_ids).toEqual([])
  })

  it('should_treat_null_junction_data_as_empty', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpenseChain(expense)
      return makeJunctionChain(null)
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.horse_ids).toEqual([])
  })

  it('should_fall_back_to_raw_horse_id_when_name_not_found', async () => {
    const expense = createMockHorseExpense()
    const fromFn = vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpenseChain(expense)
      if (table === 'appointment_horses') return makeJunctionChain([{ appointment_id: expense.id, horse_id: 'horse-orphan' }])
      if (table === 'appointment_costs') return makeCostChain([])
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
      if (table === 'appointments') return makeExpenseChain(expense)
      return makeJunctionChain(null, new Error('junction error'))
    })
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseById('expense-1', 'barn-1')).rejects.toThrow('junction error')
  })

  // #1148: amount/payment_type live on appointment_costs now, and the DAL flattens them
  // back onto the returned row so every consumer keeps reading expense.amount.
  function makeCostFrom(costs: unknown[] | null, error: Error | null = null) {
    const appointment = createMockAppointment({ id: 'expense-1' })
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeExpenseChain(appointment)
      if (table === 'appointment_horses') return makeJunctionChain([])
      if (table === 'appointment_costs') return makeCostChain(costs, error)
      return makeNamesChain([])
    })
  }

  it('should_flatten_the_attached_cost_amount_onto_the_appointment', async () => {
    const fromFn = makeCostFrom([{ appointment_id: 'expense-1', amount: 250, payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.amount).toBe(250)
  })

  it('should_flatten_the_attached_cost_payment_type_onto_the_appointment', async () => {
    const fromFn = makeCostFrom([{ appointment_id: 'expense-1', amount: 250, payment_type: 'venmo' }])
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.payment_type).toBe('venmo')
  })

  it('should_report_a_null_amount_when_no_cost_row_is_visible', async () => {
    // Both the not-yet-priced case and a trainer's session, which appointment_costs'
    // manager-only RLS filters down to zero rows.
    const fromFn = makeCostFrom([])
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.amount).toBeNull()
  })

  it('should_report_a_null_payment_type_when_no_cost_row_is_visible', async () => {
    const fromFn = makeCostFrom([])
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.payment_type).toBeNull()
  })

  it('should_treat_null_cost_data_as_no_cost', async () => {
    const fromFn = makeCostFrom(null)
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    const result = await getExpenseById('expense-1', 'barn-1')

    expect(result?.amount).toBeNull()
  })

  it('should_throw_when_cost_query_errors', async () => {
    const fromFn = makeCostFrom(null, new Error('cost error'))
    vi.mocked(createClient).mockResolvedValue({ from: fromFn } as any)

    await expect(getExpenseById('expense-1', 'barn-1')).rejects.toThrow('cost error')
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

  // #1148: the old `.or('amount.is.null,payment_type.is.null')` query filter is gone --
  // amount and payment_type moved to appointment_costs, so "outstanding" is now decided
  // in JS from the attached cost (no cost row = not yet priced, cost with a null
  // payment_type = priced but unpaid), alongside the wall-clock past-due bound this
  // function already evaluated there.
  function makeAppointmentsChain(data: unknown[] | null, error: Error | null = null) {
    const mockEq = vi.fn().mockResolvedValue({ data, error })
    const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
    return { select: mockSelect, mockEq }
  }

  function makeFrom(appointments: unknown[] | null, costs: unknown[] | null = [], opts: { appointmentsError?: Error | null; costsError?: Error | null } = {}) {
    return vi.fn().mockImplementation((table: string) => {
      if (table === 'appointments') return makeAppointmentsChain(appointments, opts.appointmentsError ?? null)
      return makeCostChain(costs, opts.costsError ?? null)
    })
  }

  it('should_return_empty_array_when_no_rows', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([]) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_return_empty_array_when_data_is_null', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom(null) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_scope_query_to_barn_id', async () => {
    const chain = makeAppointmentsChain([])
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(chain.mockEq).toHaveBeenCalledWith('barn_id', 'barn-1')
  })

  it('should_include_a_past_due_appointment_with_no_cost_row', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment], []) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual([appointment.id])
  })

  it('should_include_a_past_due_appointment_whose_cost_is_unpaid', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: '10:00:00' })
    const costs = [{ appointment_id: appointment.id, amount: 150, payment_type: null }]
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment], costs) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual([appointment.id])
  })

  it('should_exclude_a_past_due_appointment_whose_cost_is_already_paid', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: '10:00:00' })
    const costs = [{ appointment_id: appointment.id, amount: 150, payment_type: 'venmo' }]
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment], costs) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_flatten_the_attached_amount_onto_an_outstanding_row', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: '10:00:00' })
    const costs = [{ appointment_id: appointment.id, amount: 150, payment_type: null }]
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment], costs) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result[0].amount).toBe(150)
  })

  it('should_exclude_row_whose_combined_datetime_is_after_now', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-11'), expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment]) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_default_null_expense_time_to_end_of_day_when_checking_past_due', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-10'), expense_time: null })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment]) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result).toEqual([])
  })

  it('should_include_null_time_row_once_its_day_has_fully_passed', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: null })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment]) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual([appointment.id])
  })

  it('should_sort_ascending_by_combined_datetime', async () => {
    const later = createMockAppointment({ id: 'expense-2', expense_date: calendarDate('2026-07-08'), expense_time: '10:00:00' })
    const earlier = createMockAppointment({ id: 'expense-1', expense_date: calendarDate('2026-07-02'), expense_time: '09:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([later, earlier]) } as any)

    const result = await getOutstandingExpenses('barn-1', 'America/New_York')

    expect(result.map((r) => r.id)).toEqual(['expense-1', 'expense-2'])
  })

  it('should_throw_when_supabase_returns_error', async () => {
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom(null, [], { appointmentsError: new Error('db error') }) } as any)

    await expect(getOutstandingExpenses('barn-1', 'America/New_York')).rejects.toThrow('db error')
  })

  it('should_throw_when_the_cost_lookup_errors', async () => {
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-09'), expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment], null, { costsError: new Error('cost error') }) } as any)

    await expect(getOutstandingExpenses('barn-1', 'America/New_York')).rejects.toThrow('cost error')
  })

  it('should_exclude_a_row_a_naive_utc_comparison_would_wrongly_flag_as_past_due', async () => {
    // Entered as 10:00 AM barn-local (EDT, UTC-4) -- that's 2026-07-10T14:00:00Z, still
    // after fake "now" (2026-07-10T12:00:00Z). A naive `...Z` cast would read the digits
    // as 10:00 AM UTC (2026-07-10T10:00:00Z), which is before "now" and would wrongly
    // flag it as already past due.
    const appointment = createMockAppointment({ expense_date: calendarDate('2026-07-10'), expense_time: '10:00:00' })
    vi.mocked(createClient).mockResolvedValue({ from: makeFrom([appointment]) } as any)

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
      if (table === 'appointments') return makeExpensesChain([expense])
      if (table === 'appointment_horses') return makeJunctionChain([{ appointment_id: expense.id, horse_id: 'horse-1' }])
      if (table === 'appointment_costs') return makeCostChain([])
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
