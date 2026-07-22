'use client'

import { useActionState, useState } from 'react'
import type { Barn, Horse } from '@/lib/db/types'
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
  barn,
  action,
}: {
  horse: Horse
  barn: Barn
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}) {
  const [status, setStatus] = useState<Status>(deriveStatus(horse))
  const [reason, setReason] = useState(horse.unavailability_reason ?? '')
  const [registeredName, setRegisteredName] = useState(horse.registered_name ?? '')
  const [feedNotes, setFeedNotes] = useState(horse.feed_notes ?? '')
  const [medicationNotes, setMedicationNotes] = useState(horse.medication_notes ?? '')
  const { show, flash } = useSaveFlash()
  // React 19 resets the DOM's `checked`/`value` properties on uncontrolled form
  // fields to their mount-time value after a successful form action, without
  // re-syncing controlled props (#762 review) — remounting the inputs on every
  // successful save forces React to reapply the real current value.
  const [saveCount, setSaveCount] = useState(0)
  // Sourced from the submitted FormData, not the `horse` prop — Next.js's
  // revalidatePath-driven prop refresh isn't guaranteed to land before this
  // continuation runs, so reading post-save values off `horse` here would
  // remount the inputs with the *previous* save's values (#759 testIssue).
  const [thresholds, setThresholds] = useState({
    moderate: horse.exhaustion_threshold_moderate ?? barn.exhaustion_threshold_moderate,
    high: horse.exhaustion_threshold_high ?? barn.exhaustion_threshold_high,
  })

  async function wrappedAction(prevState: { error: string | null }, formData: FormData) {
    const result = await action(prevState, formData)
    if (!result.error) {
      flash()
      setSaveCount(c => c + 1)
      setThresholds(
        formData.get('use_barn_defaults') === 'true'
          ? { moderate: barn.exhaustion_threshold_moderate, high: barn.exhaustion_threshold_high }
          : { moderate: Number(formData.get('moderate')), high: Number(formData.get('high')) }
      )
    }
    return result
  }

  const [state, formAction] = useActionState(wrappedAction, { error: null })
  const [useBarnDefaults, setUseBarnDefaults] = useState(
    horse.exhaustion_threshold_moderate === null && horse.exhaustion_threshold_high === null
  )

  return (
    <form action={formAction} onReset={(e) => e.preventDefault()} className="flex w-full flex-col gap-5">
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="horse-name" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Barn Name
        </label>
        <input
          id="horse-name"
          name="name"
          type="text"
          defaultValue={horse.name}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="horse-registered-name" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          Registered Name
        </label>
        <input
          id="horse-registered-name"
          name="registered_name"
          type="text"
          value={registeredName}
          onChange={e => setRegisteredName(e.target.value)}
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

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Exhaustion Thresholds
        </h2>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Override this horse&apos;s exhaustion thresholds — useful for horses on light duty. Leave on barn defaults otherwise.
        </p>

        <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
          <input
            key={saveCount}
            type="checkbox"
            name="use_barn_defaults"
            value="true"
            checked={useBarnDefaults}
            onChange={(e) => setUseBarnDefaults(e.target.checked)}
            className="rounded border-zinc-300 dark:border-zinc-600"
          />
          Use barn defaults
        </label>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label
              htmlFor="horse-exhaustion-moderate"
              className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            >
              Moderate threshold
            </label>
            <input
              key={saveCount}
              id="horse-exhaustion-moderate"
              name="moderate"
              type="number"
              min="0"
              step="1"
              required
              disabled={useBarnDefaults}
              defaultValue={thresholds.moderate}
              className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
          <div>
            <label
              htmlFor="horse-exhaustion-high"
              className="mb-1 block text-sm text-zinc-700 dark:text-zinc-300"
            >
              High threshold
            </label>
            <input
              key={saveCount}
              id="horse-exhaustion-high"
              name="high"
              type="number"
              min="0"
              step="1"
              required
              disabled={useBarnDefaults}
              defaultValue={thresholds.high}
              className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          Feed & Medication
        </h2>

        <div className="flex flex-col gap-1">
          <label htmlFor="horse-feed-notes" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Feed Notes
          </label>
          <textarea
            id="horse-feed-notes"
            name="feed_notes"
            value={feedNotes}
            onChange={e => setFeedNotes(e.target.value)}
            rows={3}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="horse-medication-notes" className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Medication Notes
          </label>
          <textarea
            id="horse-medication-notes"
            name="medication_notes"
            value={medicationNotes}
            onChange={e => setMedicationNotes(e.target.value)}
            rows={3}
            className="rounded border border-zinc-300 px-2 py-1 text-sm dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" className="self-start">
          Save
        </Button>
        <SavedIndicator show={show} />
      </div>
    </form>
  )
}
