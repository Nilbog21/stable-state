'use client'

// Renders an instant in the viewer's own local timezone (per #935's convention: UI
// always renders local time). Used from Server Components that can't format this
// themselves — the server render (host timezone) and client hydration (browser
// timezone) intentionally differ, hence suppressHydrationWarning, mirroring
// CalendarLessonCard.tsx/CalendarEventCard.tsx's existing pattern.
export function LocalDateTime({ iso, options }: { iso: string; options: Intl.DateTimeFormatOptions }) {
  const formatted = new Intl.DateTimeFormat('en-US', options).format(new Date(iso))
  return <span suppressHydrationWarning>{formatted}</span>
}

// Shared date-only (no time-of-day) options for a viewer-local LocalDateTime — used
// by the finance drill-down/Outstanding pages to render a lesson_at instant's date
// alongside DATE-column rows formatted via formatShortDate.
export const DATE_ONLY_OPTIONS: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' }
