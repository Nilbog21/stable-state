'use server'

import { redirect } from 'next/navigation'
import { requireMembership } from '@/lib/auth/guard'
import { createAgreement, updateAgreement, endAgreement, getAgreementById } from '@/lib/db/agreements'
import type { AgreementKind, AgreementCadence } from '@/lib/db/types'

function parseFee(raw: string | null): number | null {
  if (!raw || raw.trim() === '') return null
  const n = parseFloat(raw)
  return isNaN(n) || n < 0 ? null : n
}

export async function createAgreementAction(
  barnSlug: string,
  kind: AgreementKind,
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const riderId = (formData.get('rider_id') as string | null)?.trim()
  const horseId = (formData.get('horse_id') as string | null)?.trim()
  const fee = parseFee(formData.get('fee') as string | null)
  if (!riderId || !horseId || fee === null) return

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
  formData: FormData
): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const fee = parseFee(formData.get('fee') as string | null)
  if (fee === null) return

  const agreement = await updateAgreement(agreementId, barn.id, { fee })
  redirect(`/barn/${barnSlug}/agreements?kind=${agreement.kind}`)
}

export async function endAgreementAction(barnSlug: string, agreementId: string): Promise<void> {
  const { barn } = await requireMembership(barnSlug, ['manager'])

  const agreement = await getAgreementById(agreementId, barn.id)
  if (!agreement) redirect(`/barn/${barnSlug}/agreements`)

  await endAgreement(agreementId, barn.id)
  redirect(`/barn/${barnSlug}/agreements?kind=${agreement.kind}`)
}
