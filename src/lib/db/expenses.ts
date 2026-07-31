/**
 * Appointment CRUD (#1148 — the table behind the manager's "expenses" UI is `appointments`
 * now, with `amount`/`payment_type` on a manager-only `appointment_costs` row): barn/ID
 * reads with resolved horse names and costs, RPC-backed create/update
 * (`create_expense_with_horses`/`update_expense_with_horses`, both syncing the cost row and
 * a matching `expense`-kind `transactions` row, #829) and delete
 * (`delete_expense_with_transactions`), outstanding-expense reads, and the
 * recent-recipient/type lookups feeding the expense form. Reporting reads live in
 * `expense-finances.ts`.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveHorseNames } from './horses'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import type { Appointment, ExpenseInput, ExpenseWithHorses, HorseExpense, PaymentType } from './types'

async function attachHorseNames<T extends { id: string }>(
  supabase: SupabaseClient,
  barnId: string,
  appointments: T[]
): Promise<(T & { horse_ids: string[]; horse_names: string[] })[]> {
  const appointmentIds = appointments.map((a) => a.id)
  const { data: junctionRows, error } = await supabase
    .from('appointment_horses')
    .select('appointment_id, horse_id')
    .eq('barn_id', barnId)
    .in('appointment_id', appointmentIds)
  if (error) throw error

  const rows = junctionRows ?? []
  const horseIds = [...new Set(rows.map((r) => r.horse_id))]
  const horseNameMap = await resolveHorseNames(horseIds, barnId, supabase)

  return appointments.map((appointment) => {
    const ids = rows.filter((r) => r.appointment_id === appointment.id).map((r) => r.horse_id)
    return {
      ...appointment,
      horse_ids: ids,
      horse_names: ids.map((id) => horseNameMap.get(id) ?? id),
    }
  })
}

/**
 * Flattens each appointment's `appointment_costs` row back onto it as `amount`/`payment_type`
 * (#1148), so every consumer of `HorseExpense` keeps reading the two fields where they always
 * were. A separate `.in()` query rather than a PostgREST embed, matching `attachHorseNames`
 * above — the FK is composite (`barn_id, appointment_id`), which is not the shape embeds are
 * reliable on.
 *
 * No role branch, and deliberately so: `appointment_costs` is manager-only RLS while the
 * `authenticated` table grant stays, so a trainer's session gets zero rows back rather than
 * an error, and both fields come out `null` — indistinguishable from a not-yet-priced
 * appointment, which is exactly the shape the trainer-facing UI wants.
 */
async function attachCosts<T extends { id: string }>(
  supabase: SupabaseClient,
  barnId: string,
  appointments: T[]
): Promise<(T & { amount: number | null; payment_type: PaymentType | null })[]> {
  const { data: costRows, error } = await supabase
    .from('appointment_costs')
    .select('appointment_id, amount, payment_type')
    .eq('barn_id', barnId)
    .in('appointment_id', appointments.map((a) => a.id))
  if (error) throw error

  const costByAppointmentId = new Map(
    (costRows ?? []).map((c) => [c.appointment_id as string, c as { amount: number; payment_type: PaymentType | null }])
  )

  return appointments.map((appointment) => {
    const cost = costByAppointmentId.get(appointment.id)
    return {
      ...appointment,
      amount: cost?.amount ?? null,
      payment_type: cost?.payment_type ?? null,
    }
  })
}

async function hydrate<T extends { id: string }>(
  supabase: SupabaseClient,
  barnId: string,
  appointments: T[]
): Promise<ExpenseWithHorses[]> {
  const withHorses = await attachHorseNames(supabase, barnId, appointments)
  return (await attachCosts(supabase, barnId, withHorses)) as unknown as ExpenseWithHorses[]
}

export async function getExpensesByBarn(barnId: string): Promise<ExpenseWithHorses[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('barn_id', barnId)
    .order('expense_date', { ascending: false })
    .order('created_at', { ascending: false })
  if (error) throw error

  const appointments = data ?? []
  if (!appointments.length) return []

  return hydrate(supabase, barnId, appointments)
}

export async function getExpenseById(expenseId: string, barnId: string): Promise<ExpenseWithHorses | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', expenseId)
    .eq('barn_id', barnId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null

  const [result] = await hydrate(supabase, barnId, [data])
  return result
}

export async function createExpense(barnId: string, data: ExpenseInput, client?: SupabaseClient): Promise<Appointment> {
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
    p_occurred_at: data.occurredAt ?? null,
  })
  if (error) throw error
  return expense as Appointment
}

export async function updateExpense(expenseId: string, barnId: string, updates: ExpenseInput, client?: SupabaseClient): Promise<Appointment> {
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
    p_occurred_at: updates.occurredAt ?? null,
  })
  if (error) throw error
  return expense as Appointment
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

// Finances dashboard Outstanding Expenses section: appointments with no cost row
// (still planned) or a cost row missing a payment type (amount known but never marked
// paid), whose due datetime (expense_date + expense_time, or end-of-day when
// time is null) has already passed, in the barn's own local time (timezone —
// barns.timezone). expense_date/expense_time are entered as literal local wall-clock
// digits, not real UTC instants, so comparing them against "now" requires converting
// that real instant into the barn's wall-clock frame first, rather than assuming
// UTC (#955) — same rationale schedule.ts:getScheduleForRange mirrors for its own
// appointment-window bound.
//
// #1148 moved the outstanding predicate itself from the query
// (`.or('amount.is.null,payment_type.is.null')`) into JS: amount and payment_type are no
// longer columns here, and the past-due bound was already evaluated in JS for the reason
// above. This section is manager-only UI, so `attachCosts` always resolves real costs for it.
export async function getOutstandingExpenses(barnId: string, timezone: string, client?: SupabaseClient): Promise<HorseExpense[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('barn_id', barnId)
  if (error) throw error

  const appointments = (data ?? []) as Appointment[]
  if (!appointments.length) return []

  const withCosts = await attachCosts(supabase, barnId, appointments)
  const nowWall = instantToLocalWallClock(new Date(), timezone)

  return withCosts
    .map((expense) => ({
      expense,
      wallClock: `${expense.expense_date}T${expense.expense_time ?? '23:59:59'}`,
    }))
    .filter(({ expense }) => expense.amount === null || expense.payment_type === null)
    .filter(({ wallClock }) => wallClock < nowWall)
    .sort((a, b) => a.wallClock.localeCompare(b.wallClock))
    .map(({ expense }) => expense)
}

// Hydrates a set of getScheduleForRange appointment ids into display data, same idiom as
// getLessonsByIds.
export async function getExpensesByIds(barnId: string, ids: string[]): Promise<ExpenseWithHorses[]> {
  if (!ids.length) return []
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
    .select('*')
    .eq('barn_id', barnId)
    .in('id', ids)
  if (error) throw error

  const appointments = data ?? []
  if (!appointments.length) return []

  return hydrate(supabase, barnId, appointments)
}

export async function getRecentRecipients(barnId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('appointments')
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
    .from('appointments')
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
    .from('appointments')
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
