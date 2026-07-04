import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveMemberNames } from './barn-memberships'
import type { Agreement, AgreementCadence, AgreementCharge, AgreementKind, OutstandingCharge, PaymentType, Role } from './types'

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
  const { data, error } = await supabase
    .from('agreement_charges')
    .update({ fee })
    .eq('id', chargeId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
}

export async function updateChargePaymentType(
  chargeId: string,
  barnId: string,
  paymentType: PaymentType | null
): Promise<AgreementCharge> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('agreement_charges')
    .update({ payment_type: paymentType })
    .eq('id', chargeId)
    .eq('barn_id', barnId)
    .select()
    .single()

  if (error) throw error
  return data
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
  fee: number
  payment_type: PaymentType | null
}

export async function getChargesForSummary(
  barnId: string,
  startDate: Date,
  endDate: Date,
  client?: SupabaseClient
): Promise<ChargeSummaryRow[]> {
  const supabase = client ?? await createClient()
  const { data, error } = await supabase
    .from('agreement_charges')
    .select('fee, payment_type')
    .eq('barn_id', barnId)
    .gte('period', startDate.toISOString().slice(0, 10))
    .lt('period', endDate.toISOString().slice(0, 10))

  if (error) throw error
  return data ?? []
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
  const { data, error } = await supabase
    .from('agreement_charges')
    .select('id, agreement_id, period, fee, agreements!inner(kind, rider_id, horse_id)')
    .eq('barn_id', barnId)
    .not('payment_type', 'is', null)
    .gte('period', startDate.toISOString().slice(0, 10))
    .lt('period', endDate.toISOString().slice(0, 10))

  if (error) throw error
  return (data ?? []).map((row: any) => ({
    chargeId: row.id,
    agreementId: row.agreement_id,
    period: row.period,
    fee: row.fee,
    kind: row.agreements.kind,
    riderId: row.agreements.rider_id,
    horseId: row.agreements.horse_id,
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

  let riderMembershipId: string | undefined
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
    riderMembershipId = rider.id
  }

  let query = supabase
    .from('agreement_charges')
    .select('id, period, fee, agreements!inner(kind, rider_id)')
    .eq('barn_id', barnId)
    .is('payment_type', null)
    .lt('period', firstOfCurrentMonth)

  if (riderMembershipId) {
    query = query.eq('agreements.rider_id', riderMembershipId)
  }

  const { data, error } = await query.order('period', { ascending: true })
  if (error) throw error

  const rows = data ?? []
  const riderIds = [...new Set(rows.map((r: any) => r.agreements.rider_id))]
  const nameMap = await resolveMemberNames(riderIds, barnId, supabase)

  return rows.map((row: any) => ({
    id: row.id,
    period: row.period,
    kind: row.agreements.kind,
    riderName: nameMap.get(row.agreements.rider_id) ?? row.agreements.rider_id,
    fee: row.fee,
  }))
}
