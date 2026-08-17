'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { MonthCalendarPicker } from './MonthCalendarPicker'
import { CalendarDayView } from './CalendarDayView'
import { browseDayDecorations } from '@/lib/month-calendar'
import type { CalendarDate, Role } from '@/lib/db/types'
import type { DayScheduleDisplayItem } from './dayScheduleItems'

/**
 * The dashboard's Month view (#1558) — the third `MonthCalendarPicker` caller, and the only one
 * browsing a month rather than picking a day in one.
 *
 * The two pieces of state are held in deliberately different places:
 *
 * - **The month lives in the URL** (`?view=month&date=`), so paging it is a `router.push` —
 *   a soft navigation that refetches the RSC payload without a full page load. That reuses
 *   page.tsx's already role-scoped read instead of needing a second, rider-inclusive server
 *   action (`getScheduleRangeForBarn` is manager/trainer-only and deliberately skips
 *   `scopeScheduleItemsForRole`), and it keeps a month linkable the way `?date=` already makes
 *   a day linkable.
 * - **The selected day is local state**, because the whole month is already on the client:
 *   opening a day panel is a pure reveal and must not cost a round trip.
 */
export function DashboardMonthCalendar({
  slug,
  month,
  selectedDate,
  days,
  role,
  viewerMembershipId,
}: {
  slug: string
  /** Displayed month, "YYYY-MM" — derived by the page from `?date=`. */
  month: string
  selectedDate: CalendarDate
  /** The whole 42-cell grid, already hydrated and role-scoped by the page. */
  days: { date: CalendarDate; items: DayScheduleDisplayItem[] }[]
  role: Role
  viewerMembershipId?: string
}) {
  const router = useRouter()
  const [selected, setSelected] = useState<string>(selectedDate)

  const itemsByDay = new Map(days.map((day) => [day.date as string, day.items]))

  return (
    <MonthCalendarPicker
      value={selected}
      onChange={setSelected}
      month={month}
      onMonthChange={(nextMonth) => router.push(`/barn/${slug}?view=month&date=${nextMonth}-01`, { scroll: false })}
      decorations={browseDayDecorations(days)}
      renderDayPanel={(date) => (
        <CalendarDayView items={itemsByDay.get(date) ?? []} role={role} slug={slug} viewerMembershipId={viewerMembershipId} />
      )}
    />
  )
}
