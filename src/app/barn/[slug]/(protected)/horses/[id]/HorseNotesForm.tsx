'use client'

import { useActionState, useState } from 'react'
import type { Horse } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'
import { SavedIndicator, useSaveFlashOn } from '@/components/ui/SavedIndicator'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'

// Module scope so the identity check in the effect below has a stable sentinel to compare against.
const INITIAL_STATE: { error: string | null } = { error: null }

export function HorseNotesForm({
  horse,
  action,
}: {
  horse: Horse
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}) {
  const [feedNotes, setFeedNotes] = useState(horse.feed_notes ?? '')
  const [medicationNotes, setMedicationNotes] = useState(horse.medication_notes ?? '')
  // `action` goes to the hook unwrapped, or the form loses its progressive enhancement (#1396) —
  // so everything that used to run on the action's return path is derived from the returned state
  // instead. The discriminator is referential identity, not value: useActionState hands back the
  // exact object it was seeded with until an action resolves, and every server response
  // deserializes to a fresh one, so `state !== INITIAL_STATE` means a real result landed.
  const [state, formAction] = useActionState(action, INITIAL_STATE)
  const show = useSaveFlashOn(state !== INITIAL_STATE && !state.error ? state : null)
  // Submit clears the flag optimistically (as GuardedForm does) and a returned error re-arms it,
  // because a failed save leaves the fields holding exactly the edits that didn't land.
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty || state.error !== null)

  return (
    <form
      action={formAction}
      className="flex w-full flex-col gap-5"
      onChange={() => setDirty(true)}
      onSubmit={() => setDirty(false)}
    >
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="horse-owner-feed-notes" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Feed Notes
        </label>
        <textarea
          id="horse-owner-feed-notes"
          name="feed_notes"
          value={feedNotes}
          onChange={e => setFeedNotes(e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="horse-owner-medication-notes" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Medication Notes
        </label>
        <textarea
          id="horse-owner-medication-notes"
          name="medication_notes"
          value={medicationNotes}
          onChange={e => setMedicationNotes(e.target.value)}
          rows={3}
          className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" size="sm" className="self-start">
          Save
        </Button>
        <SavedIndicator show={show} />
      </div>
    </form>
  )
}
