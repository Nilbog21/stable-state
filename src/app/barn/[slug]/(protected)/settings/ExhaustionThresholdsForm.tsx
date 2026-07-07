'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Barn } from '@/lib/db/types'

type ExhaustionThresholdsFormProps = {
  barn: Barn
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

export function ExhaustionThresholdsForm({ barn, action }: ExhaustionThresholdsFormProps) {
  const [state, formAction] = useActionState(action, { error: null })

  return (
    <form action={formAction} className="space-y-4">
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
