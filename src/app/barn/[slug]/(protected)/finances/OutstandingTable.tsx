'use client'

import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../agreements/actions'
import type { OutstandingItem } from '@/lib/db/types'

const PAYMENT_TYPES = ['venmo', 'zelle', 'cash', 'check', 'freshbooks'] as const

const TYPE_LABELS: Record<OutstandingItem['itemType'], string> = {
  lesson: 'Lesson',
  lease: 'Lease',
  board: 'Boarding',
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
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
    } else {
      await updateChargePaymentTypeAction(barnSlug, item.id, value || null)
    }
    router.refresh()
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wide text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
          <th className="pb-2 pr-6">Date</th>
          <th className="pb-2 pr-6">Type</th>
          <th className="pb-2 pr-6">Rider(s)</th>
          <th className="pb-2 pr-6">Instructor</th>
          <th className="pb-2 pr-6">Fee</th>
          <th className="pb-2">Payment Type</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id} className="border-b border-zinc-100 dark:border-zinc-800">
            <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
              {formatDate(item.date)}
            </td>
            <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
              {TYPE_LABELS[item.itemType]}
            </td>
            <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
              {item.riderNames.join(', ') || '—'}
            </td>
            <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
              {item.instructorName ?? '—'}
            </td>
            <td className="py-3 pr-6 text-sm text-zinc-900 dark:text-zinc-50">
              {item.fee !== null
                ? item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
                : '—'}
            </td>
            <td className="py-3 text-sm">
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
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
