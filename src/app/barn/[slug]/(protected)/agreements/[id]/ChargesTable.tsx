'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateChargeFeeAction, updateChargePaymentTypeAction } from '../actions'
import { Th, Td } from '@/components/ui/Table'
import type { AgreementCharge } from '@/lib/db/types'

const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

function formatPeriod(period: string): string {
  return new Date(period).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function ChargeRow({ charge, barnSlug }: { charge: AgreementCharge; barnSlug: string }) {
  const router = useRouter()
  const [fee, setFee] = useState(String(charge.fee))

  async function handleFeeBlur() {
    if (fee === String(charge.fee)) return
    await updateChargeFeeAction(barnSlug, charge.id, fee)
    router.refresh()
  }

  async function handlePaymentTypeChange(value: string) {
    await updateChargePaymentTypeAction(barnSlug, charge.id, value || null)
    router.refresh()
  }

  return (
    <tr>
      <Td>{formatPeriod(charge.period)}</Td>
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
      </Td>
      <Td>
        <select
          defaultValue={charge.payment_type ?? ''}
          onChange={(e) => handlePaymentTypeChange(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">Unpaid</option>
          {PAYMENT_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </option>
          ))}
        </select>
      </Td>
    </tr>
  )
}

export function ChargesTable({ charges, barnSlug }: { charges: AgreementCharge[]; barnSlug: string }) {
  if (charges.length === 0) return <p className="mt-6 text-sm text-zinc-500">No charges yet.</p>

  return (
    <table className="mt-6 w-full">
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
  )
}
