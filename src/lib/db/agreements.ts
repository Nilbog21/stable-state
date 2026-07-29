/**
 * Lease/board agreement and charge CRUD: RPC-backed `createAgreement`
 * (`create_agreement_with_first_charge`), barn/ID/rider reads, fee update and
 * `endAgreement`, the pure `getAgreementStatusLabel`, and charge reads/mutations —
 * `getChargesForAgreement` overlays each charge's `payment_type` from the
 * `transactions` ledger (#885). Reporting reads live in `agreement-finances.ts`.
 */
import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getTransactionRows } from './transactions'
import type { Agreement, AgreementCadence, AgreementCharge, AgreementKind, PaymentType } from './types'
import { CHARGE_TRANSACTION_KINDS } from './agreement-finances'

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

// ponytail: barn-wide, no role/userId scoping (unlike agreement-finances.ts:getOutstandingCharges)
// — its only caller is the manager-only /barn/[slug]/agreements page. Add role-based scoping
// (mirroring agreement-finances.ts:getOutstandingCharges) before reusing this from a trainer- or
// rider-facing surface.
//
// #831: agreement_charges.payment_type is gone — this reads transactions directly
// instead (no relay RPC needed, unlike agreement-finances.ts:getOutstandingCharges,
// since this caller is already manager-only and passes transactions' own RLS).
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
