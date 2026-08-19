'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateChargeFeeAction, updateChargePaymentTypeAction } from '../actions'
import { Th, Td } from '@/components/ui/Table'
import { SavedIndicator, useSaveFlash } from '@/components/ui/SavedIndicator'
import { EmptyState } from '@/components/EmptyState'
import type { AgreementCharge } from '@/lib/db/types'
import { formatChargePeriod } from '@/lib/format-date'

const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

function ChargeRow({ charge, barnSlug }: { charge: AgreementCharge; barnSlug: string }) {
  const router = useRouter()
  const [fee, setFee] = useState(String(charge.fee))
  const [paymentType, setPaymentType] = useState(charge.payment_type ?? '')
  const [feeError, setFeeError] = useState<string | null>(null)
  const [paymentTypeError, setPaymentTypeError] = useState<string | null>(null)
  const [savingPaymentType, setSavingPaymentType] = useState(false)
  const feeSaved = useSaveFlash()
  const paymentTypeSaved = useSaveFlash()

  async function handleFeeBlur() {
    if (fee === String(charge.fee)) return
    const result = await updateChargeFeeAction(barnSlug, charge.id, fee)
    if (result.error) {
      setFeeError(result.error)
      setFee(String(charge.fee))
      return
    }
    setFeeError(null)
    router.refresh()
    feeSaved.flash()
  }

  async function handlePaymentTypeChange(value: string) {
    setPaymentType(value)
    setSavingPaymentType(true)
    try {
      const result = await updateChargePaymentTypeAction(barnSlug, charge.id, value || null)
      if (result.error) {
        setPaymentTypeError(result.error)
        setPaymentType(charge.payment_type ?? '')
        return
      }
      setPaymentTypeError(null)
      router.refresh()
      paymentTypeSaved.flash()
    } catch {
      // A rejected call is a transport failure, not an `{ error }` result — the server recorded
      // nothing, so roll the select back and re-enable it rather than leaving the row locked.
      setPaymentTypeError('Could not save. Please try again.')
      setPaymentType(charge.payment_type ?? '')
    } finally {
      setSavingPaymentType(false)
    }
  }

  return (
    <tr>
      <Td>{formatChargePeriod(charge.period)}</Td>
      <Td>
        <input
          type="number"
          step="0.01"
          min="0"
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          onBlur={handleFeeBlur}
          className="w-24 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        {feeError && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{feeError}</p>}
        <SavedIndicator show={feeSaved.show} />
      </Td>
      <Td>
        <select
          value={paymentType}
          disabled={savingPaymentType}
          onChange={(e) => handlePaymentTypeChange(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">Unpaid</option>
          {PAYMENT_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </option>
          ))}
        </select>
        {paymentTypeError && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400">{paymentTypeError}</p>
        )}
        <SavedIndicator show={paymentTypeSaved.show} />
      </Td>
    </tr>
  )
}

export function ChargesTable({ charges, barnSlug }: { charges: AgreementCharge[]; barnSlug: string }) {
  if (charges.length === 0) {
    return <EmptyState heading="No charges yet." subtext="Charges will appear here once generated." />
  }

  return (
    <div className="mt-6 overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Period</Th>
            <Th>Fee</Th>
            <Th>Payment Type</Th>
          </tr>
        </thead>
        <tbody>
          {charges.map((charge) => (
            <ChargeRow key={charge.id} charge={charge} barnSlug={barnSlug} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
