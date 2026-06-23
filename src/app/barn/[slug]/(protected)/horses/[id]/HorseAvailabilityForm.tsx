'use client'

import { useState } from 'react'
import type { Horse } from '@/lib/db/types'

export function HorseAvailabilityForm({
  horse,
  action,
}: {
  horse: Horse
  action: (formData: FormData) => Promise<void>
}) {
  const [isAvailable, setIsAvailable] = useState(horse.is_available)

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="is_available" value={isAvailable ? 'true' : 'false'} />

      <label className="flex items-center gap-2 text-sm font-medium text-zinc-900 dark:text-zinc-50">
        <input
          type="checkbox"
          checked={isAvailable}
          onChange={e => setIsAvailable(e.target.checked)}
          className="h-4 w-4 rounded border-zinc-300"
        />
        Available
      </label>

      <div className="flex flex-col gap-1">
        <label htmlFor="reason" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Unavailability Reason
        </label>
        <textarea
          id="reason"
          name="reason"
          defaultValue={horse.unavailability_reason ?? ''}
          disabled={isAvailable}
          rows={3}
          className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <button
        type="submit"
        className="self-start rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        Save
      </button>
    </form>
  )
}
