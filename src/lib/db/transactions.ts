import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PaymentType, TransactionKind } from './types'

/**
 * Single typed reader for the `transactions` ledger (#826), replacing the
 * hand-rolled FK-embed queries `agreements.ts`/`expenses.ts`/`lesson-finance-queries.ts`
 * each used to write independently. No embeds here — a caller needing one extra
 * joined field (e.g. tier_name, agreement_id, applies_to_all_horses) resolves it
 * via its own small follow-up `.in('id', ids)` lookup, same idiom as
 * resolveMemberNames/resolveHorseNames/getTierPricesByNames elsewhere in this DAL.
 */

export interface TransactionRow {
  id: string
  kind: TransactionKind
  amount: number
  collected: boolean
  paymentType: PaymentType | null
  membershipId: string | null
  horseId: string | null
  lessonId: string | null
  lessonRiderId: string | null
  agreementChargeId: string | null
  expenseId: string | null
  occurredAt: string
}

export interface GetTransactionRowsOptions {
  startDate?: Date
  endDate?: Date
  collected?: boolean
}

/** kinds whose `amount` is stored negative (an outflow) in the signed ledger */
const NEGATIVE_AMOUNT_KINDS: ReadonlySet<TransactionKind> = new Set(['instructor_payout', 'expense'])

export function positiveAmount(kind: TransactionKind, amount: number): number {
  return NEGATIVE_AMOUNT_KINDS.has(kind) ? -amount : amount
}

type RawRow = {
  id: string
  kind: TransactionKind
  amount: number
  collected: boolean
  payment_type: PaymentType | null
  membership_id: string | null
  horse_id: string | null
  lesson_id: string | null
  lesson_rider_id: string | null
  agreement_charge_id: string | null
  expense_id: string | null
  occurred_at: string
}

export async function getTransactionRows(
  barnId: string,
  kinds: readonly TransactionKind[],
  options?: GetTransactionRowsOptions,
  client?: SupabaseClient
): Promise<TransactionRow[]> {
  const supabase = client ?? await createClient()
  let query = supabase
    .from('transactions')
    .select(
      'id, kind, amount, collected, payment_type, membership_id, horse_id, lesson_id, lesson_rider_id, agreement_charge_id, expense_id, occurred_at'
    )
    .eq('barn_id', barnId)
    .in('kind', kinds)

  if (options?.collected !== undefined) query = query.eq('collected', options.collected)
  if (options?.startDate) query = query.gte('occurred_at', options.startDate.toISOString())
  if (options?.endDate) query = query.lt('occurred_at', options.endDate.toISOString())

  const { data, error } = await query
  if (error) throw error

  return ((data ?? []) as unknown as RawRow[]).map((row) => ({
    id: row.id,
    kind: row.kind,
    amount: row.amount,
    collected: row.collected,
    paymentType: row.payment_type,
    membershipId: row.membership_id,
    horseId: row.horse_id,
    lessonId: row.lesson_id,
    lessonRiderId: row.lesson_rider_id,
    agreementChargeId: row.agreement_charge_id,
    expenseId: row.expense_id,
    occurredAt: row.occurred_at,
  }))
}

/**
 * Relay for Outstanding (#831): transactions SELECT is manager-only RLS, so a
 * trainer/rider-facing unpaid check needs the get_outstanding_transactions
 * SECURITY DEFINER RPC instead of a direct table read. Callers already resolve
 * their candidate lesson/charge/lesson_rider IDs via plain RLS-scoped queries
 * (lessons/agreement_charges/lesson_riders) — this just relays collected/
 * payment_type/amount for exactly those IDs, re-checked per row server-side.
 */
export interface OutstandingTransactionRow {
  kind: TransactionKind
  entityId: string
  amount: number
  collected: boolean
  paymentType: PaymentType | null
}

export interface OutstandingTransactionFilters {
  lessonIds?: string[]
  chargeIds?: string[]
  lessonRiderIds?: string[]
}

type RawOutstandingRow = {
  kind: TransactionKind
  entity_id: string
  amount: number
  collected: boolean
  payment_type: PaymentType | null
}

export async function getOutstandingTransactionRows(
  barnId: string,
  filters: OutstandingTransactionFilters,
  client?: SupabaseClient
): Promise<OutstandingTransactionRow[]> {
  const lessonIds = filters.lessonIds ?? []
  const chargeIds = filters.chargeIds ?? []
  const lessonRiderIds = filters.lessonRiderIds ?? []
  if (!lessonIds.length && !chargeIds.length && !lessonRiderIds.length) return []

  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('get_outstanding_transactions', {
    p_barn_id: barnId,
    p_lesson_ids: lessonIds,
    p_charge_ids: chargeIds,
    p_lesson_rider_ids: lessonRiderIds,
  })
  if (error) throw error

  return ((data ?? []) as RawOutstandingRow[]).map((row) => ({
    kind: row.kind,
    entityId: row.entity_id,
    amount: row.amount,
    collected: row.collected,
    paymentType: row.payment_type,
  }))
}
