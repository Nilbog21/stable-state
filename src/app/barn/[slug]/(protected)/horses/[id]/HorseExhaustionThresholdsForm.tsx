'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Barn, Horse } from '@/lib/db/types'

type HorseExhaustionThresholdsFormProps = {
  horse: Horse
  barn: Barn
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

export function HorseExhaustionThresholdsForm({ horse, barn, action }: HorseExhaustionThresholdsFormProps) {
  const [state, formAction] = useActionState(action, { error: null })
  const [useBarnDefaults, setUseBarnDefaults] = useState(
    horse.exhaustion_threshold_moderate === null && horse.exhaustion_threshold_high === null
  )

  const defaultModerate = horse.exhaustion_threshold_moderate ?? barn.exhaustion_threshold_moderate
  const defaultHigh = horse.exhaustion_threshold_high ?? barn.exhaustion_threshold_high

  return (
    <form action={formAction} className="space-y-4">
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}

      <label className="flex items-center gap-2 text-sm text-zinc-900 dark:text-zinc-50">
        <input
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
            id="horse-exhaustion-moderate"
            name="moderate"
            type="number"
            min="0"
            step="1"
            required
            disabled={useBarnDefaults}
            defaultValue={defaultModerate}
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
            id="horse-exhaustion-high"
            name="high"
            type="number"
            min="0"
            step="1"
            required
            disabled={useBarnDefaults}
            defaultValue={defaultHigh}
            className="w-24 rounded border border-zinc-300 px-3 py-2 text-sm dark:border-zinc-600 dark:bg-zinc-900"
          />
        </div>
      </div>

      <Button type="submit">Save</Button>
    </form>
  )
}
