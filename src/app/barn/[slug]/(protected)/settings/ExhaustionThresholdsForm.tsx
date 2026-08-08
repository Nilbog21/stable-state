'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useUnsavedChangesGuard } from '../NavigationBlocker'
import type { Barn } from '@/lib/db/types'

type ExhaustionThresholdsFormProps = {
  barn: Barn
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

export function ExhaustionThresholdsForm({ barn, action }: ExhaustionThresholdsFormProps) {
  // `action` goes to the hook unwrapped, or the form loses its progressive enhancement (#1396) —
  // so the dirty flag is derived from the returned state instead of cleared on the action's
  // return path. Submit clears it optimistically (as GuardedForm does) and a returned error
  // re-arms it, because a failed save leaves the fields holding exactly the edits that didn't
  // land. `pending` spans the gap between the two: onSubmit fires on click, while `state` still
  // reads as the previous result until the action resolves, so without it nothing is armed for
  // the whole round trip — the window #1362 built the guard for.
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty || pending || state.error !== null)

  return (
    <form
      action={formAction}
      className="space-y-4"
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label
            htmlFor="exhaustion-moderate"
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          >
            Moderate threshold
          </label>
          <input
            id="exhaustion-moderate"
            name="moderate"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={barn.exhaustion_threshold_moderate}
            className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <div>
          <label
            htmlFor="exhaustion-high"
            className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
          >
            High threshold
          </label>
          <input
            id="exhaustion-high"
            name="high"
            type="number"
            min="0"
            step="1"
            required
            defaultValue={barn.exhaustion_threshold_high}
            className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
        <Button type="submit">Save</Button>
      </div>
    </form>
  )
}
