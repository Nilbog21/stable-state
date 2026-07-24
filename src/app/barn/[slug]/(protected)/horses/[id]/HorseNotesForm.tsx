'use client'

import { useActionState, useState } from 'react'
import type { Horse } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'
import { SavedIndicator, useSaveFlash } from '@/components/ui/SavedIndicator'

export function HorseNotesForm({
  horse,
  action,
}: {
  horse: Horse
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}) {
  const [feedNotes, setFeedNotes] = useState(horse.feed_notes ?? '')
  const [medicationNotes, setMedicationNotes] = useState(horse.medication_notes ?? '')
  const { show, flash } = useSaveFlash()
  async function wrappedAction(prevState: { error: string | null }, formData: FormData) {
    const result = await action(prevState, formData)
    if (!result.error) flash()
    return result
  }
  const [state, formAction] = useActionState(wrappedAction, { error: null })

  return (
    <form action={formAction} className="flex w-full flex-col gap-5">
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
