import { createClient } from '@/lib/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Agreement, AgreementCadence, AgreementCharge, AgreementKind } from './types'

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

export async function generateChargeForMonth(
  agreementId: string,
  period: Date,
  client?: SupabaseClient
): Promise<AgreementCharge> {
  const supabase = client ?? await createClient()

  const { data: agreement, error: agreementError } = await supabase
    .from('agreements')
    .select('barn_id, fee')
    .eq('id', agreementId)
    .single()
  if (agreementError) throw agreementError

  const periodDate = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10)

  const { error: upsertError } = await supabase
    .from('agreement_charges')
    .upsert(
      { barn_id: agreement.barn_id, agreement_id: agreementId, period: periodDate, fee: agreement.fee },
      { onConflict: 'agreement_id,period', ignoreDuplicates: true }
    )
  if (upsertError) throw upsertError

  const { data, error } = await supabase
    .from('agreement_charges')
    .select('*')
    .eq('agreement_id', agreementId)
    .eq('period', periodDate)
    .single()

  if (error) throw error
  return data
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
