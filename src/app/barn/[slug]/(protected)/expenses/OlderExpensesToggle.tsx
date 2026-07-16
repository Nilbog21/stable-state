'use client'

import { useState } from 'react'
import type { ExpenseWithHorses } from '@/lib/db/types'
import { ExpenseCard } from './ExpenseCard'

interface Props {
  expenses: ExpenseWithHorses[]
  slug: string
}

export function OlderExpensesToggle({ expenses, slug }: Props) {
  const [show, setShow] = useState(false)

  if (expenses.length === 0) return null

  return (
    <>
      {/* Raw Tailwind, not <Button>: bare underlined text-link control, no
          background/border — same reasoning as NotificationBell's
          "Mark all read" control. */}
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        className="min-h-11 px-4 py-3 text-sm text-zinc-500 underline hover:text-zinc-700 dark:hover:text-zinc-300"
      >
        {show ? 'Hide older expenses' : 'Show older expenses'}
      </button>
      {show && (
        <div className="flex flex-col gap-2">
          {expenses.map((expense) => (
            <ExpenseCard key={expense.id} expense={expense} slug={slug} />
          ))}
        </div>
      )}
    </>
  )
}
