'use client'

import { useActionState, useState } from 'react'
import type { LessonTier } from '@/lib/db/types'
import { DeactivateButton } from '../DeactivateButton'
import { Button } from '@/components/ui/Button'
import { useUnsavedChangesGuard } from '../../NavigationBlocker'

type TierFormProps = {
  mode: 'new' | 'edit'
  initialTier?: LessonTier
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  onDeactivate?: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  onActivate?: () => Promise<void>
  defaultInstructorCut?: number
}

export function TierForm({
  mode,
  initialTier,
  action,
  onDeactivate,
  onActivate,
  defaultInstructorCut = 0,
}: TierFormProps) {
  const [name, setName] = useState(initialTier?.name ?? '')
  const initialPrice = initialTier?.price != null ? String(initialTier.price) : ''
  const [price, setPrice] = useState(initialPrice)
  const initialInstructorCut = initialTier?.instructor_cut != null ? String(initialTier.instructor_cut) : String(defaultInstructorCut)
  const [instructorCut, setInstructorCut] = useState(initialInstructorCut)
  const [state, formAction] = useActionState(action, { error: null })
  const [deactivateState, deactivateFormAction] = useActionState(onDeactivate ?? action, {
    error: null,
  })
  const isActive = initialTier?.is_active ?? true
  const nameChanged = mode === 'edit' && isActive && name !== (initialTier?.name ?? '')
  const priceChanged =
    mode === 'edit' && isActive && Number(price) !== Number(initialPrice)
  const instructorCutChanged =
    mode === 'edit' && isActive && Number(instructorCut) !== Number(initialInstructorCut)
  const [dirty, setDirty] = useState(false)
  useUnsavedChangesGuard(dirty)

  return (
    <div className="w-full max-w-md space-y-6">
      {mode === 'edit' && (
        <div>
          <div className="flex gap-2">
            {isActive && onDeactivate && <DeactivateButton action={deactivateFormAction} />}
            {!isActive && onActivate && (
              <form action={onActivate}>
                <Button type="submit" variant="secondary" size="sm">
                  Activate
                </Button>
              </form>
            )}
          </div>
          {deactivateState.error && (
            <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
              {deactivateState.error}
            </p>
          )}
        </div>
      )}

      <form action={formAction} className="space-y-4" onChange={() => setDirty(true)}>
        {state.error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {state.error}
          </p>
        )}
        <div>
          <label
            htmlFor="tier-name"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Name
          </label>
          <input
            id="tier-name"
            name="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={!isActive}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {nameChanged && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Renaming will not update past lessons
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="tier-price"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Price
          </label>
          <input
            id="tier-price"
            name="price"
            type="text"
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            disabled={!isActive}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {priceChanged && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Changing the price will not affect past lessons
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="tier-instructor-cut"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Instructor Cut
          </label>
          <input
            id="tier-instructor-cut"
            name="instructor_cut"
            type="text"
            inputMode="decimal"
            value={instructorCut}
            onChange={(e) => setInstructorCut(e.target.value)}
            disabled={!isActive}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {instructorCutChanged && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Changing the instructor cut will not affect past lessons
            </p>
          )}
        </div>

        <div>
          <label
            htmlFor="tier-jumping"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Default jumping
          </label>
          <select
            id="tier-jumping"
            name="default_jumping"
            defaultValue={
              initialTier?.default_jumping == null
                ? ''
                : String(initialTier.default_jumping)
            }
            disabled={!isActive}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">No default</option>
            <option value="true">Yes (jumping)</option>
            <option value="false">No (ground)</option>
          </select>
        </div>

        <div>
          <label
            htmlFor="tier-exertion"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Default exertion
          </label>
          <select
            id="tier-exertion"
            name="default_exertion_level"
            defaultValue={initialTier?.default_exertion_level ?? ''}
            disabled={!isActive}
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="">No default</option>
            <option value="1">1 (Light)</option>
            <option value="2">2</option>
            <option value="3">3 (Moderate)</option>
            <option value="4">4</option>
            <option value="5">5 (Max)</option>
          </select>
        </div>

        {mode === 'edit' && (
          <div className="flex items-center gap-2">
            <input
              id="set-as-default"
              name="set_as_default"
              type="checkbox"
              defaultChecked={initialTier?.is_default ?? false}
              disabled={!isActive}
              className="h-4 w-4 rounded border-zinc-300 disabled:opacity-50"
            />
            <label
              htmlFor="set-as-default"
              className="text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Set as default tier
            </label>
          </div>
        )}

        <Button type="submit" disabled={!isActive}>
          Save
        </Button>
      </form>
    </div>
  )
}
