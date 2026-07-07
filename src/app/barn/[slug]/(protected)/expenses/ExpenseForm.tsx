'use client'

import { useActionState, useState } from 'react'
import { getMostCommonExpenseTypeAction, type ExpenseFormState } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'

type ExpenseFormInitial = {
  recipient: string
  expenseType: string
  expenseTime: string | null
  amount: number | null
  notes: string | null
  appliesToAllHorses: boolean
  horseIds: string[]
}

type ExpenseFormProps = {
  barnSlug: string
  horses: { id: string; name: string }[]
  recentRecipients: string[]
  recentExpenseTypes: string[]
  defaultDate?: string
  initial?: ExpenseFormInitial
  submitLabel?: string
  onSave: (state: ExpenseFormState, fd: FormData) => Promise<ExpenseFormState>
}

const inputClassName =
  'mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50'

export function ExpenseForm({
  barnSlug,
  horses,
  recentRecipients,
  recentExpenseTypes,
  defaultDate,
  initial,
  submitLabel = 'Add Expense',
  onSave,
}: ExpenseFormProps) {
  const [state, formAction] = useActionState(onSave, { error: null })
  const [recipient, setRecipient] = useState(initial?.recipient ?? '')
  const [lastCheckedRecipient, setLastCheckedRecipient] = useState('')
  const [expenseType, setExpenseType] = useState(initial?.expenseType ?? '')
  const [appliesToAllHorses, setAppliesToAllHorses] = useState(initial?.appliesToAllHorses ?? false)
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(new Set(initial?.horseIds ?? []))
  const [typeFlashing, setTypeFlashing] = useState(false)

  async function handleRecipientBlur() {
    const trimmed = recipient.trim()
    if (!trimmed || trimmed === lastCheckedRecipient) return
    setLastCheckedRecipient(trimmed)
    const suggested = await getMostCommonExpenseTypeAction(barnSlug, trimmed)
    if (suggested) {
      setExpenseType(suggested)
      setTypeFlashing(true)
      setTimeout(() => setTypeFlashing(false), 600)
    }
  }

  return (
    <form action={formAction} className="w-full max-w-md space-y-4">
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div>
        <label htmlFor="expense-recipient" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Recipient
        </label>
        <input
          id="expense-recipient"
          name="recipient"
          list="recipient-options"
          required
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          onBlur={handleRecipientBlur}
          className={inputClassName}
        />
        <datalist id="recipient-options">
          {recentRecipients.map((r) => (
            <option key={r} value={r} />
          ))}
        </datalist>
      </div>

      <div>
        <label htmlFor="expense-type" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Expense Type <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="expense-type"
          name="expense_type"
          list="expense-type-options"
          value={expenseType}
          onChange={(e) => setExpenseType(e.target.value)}
          className={`${inputClassName} transition ${typeFlashing ? 'ring-2 ring-blue-400' : ''}`}
        />
        <datalist id="expense-type-options">
          {recentExpenseTypes.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </div>

      <div>
        <label htmlFor="expense-date" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Date
        </label>
        <input
          id="expense-date"
          name="expense_date"
          type="date"
          required
          defaultValue={defaultDate}
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor="expense-time" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Time <span className="font-normal text-zinc-500">(optional — presence signals a planned visit)</span>
        </label>
        <input
          id="expense-time"
          name="expense_time"
          type="time"
          defaultValue={initial?.expenseTime ?? undefined}
          className={inputClassName}
        />
      </div>

      <div>
        <label htmlFor="expense-amount" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Amount <span className="font-normal text-zinc-500">(optional)</span>
        </label>
        <input
          id="expense-amount"
          name="amount"
          type="number"
          step="0.01"
          min="0"
          defaultValue={initial?.amount ?? undefined}
          className={inputClassName}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
          <input
            type="checkbox"
            name="applies_to_all_horses"
            value="true"
            checked={appliesToAllHorses}
            onChange={(e) => setAppliesToAllHorses(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Entire Barn
        </label>

        <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
          <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Horses</legend>
          {horses.map((h) => (
            <label key={h.id} className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              <input
                type="checkbox"
                name="horse_id"
                value={h.id}
                disabled={appliesToAllHorses}
                checked={checkedHorseIds.has(h.id)}
                onChange={(e) => {
                  setCheckedHorseIds((prev) => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(h.id)
                    else next.delete(h.id)
                    return next
                  })
                }}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              {h.name}
            </label>
          ))}
        </fieldset>
      </div>

      <div>
        <label htmlFor="expense-notes" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Notes
        </label>
        <textarea
          id="expense-notes"
          name="notes"
          rows={3}
          defaultValue={initial?.notes ?? undefined}
          className={inputClassName}
        />
      </div>

      <Button type="submit">{submitLabel}</Button>
    </form>
  )
}
