'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import {
  createAgreement,
  updateAgreement,
  endAgreement,
  getAgreementById,
  updateCharge,
  updateChargePaymentType,
} from '@/lib/db/agreements'
import type { AgreementKind, AgreementCadence, PaymentType } from '@/lib/db/types'

const PAYMENT_TYPES: PaymentType[] = ['venmo', 'zelle', 'cash', 'check', 'freshbooks']

function parseFee(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) || n < 0 ? null : n
}

export type AgreementFormState = { error: string | null }

export async function createAgreementAction(
  barnSlug: string,
  kind: AgreementKind,
  _prevState: AgreementFormState,
  formData: FormData
): Promise<AgreementFormState> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const riderId = (formData.get('rider_id') as string | null)?.trim()
  const horseId = (formData.get('horse_id') as string | null)?.trim()
  const fee = parseFee(formData.get('fee') as string | null)
  if (!riderId) return { error: 'rider required' }
  if (!horseId) return { error: 'horse required' }
  if (fee === null) return { error: 'a valid, non-negative fee is required' }

  const startDate = (formData.get('start_date') as string | null)?.trim() || undefined
  const cadence: AgreementCadence =
    kind === 'board'
      ? 'monthly'
      : (formData.get('cadence') as string | null) === 'one_time'
        ? 'one_time'
        : 'monthly'

  await createAgreement({ barnId: barn.id, riderId, horseId, fee, kind, cadence, startDate })
  redirect(`/barn/${barnSlug}/agreements?kind=${kind}`)
}

export async function updateAgreementAction(
  barnSlug: string,
  agreementId: string,
  _prevState: AgreementFormState,
  formData: FormData
): Promise<AgreementFormState> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const fee = parseFee(formData.get('fee') as string | null)
  if (fee === null) return { error: 'a valid, non-negative fee is required' }

  const existing = await getAgreementById(agreementId, barn.id)
  if (!existing) return { error: 'agreement not found' }

  const agreement = await updateAgreement(agreementId, barn.id, { fee })
  redirect(`/barn/${barnSlug}/agreements?kind=${agreement.kind}`)
}

export async function endAgreementAction(barnSlug: string, agreementId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const agreement = await getAgreementById(agreementId, barn.id)
  if (!agreement) redirect(`/barn/${barnSlug}/agreements?kind=lease`)

  await endAgreement(agreementId, barn.id)
  redirect(`/barn/${barnSlug}/agreements?kind=${agreement.kind}`)
}

export async function updateChargeFeeAction(
  barnSlug: string,
  chargeId: string,
  feeRaw: string
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const fee = parseFee(feeRaw)
  if (fee === null) return { error: 'a valid, non-negative fee is required' }

  try {
    await updateCharge(chargeId, barn.id, fee)
  } catch {
    return { error: 'Failed to update charge fee' }
  }

  return { error: null }
}

export async function updateChargePaymentTypeAction(
  barnSlug: string,
  chargeId: string,
  paymentType: string | null
): Promise<{ error: string | null }> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  if (paymentType !== null && !PAYMENT_TYPES.includes(paymentType as PaymentType)) {
    return { error: 'invalid payment type' }
  }

  try {
    await updateChargePaymentType(chargeId, barn.id, paymentType as PaymentType | null)
  } catch {
    return { error: 'Failed to update payment type' }
  }

  return { error: null }
}
