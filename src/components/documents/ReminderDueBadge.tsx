'use client'
import { Badge } from '@/components/ui/Badge'

interface Props {
  reminderDate: string | null
  /** The barn's own calendar day, from `barnToday` (#1149) — required rather than defaulted to
   *  the viewer's clock, which would put this comparison in the wrong frame for anyone whose
   *  device timezone differs from the barn's. */
  today: string
}

export function ReminderDueBadge({ reminderDate, today }: Props) {
  if (reminderDate === null || reminderDate > today) return null

  return <Badge tone="amber">Reminder Due</Badge>
}
