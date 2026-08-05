// Ledger-backed agreement-charge financial reporting: income fold-ins for
// lesson-finances.ts and the Outstanding collections read. Reads lease_charge/board_charge
// transactions rows. Split out of agreements.ts, which keeps the agreement/charge record
// CRUD — completes the lessons.ts/lesson-finances.ts and expenses.ts/expense-finances.ts
// CRUD-vs-finances seam for the third revenue domain.

import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { getTransactionRows, getOutstandingTransactionRows } from './transactions'
import { calendarDate, firstOfMonth } from '../local-day'
import { barnToday } from '../barn-timezone'
import type { AgreementKind, CalendarDate, OutstandingCharge, PaymentType, Role, TransactionKind } from './types'

export interface ChargeSummaryRow {
  period: CalendarDate
  fee: number
  payment_type: PaymentType | null
}

export const CHARGE_TRANSACTION_KINDS: TransactionKind[] = ['lease_charge', 'board_charge']

export async function getChargesForSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<ChargeSummaryRow[]> {
  const rows = await getTransactionRows(barnId, CHARGE_TRANSACTION_KINDS, { startDate, endDate }, client)
  return rows.map((row) => ({
    // #1309: this slice is correct and must stay — do NOT reach for `barnDay(...)` here.
    // A charge transaction's `occurred_at` is not a real instant: `create_agreement_with_first_charge`
    // and `generate_agreement_charge` insert it as `v_period::timestamptz`, where `v_period` is
    // `date_trunc('month', …)::date`. It is the `period` DATE laundered through a cast, landing at
    // exact UTC midnight on the 1st, so slicing the UTC date back out recovers exactly the DATE
    // that went in. Decoding it into the barn's zone — every one of which is behind UTC — would
    // shift every charge to the last day of the *previous* month, for every barn, always.
    // (Same reason `transactions.ts:getTransactionRows`'s `.gte`/`.lt` window needs no padding
    // here, unlike `expense-finances.ts`, where `occurred_at` genuinely is a real instant.)
    // Unlike getPaidCharges below, this reader has no `agreement_charges` round-trip to read the
    // real column from, and adding one for a barn-wide summary fold isn't worth the query.
    period: calendarDate(row.occurredAt.slice(0, 10)),
    fee: row.amount,
    payment_type: row.paymentType,
  }))
}

export interface PaidCharge {
  chargeId: string
  agreementId: string
  period: CalendarDate
  fee: number
  kind: AgreementKind
  riderId: string | null
  horseId: string | null
}

export async function getPaidCharges(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PaidCharge[]> {
  const supabase = client ?? await createClient()
  const rows = await getTransactionRows(
    barnId, CHARGE_TRANSACTION_KINDS, { startDate, endDate, collected: true }, supabase
  )
  if (!rows.length) return []

  const chargeIds = [...new Set(rows.map((r) => r.agreementChargeId).filter((id): id is string => id !== null))]
  // #1309: `period` is read off the column rather than re-derived from the transaction's
  // `occurred_at`. The round-trip below already exists for `agreement_id`, so this costs
  // nothing — and it removes the trap that produced #1309, where the `occurred_at.slice(0, 10)`
  // idiom read as a real-instant decode that a later reader would "fix" into `barnDay(...)`.
  const chargeById = new Map<string, { agreementId: string; period: CalendarDate }>()
  if (chargeIds.length) {
    const { data: chargeRows, error } = await supabase
      .from('agreement_charges')
      .select('id, agreement_id, period')
      .eq('barn_id', barnId)
      .in('id', chargeIds)
    if (error) throw error
    for (const c of chargeRows ?? []) {
      chargeById.set(c.id, { agreementId: c.agreement_id, period: calendarDate(c.period) })
    }
  }

  // agreementChargeId/membershipId/horseId are nullable via ON DELETE SET NULL — no
  // code path currently hard-deletes an agreement_charges row, but a rider's
  // membership can be removed after their charge is collected, so riderId/horseId
  // fall back to null rather than an unchecked cast (mirrors getLessonFeeRows'
  // orphaned-lessonId handling); callers apply their own NO_HORSE_LABEL/NO_RIDER_LABEL.
  return rows.map((row) => {
    const chargeId = row.agreementChargeId ?? row.id
    const charge = row.agreementChargeId ? chargeById.get(row.agreementChargeId) : undefined
    return {
      chargeId,
      agreementId: charge?.agreementId ?? chargeId,
      // Falls back to the transaction's own date when the charge row is gone — same
      // defensive case the chargeId/agreementId fallbacks above cover, and correct for
      // the reason getChargesForSummary's identical slice is correct (see its comment).
      period: charge?.period ?? calendarDate(row.occurredAt.slice(0, 10)),
      fee: row.amount,
      kind: row.kind === 'lease_charge' ? 'lease' : 'board',
      riderId: row.membershipId,
      horseId: row.horseId,
    }
  })
}

// `timezone` sits second rather than last because the three arguments after it are optional;
// same placement as expenses.ts:getOutstandingExpenses, the other outstanding read that needs
// the barn's own zone.
export async function getOutstandingCharges(
  barnId: string,
  timezone: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingCharge[]> {
  if (role === 'trainer') return []

  const supabase = client ?? await createClient()
  // #1309: the barn's own month, not the server host's. `agreement_charges.period` is a
  // zoneless calendar date naming a billing month — it carries no zone of its own, so it is
  // whoever asks "is that month still current?" who has to supply one, and that question is
  // about the barn's day. Every zone in BARN_TIMEZONES is behind UTC, so answering it on the
  // host's clock rolled the boundary over 4-10 hours early and briefly showed the
  // still-current month's charges as overdue.
  const firstOfCurrentMonth = firstOfMonth(barnToday(timezone))

  let riderAgreementIds: string[] | undefined
  if (role === 'rider' && userId) {
    const { data: rider, error: riderError } = await supabase
      .from('barn_memberships')
      .select('id')
      .eq('barn_id', barnId)
      .eq('user_id', userId)
      .eq('role', 'rider')
      .eq('status', 'active')
      .maybeSingle()
    if (riderError) throw riderError
    if (!rider) return []

    const { data: riderAgreements, error: riderAgreementsError } = await supabase
      .from('agreements')
      .select('id')
      .eq('barn_id', barnId)
      .eq('rider_id', rider.id)
    if (riderAgreementsError) throw riderAgreementsError
    riderAgreementIds = (riderAgreements ?? []).map((a) => a.id)
    if (!riderAgreementIds.length) return []
  }

  // FK-hint embed pinned to the exact composite constraint (not an unqualified
  // `agreements!inner`) — #665 verified against live dev schema that pinning avoids a
  // PGRST200/PGRST201 "relationship not found"/"more than one relationship" error;
  // getPaidCharges above no longer uses an embed at all (#865, replaced with a follow-up
  // `.in('id', ids)` lookup), but this one only needs kind/rider_id, both cheap to embed
  // alongside the candidate fetch, so it stays as-is.
  let query = supabase
    .from('agreement_charges')
    .select('id, agreement_id, period, fee, agreements!agreement_charges_barn_id_agreement_id_fkey!inner(kind, rider_id)')
    .eq('barn_id', barnId)
    .lt('period', firstOfCurrentMonth)

  if (riderAgreementIds) {
    query = query.in('agreement_id', riderAgreementIds)
  }

  const { data, error } = await query.order('period', { ascending: true })
  if (error) throw error

  type OutstandingChargeRow = {
    id: string
    agreement_id: string
    period: string
    fee: number
    agreements: { kind: AgreementKind; rider_id: string }
  }
  const candidateRows = (data ?? []) as unknown as OutstandingChargeRow[]
  if (!candidateRows.length) return []

  // #831: agreement_charges.payment_type is gone — a candidate charge is only
  // "outstanding" once relayed as uncollected via get_outstanding_transactions
  // (transactions SELECT is manager-only RLS, so trainer/rider callers need the relay).
  const outstandingRows = await getOutstandingTransactionRows(
    barnId, { chargeIds: candidateRows.map((r) => r.id) }, supabase
  )
  const unpaidChargeIds = new Set(outstandingRows.filter((r) => !r.collected).map((r) => r.entityId))
  const rows = candidateRows.filter((r) => unpaidChargeIds.has(r.id))
  if (!rows.length) return []

  const riderIds = [...new Set(rows.map((r) => r.agreements.rider_id))]
  const nameMap = await resolveMemberNames(riderIds, barnId, supabase)

  return rows.map((row) => ({
    id: row.id,
    agreementId: row.agreement_id,
    period: calendarDate(row.period),
    kind: row.agreements.kind,
    riderName: nameMap.get(row.agreements.rider_id) ?? row.agreements.rider_id,
    fee: row.fee,
  }))
}
