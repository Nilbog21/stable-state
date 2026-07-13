'use client'

import { useState } from 'react'
import type { ExpenseWithHorses } from '@/lib/db/types'
import { Th } from '@/components/ui/Table'
import { ExpenseRow } from './ExpenseRow'

interface Props {
  expenses: ExpenseWithHorses[]
  slug: string
}

export function OlderExpensesToggle({ expenses, slug }: Props) {
  const [show, setShow] = useState(false)

  if (expenses.length === 0) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="min-h-11 px-4 py-3 text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {show ? 'Hide older expenses' : 'Show older expenses'}
      </button>
      {show && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                <Th scope="col">Date</Th>
                <Th scope="col">Time</Th>
                <Th scope="col">Recipient</Th>
                <Th scope="col">Type</Th>
                <Th scope="col">Horse(s)</Th>
                <Th scope="col">Amount</Th>
                <Th scope="col">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <ExpenseRow key={expense.id} expense={expense} slug={slug} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}
