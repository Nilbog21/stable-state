'use client'

import { useActionState, useState } from 'react'
import type { Horse, LessonDetail, LessonTier, LessonType, Rider } from '@/lib/db/types'
import { DateHourPicker } from './new/DateHourPicker'

const CUSTOM_ID = '__custom__'

function parseInitialDate(lessonAt: string): string {
  return lessonAt.slice(0, 10)
}

function parseInitialHour(lessonAt: string): number {
  return parseInt(lessonAt.slice(11, 13), 10)
}

export function LessonForm({
  mode,
  horses,
  riders,
  isManager,
  action,
  instructors,
  currentUserId,
  tiers,
  initialLesson,
}: {
  mode: 'new' | 'edit'
  horses: Horse[]
  riders: Rider[]
  isManager: boolean
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  instructors: { userId: string; name: string }[]
  currentUserId: string
  tiers: LessonTier[]
  initialLesson?: LessonDetail
}) {
  const defaultTier = tiers.find(t => t.is_default) ?? tiers[0] ?? null

  const initialTierByName =
    mode === 'edit' && initialLesson
      ? tiers.find(t => t.name === initialLesson.tier_name) ?? null
      : null

  const computedInitialSelectedId =
    mode === 'edit'
      ? (initialTierByName?.id ?? CUSTOM_ID)
      : (defaultTier?.id ?? CUSTOM_ID)

  const initialJumping = initialLesson?.jumping ?? false
  const initialLessonType: LessonType = initialLesson?.lesson_type ?? 'normal'

  const initialHorseIds = new Set(
    (initialLesson?.lesson_horses ?? [])
      .map(lh => lh.horses?.id)
      .filter((id): id is string => Boolean(id))
  )

  const initialExertionMap = new Map(
    (initialLesson?.lesson_horses ?? []).map(lh => [lh.horses?.id ?? '', lh.exertion_level])
  )

  const initialRiderIds = new Set(
    (initialLesson?.lesson_riders ?? [])
      .map(lr => lr.riders?.id)
      .filter((id): id is string => Boolean(id))
  )

  const initialNormalRiderId =
    mode === 'edit' ? (initialLesson?.lesson_riders[0]?.riders?.id ?? '') : ''

  const [state, formAction, pending] = useActionState(action, { error: null })
  const [lessonType, setLessonType] = useState<LessonType>(initialLessonType)
  const [checkedHorseIds, setCheckedHorseIds] = useState<Set<string>>(initialHorseIds)
  const [exertionMap, setExertionMap] = useState<Map<string, number>>(initialExertionMap)
  const [checkedRiderIds, setCheckedRiderIds] = useState<Set<string>>(initialRiderIds)
  const [normalRiderId, setNormalRiderId] = useState(initialNormalRiderId)
  const [clientError, setClientError] = useState<string | null>(null)
  const [jumping, setJumping] = useState(initialJumping)
  const [selectedId, setSelectedId] = useState<string>(computedInitialSelectedId)
  const [newHorseName, setNewHorseName] = useState('')
  const [newHorseExertionLevel, setNewHorseExertionLevel] = useState(initialJumping ? 4 : 3)
  const [newRiderName, setNewRiderName] = useState('')
  const [showDowngradeWarning, setShowDowngradeWarning] = useState(false)

  if (tiers.length === 0) {
    return (
      <p role="alert" className="text-sm text-red-600 dark:text-red-400">
        No lesson tiers have been configured. A manager must add at least one tier in Settings before lessons can be created.
      </p>
    )
  }

  const isCustom = selectedId === CUSTOM_ID
  const selectedTier = tiers.find(t => t.id === selectedId) ?? null

  function handleJumpingToggle(e: React.ChangeEvent<HTMLInputElement>) {
    const checked = e.target.checked
    setJumping(checked)
    if (checked) {
      setExertionMap(prev => {
        const next = new Map(prev)
        for (const [id, val] of next) {
          if (val < 4) next.set(id, 4)
        }
        return next
      })
      if (newHorseExertionLevel < 4) setNewHorseExertionLevel(4)
    }
  }

  function handleLessonTypeSwitch(type: LessonType) {
    setLessonType(type)
    setClientError(null)
    if (type === 'normal') {
      setCheckedRiderIds(new Set())
      if (mode === 'edit' && lessonType === 'group') setCheckedHorseIds(new Set())
      if (mode === 'edit' && initialLessonType === 'group') setShowDowngradeWarning(true)
    } else {
      setShowDowngradeWarning(false)
      setCheckedRiderIds(new Set())
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null)
    const hasNewHorse = newHorseName.trim() !== ''
    const hasNewRider = newRiderName.trim() !== ''
    if (hasNewHorse && checkedHorseIds.size > 0) {
      e.preventDefault()
      setClientError('select a horse or add a new one, not both')
      return
    }
    if (lessonType === 'normal' && !hasNewHorse && checkedHorseIds.size !== 1) {
      e.preventDefault()
      setClientError('normal lesson requires exactly 1 horse')
      return
    }
    if (lessonType === 'normal' && normalRiderId === '' && !hasNewRider) {
      e.preventDefault()
      setClientError('a rider is required')
      return
    }
    if (lessonType === 'normal' && normalRiderId !== '' && hasNewRider) {
      e.preventDefault()
      setClientError('select a rider or add a new one, not both')
      return
    }
    if (lessonType === 'group' && !hasNewHorse && checkedHorseIds.size < 1) {
      e.preventDefault()
      setClientError('group lesson requires at least 1 horse')
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
      <input type="hidden" name="jumping" value={jumping ? 'true' : 'false'} />

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

      {isManager ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="instructor_id" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Instructor
          </label>
          <select
            id="instructor_id"
            name="instructor_id"
            required
            defaultValue={initialLesson?.instructor_id ?? currentUserId}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          >
            {instructors.map((i) => (
              <option key={i.userId} value={i.userId}>{i.name}</option>
            ))}
          </select>
        </div>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Instructor</span>
          <input type="hidden" name="instructor_id" value={currentUserId} />
          <span className="text-sm text-zinc-900 dark:text-zinc-50">
            {instructors.find(i => i.userId === currentUserId)?.name ?? currentUserId}
          </span>
        </div>
      )}

      <fieldset className="flex flex-col gap-2 border-0 p-0 m-0">
        <legend className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Horse{' '}
          <span className="font-normal text-zinc-500">(select at least one)</span>
        </legend>
        {[...horses].sort((a, b) => {
          const aAvail = a.is_available === false ? 1 : 0
          const bAvail = b.is_available === false ? 1 : 0
          return aAvail - bAvail
        }).map((h) => {
          const isUnavailable = h.is_available === false
          return (
          <div key={h.id} className="flex items-center gap-3">
            <label className={`flex items-center gap-2 text-sm ${isUnavailable ? 'text-zinc-400 dark:text-zinc-500' : 'text-zinc-900 dark:text-zinc-50'}`}>
              {isUnavailable && checkedHorseIds.has(h.id) && (
                <input type="hidden" name="horse_id" value={h.id} />
              )}
              <input
                type="checkbox"
                name="horse_id"
                value={h.id}
                checked={checkedHorseIds.has(h.id)}
                disabled={isUnavailable}
                onChange={(e) => {
                  setCheckedHorseIds(prev => {
                    const next = new Set(prev)
                    if (e.target.checked) next.add(h.id)
                    else next.delete(h.id)
                    return next
                  })
                  if (e.target.checked) {
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.set(h.id, jumping ? 4 : 3)
                      return next
                    })
                  } else {
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.delete(h.id)
                      return next
                    })
                  }
                }}
                className="rounded border-zinc-300 dark:border-zinc-600"
              />
              {h.name}
              {isUnavailable && h.unavailability_reason && (
                <span className="text-xs text-zinc-400 dark:text-zinc-500">— {h.unavailability_reason}</span>
              )}
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
                  value={exertionMap.get(h.id) as number}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    setExertionMap(prev => {
                      const next = new Map(prev)
                      next.set(h.id, Number.isNaN(val) ? 3 : val)
                      return next
                    })
                  }}
                  required
                  className="w-16 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </>
            )}
          </div>
          )
        })}
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
              value={normalRiderId}
              onChange={e => setNormalRiderId(e.target.value)}
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
                  value={newRiderName}
                  onChange={e => setNewRiderName(e.target.value)}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
                />
              </>
            )}
          </>
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
        initialDate={mode === 'edit' && initialLesson ? parseInitialDate(initialLesson.lesson_at) : undefined}
        initialHour={mode === 'edit' && initialLesson ? parseInitialHour(initialLesson.lesson_at) : undefined}
      />

      <div className="flex flex-col gap-1">
        <label htmlFor="tier_name" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Tier
        </label>
        <select
          id="tier_name"
          value={selectedId}
          onChange={e => setSelectedId(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        >
          {tiers.map(t => (
            <option key={t.id} value={t.id}>
              {t.price != null ? `${t.name} - $${t.price}` : t.name}
            </option>
          ))}
          <option value={CUSTOM_ID}>Custom</option>
        </select>
        <input type="hidden" name="tier_name" value={isCustom ? 'Custom' : selectedTier!.name} />
        {isCustom && <input type="hidden" name="is_custom" value="true" />}
      </div>

      {isCustom ? (
        <div className="flex flex-col gap-1">
          <label htmlFor="fee" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Fee{mode === 'edit' ? ' (optional)' : ''}
          </label>
          <input
            id="fee"
            name="fee"
            type="number"
            min="0"
            step="0.01"
            required={mode === 'new'}
            defaultValue={initialLesson?.fee ?? ''}
            className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </div>
      ) : (
        <input type="hidden" name="fee" value={selectedTier?.price ?? ''} />
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="payment_type" className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Payment type
        </label>
        <select
          id="payment_type"
          name="payment_type"
          defaultValue={initialLesson?.payment_type ?? ''}
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
        {pending
          ? (mode === 'edit' ? 'Saving…' : 'Submitting…')
          : (mode === 'edit' ? 'Save' : 'Submit')}
      </button>
    </form>
  )
}
