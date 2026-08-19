'use client'

import { useActionState, useEffect, useState } from 'react'
import type { BarnEvent, Role, ScheduleItem } from '@/lib/db/types'
import { MonthCalendarPicker } from '@/components/calendar/MonthCalendarPicker'
import { StartTimeField } from '@/components/calendar/StartTimeField'
import { browseDayDecorations, getMonthGrid } from '@/lib/month-calendar'
import { addDays, calendarDate } from '@/lib/local-day'
import { barnToday, instantToLocalWallClock } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'rider', label: 'Rider' },
]

type EventFormProps = {
  mode: 'new' | 'edit'
  /** `barns.timezone` — the frame the event's date/time are entered and decoded in (#1222). */
  timezone: string
  initialEvent?: BarnEvent
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  deleteHref?: string
  /** One read per displayed month, feeding both the grid's tint and the day panel's list. */
  getScheduleRange: (fromDate: string, toDate: string) => Promise<ScheduleItem[]>
}

export function EventForm({ mode, timezone, initialEvent, action, deleteHref, getScheduleRange }: EventFormProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  // Decoding a stored instant back to form values is barn-local, same as entering one. `''` on
  // the create form, which makes both slices below empty — the date falls back to the barn's
  // today, and the Start Time field opens empty (#1578).
  const eventWallClock = initialEvent ? instantToLocalWallClock(new Date(initialEvent.event_at.at), timezone) : ''
  const [eventDate, setEventDate] = useState(eventWallClock.slice(0, 10) || String(barnToday(timezone)))
  const [calendarMonth, setCalendarMonth] = useState(eventDate.slice(0, 7))
  const [scheduleItems, setScheduleItems] = useState<ScheduleItem[]>([])
  const [state, formAction] = useActionState(action, { error: null })
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  // The always-open day panel's #1580 duty: a panel that cannot close cannot use closing to
  // avoid outliving its data, so the range is always stretched to reach the selected day as well
  // as the whole 42-cell grid — otherwise paging one month leaves the panel's heading on the
  // selected day above a silently empty body. No exertion widening, unlike `LessonForm`: a barn
  // event has no heatmap to compute, only the flat tint below. `to` is exclusive.
  useEffect(() => {
    const grid = getMonthGrid(calendarMonth)
    const selected = calendarDate(eventDate)
    // ISO dates sort lexicographically, so this is min/max with no branch to cover.
    const from = [grid[0], selected].sort()[0]
    const to = [addDays(grid[41], 1), addDays(selected, 1)].sort()[1]
    let cancelled = false
    getScheduleRange(from, to).then((items) => {
      if (!cancelled) setScheduleItems(items)
    })
    return () => { cancelled = true }
  }, [calendarMonth, eventDate, getScheduleRange])

  // The dashboard's flat "something is on this day" tint, unchanged. `computeDayDecorations` is
  // the wrong model here — its answers are all derived from a form's horse/rider selection, and
  // this form has neither, so it would return a blank grid.
  const dayDecorations = browseDayDecorations(
    getMonthGrid(calendarMonth).map((date) => ({
      date,
      items: scheduleItems.filter((item) => item.start.slice(0, 10) === date),
    }))
  )

  // Appointments and events carry a server-built label; lessons don't. Naming a lesson's horses
  // would cost both event pages a `getHorsesByBarn` purely for a caption, and the signal that
  // matters when placing a barn-wide event is that the slot is busy.
  function describeScheduleItem(scheduleItem: ScheduleItem): string {
    return scheduleItem.label ?? 'Lesson'
  }

  return (
    <div className="w-full max-w-md space-y-6">
      {mode === 'edit' && deleteHref && (
        <Button href={deleteHref} variant="danger" size="sm">
          Delete
        </Button>
      )}

      <form action={formAction} className="space-y-4" onChange={() => setDirty(true)}>
        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}

        <div>
          <label
            htmlFor="event-title"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Title
          </label>
          <input
            id="event-title"
            name="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        {/* A day cell is a `<button>`, so tapping one fires no bubbling `change` for the form's
            own `onChange` to catch — the guard has to be armed here. The Start Time field still
            arms it through the form. */}
        <MonthCalendarPicker
          value={eventDate}
          onChange={(date) => { setEventDate(date); setDirty(true) }}
          month={calendarMonth}
          onMonthChange={setCalendarMonth}
          decorations={dayDecorations}
          items={scheduleItems}
          describeItem={describeScheduleItem}
          label="Date"
          dayPanelAlwaysOpen
          dayPanel={
            <StartTimeField
              timezone={timezone}
              date={eventDate}
              initialTime={eventWallClock.slice(11, 16)}
              id="event-start-time"
              name="event_at"
            />
          }
        />

        <div>
          <label
            htmlFor="event-notes"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Notes
          </label>
          <textarea
            id="event-notes"
            name="notes"
            defaultValue={initialEvent?.notes ?? ''}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <fieldset>
          <legend className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Visible to
          </legend>
          <div className="mt-1 flex gap-4">
            {ROLE_OPTIONS.map((role) => (
              <label
                key={role.value}
                className="flex items-center gap-2 text-sm text-zinc-700 dark:text-zinc-300"
              >
                <input
                  type="checkbox"
                  name="visible_to_roles"
                  value={role.value}
                  defaultChecked={initialEvent ? initialEvent.visible_to_roles.includes(role.value) : true}
                  className="h-4 w-4 rounded border-zinc-300"
                />
                {role.label}
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit">Save</Button>
      </form>
    </div>
  )
}
