'use client'

import { useActionState, useEffect, useState } from 'react'
import { getMostCommonExpenseTypeAction, type ExpenseFormState } from '@/app/actions/expenses'
import { MonthCalendarPicker } from '@/components/calendar/MonthCalendarPicker'
import { computeDayDecorations, getMonthGrid } from '@/lib/month-calendar'
import { addDays } from '@/lib/local-day'
import { wallClockToInstant } from '@/lib/barn-timezone'
import { AmPmWarning } from '@/components/AmPmWarning'
import { Button } from '@/components/ui/Button'
import { useUnsavedChangesGuard } from '../NavigationBlocker'
import type { CalendarDate, PaymentType, ScheduleItem } from '@/lib/db/types'

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
  showsOnCalendar?: boolean
}

type ExpenseFormProps = {
  barnSlug: string
  horses: { id: string; name: string }[]
  recentRecipients: string[]
  recentExpenseTypes: string[]
  /** In edit mode, the record's own `expense_date`. Omitted (the new-expense case), the Date
   *  field seeds from `todayStr` — see below. */
  defaultDate?: string
  /** The barn's own calendar day, from `barnToday` (#1149) — required rather than defaulted to
   *  the viewer's clock, which would put this comparison in the wrong frame for anyone whose
   *  device timezone differs from the barn's. #1224 made it the new-expense date default too:
   *  the day being pre-filled is a day of *barn* business, and the alternative it replaced was
   *  the server host's UTC day, which runs ahead of every zone the barn picker offers. */
  todayStr: CalendarDate
  /** The barn's `barns.timezone`. Required, and the frame the entered date and time resolve
   *  in: they mean that wall clock *at the barn*, same as `StartTimeField`'s (#1222). */
  timezone: string
  /** #1020 — supplied, the Date field becomes the same month conflict calendar the lesson form
   *  got in #1019; omitted, it stays a plain `<input type="date">`. Injected rather than called
   *  directly because this is a client component and the DAL is server-only, matching how
   *  `LessonForm` takes the same action. */
  getScheduleRange?: (fromDate: string, toDate: string) => Promise<ScheduleItem[]>
  /** In edit mode, the appointment being edited — it must not conflict with itself. */
  excludeItemId?: string
  initial?: ExpenseFormInitial
  submitLabel?: string
  onSave: (state: ExpenseFormState, fd: FormData) => Promise<ExpenseFormState>
}

const inputClassName =
  'mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50'

// The date and time entered here mean that wall clock *at the barn* (#1222), so they
// resolve through the barn's zone — not the entering user's browser zone, which is what
// `new Date(year, month - 1, day, hour, minute)` used to read here. `occurred_at` drives
// barn-local month bucketing in expense-finances.ts, so a manager in another zone entering
// a late-evening expense on a month boundary was bucketing it into the wrong month. Time
// defaults to midnight when blank.
function computeOccurredAt(expenseDate: string, expenseTime: string, timezone: string): string {
  // Take only hour and minute: the time input produces "HH:MM", but the edit page seeds this
  // from `appointments.expense_time`, a Postgres `time` that arrives as "HH:MM:SS". Appending
  // seconds to that built an Invalid Date and threw out of wallClockToInstant.
  const [hour, minute] = (expenseTime || '00:00').split(':')
  return wallClockToInstant(`${expenseDate}T${hour}:${minute}:00`, timezone).toISOString()
}

export function ExpenseForm({
  barnSlug,
  horses,
  recentRecipients,
  recentExpenseTypes,
  defaultDate,
  todayStr,
  timezone,
  getScheduleRange,
  excludeItemId,
  initial,
  submitLabel = 'Add Expense',
  onSave,
}: ExpenseFormProps) {
  const [state, formAction] = useActionState(onSave, { error: null })
  const [expenseDate, setExpenseDate] = useState(defaultDate ?? todayStr)
  const isPastDate = expenseDate !== '' && expenseDate < todayStr
  const [expenseTime, setExpenseTime] = useState(initial?.expenseTime ?? '')
  const [recipient, setRecipient] = useState(initial?.recipient ?? '')
  const [lastCheckedRecipient, setLastCheckedRecipient] = useState(initial?.recipient ?? '')
  const [expenseType, setExpenseType] = useState(initial?.expenseType ?? '')
  const [amount, setAmount] = useState(initial?.amount != null ? String(initial.amount) : '')
  const [paymentType, setPaymentType] = useState(initial?.paymentType ?? '')
  const [appliesToAllHorses, setAppliesToAllHorses] = useState(initial?.appliesToAllHorses ?? false)
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(new Set(initial?.horseIds ?? []))
  const [showsOnCalendar, setShowsOnCalendar] = useState(initial?.showsOnCalendar ?? false)
  const [typeFlashing, setTypeFlashing] = useState(false)
  const [calendarFlashing, setCalendarFlashing] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState((defaultDate ?? todayStr).slice(0, 7))
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  // One fetch per displayed month, over the grid exactly. LessonForm widens this by 3 days at
  // each end to feed the ±3-day exertion window; there is no heatmap here, so the plain grid is
  // all this calendar reads. `to` is exclusive.
  useEffect(() => {
    if (!getScheduleRange) return
    const grid = getMonthGrid(calendarMonth)
    let cancelled = false
    getScheduleRange(grid[0], addDays(grid[41], 1)).then((items) => {
      if (!cancelled) setScheduleItems(items)
    })
    return () => { cancelled = true }
  }, [calendarMonth, getScheduleRange])

  // No exertion bands: an appointment carries no exertion_level, and the thresholds would cost a
  // second round trip. Empty thresholds make worstBand skip every horse and return null, so
  // `hour` cannot affect the result either — hence the 0.
  const dayDecorations = computeDayDecorations(getMonthGrid(calendarMonth), scheduleItems, {
    selectedHorseIds: [...checkedHorseIds],
    selectedRiderIds: [],
    hour: 0,
    thresholdsByHorseId: {},
    todayStr,
    selectionAppliesToAllHorses: appliesToAllHorses,
    excludeItemId,
  })

  const horseNameById = new Map(horses.map((h) => [h.id, h.name]))

  // Appointments and events carry a server-built label; lessons don't, and this form holds no
  // rider names, so it composes one from the horse names it does have.
  function describeScheduleItem(scheduleItem: ScheduleItem): string {
    if (scheduleItem.label) return scheduleItem.label
    const names = scheduleItem.horseIds
      .map((id) => horseNameById.get(id))
      .filter((name): name is string => name !== undefined)
    return names.length ? `Lesson — ${names.join(', ')}` : 'Lesson'
  }

  // Naming a time is the strongest available signal that this is a visit rather than a bill,
  // so it ticks the calendar box for the manager and flashes it so they see it happen (#1640).
  // Deliberately one-way and once: it fires only on empty → set with the box still off, so
  // clearing the time never unticks and a manual untick survives every later time edit.
  function handleTimeChange(next: string) {
    if (next !== '' && expenseTime === '' && !showsOnCalendar) {
      setShowsOnCalendar(true)
      setCalendarFlashing(true)
      setTimeout(() => setCalendarFlashing(false), 600)
    }
    setExpenseTime(next)
  }

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
    <form action={formAction} className="w-full max-w-md space-y-4" onChange={() => setDirty(true)}>
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

      {/* Above Date, not below it: the calendar's dots are driven by this selection, so a
        * manager who fills the form top-down has an empty grid until they scroll past the date
        * they came here to pick. */}
      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Horses</legend>
        {/* First row of the group it controls, divided off from the horses below: this is not a
          * select-all. Ticking every horse writes N horse_id rows; ticking this writes the
          * applies_to_all_horses flag, so a horse added later is retroactively covered. The
          * divider is what keeps it from reading as one more horse. */}
        <label className="flex items-center gap-2 border-b border-zinc-200 pb-3 text-sm text-zinc-900 dark:border-zinc-700 dark:text-zinc-50">
          <input
            type="checkbox"
            name="applies_to_all_horses"
            value="true"
            checked={appliesToAllHorses}
            onChange={(e) => setAppliesToAllHorses(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          All
        </label>
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

      {getScheduleRange ? (
        <>
          <MonthCalendarPicker
            value={expenseDate}
            onChange={(date) => { setExpenseDate(date); setDirty(true) }}
            month={calendarMonth}
            onMonthChange={setCalendarMonth}
            decorations={dayDecorations}
            items={scheduleItems}
            describeItem={describeScheduleItem}
            label="Date"
          />
          <input type="hidden" name="expense_date" value={expenseDate} />
        </>
      ) : (
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
      )}

      {expenseDate && (
        <input type="hidden" name="occurred_at" value={computeOccurredAt(expenseDate, expenseTime, timezone)} />
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
            onChange={(e) => handleTimeChange(e.target.value)}
            className={inputClassName}
          />
          <AmPmWarning value={expenseTime} />
        </div>
      )}

      {/* Rendered on past dates too, unlike Time above: a past appointment can still be worth
        * a calendar entry, and hiding the control would strand an already-ticked row with no
        * way to untick it. */}
      <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
        <input
          type="checkbox"
          name="shows_on_calendar"
          value="true"
          checked={showsOnCalendar}
          onChange={(e) => setShowsOnCalendar(e.target.checked)}
          className={`rounded border-zinc-300 transition dark:border-zinc-600 ${calendarFlashing ? 'ring-2 ring-blue-400' : ''}`}
        />
        Show on barn calendar
      </label>

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
