import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import { getTransactionRows, getOutstandingTransactionRows } from './transactions'
import type { Agreement, AgreementCadence, AgreementCharge, AgreementKind, OutstandingCharge, PaymentType, Role, TransactionKind } from './types'

export function getAgreementStatusLabel(agreement: Pick<Agreement, 'cadence' | 'is_active'>): string {
  if (!agreement.is_active) return 'Ended'
  return agreement.cadence === 'one_time' ? 'Complete' : 'Active'
}

export async function createAgreement(
  params: {
    barnId: string
    riderId: string
    horseId: string
    fee: number
    kind: AgreementKind
    cadence: AgreementCadence
    startDate?: string
  },
  client?: SupabaseClient
): Promise<Agreement> {
  // optional client for service-role injection from scripts; omitting defaults to SSR client
  const supabase = client ?? await createClient()
  const { data, error } = await supabase.rpc('create_agreement_with_first_charge', {
    p_barn_id: params.barnId,
    p_rider_id: params.riderId,
    p_horse_id: params.horseId,
    p_fee: params.fee,
    p_kind: params.kind,
    p_cadence: params.cadence,
    ...(params.startDate ? { p_start_date: params.startDate } : {}),
  })
  if (error) throw error
  return data as Agreement
}

export async function getAgreementsByBarn(
  barnId: string,
  kind?: AgreementKind,
  client?: SupabaseClient
): Promise<Agreement[]> {
  const supabase = client ?? await createClient()
  let query = supabase.from('agreements').select('*').eq('barn_id', barnId)
  if (kind) query = query.eq('kind', kind)
  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function getAgreementById(
  agreementId: string,
  barnId: string,
  client?: SupabaseClient
): Promise<Agreement | null> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('agreements')
    .select('*')
    .eq('id', agreementId)
    .eq('barn_id', barnId)
    .maybeSingle()

  if (error) throw error
  return data
}

export async function getActiveAgreementsForRider(
  barnId: string,
  riderId: string,
  client?: SupabaseClient
): Promise<Agreement[]> {
  const supabase = client ?? await createClient()
  // a rider can have more than one simultaneously-active agreement (e.g. boarding two horses,
  // or a lease alongside a boarding agreement), so this returns all of them, not just one
  const { data, error } = await supabase
    .from('agreements')
    .select('*')
    .eq('barn_id', barnId)
    .eq('rider_id', riderId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

export async function updateAgreement(
  agreementId: string,
  barnId: string,
  updates: { fee?: number }
): Promise<Agreement> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agreements')
    .update(updates)
    .eq('id', agreementId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function endAgreement(agreementId: string, barnId: string): Promise<void> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('agreements')
    .update({ is_active: false })
    .eq('id', agreementId)
    .eq('barn_id', barnId)

  if (error) throw error
}

export async function getChargesForAgreement(
  agreementId: string,
  barnId: string
): Promise<AgreementCharge[]> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agreement_charges')
    .select('*')
    .eq('agreement_id', agreementId)
    .eq('barn_id', barnId)
    .order('period', { ascending: false })

  if (error) throw error
  const charges = data ?? []
  if (!charges.length) return charges

  // #885: agreement_charges.payment_type is no longer written by mark_agreement_charge_paid —
  // the transactions ledger (kind IN lease_charge/board_charge) is the source of truth.
  const { data: txns, error: txnError } = await supabase
    .from('transactions')
    .select('agreement_charge_id, payment_type')
    .eq('barn_id', barnId)
    .in('kind', CHARGE_TRANSACTION_KINDS)
    .in('agreement_charge_id', charges.map((c) => c.id))
  if (txnError) throw txnError

  type ChargePaymentRow = { agreement_charge_id: string; payment_type: PaymentType | null }
  const paymentMap = new Map(((txns ?? []) as unknown as ChargePaymentRow[]).map((t) => [t.agreement_charge_id, t.payment_type]))
  return charges.map((c) => ({ ...c, payment_type: paymentMap.get(c.id) ?? null }))
}

export async function updateCharge(
  chargeId: string,
  barnId: string,
  fee: number
): Promise<AgreementCharge> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('update_agreement_charge_fee', {
    p_charge_id: chargeId,
    p_barn_id: barnId,
    p_fee: fee,
  })
  if (error) throw error
  return data as AgreementCharge
}

export async function updateChargePaymentType(
  chargeId: string,
  barnId: string,
  paymentType: PaymentType | null
): Promise<AgreementCharge> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('mark_agreement_charge_paid', {
    p_charge_id: chargeId,
    p_barn_id: barnId,
    p_payment_type: paymentType,
  })
  if (error) throw error
  return data as AgreementCharge
}

export async function generateChargeForMonth(
  agreementId: string,
  barnId: string,
  period: Date,
  client?: SupabaseClient
): Promise<AgreementCharge> {
  const supabase = client ?? await createClient()
  const periodDate = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)

  const { data, error } = await supabase.rpc('generate_agreement_charge', {
    p_agreement_id: agreementId,
    p_barn_id: barnId,
    p_period: periodDate,
  })
  if (error) throw error
  return data as AgreementCharge
}

export async function getBarnDefaultBoardFee(barnId: string, client?: SupabaseClient): Promise<number> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('barns')
    .select('default_board_fee')
    .eq('id', barnId)
    .single()

  if (error) throw error
  return data.default_board_fee
}

export interface ChargeSummaryRow {
  period: string
  fee: number
  payment_type: PaymentType | null
}

const CHARGE_TRANSACTION_KINDS: TransactionKind[] = ['lease_charge', 'board_charge']

export async function getChargesForSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<ChargeSummaryRow[]> {
  const rows = await getTransactionRows(barnId, CHARGE_TRANSACTION_KINDS, { startDate, endDate }, client)
  return rows.map((row) => ({
    period: row.occurredAt.slice(0, 10),
    fee: row.amount,
    payment_type: row.paymentType,
  }))
}

export interface PaidCharge {
  chargeId: string
  agreementId: string
  period: string
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
  const agreementIdByChargeId = new Map<string, string>()
  if (chargeIds.length) {
    const { data: chargeRows, error } = await supabase
      .from('agreement_charges')
      .select('id, agreement_id')
      .eq('barn_id', barnId)
      .in('id', chargeIds)
    if (error) throw error
    for (const c of chargeRows ?? []) agreementIdByChargeId.set(c.id, c.agreement_id)
  }

  // agreementChargeId/membershipId/horseId are nullable via ON DELETE SET NULL — no
  // code path currently hard-deletes an agreement_charges row, but a rider's
  // membership can be removed after their charge is collected, so riderId/horseId
  // fall back to null rather than an unchecked cast (mirrors getLessonFeeRows'
  // orphaned-lessonId handling); callers apply their own NO_HORSE_LABEL/NO_RIDER_LABEL.
  return rows.map((row) => {
    const chargeId = row.agreementChargeId ?? row.id
    return {
      chargeId,
      agreementId: (row.agreementChargeId && agreementIdByChargeId.get(row.agreementChargeId)) ?? chargeId,
      period: row.occurredAt.slice(0, 10),
      fee: row.amount,
      kind: row.kind === 'lease_charge' ? 'lease' : 'board',
      riderId: row.membershipId,
      horseId: row.horseId,
    }
  })
}

// ponytail: barn-wide, no role/userId scoping (unlike getOutstandingCharges) — its only caller
// is the manager-only /barn/[slug]/agreements page. Add role-based scoping (mirroring
// getOutstandingCharges) before reusing this from a trainer- or rider-facing surface.
//
// #831: agreement_charges.payment_type is gone — this reads transactions directly
// instead (no relay RPC needed, unlike getOutstandingCharges below, since this
// caller is already manager-only and passes transactions' own RLS).
export async function getUnpaidAgreementIds(barnId: string, client?: SupabaseClient): Promise<Set<string>> {
  const supabase = client ?? await createClient()
  const now = new Date()
  const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))

  const rows = await getTransactionRows(
    barnId, CHARGE_TRANSACTION_KINDS, { endDate: firstOfCurrentMonth, collected: false }, supabase
  )
  if (!rows.length) return new Set()

  const chargeIds = [...new Set(rows.map((r) => r.agreementChargeId).filter((id): id is string => id !== null))]
  if (!chargeIds.length) return new Set()

  const { data, error } = await supabase
    .from('agreement_charges')
    .select('id, agreement_id')
    .eq('barn_id', barnId)
    .in('id', chargeIds)

  if (error) throw error
  return new Set((data ?? []).map((row) => row.agreement_id))
}

export async function getOutstandingCharges(
  barnId: string,
  userId?: string,
  role?: Role,
  client?: SupabaseClient
): Promise<OutstandingCharge[]> {
  if (role === 'trainer') return []

  const supabase = client ?? await createClient()
  const now = new Date()
  const firstOfCurrentMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)

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
    .select('id, period, fee, agreements!agreement_charges_barn_id_agreement_id_fkey!inner(kind, rider_id)')
    .eq('barn_id', barnId)
    .lt('period', firstOfCurrentMonth)

  if (riderAgreementIds) {
    query = query.in('agreement_id', riderAgreementIds)
  }

  const { data, error } = await query.order('period', { ascending: true })
  if (error) throw error

  type OutstandingChargeRow = {
    id: string
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
    period: row.period,
    kind: row.agreements.kind,
    riderName: nameMap.get(row.agreements.rider_id) ?? row.agreements.rider_id,
    fee: row.fee,
  }))
}
