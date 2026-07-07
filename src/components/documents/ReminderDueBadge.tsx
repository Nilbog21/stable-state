'use client'

interface Props {
  reminderDate: string | null
  today?: string
}

// Computed with local getters, not toISOString (UTC), so the cutoff matches
// the viewer's own calendar day rather than the server's — same tradeoff as
// isSameLocalDay in UpcomingLessonCard.
function localToday(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function ReminderDueBadge({ reminderDate, today = localToday() }: Props) {
  if (reminderDate === null || reminderDate > today) return null

  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
      Reminder Due
    </span>
  )
}
