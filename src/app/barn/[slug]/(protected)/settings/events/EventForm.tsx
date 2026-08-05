'use client'

import { useActionState, useState } from 'react'
import type { BarnEvent, Role } from '@/lib/db/types'
import { DateHourPicker } from '../../lessons/DateHourPicker'
import { instantToLocalWallClock } from '@/lib/barn-timezone'
import { Button } from '@/components/ui/Button'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'rider', label: 'Rider' },
]

type EventFormProps = {
  mode: 'new' | 'edit'
  /** `barns.timezone` — the frame the event's date/hour are entered and decoded in (#1222). */
  timezone: string
  initialEvent?: BarnEvent
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  deleteHref?: string
}

export function EventForm({ mode, timezone, initialEvent, action, deleteHref }: EventFormProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [eventAt, setEventAt] = useState('')
  // Decoding a stored instant back to form values is barn-local, same as entering one.
  const eventWallClock = initialEvent ? instantToLocalWallClock(new Date(initialEvent.event_at.at), timezone) : ''
  const [state, formAction] = useActionState(action, { error: null })
  // Armed only by bubbled field changes — DateHourPicker's onChange also fires from a
  // mount-time effect, so latching there would flag a pristine edit form as dirty.
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

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

        <DateHourPicker
          timezone={timezone}
          initialDate={mode === 'edit' && initialEvent ? eventWallClock.slice(0, 10) : undefined}
          initialHour={mode === 'edit' && initialEvent ? Number(eventWallClock.slice(11, 13)) : undefined}
          onChange={setEventAt}
        />
        <input type="hidden" name="event_at" value={eventAt} />

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
