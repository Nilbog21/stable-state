'use client'

import { useActionState, useState } from 'react'
import type { Agreement, AgreementKind } from '@/lib/db/types'
import { Button } from '@/components/ui/Button'
import type { AgreementFormState } from './actions'

type AgreementFormProps = {
  mode: 'new' | 'edit'
  kind: AgreementKind
  onSave: (state: AgreementFormState, fd: FormData) => Promise<AgreementFormState>
  riders?: { id: string; name: string }[]
  horses?: { id: string; name: string; is_available?: boolean; unavailability_reason?: string | null }[]
  defaultStartDate?: string
  defaultBoardFee?: number
  initialAgreement?: Agreement
  riderName?: string
  horseName?: string
}

const cadenceLabel: Record<'one_time' | 'monthly', string> = {
  one_time: 'One time',
  monthly: 'Monthly',
}

export function AgreementForm({
  mode,
  kind,
  onSave,
  riders = [],
  horses = [],
  defaultStartDate,
  defaultBoardFee,
  initialAgreement,
  riderName,
  horseName,
}: AgreementFormProps) {
  const isEdit = mode === 'edit'
  const [state, formAction] = useActionState(onSave, { error: null })
  const [fee, setFee] = useState(() => {
    if (isEdit) return String(initialAgreement?.fee ?? '')
    return kind === 'board' ? String(defaultBoardFee ?? '') : ''
  })
  const sortedHorses = [...horses].sort((a, b) => {
    const aAvail = a.is_available === false ? 1 : 0
    const bAvail = b.is_available === false ? 1 : 0
    return aAvail - bAvail
  })

  return (
    <form action={formAction} className="w-full max-w-md space-y-4">
      {state.error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <div>
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Rider</span>
        {isEdit ? (
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">{riderName}</p>
        ) : (
          <select
            id="agreement-rider"
            name="rider_id"
            required
            defaultValue=""
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled>
              Select rider
            </option>
            {riders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        )}
      </div>

      <div>
        <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">Horse</span>
        {isEdit ? (
          <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">{horseName}</p>
        ) : (
          <select
            id="agreement-horse"
            name="horse_id"
            required
            defaultValue=""
            className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <option value="" disabled>
              Select horse
            </option>
            {sortedHorses.map((h) => {
              const isUnavailable = h.is_available === false
              return (
                <option key={h.id} value={h.id} disabled={isUnavailable}>
                  {h.name}
                  {isUnavailable && h.unavailability_reason ? ` — ${h.unavailability_reason}` : isUnavailable ? ' — Unavailable' : ''}
                </option>
              )
            })}
          </select>
        )}
      </div>

      {kind === 'lease' ? (
        <div>
          <label
            htmlFor="agreement-cadence"
            className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
          >
            Cadence
          </label>
          {isEdit ? (
            <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">
              {initialAgreement ? cadenceLabel[initialAgreement.cadence] : '—'}
            </p>
          ) : (
            <select
              id="agreement-cadence"
              name="cadence"
              defaultValue="monthly"
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="one_time">One time</option>
              <option value="monthly">Monthly</option>
            </select>
          )}
        </div>
      ) : (
        !isEdit && <input type="hidden" name="cadence" value="monthly" />
      )}

      <div>
        {isEdit ? (
          <>
            <span className="block text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Start date
            </span>
            <p className="mt-1 text-sm text-zinc-900 dark:text-zinc-50">{initialAgreement?.start_date ?? '—'}</p>
          </>
        ) : (
          <>
            <label
              htmlFor="agreement-start-date"
              className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
            >
              Start date
            </label>
            <input
              id="agreement-start-date"
              name="start_date"
              type="date"
              defaultValue={defaultStartDate}
              className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </>
        )}
      </div>

      <div>
        <label
          htmlFor="agreement-fee"
          className="block text-sm font-medium text-zinc-700 dark:text-zinc-300"
        >
          Fee
        </label>
        <input
          id="agreement-fee"
          name="fee"
          type="number"
          step="0.01"
          min="0"
          required
          value={fee}
          onChange={(e) => setFee(e.target.value)}
          className="mt-1 block w-full rounded border border-zinc-300 px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
        />
      </div>

      <Button type="submit">
        {isEdit ? 'Save' : `Add ${kind === 'lease' ? 'Lease' : 'Boarding'}`}
      </Button>
    </form>
  )
}
