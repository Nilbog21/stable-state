import { formatExpenseDate, formatExpenseTime, formatExpenseHorses } from '@/lib/format-expense'
import type { ExpenseWithHorses } from '@/lib/db/types'

/**
 * The trainer's read-only view of an appointment (#1148). Same route as the manager's edit
 * form — a vet or farrier visit is barn business, its cost is not, so the split is a render
 * branch rather than a second route. `notes` is the only field here that isn't already on the
 * dashboard's CalendarAppointmentCard, which is why that card links here at all.
 *
 * Laid out as a labeled `<dl>` mirroring `lessons/[id]/page.tsx`, not a `<Card>`: a card is the
 * primitive for a browseable collection of items, and this page is a single item.
 *
 * Nothing is withheld by this component's own choices: `amount`/`payment_type` come back
 * `null` for a trainer because appointment_costs is manager-only RLS, so there is no figure
 * in scope to leak even if a later edit added a cost line here.
 */
export function AppointmentDetail({ appointment }: { appointment: ExpenseWithHorses }) {
  return (
    <main className="flex min-h-screen flex-col items-center gap-6 bg-white p-8 dark:bg-black">
      <div className="w-full max-w-2xl">
        <h1 className="mb-6 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          Appointment
        </h1>
        <dl className="divide-y divide-zinc-200 dark:divide-zinc-800">
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Date &amp; Time</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">
              {formatExpenseDate(appointment.expense_date)}
              {appointment.expense_time && ` · ${formatExpenseTime(appointment.expense_time)}`}
            </dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Recipient</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{appointment.recipient}</dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Type</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{appointment.expense_type}</dd>
          </div>
          <div className="flex flex-col gap-1 py-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Horse(s)</dt>
            <dd className="text-sm text-zinc-900 dark:text-zinc-50">{formatExpenseHorses(appointment)}</dd>
          </div>
          {appointment.notes && (
            <div className="flex flex-col gap-1 py-4">
              <dt className="text-xs font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">Notes</dt>
              <dd className="text-sm whitespace-pre-wrap text-zinc-900 dark:text-zinc-50">{appointment.notes}</dd>
            </div>
          )}
        </dl>
      </div>
    </main>
  )
}
