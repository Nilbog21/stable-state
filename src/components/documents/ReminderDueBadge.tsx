'use client'
import { localToday } from '@/lib/local-day'

interface Props {
  reminderDate: string | null
  today?: string
}

export function ReminderDueBadge({ reminderDate, today = localToday() }: Props) {
  if (reminderDate === null || reminderDate > today) return null

  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Reminder Due
    </span>
  )
}
