'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updatePaymentTypeAction } from '@/app/actions/lessons'
import { updateChargePaymentTypeAction } from '../agreements/actions'
import { resolvePastDueExpenseAction } from '@/app/actions/expenses'
import type { OutstandingItem, HorseExpense } from '@/lib/db/types'
import { Th, Td, TableActions } from '@/components/ui/Table'
import { Button } from '@/components/ui/Button'

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

function PastDueExpenseRow({ expense, barnSlug }: { expense: HorseExpense; barnSlug: string }) {
  const router = useRouter()
  const [amount, setAmount] = useState('')
  const [paymentType, setPaymentType] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    const result = await resolvePastDueExpenseAction(barnSlug, expense.id, amount, paymentType || null)
    if (result.error) {
      setError(result.error)
      return
    }
    setError(null)
    router.refresh()
  }

  return (
    <tr>
      <Td>{formatDate(expense.expense_date)}</Td>
      <Td>Expense</Td>
      <Td>{`${expense.recipient} · ${expense.expense_type}`}</Td>
      <Td>—</Td>
      <Td>—</Td>
      <TableActions>
        <label className="sr-only" htmlFor={`expense-amount-${expense.id}`}>Amount</label>
        <input
          id={`expense-amount-${expense.id}`}
          type="number"
          step="0.01"
          min="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-20 rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        />
        <select
          value={paymentType}
          onChange={(e) => setPaymentType(e.target.value)}
          className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
        >
          <option value="">Unpaid</option>
          {PAYMENT_TYPES.map((pt) => (
            <option key={pt} value={pt}>
              {pt.charAt(0).toUpperCase() + pt.slice(1)}
            </option>
          ))}
        </select>
        <Button type="button" size="sm" onClick={handleSave}>Save</Button>
        {error && <p className="mt-1 w-full text-xs text-red-600 dark:text-red-400">{error}</p>}
      </TableActions>
    </tr>
  )
}

export function OutstandingTable({
  items,
  pastDueExpenses = [],
  barnSlug,
}: {
  items: OutstandingItem[]
  pastDueExpenses?: HorseExpense[]
  barnSlug: string
}) {
  const router = useRouter()

  if (items.length === 0 && pastDueExpenses.length === 0) return null

  async function handleChange(item: OutstandingItem, value: string) {
    if (item.itemType === 'lesson') {
      await updatePaymentTypeAction(item.id, barnSlug, value || null)
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
              <Td>{formatDate(item.date)}</Td>
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
          {pastDueExpenses.map((expense) => (
            <PastDueExpenseRow key={expense.id} expense={expense} barnSlug={barnSlug} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
