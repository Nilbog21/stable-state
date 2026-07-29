import { Card } from '@/components/ui/Card'
import { formatExpenseDate, formatExpenseTime, formatExpenseHorses } from '@/lib/format-expense'
import type { ExpenseWithHorses } from '@/lib/db/types'

/**
 * The trainer's read-only view of an appointment (#1148). Same route as the manager's edit
 * form — a vet or farrier visit is barn business, its cost is not, so the split is a render
 * branch rather than a second route. `notes` is the only field here that isn't already on the
 * dashboard's CalendarAppointmentCard, which is why that card links here at all.
 *
 * Nothing is withheld by this component's own choices: `amount`/`payment_type` come back
 * `null` for a trainer because appointment_costs is manager-only RLS, so there is no figure
 * in scope to leak even if a later edit added a cost line here.
 */
export function AppointmentDetail({ appointment }: { appointment: ExpenseWithHorses }) {
  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
        Appointment
      </h1>
      <Card className="space-y-3 p-4">
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
          {formatExpenseDate(appointment.expense_date)}
          {appointment.expense_time && ` · ${formatExpenseTime(appointment.expense_time)}`}
        </p>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">{appointment.recipient}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{appointment.expense_type}</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatExpenseHorses(appointment)}</p>
        {appointment.notes && (
          <p className="text-sm whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">{appointment.notes}</p>
        )}
      </Card>
    </main>
  )
}
