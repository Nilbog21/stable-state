import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHorseNames } from './horses'
import type { ExpenseFinancialSummary, ExpenseInput, ExpenseWithHorses, HorseExpense, HorseExpenseDetailRow, ScheduledExpense } from './types'

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

  const expenseIds = expenses.map((e) => e.id)
  const { data: junctionRows, error: jError } = await supabase
    .from('expense_horses')
    .select('expense_id, horse_id')
    .eq('barn_id', barnId)
    .in('expense_id', expenseIds)
  if (jError) throw jError

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

  const { data: junctionRows, error: jError } = await supabase
    .from('expense_horses')
    .select('expense_id, horse_id')
    .eq('barn_id', barnId)
    .eq('expense_id', expenseId)
  if (jError) throw jError

  const horseIds = (junctionRows ?? []).map((r) => r.horse_id)
  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

  return {
    ...data,
    horse_ids: horseIds,
    horse_names: horseIds.map((id) => horseNameMap.get(id) ?? id),
  }
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
  })
  if (error) throw error
  return expense as HorseExpense
}

export async function deleteExpense(expenseId: string, barnId: string, client?: SupabaseClient): Promise<void> {
  const supabase = client ?? await createClient()
  const { error } = await supabase
    .from('horse_expenses')
    .delete()
    .eq('id', expenseId)
    .eq('barn_id', barnId)
  if (error) throw error
}

export async function getUpcomingExpenses(barnId: string, from: string, to: string): Promise<HorseExpense[]> {
  const supabase = await createClient()
  const fromDate = from.slice(0, 10)
  const toDate = to.slice(0, 10)

  const { data, error } = await supabase
    .from('horse_expenses')
    .select('*')
    .eq('barn_id', barnId)
    .is('amount', null)
    .gte('expense_date', fromDate)
    .lte('expense_date', toDate)
  if (error) throw error

  const fromTime = new Date(from).getTime()
  const toTime = new Date(to).getTime()

  return (data ?? [])
    .map((expense) => ({
      expense,
      // no explicit time means "sometime that day" — treat as due by end of day, not midnight,
      // so a date-only planned expense stays upcoming for its whole due day
      combined: new Date(`${expense.expense_date}T${expense.expense_time ?? '23:59:59.999'}Z`).getTime(),
    }))
    .filter(({ combined }) => combined >= fromTime && combined < toTime)
    .sort((a, b) => a.combined - b.combined)
    .map(({ expense }) => expense)
}

// Barn Schedule dashboard widget: unlike getUpcomingExpenses, a null expense_time is
// excluded rather than defaulted to end-of-day — a date-only expense is treated as a
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
    .map((expense) => ({
      expense,
      combined: new Date(`${expense.expense_date}T${expense.expense_time}Z`).getTime(),
    }))
    .filter(({ combined }) => combined >= fromTime && combined < toTime)
    .sort((a, b) => a.combined - b.combined)
    .map(({ expense }) => expense)

  if (!expenses.length) return []

  const expenseIds = expenses.map((e) => e.id)
  const { data: junctionRows, error: jError } = await supabase
    .from('expense_horses')
    .select('expense_id, horse_id')
    .eq('barn_id', barnId)
    .in('expense_id', expenseIds)
  if (jError) throw jError

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

export async function getExpenseFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date
): Promise<ExpenseFinancialSummary> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('horse_expenses')
    .select('id, expense_date, amount, applies_to_all_horses')
    .eq('barn_id', barnId)
    .gte('expense_date', startDate.toISOString().slice(0, 10))
    .lt('expense_date', endDate.toISOString().slice(0, 10))
  if (error) throw error

  const expenses = (data ?? []).filter(
    (e): e is { id: string; expense_date: string; amount: number; applies_to_all_horses: boolean } => e.amount !== null
  )
  if (!expenses.length) return { totalExpenses: 0, breakdown: [] }

  const { data: barnHorses, error: horsesError } = await supabase
    .from('horses')
    .select('id, created_at, deactivated_at')
    .eq('barn_id', barnId)
  if (horsesError) throw horsesError

  const nonBarnWideIds = expenses.filter((e) => !e.applies_to_all_horses).map((e) => e.id)
  let junctionRows: { expense_id: string; horse_id: string }[] = []
  if (nonBarnWideIds.length) {
    const { data: jData, error: jError } = await supabase
      .from('expense_horses')
      .select('expense_id, horse_id')
      .eq('barn_id', barnId)
      .in('expense_id', nonBarnWideIds)
    if (jError) throw jError
    junctionRows = jData ?? []
  }

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

  const { data: expensesData, error: expensesError } = await supabase
    .from('horse_expenses')
    .select('id, expense_date, amount, applies_to_all_horses')
    .eq('barn_id', barnId)
    .gte('expense_date', startDate.toISOString().slice(0, 10))
    .lt('expense_date', endDate.toISOString().slice(0, 10))
  if (expensesError) throw expensesError

  const expenses = (expensesData ?? []).filter(
    (e): e is { id: string; expense_date: string; amount: number; applies_to_all_horses: boolean } => e.amount !== null
  )
  if (!expenses.length) return { horseName: horse.name, rows: [], total: 0 }

  const { data: barnHorses, error: barnHorsesError } = await supabase
    .from('horses')
    .select('id, created_at, deactivated_at')
    .eq('barn_id', barnId)
  if (barnHorsesError) throw barnHorsesError

  const nonBarnWideIds = expenses.filter((e) => !e.applies_to_all_horses).map((e) => e.id)
  let junctionRows: { expense_id: string; horse_id: string }[] = []
  if (nonBarnWideIds.length) {
    const { data: jData, error: jError } = await supabase
      .from('expense_horses')
      .select('expense_id, horse_id')
      .eq('barn_id', barnId)
      .in('expense_id', nonBarnWideIds)
    if (jError) throw jError
    junctionRows = jData ?? []
  }

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
