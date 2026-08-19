import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createMockHorseExpense } from '@/test/fixtures'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

import { createClient } from '@/lib/supabase/server'
import {
  createExpense,
  updateExpense,
  deleteExpense,
} from '../expenses'
import { calendarDate } from '@/lib/local-day'

describe('createExpense', () => {
  beforeEach(() => {
    vi.mocked(createClient).mockReset()
  })

  it('should_call_rpc_with_provided_fields', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', {
      expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false,
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

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_type).toBe('Unspecified')
  })

  it('should_default_expense_time_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_time).toBeNull()
  })

  it('should_default_amount_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_amount).toBeNull()
  })

  it('should_default_notes_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_notes).toBeNull()
  })

  it('should_default_horse_ids_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: true })

    expect(mockRpc.mock.calls[0][1].p_horse_ids).toBeNull()
  })

  it('should_return_rpc_data', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await createExpense(
      'barn-1',
      { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false },
      mockClient
    )

    expect(result).toEqual(expense)
  })

  it('should_forward_payment_type_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false, paymentType: 'venmo' })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBe('venmo')
  })

  it('should_default_payment_type_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBeNull()
  })

  it('should_forward_occurred_at_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', {
      expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false,
      occurredAt: '2026-07-01T18:00:00.000Z',
    })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBe('2026-07-01T18:00:00.000Z')
  })

  it('should_default_occurred_at_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await createExpense('barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

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
      expenseDate: calendarDate('2026-07-01'), recipient: 'New Vet', appliesToAllHorses: false,
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

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_type).toBe('Unspecified')
  })

  it('should_default_expense_time_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_expense_time).toBeNull()
  })

  it('should_default_amount_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_amount).toBeNull()
  })

  it('should_default_notes_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_notes).toBeNull()
  })

  it('should_default_horse_ids_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense({ applies_to_all_horses: true })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: true })

    expect(mockRpc.mock.calls[0][1].p_horse_ids).toBeNull()
  })

  it('should_return_rpc_data', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    const result = await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'New Vet', appliesToAllHorses: false })

    expect(result).toEqual(expense)
  })

  it('should_throw_when_rpc_returns_error', async () => {
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: new Error('rpc failed') })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await expect(
      updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })
    ).rejects.toThrow('rpc failed')
  })

  it('should_use_injected_client_when_provided', async () => {
    const expense = createMockHorseExpense({ recipient: 'New Vet' })
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    const mockClient = { rpc: mockRpc } as any

    const result = await updateExpense(
      'expense-1',
      'barn-1',
      { expenseDate: calendarDate('2026-07-01'), recipient: 'New Vet', appliesToAllHorses: false },
      mockClient
    )

    expect(result).toEqual(expense)
  })

  it('should_forward_payment_type_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false, paymentType: 'cash' })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBe('cash')
  })

  it('should_default_payment_type_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

    expect(mockRpc.mock.calls[0][1].p_payment_type).toBeNull()
  })

  it('should_forward_occurred_at_to_rpc', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', {
      expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false,
      occurredAt: '2026-07-01T18:00:00.000Z',
    })

    expect(mockRpc.mock.calls[0][1].p_occurred_at).toBe('2026-07-01T18:00:00.000Z')
  })

  it('should_default_occurred_at_to_null_when_omitted', async () => {
    const expense = createMockHorseExpense()
    const mockRpc = vi.fn().mockResolvedValue({ data: expense, error: null })
    vi.mocked(createClient).mockResolvedValue({ rpc: mockRpc } as any)

    await updateExpense('expense-1', 'barn-1', { expenseDate: calendarDate('2026-07-01'), recipient: 'Dr. Smith', appliesToAllHorses: false })

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

