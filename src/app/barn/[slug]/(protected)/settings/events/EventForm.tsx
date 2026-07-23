'use client'

import { useActionState, useState } from 'react'
import type { BarnEvent, Role } from '@/lib/db/types'
import { DateHourPicker } from '../../lessons/DateHourPicker'
import { Button } from '@/components/ui/Button'

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: 'manager', label: 'Manager' },
  { value: 'trainer', label: 'Trainer' },
  { value: 'rider', label: 'Rider' },
]

function parseInitialDate(eventAt: string): string {
  const d = new Date(eventAt)
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}

function parseInitialHour(eventAt: string): number {
  return new Date(eventAt).getHours()
}

type EventFormProps = {
  mode: 'new' | 'edit'
  initialEvent?: BarnEvent
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  deleteHref?: string
}

export function EventForm({ mode, initialEvent, action, deleteHref }: EventFormProps) {
  const [title, setTitle] = useState(initialEvent?.title ?? '')
  const [eventAt, setEventAt] = useState('')
  const [state, formAction] = useActionState(action, { error: null })

  return (
    <div className="w-full max-w-md space-y-6">
      {mode === 'edit' && deleteHref && (
        <Button href={deleteHref} variant="danger" size="sm">
          Delete
        </Button>
      )}

      <form action={formAction} className="space-y-4">
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
          initialDate={mode === 'edit' && initialEvent ? parseInitialDate(initialEvent.event_at) : undefined}
          initialHour={mode === 'edit' && initialEvent ? parseInitialHour(initialEvent.event_at) : undefined}
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
