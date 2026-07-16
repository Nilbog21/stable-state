// Ledger-backed expense financial reporting (per-horse splits for the Finances page and
// horse drill-down), reading expense-kind transactions rows — split out of expenses.ts,
// which keeps the horse_expenses record CRUD, mirroring the lessons.ts/lesson-finances.ts
// seam.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHorseNames } from './horses'
import { getTransactionRows, positiveAmount } from './transactions'
import type { ExpenseFinancialSummary, HorseExpenseDetailRow, RecipientExpenseSummary, RecipientExpenseDetailRow } from './types'

function applicableHorseIdsForExpense(
  expense: { id: string; expense_date: string; applies_to_all_horses: boolean },
  junctionRows: { expense_id: string; horse_id: string }[],
  barnHorses: { id: string; created_at: string; deactivated_at: string | null }[]
): string[] {
  if (expense.applies_to_all_horses) {
    // expense_date is a DATE; compare against midnight UTC of that date to mirror
    // Postgres's implicit date->timestamptz cast (a horse created later the same day doesn't qualify)
    const cutoff = new Date(`${expense.expense_date}T00:00:00.000Z`).getTime()
    return barnHorses
      .filter((h) => new Date(h.created_at).getTime() <= cutoff && (h.deactivated_at === null || new Date(h.deactivated_at).getTime() > cutoff))
      .map((h) => h.id)
  }
  return junctionRows.filter((r) => r.expense_id === expense.id).map((r) => r.horse_id)
}

// #829/#865: expense-kind transactions rows are the ledger source of truth for
// getExpenseFinancialSummary/getHorseExpenseDetail — only an expense whose amount is
// known has one (see sync_expense_transaction), so this already excludes planned
// expenses without a separate null-amount filter. Reads the base rows via
// transactions.ts:getTransactionRows, then resolves applies_to_all_horses (the one
// extra field it needs) via a small follow-up horse_expenses lookup.
async function fetchExpenseTransactionsInRange(
  supabase: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<{ id: string; expense_date: string; amount: number; applies_to_all_horses: boolean; recipient: string | null; expense_type: string | null }[]> {
  const rows = await getTransactionRows(barnId, ['expense'], { startDate, endDate }, supabase)
  if (!rows.length) return []

  const expenseIds = [...new Set(rows.map((r) => r.expenseId).filter((id): id is string => id !== null))]
  const detailsByExpenseId = new Map<string, { applies_to_all_horses: boolean; recipient: string; expense_type: string }>()
  if (expenseIds.length) {
    const { data, error } = await supabase
      .from('horse_expenses')
      .select('id, applies_to_all_horses, recipient, expense_type')
      .eq('barn_id', barnId)
      .in('id', expenseIds)
    if (error) throw error
    for (const e of data ?? []) detailsByExpenseId.set(e.id, e)
  }

  // expenseId is null for a transaction whose source horse_expenses row was hard-deleted
  // while deleteExpense's default kept the collected transactions row (expense_id is
  // ON DELETE SET NULL) — kept (not filtered out) so its amount still counts toward
  // totalExpenses, mirroring
  // lesson-finance-queries.ts's orphaned-lessonId precedent. Falls back to the
  // transaction's own id, which never matches a real horse_expenses/expense_horses row,
  // so it naturally drops out of every per-horse/per-recipient breakdown below instead of
  // corrupting one.
  return rows.map((row) => {
    const expenseId = row.expenseId ?? row.id
    const details = row.expenseId ? detailsByExpenseId.get(row.expenseId) : undefined
    return {
      id: expenseId,
      expense_date: row.occurredAt.slice(0, 10),
      amount: positiveAmount(row.kind, row.amount),
      applies_to_all_horses: details?.applies_to_all_horses ?? false,
      recipient: details?.recipient ?? null,
      expense_type: details?.expense_type ?? null,
    }
  })
}

async function getExpenseHorseJunctionRows(
  supabase: SupabaseClient,
  barnId: string,
  expenseIds: string[]
): Promise<{ expense_id: string; horse_id: string }[]> {
  if (!expenseIds.length) return []
  const { data, error } = await supabase
    .from('expense_horses')
    .select('expense_id, horse_id')
    .eq('barn_id', barnId)
    .in('expense_id', expenseIds)
  if (error) throw error
  return data ?? []
}

export async function getExpenseFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<ExpenseFinancialSummary> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate)
  if (!expenses.length) return { totalExpenses: 0, breakdown: [] }

  const { data: barnHorses, error: horsesError } = await supabase
    .from('horses')
    .select('id, created_at, deactivated_at')
    .eq('barn_id', barnId)
  if (horsesError) throw horsesError

  const nonBarnWideIds = expenses.filter((e) => !e.applies_to_all_horses).map((e) => e.id)
  const junctionRows = await getExpenseHorseJunctionRows(supabase, barnId, nonBarnWideIds)

  let totalExpenses = 0
  const breakdownMap = new Map<string, number>()

  for (const expense of expenses) {
    totalExpenses += expense.amount
    const applicableIds = applicableHorseIdsForExpense(expense, junctionRows, barnHorses ?? [])
    if (!applicableIds.length) continue
    const split = expense.amount / applicableIds.length
    for (const horseId of applicableIds) {
      breakdownMap.set(horseId, (breakdownMap.get(horseId) ?? 0) + split)
    }
  }

  const horseNameMap = await resolveHorseNames([...breakdownMap.keys()], barnId, supabase)

  const breakdown = Array.from(breakdownMap.entries())
    .map(([horseId, horseTotal]) => ({
      horseId,
      horseName: horseNameMap.get(horseId) ?? horseId,
      totalExpenses: horseTotal,
    }))
    .sort((a, b) => b.totalExpenses - a.totalExpenses)

  return { totalExpenses, breakdown }
}

export async function getHorseExpenseDetail(
  barnId: string,
  horseId: string,
  startDate: Date,
  endDate: Date
): Promise<{ horseName: string; rows: HorseExpenseDetailRow[]; total: number }> {
  const supabase = await createClient()

  const { data: horse, error: horseError } = await supabase
    .from('horses')
    .select('id, name, created_at, deactivated_at')
    .eq('id', horseId)
    .eq('barn_id', barnId)
    .maybeSingle()
  if (horseError) throw horseError
  if (!horse) return { horseName: horseId, rows: [], total: 0 }

  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate)
  if (!expenses.length) return { horseName: horse.name, rows: [], total: 0 }

  const { data: barnHorses, error: barnHorsesError } = await supabase
    .from('horses')
    .select('id, created_at, deactivated_at')
    .eq('barn_id', barnId)
  if (barnHorsesError) throw barnHorsesError

  const nonBarnWideIds = expenses.filter((e) => !e.applies_to_all_horses).map((e) => e.id)
  const junctionRows = await getExpenseHorseJunctionRows(supabase, barnId, nonBarnWideIds)

  const rows: HorseExpenseDetailRow[] = []
  for (const expense of expenses) {
    const applicableIds = applicableHorseIdsForExpense(expense, junctionRows, barnHorses ?? [])
    const horseCount = applicableIds.length
    if (!horseCount || !applicableIds.includes(horseId)) continue
    rows.push({
      expenseId: expense.id,
      expenseDate: expense.expense_date,
      amount: expense.amount,
      horseCount,
      splitAmount: expense.amount / horseCount,
    })
  }

  const total = rows.reduce((sum, r) => sum + r.splitAmount, 0)
  return { horseName: horse.name, rows, total }
}

// #949: recipient is free text on horse_expenses (no FK/id), so this breakdown groups by
// the raw recipient string itself rather than a resolved entity id, unlike the horse/rider/
// trainer breakdowns above.
export async function getRecipientExpenseSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<RecipientExpenseSummary[]> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate)

  const breakdownMap = new Map<string, number>()
  for (const expense of expenses) {
    if (!expense.recipient) continue
    breakdownMap.set(expense.recipient, (breakdownMap.get(expense.recipient) ?? 0) + expense.amount)
  }

  return Array.from(breakdownMap.entries())
    .map(([recipient, totalExpenses]) => ({ recipient, totalExpenses }))
    .sort((a, b) => b.totalExpenses - a.totalExpenses)
}

export async function getRecipientExpenseDetail(
  barnId: string,
  recipient: string,
  startDate: Date,
  endDate: Date
): Promise<{ rows: RecipientExpenseDetailRow[]; total: number }> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate)

  // recipient and expense_type are resolved together from the same horse_expenses lookup
  // row (see fetchExpenseTransactionsInRange), so a non-null recipient match guarantees a
  // non-null expense_type too.
  const rows: RecipientExpenseDetailRow[] = expenses
    .filter((e) => e.recipient === recipient)
    .map((e) => ({ expenseId: e.id, expenseDate: e.expense_date, expenseType: e.expense_type as string, amount: e.amount }))

  const total = rows.reduce((sum, r) => sum + r.amount, 0)
  return { rows, total }
}
