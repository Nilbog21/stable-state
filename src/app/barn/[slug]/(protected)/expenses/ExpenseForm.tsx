'use client'

import { useActionState, useState } from 'react'
import { getMostCommonExpenseTypeAction, type ExpenseFormState } from '@/app/actions/expenses'
import { Button } from '@/components/ui/Button'
import { localToday } from '@/lib/local-day'
import type { PaymentType } from '@/lib/db/types'

const PAYMENT_TYPES: PaymentType[] = ['venmo', 'zelle', 'cash', 'check', 'freshbooks']

type ExpenseFormInitial = {
  recipient: string
  expenseType: string
  expenseTime: string | null
  amount: number | null
  notes: string | null
  appliesToAllHorses: boolean
  horseIds: string[]
  paymentType?: PaymentType | null
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

// Mirrors DateHourPicker's fix: constructing via Date's local (year, month, day, hour,
// minute) numeric components, then reading the true UTC instant back out via
// toISOString(), uses the entering user's actual browser timezone — unlike a naive
// server-side (date + time)::timestamptz cast, which #935's audit found interprets in
// the session's timezone instead. Time defaults to midnight when blank.
function computeOccurredAt(expenseDate: string, expenseTime: string): string {
  const [year, month, day] = expenseDate.split('-').map(Number)
  const [hour, minute] = expenseTime ? expenseTime.split(':').map(Number) : [0, 0]
  return new Date(year, month - 1, day, hour, minute).toISOString()
}

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
  const [expenseDate, setExpenseDate] = useState(defaultDate ?? '')
  const isPastDate = expenseDate !== '' && expenseDate < localToday()
  const [expenseTime, setExpenseTime] = useState(initial?.expenseTime ?? '')
  const [recipient, setRecipient] = useState(initial?.recipient ?? '')
  const [lastCheckedRecipient, setLastCheckedRecipient] = useState(initial?.recipient ?? '')
  const [expenseType, setExpenseType] = useState(initial?.expenseType ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [paymentType, setPaymentType] = useState(initial?.paymentType ?? '')
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
          value={expenseDate}
          onChange={(e) => setExpenseDate(e.target.value)}
          className={inputClassName}
        />
      </div>

      {expenseDate && (
        <input type="hidden" name="occurred_at" value={computeOccurredAt(expenseDate, expenseTime)} />
      )}

      {isPastDate ? (
        <input type="hidden" name="expense_time" value={expenseTime} />
      ) : (
        <div>
          <label htmlFor="expense-time" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Time <span className="font-normal text-zinc-500">(optional — presence signals a planned visit)</span>
          </label>
          <input
            id="expense-time"
            name="expense_time"
            type="time"
            value={expenseTime}
            onChange={(e) => setExpenseTime(e.target.value)}
            className={inputClassName}
          />
        </div>
      )}

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
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={inputClassName}
        />
      </div>

      {amount.trim() !== '' && (
        <div>
          <label htmlFor="expense-payment-type" className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Payment Type
          </label>
          <select
            id="expense-payment-type"
            name="payment_type"
            value={paymentType}
            onChange={(e) => setPaymentType(e.target.value as PaymentType | '')}
            className={inputClassName}
          >
            <option value="">Unpaid</option>
            {PAYMENT_TYPES.map((pt) => (
              <option key={pt} value={pt}>
                {pt.charAt(0).toUpperCase() + pt.slice(1)}
              </option>
            ))}
          </select>
        </div>
      )}

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
