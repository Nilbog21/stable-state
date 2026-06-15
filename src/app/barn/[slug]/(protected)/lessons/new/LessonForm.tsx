'use client'

import { useActionState, useState } from 'react'
import type { Horse, Rider } from '@/lib/db/types'
import { DateHourPicker } from './DateHourPicker'

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
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(new Set())
  const [exertionLevels, setExertionLevels] = useState<Map<string, number>>(new Map())
  const [newHorseName, setNewHorseName] = useState('')
  const [newHorseExertionLevel, setNewHorseExertionLevel] = useState(3)
  const [lessonType, setLessonType] = useState<'normal' | 'group'>('normal')
  const [checkedRiderIds, setCheckedRiderIds] = useState<Set<string>>(new Set())
  const [clientError, setClientError] = useState<string | null>(null)
  const [jumping, setJumping] = useState(false)

  function handleJumpingToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked
    setJumping(checked)
    if (checked) {
      setExertionLevels(prev => {
        const next = new Map(prev)
        for (const [id, val] of next) {
          if (val < 4) next.set(id, 4)
        }
        return next
      })
      if (newHorseExertionLevel < 4) setNewHorseExertionLevel(4)
    }
  }

  function handleLessonTypeSwitch(type: 'normal' | 'group') {
    setLessonType(type)
    setClientError(null)
    setCheckedRiderIds(new Set())
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null)
    if (lessonType === 'group' && checkedRiderIds.size < 2) {
      e.preventDefault()
      setClientError('group lesson requires at least 2 riders')
    }
  }

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="lesson_type" value={lessonType} />
      <input type="hidden" name="jumping" value={jumping ? 'true' : 'false'} />
      {(clientError || state.error) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {clientError || state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => handleLessonTypeSwitch('normal')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${lessonType === 'normal' ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900' : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
        >
          Normal
        </button>
        <button
          type="button"
          onClick={() => handleLessonTypeSwitch('group')}
          className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${lessonType === 'group' ? 'bg-zinc-900 text-white dark:bg-zinc-50 dark:text-zinc-900' : 'border-zinc-200 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300'}`}
        >
          Group
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
        <input
          type="checkbox"
          aria-label="Jumping"
          checked={jumping}
          onChange={handleJumpingToggle}
          className="rounded border-zinc-300 dark:border-zinc-600"
        />
        Jumping
      </label>
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
          <div key={h.id} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              <input
                type="checkbox"
                name="horse_id"
                value={h.id}
                onChange={(e) => {
                  if (e.target.checked) {
                    setCheckedHorseIds(prev => new Set(prev).add(h.id))
                    setExertionLevels(prev => {
                      const next = new Map(prev)
                      next.set(h.id, jumping ? 4 : 3)
                      return next
                    })
                  } else {
                    setCheckedHorseIds(prev => {
                      const next = new Set(prev)
                      next.delete(h.id)
                      return next
                    })
                    setExertionLevels(prev => {
                      const next = new Map(prev)
                      next.delete(h.id)
                      return next
                    })
                  }
                }}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              {h.name}
            </label>
            {checkedHorseIds.has(h.id) && (
              <>
                <label htmlFor={`exertion_${h.id}`} className="text-xs text-zinc-500">Exertion (1–5)</label>
                <input
                  id={`exertion_${h.id}`}
                  type="number"
                  name={`exertion_${h.id}`}
                  aria-label={`Exertion level for ${h.name}`}
                  min="1"
                  max="5"
                  value={exertionLevels.get(h.id) as number}
                  onChange={(e) => {
                    setExertionLevels(prev => {
                      const next = new Map(prev)
                      next.set(h.id, parseInt(e.target.value, 10))
                      return next
                    })
                  }}
                  required
                  className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </>
            )}
          </div>
        ))}
        {isManager && (
          <>
            <label htmlFor="new_horse_name" className="sr-only">Add new horse</label>
            <div className="flex items-center gap-3">
              <input
                id="new_horse_name"
                type="text"
                name="new_horse_name"
                placeholder="Add new horse…"
                value={newHorseName}
                onChange={(e) => setNewHorseName(e.target.value)}
                className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              />
              {newHorseName && (
                <>
                  <label htmlFor="new_horse_exertion_level" className="text-xs text-zinc-500">Exertion (1–5)</label>
                  <input
                    id="new_horse_exertion_level"
                    type="number"
                    name="new_horse_exertion_level"
                    aria-label="Exertion level for new horse"
                    min="1"
                    max="5"
                    value={newHorseExertionLevel}
                    onChange={(e) => setNewHorseExertionLevel(parseInt(e.target.value, 10))}
                    required
                    className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                  />
                </>
              )}
            </div>
          </>
        )}
      </fieldset>
      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Rider{lessonType === 'group' ? 's' : ''}
          {lessonType === 'group' && (
            <span className="font-normal text-zinc-500"> (select at least 2)</span>
          )}
        </legend>
        {lessonType === 'normal' ? (
          <>
            <select
              id="rider_id"
              name="rider_id"
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">Select a rider</option>
              {riders.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {isManager && (
              <>
                <label htmlFor="new_rider_name" className="sr-only">Add new rider</label>
                <input
                  id="new_rider_name"
                  type="text"
                  name="new_rider_name"
                  placeholder="Add new rider…"
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </>
            )}
          </>
        ) : (
          <>
            {riders.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
                <input
                  type="checkbox"
                  name="rider_id"
                  value={r.id}
                  checked={checkedRiderIds.has(r.id)}
                  onChange={(e) => {
                    setCheckedRiderIds(prev => {
                      const next = new Set(prev)
                      if (e.target.checked) next.add(r.id)
                      else next.delete(r.id)
                      return next
                    })
                  }}
                  className="rounded border-zinc-300 dark:border-zinc-600"
                />
                {r.name}
              </label>
            ))}
          </>
        )}
      </fieldset>
      <DateHourPicker />
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
          defaultValue=""
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
