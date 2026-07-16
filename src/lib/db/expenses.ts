import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHorseNames } from './horses'
import type { ExpenseInput, ExpenseWithHorses, HorseExpense, ScheduledExpense } from './types'

async function attachHorseNames<T extends { id: string }>(
  supabase: SupabaseClient,
  barnId: string,
  expenses: T[]
): Promise<(T & { horse_ids: string[]; horse_names: string[] })[]> {
  const expenseIds = expenses.map((e) => e.id)
  const { data: junctionRows, error } = await supabase
    .from('expense_horses')
    .select('expense_id, horse_id')
    .eq('barn_id', barnId)
    .in('expense_id', expenseIds)
  if (error) throw error

  const rows = junctionRows ?? []
  const horseIds = [...new Set(rows.map((r) => r.horse_id))]
  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

  return expenses.map((expense) => {
    const ids = rows.filter((r) => r.expense_id === expense.id).map((r) => r.horse_id)
    return {
      ...expense,
      horse_ids: ids,
      horse_names: ids.map((id) => horseNameMap.get(id) ?? id),
    }
  })
}

export async function getExpensesByBarn(barnId: string): Promise<ExpenseWithHorses[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('*')
    .eq('barn_id', barnId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  const expenses = data ?? []
  if (!expenses.length) return []

  return attachHorseNames(supabase, barnId, expenses)
}

export async function getExpenseById(expenseId: string, barnId: string): Promise<ExpenseWithHorses | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('*')
    .eq('id', expenseId)
    .eq('barn_id', barnId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const [result] = await attachHorseNames(supabase, barnId, [data])
  return result
}

export async function createExpense(barnId: string, data: ExpenseInput, client?: SupabaseClient): Promise<HorseExpense> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data: expense, error } = await supabase.rpc('create_expense_with_horses', {
    p_barn_id: barnId,
    p_expense_date: data.expenseDate,
    p_recipient: data.recipient,
    p_applies_to_all_horses: data.appliesToAllHorses,
    p_expense_time: data.expenseTime ?? null,
    p_amount: data.amount ?? null,
    p_expense_type: data.expenseType ?? 'Unspecified',
    p_notes: data.notes ?? null,
    p_horse_ids: data.horseIds ?? null,
    p_payment_type: data.paymentType ?? null,
  })
  if (error) throw error
  return expense as HorseExpense
}

export async function updateExpense(expenseId: string, barnId: string, updates: ExpenseInput, client?: SupabaseClient): Promise<HorseExpense> {
  const supabase = client ?? await createClient()
  const { data: expense, error } = await supabase.rpc('update_expense_with_horses', {
    p_expense_id: expenseId,
    p_barn_id: barnId,
    p_expense_date: updates.expenseDate,
    p_recipient: updates.recipient,
    p_applies_to_all_horses: updates.appliesToAllHorses,
    p_expense_time: updates.expenseTime ?? null,
    p_amount: updates.amount ?? null,
    p_expense_type: updates.expenseType ?? 'Unspecified',
    p_notes: updates.notes ?? null,
    p_horse_ids: updates.horseIds ?? null,
    p_payment_type: updates.paymentType ?? null,
  })
  if (error) throw error
  return expense as HorseExpense
}

export async function deleteExpense(
  expenseId: string,
  barnId: string,
  deleteCollectedTransactions = false,
  client?: SupabaseClient
): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase.rpc('delete_expense_with_transactions', {
    p_expense_id: expenseId,
    p_barn_id: barnId,
    p_delete_collected: deleteCollectedTransactions,
  })
  if (error) throw error
}

// Barn Schedule dashboard widget: planned expenses (amount IS NULL) due within the
// window. A null expense_time is excluded — a date-only expense is treated as a
// completed/spontaneous entry, not something on the schedule. Horse names are resolved
// for display, mirroring getExpensesByBarn.
export async function getUpcomingScheduledExpenses(barnId: string, from: string, to: string): Promise<ScheduledExpense[]> {
  const supabase = await createClient()
  const fromDate = from.slice(0, 10)
  const toDate = to.slice(0, 10)

  const { data, error } = await supabase
    .from('horse_expenses')
    .select('*')
    .eq('barn_id', barnId)
    .is('amount', null)
    .not('expense_time', 'is', null)
    .gte('expense_date', fromDate)
    .lte('expense_date', toDate)
  if (error) throw error

  const fromTime = new Date(from).getTime()
  const toTime = new Date(to).getTime()

  const expenses = ((data ?? []) as ScheduledExpense[])
    .filter((expense) => expense.expense_time !== null)
    .map((expense) => ({
      expense,
      combined: new Date(`${expense.expense_date}T${expense.expense_time}Z`).getTime(),
    }))
    .filter(({ combined }) => combined >= fromTime && combined < toTime)
    .sort((a, b) => a.combined - b.combined || a.expense.created_at.localeCompare(b.expense.created_at))
    .map(({ expense }) => expense)

  if (!expenses.length) return []

  return await attachHorseNames(supabase, barnId, expenses)
}

// Finances dashboard Outstanding section: planned expenses (amount IS NULL) whose
// due datetime (expense_date + expense_time, or end-of-day when time is null) has
// already passed.
export async function getPastDueExpenses(barnId: string, client?: SupabaseClient): Promise<HorseExpense[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('*')
    .eq('barn_id', barnId)
    .is('amount', null)
  if (error) throw error

  const now = Date.now()

  return ((data ?? []) as HorseExpense[])
    .map((expense) => ({
      expense,
      combined: new Date(`${expense.expense_date}T${expense.expense_time ?? '23:59:59.999'}Z`).getTime(),
    }))
    .filter(({ combined }) => combined < now)
    .sort((a, b) => a.combined - b.combined)
    .map(({ expense }) => expense)
}

export async function getRecentRecipients(barnId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('recipient, expense_date')
    .eq('barn_id', barnId)
  if (error) throw error

  const rows = data ?? []
  if (!rows.length) return []

  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const cutoff = sixMonthsAgo.toISOString().slice(0, 10)

  const recentCount = new Map<string, number>()
  const totalCount = new Map<string, number>()
  for (const row of rows) {
    totalCount.set(row.recipient, (totalCount.get(row.recipient) ?? 0) + 1)
    if (row.expense_date >= cutoff) {
      recentCount.set(row.recipient, (recentCount.get(row.recipient) ?? 0) + 1)
    }
  }

  return [...totalCount.keys()].sort((a, b) => {
    const recentDiff = (recentCount.get(b) ?? 0) - (recentCount.get(a) ?? 0)
    if (recentDiff !== 0) return recentDiff
    // every key here comes from totalCount.keys(), so both lookups are always defined
    const totalDiff = totalCount.get(b)! - totalCount.get(a)!
    if (totalDiff !== 0) return totalDiff
    return a.localeCompare(b)
  })
}

export async function getRecentExpenseTypes(barnId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('expense_type')
    .eq('barn_id', barnId)
  if (error) throw error

  const rows = data ?? []
  if (!rows.length) return []

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.expense_type, (counts.get(row.expense_type) ?? 0) + 1)
  }

  return [...counts.keys()].sort((a, b) => {
    // every key here comes from counts.keys(), so both lookups are always defined
    const diff = counts.get(b)! - counts.get(a)!
    if (diff !== 0) return diff
    return a.localeCompare(b)
  })
}

export async function getMostCommonTypeForRecipient(barnId: string, recipient: string): Promise<string | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('expense_type')
    .eq('barn_id', barnId)
    .eq('recipient', recipient)
    .order('expense_date', { ascending: true })
  if (error) throw error

  const rows = data ?? []
  if (!rows.length) return null

  const counts = new Map<string, number>()
  for (const row of rows) {
    counts.set(row.expense_type, (counts.get(row.expense_type) ?? 0) + 1)
  }

  let best: string | null = null
  let bestCount = 0
  for (const row of rows) {
    // row.expense_type was just used to populate counts above, so this is always defined
    const count = counts.get(row.expense_type)!
    if (count > bestCount) {
      bestCount = count
      best = row.expense_type
    }
  }
  return best
}
