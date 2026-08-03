'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction, updateCancellationFeePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../agreements/actions'
import type { OutstandingItem } from '@/lib/db/types'
import { formatBarnDate, formatShortDate } from '@/lib/format-date'

import { Th, Td, TableActions } from '@/components/ui/Table'


const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

const TYPE_LABELS: Record<OutstandingItem['itemType'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
  cancellation_fee: 'Cancellation Fee',
}

/**
 * One row, mirroring `ChargeRow` in the agreements table: the select is controlled and the
 * action's `{ error }` is rendered rather than discarded, so a failed write can never leave
 * a payment type showing against a row this table is simultaneously listing as unpaid.
 * Saving state is per-row `useState` rather than `useTransition`, which appears nowhere in
 * this repo — plain state keeps the row's in-flight flag the same shape as `ChargeRow`'s.
 */
function OutstandingRow({ item, barnSlug }: { item: OutstandingItem; barnSlug: string }) {
  const router = useRouter()
  // Every row here is by definition unpaid, so '' is the persisted state to roll back to.
  const [paymentType, setPaymentType] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleChange(value: string) {
    setPaymentType(value)
    setSaving(true)
    try {
      const result =
        item.itemType === 'lesson'
          ? await updatePaymentTypeAction(item.id, barnSlug, value || null)
          : item.itemType === 'cancellation_fee'
            ? await updateCancellationFeePaymentTypeAction(barnSlug, item.id, value || null)
            : await updateChargePaymentTypeAction(barnSlug, item.id, value || null)
      if (result.error) {
        setError(result.error)
        setPaymentType('')
        return
      }
      setError(null)
      router.refresh()
    } catch {
      // A rejected call is a transport failure, not an `{ error }` result — the server recorded
      // nothing, so roll the select back and re-enable it rather than leaving the row locked.
      setError('Could not save. Please try again.')
      setPaymentType('')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr>
      <Td>
        {item.itemType === 'lesson' || item.itemType === 'cancellation_fee'
          ? formatBarnDate(item.date)
          : formatShortDate(item.date)}
      </Td>
      <Td>{TYPE_LABELS[item.itemType]}</Td>
      <Td>{item.riderNames.join(', ') || '—'}</Td>
      <Td>{item.instructorName ?? '—'}</Td>
      <Td>{item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</Td>
      <TableActions>
        {/* Stacked in its own column: `TableActions` wraps children in a nowrap flex row, which
            would sit the error beside the select and stop it wrapping on a phone. */}
        <span className="inline-flex flex-col items-end gap-1 whitespace-normal">
          <select
            value={paymentType}
            disabled={saving}
            onChange={(e) => handleChange(e.target.value)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
          >
            <option value="">Unpaid</option>
            {PAYMENT_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </option>
            ))}
          </select>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
        </span>
      </TableActions>
    </tr>
  )
}

export function OutstandingTable({
  items,
  barnSlug,
}: {
  items: OutstandingItem[]
  barnSlug: string
}) {
  if (items.length === 0) return null

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr>
            <Th>Date</Th>
            <Th>Type</Th>
            <Th>Rider(s)</Th>
            <Th>Instructor</Th>
            <Th>Fee</Th>
            <Th>Payment Type</Th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <OutstandingRow key={item.id} item={item} barnSlug={barnSlug} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
