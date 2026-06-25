'use client'

import { useState } from 'react'
import type { Horse } from '@/lib/db/types'

type Status = 'active' | 'unavailable' | 'inactive'

function deriveStatus(horse: Horse): Status {
  if (!horse.is_active) return 'inactive'
  if (!horse.is_available) return 'unavailable'
  return 'active'
}

const PILL_LABELS: { value: Status; label: string }[] = [
  { value: 'active', label: 'Active' },
  { value: 'unavailable', label: 'Unavailable' },
  { value: 'inactive', label: 'Inactive' },
]

export function HorseManagerForm({
  horse,
  action,
}: {
  horse: Horse
  action: (formData: FormData) => Promise<void>
}) {
  const [status, setStatus] = useState<Status>(deriveStatus(horse))
  const [reason, setReason] = useState(horse.unavailability_reason ?? '')

  return (
    <form action={action} className="flex w-full flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="horse-name" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Name
        </label>
        <input
          id="horse-name"
          name="name"
          type="text"
          defaultValue={horse.name}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</span>
        <div className="inline-flex rounded-md border border-zinc-300 dark:border-zinc-600" role="group">
          {PILL_LABELS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
              className={[
                'px-4 py-2 text-sm font-medium first:rounded-l-md last:rounded-r-md focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500 focus-visible:ring-offset-1',
                status === value
                  ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900'
                  : 'bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800',
              ].join(' ')}
            >
              {label}
            </button>
          ))}
        </div>

        {status === 'inactive' && horse.is_active && (
          <div className="flex">
            <p className="flex-1 break-words whitespace-normal text-sm text-amber-700 dark:text-amber-400">
              Marking this horse inactive will remove it from the roster and lesson scheduling.
            </p>
          </div>
        )}
      </div>

      <input type="hidden" name="status" value={status} />

      {status === 'unavailable' && (
        <div className="flex flex-col gap-1">
          <label htmlFor="horse-reason" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Reason
          </label>
          <textarea
            id="horse-reason"
            name="reason"
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={3}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      )}

      <button
        type="submit"
        className="self-start rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save
      </button>
    </form>
  )
}
