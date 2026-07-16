'use client'
import { localToday } from '@/lib/local-day'
import { Badge } from '@/components/ui/Badge'

interface Props {
  reminderDate: string | null
  today?: string
}

// See the tradeoff comment on localToday in @/lib/local-day.
export function ReminderDueBadge({ reminderDate, today = localToday() }: Props) {
  if (reminderDate === null || reminderDate > today) return null

  return <Badge tone="amber">Reminder Due</Badge>
}
