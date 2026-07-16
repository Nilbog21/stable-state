'use client'

import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction, updateCancellationFeePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../agreements/actions'
import type { OutstandingItem } from '@/lib/db/types'
import { formatShortDate } from '@/lib/format-date'
import { LocalDateTime } from '@/components/LocalDateTime'
import { Th, Td, TableActions } from '@/components/ui/Table'

const DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }

const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

const TYPE_LABELS: Record<OutstandingItem['itemType'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
  cancellation_fee: 'Cancellation Fee',
}

export function OutstandingTable({
  items,
  barnSlug,
}: {
  items: OutstandingItem[]
  barnSlug: string
}) {
  const router = useRouter()

  if (items.length === 0) return null

  async function handleChange(item: OutstandingItem, value: string) {
    if (item.itemType === 'lesson') {
      await updatePaymentTypeAction(item.id, barnSlug, value || null)
    } else if (item.itemType === 'cancellation_fee') {
      await updateCancellationFeePaymentTypeAction(barnSlug, item.id, value || null)
    } else {
      await updateChargePaymentTypeAction(barnSlug, item.id, value || null)
    }
    router.refresh()
  }

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
            <tr key={item.id}>
              <Td>
                {item.itemType === 'lesson' || item.itemType === 'cancellation_fee' ? (
                  <LocalDateTime iso={item.date} options={DATE_ONLY_OPTIONS} />
                ) : (
                  formatShortDate(item.date)
                )}
              </Td>
              <Td>{TYPE_LABELS[item.itemType]}</Td>
              <Td>{item.riderNames.join(', ') || '—'}</Td>
              <Td>{item.instructorName ?? '—'}</Td>
              <Td>
                {item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
              </Td>
              <TableActions>
                <select
                  defaultValue=""
                  onChange={(e) => handleChange(item, e.target.value)}
                  className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
                >
                  <option value="">Unpaid</option>
                  {PAYMENT_TYPES.map((pt) => (
                    <option key={pt} value={pt}>
                      {pt.charAt(0).toUpperCase() + pt.slice(1)}
                    </option>
                  ))}
                </select>
              </TableActions>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
