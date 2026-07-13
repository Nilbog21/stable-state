'use client'

import { useState } from 'react'
import type { Horse } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'
import { SavedIndicator, useSaveFlash } from '@/components/ui/SavedIndicator'

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
  const { show, flash } = useSaveFlash()

  async function handleSubmit(formData: FormData) {
    await action(formData)
    flash()
  }

  return (
    <form action={handleSubmit} className="flex w-full flex-col gap-5">
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

      <div className="flex min-w-0 flex-col gap-2">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-500">Status</span>
        {/* Raw Tailwind, not <Button>: joined-corner segmented status control
            (aria-pressed group, first:rounded-l-md/last:rounded-r-md) rather than
            standalone variant buttons — forcing it into Button's model would
            break the joined-pill layout. Same reasoning as LessonForm's toggle. */}
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
          <p className="min-w-0 break-words text-sm text-amber-700 dark:text-amber-400">
            Marking this horse inactive will remove it from the roster and lesson scheduling.
          </p>
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

      <div className="flex items-center gap-3">
        <Button type="submit" className="self-start">
          Save
        </Button>
        <SavedIndicator show={show} />
      </div>
    </form>
  )
}
