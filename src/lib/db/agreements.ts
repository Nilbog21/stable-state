import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './member-names'
import type { Agreement, AgreementCadence, AgreementCharge, AgreementKind, OutstandingCharge, PaymentType, Role } from './types'

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
  return data ?? []
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

const CHARGE_TRANSACTION_KINDS = ['lease_charge', 'board_charge'] as const

export async function getChargesForSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<ChargeSummaryRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('transactions')
    .select('occurred_at, amount, payment_type')
    .eq('barn_id', barnId)
    .in('kind', CHARGE_TRANSACTION_KINDS)
    .gte('occurred_at', startDate.toISOString().slice(0, 10))
    .lt('occurred_at', endDate.toISOString().slice(0, 10))

  if (error) throw error
  type ChargeTransactionRow = { occurred_at: string; amount: number; payment_type: PaymentType | null }
  return ((data ?? []) as unknown as ChargeTransactionRow[]).map((row) => ({
    period: row.occurred_at.slice(0, 10),
    fee: row.amount,
    payment_type: row.payment_type,
  }))
}

export interface PaidCharge {
  chargeId: string
  agreementId: string
  period: string
  fee: number
  kind: AgreementKind
  riderId: string
  horseId: string
}

export async function getPaidCharges(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<PaidCharge[]> {
  const supabase = client ?? await createClient()
  // `kind`/`membership_id`/`horse_id` are already denormalized onto the transaction row
  // (see the transactions table), so only `agreement_id` needs a join — one hop via the
  // FK-hint embed, pinned to the exact composite constraint (`transactions_barn_id_agreement_charge_id_fkey`,
  // Postgres's standard auto-generated name for the unnamed FK added in #826 — re-verified
  // against the live stable-state-dev schema for this #828 change — see getPaidCharges
  // history for why an unqualified `agreements!inner` embed is avoided, #407/#665).
  const { data, error } = await supabase
    .from('transactions')
    .select(
      'agreement_charge_id, occurred_at, amount, kind, membership_id, horse_id, agreement_charges!transactions_barn_id_agreement_charge_id_fkey!inner(agreement_id)'
    )
    .eq('barn_id', barnId)
    .in('kind', CHARGE_TRANSACTION_KINDS)
    .eq('collected', true)
    .gte('occurred_at', startDate.toISOString().slice(0, 10))
    .lt('occurred_at', endDate.toISOString().slice(0, 10))

  if (error) throw error
  type PaidChargeTransactionRow = {
    agreement_charge_id: string
    occurred_at: string
    amount: number
    kind: 'lease_charge' | 'board_charge'
    membership_id: string
    horse_id: string
    agreement_charges: { agreement_id: string }
  }
  return ((data ?? []) as unknown as PaidChargeTransactionRow[]).map((row) => ({
    chargeId: row.agreement_charge_id,
    agreementId: row.agreement_charges.agreement_id,
    period: row.occurred_at.slice(0, 10),
    fee: row.amount,
    kind: row.kind === 'lease_charge' ? 'lease' : 'board',
    riderId: row.membership_id,
    horseId: row.horse_id,
  }))
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

  // FK-hint embed pinned to the exact composite constraint — see getPaidCharges above for
  // why (not an unqualified `agreements!inner`); same table pair, same verified FK (#665).
  let query = supabase
    .from('agreement_charges')
    .select('id, period, fee, agreements!agreement_charges_barn_id_agreement_id_fkey!inner(kind, rider_id)')
    .eq('barn_id', barnId)
    .is('payment_type', null)
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
  const rows = (data ?? []) as unknown as OutstandingChargeRow[]
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
