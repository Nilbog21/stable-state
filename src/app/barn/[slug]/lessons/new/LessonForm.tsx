'use client'

import { useActionState } from 'react'
import type { Horse, Rider } from '@/lib/db/types'

export function LessonForm({
  horses,
  riders,
  isManager,
  action,
  instructors,
  currentUserId,
}: {
  horses: Horse[]
  riders: Rider[]
  isManager: boolean
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  instructors: { userId: string; name: string }[]
  currentUserId: string
}) {
  const [state, formAction, pending] = useActionState(action, { error: null })

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {isManager && (
        <div className="flex flex-col gap-1">
          <label htmlFor="instructor_id" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Instructor
          </label>
          <select
            id="instructor_id"
            name="instructor_id"
            required
            defaultValue={currentUserId}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {instructors.map((i) => (
              <option key={i.userId} value={i.userId}>{i.name}</option>
            ))}
          </select>
        </div>
      )}
      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Horse{' '}
          <span className="font-normal text-zinc-500">(select at least one)</span>
        </legend>
        {horses.map((h) => (
          <label key={h.id} className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
            <input
              type="checkbox"
              name="horse_id"
              value={h.id}
              className="rounded border-zinc-300 dark:border-zinc-600"
            />
            {h.name}
          </label>
        ))}
        {isManager && (
          <input
            type="text"
            name="new_horse_name"
            placeholder="Add new horse…"
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        )}
      </fieldset>
      <div className="flex flex-col gap-1">
        <label htmlFor="rider_id" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Rider
        </label>
        <select
          id="rider_id"
          name="rider_id"
          required
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Select a rider</option>
          {riders.map((r) => (
            <option key={r.id} value={r.id}>{r.name}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="lesson_at" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Date &amp; time
        </label>
        <input
          id="lesson_at"
          name="lesson_at"
          type="datetime-local"
          required
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="fee" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Fee (optional)
        </label>
        <input
          id="fee"
          name="fee"
          type="number"
          min="0"
          step="0.01"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? 'Submitting…' : 'Submit'}
      </button>
    </form>
  )
}
