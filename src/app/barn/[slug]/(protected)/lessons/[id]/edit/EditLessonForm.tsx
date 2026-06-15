'use client'

import { useActionState, useState } from 'react'
import type { Horse, LessonDetail, LessonType, Rider } from '@/lib/db/types'
import { DateHourPicker } from '@/app/barn/[slug]/(protected)/lessons/new/DateHourPicker'

function parseInitialDate(lessonAt: string): string {
  return lessonAt.slice(0, 10)
}

function parseInitialHour(lessonAt: string): number {
  return parseInt(lessonAt.slice(11, 13), 10)
}

export function EditLessonForm({
  lesson,
  horses,
  riders,
  instructors,
  currentUserId,
  action,
}: {
  lesson: LessonDetail
  horses: Horse[]
  riders: Rider[]
  instructors: { userId: string; name: string }[]
  currentUserId: string
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}) {
  const [state, formAction, pending] = useActionState(action, { error: null })

  const initialLessonType = lesson.lesson_type
  const initialHorseIds = new Set(
    lesson.lesson_horses.map(lh => lh.horses?.id).filter((id): id is string => Boolean(id))
  )
  const initialExertionMap = new Map(
    lesson.lesson_horses.map(lh => [lh.horses?.id ?? '', lh.exertion_level])
  )
  const initialRiderIds = new Set(
    lesson.lesson_riders.map(lr => lr.riders?.id).filter((id): id is string => Boolean(id))
  )
  const initialRiderId = lesson.lesson_riders[0]?.riders?.id ?? ''

  const [lessonType, setLessonType] = useState<LessonType>(initialLessonType)
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(initialHorseIds)
  const [exertionMap, setExertionMap] = useState<Map<string, number>>(initialExertionMap)
  const [checkedRiderIds, setCheckedRiderIds] = useState<Set<string>>(initialRiderIds)
  const [showDowngradeWarning, setShowDowngradeWarning] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  function handleLessonTypeSwitch(type: LessonType) {
    setLessonType(type)
    setClientError(null)
    if (type === 'normal') {
      setCheckedRiderIds(new Set())
      if (lessonType === 'group') setCheckedHorseIds(new Set())
      if (initialLessonType === 'group') setShowDowngradeWarning(true)
    } else {
      setShowDowngradeWarning(false)
      setCheckedRiderIds(new Set())
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null)
    if (lessonType === 'normal' && checkedHorseIds.size !== 1) {
      e.preventDefault()
      setClientError('normal lesson requires exactly 1 horse')
      return
    }
    if (lessonType === 'group' && checkedRiderIds.size < 2) {
      e.preventDefault()
      setClientError('group lesson requires at least 2 riders')
    }
  }

  const displayError = clientError || state.error

  return (
    <form action={formAction} onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <input type="hidden" name="lesson_type" value={lessonType} />
      <input type="hidden" name="jumping" value={lesson.jumping ? 'true' : 'false'} />
      <input type="hidden" name="tier_name" value={lesson.tier_name} />

      {(showDowngradeWarning || displayError) && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {showDowngradeWarning && !displayError
            ? 'Switching to Normal will remove extra riders and horses. Select one rider and one horse to keep.'
            : displayError}
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

      <div className="flex flex-col gap-1">
        <label htmlFor="instructor_id" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Instructor
        </label>
        <select
          id="instructor_id"
          name="instructor_id"
          required
          defaultValue={lesson.instructor_id ?? currentUserId}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {instructors.map((i) => (
            <option key={i.userId} value={i.userId}>{i.name}</option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Horse <span className="font-normal text-zinc-500">(select at least one)</span>
        </legend>
        {horses.map((h) => (
          <div key={h.id} className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
              <input
                type="checkbox"
                name="horse_id"
                value={h.id}
                checked={checkedHorseIds.has(h.id)}
                onChange={(e) => {
                  setCheckedHorseIds(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(h.id)
                    else next.delete(h.id)
                    return next
                  })
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
                  value={exertionMap.get(h.id) ?? 3}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.set(h.id, Number.isNaN(val) ? 3 : val)
                      return next
                    })
                  }}
                  className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </>
            )}
          </div>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Rider{lessonType === 'group' ? 's' : ''}
          {lessonType === 'group' && (
            <span className="font-normal text-zinc-500"> (select at least 2)</span>
          )}
        </legend>
        {lessonType === 'normal' ? (
          <select
            id="rider_id"
            name="rider_id"
            defaultValue={initialRiderId}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">Select a rider</option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        ) : (
          riders.map((r) => (
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
          ))
        )}
      </fieldset>

      <DateHourPicker
        initialDate={parseInitialDate(lesson.lesson_at)}
        initialHour={parseInitialHour(lesson.lesson_at)}
      />

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
          defaultValue={lesson.fee ?? ''}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="payment_type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Payment type
        </label>
        <select
          id="payment_type"
          name="payment_type"
          defaultValue={lesson.payment_type ?? ''}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          <option value="">Unpaid</option>
          <option value="venmo">Venmo</option>
          <option value="zelle">Zelle</option>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="freshbooks">FreshBooks Invoice</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
      >
        {pending ? 'Saving…' : 'Save'}
      </button>
    </form>
  )
}
