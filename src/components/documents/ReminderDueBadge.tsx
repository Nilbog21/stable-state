'use client'
import { Badge } from '@/components/ui/Badge'
import type { CalendarDate } from '@/lib/db/types'

interface Props {
  reminderDate: CalendarDate | null
  /** The barn's own calendar day, from `barnToday` (#1149) — required rather than defaulted to
   *  the viewer's clock, which would put this comparison in the wrong frame for anyone whose
   *  device timezone differs from the barn's. Branded (#1223) so the frame match is the
   *  compiler's problem, not a convention the two call sites have to keep remembering. */
  today: CalendarDate
}

export function ReminderDueBadge({ reminderDate, today }: Props) {
  if (reminderDate === null || reminderDate > today) return null

  return <Badge tone="amber">Reminder Due</Badge>
}
