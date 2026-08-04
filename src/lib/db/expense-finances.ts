// Ledger-backed expense financial reporting (per-horse splits and per-recipient/"By Paid
// To" breakdowns for the Finances page and their drill-downs), reading expense-kind
// transactions rows — split out of expenses.ts, which keeps the appointments record
// CRUD, mirroring the lessons.ts/lesson-finances.ts seam.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHorseNames } from './horses'
import { getTransactionRows, positiveAmount } from './transactions'
import { barnDay } from '@/lib/barn-timezone'
import type { CalendarDate, ExpenseFinancialSummary, HorseExpenseDetailRow, RecipientExpenseSummary, RecipientExpenseDetailRow } from './types'

function applicableHorseIdsForExpense(
  expense: { id: string; expense_date: string; applies_to_all_horses: boolean },
  junctionRows: { appointment_id: string; horse_id: string }[],
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
  return junctionRows.filter((r) => r.appointment_id === expense.id).map((r) => r.horse_id)
}

// A day of padding on each side of the requested month's UTC boundary — more than any
// BARN_TIMEZONES offset (max 10h) — so a barn-local expense whose occurred_at instant
// falls just outside the nominal UTC range still gets fetched; see QUERY_PADDING_MS's
// use below.
const QUERY_PADDING_MS = 24 * 60 * 60 * 1000

// #829/#865: expense-kind transactions rows are the ledger source of truth for
// getExpenseFinancialSummary/getHorseExpenseDetail — only an expense whose amount is
// known has one (see sync_expense_transaction), so this already excludes planned
// expenses without a separate null-amount filter. Reads the base rows via
// transactions.ts:getTransactionRows, then resolves applies_to_all_horses (the one
// extra field it needs) via a small follow-up appointments lookup. `timezone`
// (barns.timezone) decodes each row's occurredAt (a real UTC instant, post-#955) back
// to the calendar date it falls on in the barn's own local time — a naive
// occurredAt.slice(0, 10) would read the wrong day for an entry near a local midnight
// boundary whose UTC digits land on a different date.
//
// startDate/endDate are the requested month's UTC-midnight boundary (from
// resolveFinancesMonth), but a barn-local calendar month doesn't line up with that UTC
// range — a barn west of UTC can have an end-of-month expense whose occurred_at instant
// falls on the UTC day after endDate (missed by a plain range query), or a
// start-of-month expense falling before startDate. Query with QUERY_PADDING_MS of slack
// on each side, then filter down to the actual requested month using each row's own
// decoded expense_date — a wall-clock string comparison, matching the convention already
// used by getOutstandingExpenses, rather than trying to encode
// the barn-local month boundary back into an instant.
async function fetchExpenseTransactionsInRange(
  supabase: SupabaseClient,
  barnId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<{ id: string; expense_date: CalendarDate; amount: number; applies_to_all_horses: boolean; recipient: string | null; expense_type: string | null }[]> {
  const rows = await getTransactionRows(
    barnId,
    ['expense'],
    { startDate: new Date(startDate.getTime() - QUERY_PADDING_MS), endDate: new Date(endDate.getTime() + QUERY_PADDING_MS) },
    supabase
  )
  if (!rows.length) return []

  const expenseIds = [...new Set(rows.map((r) => r.expenseId).filter((id): id is string => id !== null))]
  const detailsByExpenseId = new Map<string, { applies_to_all_horses: boolean; recipient: string; expense_type: string }>()
  if (expenseIds.length) {
    const { data, error } = await supabase
      .from('appointments')
      .select('id, applies_to_all_horses, recipient, expense_type')
      .eq('barn_id', barnId)
      .in('id', expenseIds)
    if (error) throw error
    for (const e of data ?? []) detailsByExpenseId.set(e.id, e)
  }

  // expenseId is null for a transaction whose source appointments row was hard-deleted
  // while deleteExpense's default kept the collected transactions row (expense_id is
  // ON DELETE SET NULL) — kept (not filtered out) so its amount still counts toward
  // totalExpenses, mirroring
  // lesson-finance-queries.ts's orphaned-lessonId precedent. Falls back to the
  // transaction's own id, which never matches a real appointments/appointment_horses row,
  // so it naturally drops out of every per-horse/per-recipient breakdown below instead of
  // corrupting one.
  //
  // startDate/endDate are always exact UTC midnights of the requested month's first day
  // (see resolveFinancesMonth), so their raw digits already are the barn-local month
  // boundary we want — no timezone conversion needed for the boundary itself, only for
  // each row's own expense_date above.
  const monthStartLocal = startDate.toISOString().slice(0, 10)
  const monthEndLocal = endDate.toISOString().slice(0, 10)

  return rows
    .map((row) => {
      const expenseId = row.expenseId ?? row.id
      const details = row.expenseId ? detailsByExpenseId.get(row.expenseId) : undefined
      return {
        id: expenseId,
        expense_date: barnDay(new Date(row.occurredAt), timezone),
        amount: positiveAmount(row.kind, row.amount),
        applies_to_all_horses: details?.applies_to_all_horses ?? false,
        recipient: details?.recipient ?? null,
        expense_type: details?.expense_type ?? null,
      }
    })
    .filter((e) => e.expense_date >= monthStartLocal && e.expense_date < monthEndLocal)
}

async function getExpenseHorseJunctionRows(
  supabase: SupabaseClient,
  barnId: string,
  expenseIds: string[]
): Promise<{ appointment_id: string; horse_id: string }[]> {
  if (!expenseIds.length) return []
  const { data, error } = await supabase
    .from('appointment_horses')
    .select('appointment_id, horse_id')
    .eq('barn_id', barnId)
    .in('appointment_id', expenseIds)
  if (error) throw error
  return data ?? []
}

export async function getExpenseFinancialSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<ExpenseFinancialSummary> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate, timezone)
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
  endDate: Date,
  timezone: string
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

  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate, timezone)
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

// #949: recipient is free text on appointments (no FK/id), so this breakdown groups by
// the raw recipient string itself rather than a resolved entity id, unlike the horse
// breakdown above or the rider/trainer breakdowns in lesson-finances.ts.
export async function getRecipientExpenseSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  timezone: string
): Promise<RecipientExpenseSummary[]> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate, timezone)

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
  endDate: Date,
  timezone: string
): Promise<{ rows: RecipientExpenseDetailRow[]; total: number }> {
  const supabase = await createClient()
  const expenses = await fetchExpenseTransactionsInRange(supabase, barnId, startDate, endDate, timezone)

  // recipient and expense_type are both NOT NULL columns on appointments and are always
  // resolved together from the same lookup row (see fetchExpenseTransactionsInRange's
  // detailsByExpenseId), so a non-null recipient match structurally guarantees a non-null
  // expense_type too — this isn't a coincidental invariant that could drift independently.
  const rows: RecipientExpenseDetailRow[] = expenses
    .filter((e) => e.recipient === recipient)
    .map((e) => ({ expenseId: e.id, expenseDate: e.expense_date, expenseType: e.expense_type as string, amount: e.amount }))

  const total = rows.reduce((sum, r) => sum + r.amount, 0)
  return { rows, total }
}
