'use client'

import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../agreements/actions'
import type { OutstandingItem } from '@/lib/db/types'
import { Th, Td } from '@/components/ui/Table'

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
            <Td>{formatDate(item.date)}</Td>
            <Td>{TYPE_LABELS[item.itemType]}</Td>
            <Td>{item.riderNames.join(', ') || '—'}</Td>
            <Td>{item.instructorName ?? '—'}</Td>
            <Td>
              {item.fee.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}
            </Td>
            <Td>
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
            </Td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
