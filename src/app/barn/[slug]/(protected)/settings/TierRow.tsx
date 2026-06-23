'use client'

import { useState } from 'react'
import type { LessonTier } from '@/lib/db/types'
import { DeactivateButton } from './DeactivateButton'

interface TierRowProps {
  tier: LessonTier
  formId: string | undefined
  setDefaultAction: () => Promise<void>
  deactivateAction: () => Promise<void>
  showError?: boolean
}

export function TierRow({ tier, formId, setDefaultAction, deactivateAction, showError }: TierRowProps) {
  const [nameDirty, setNameDirty] = useState(false)

  return (
    <>
      <tr className="border-b border-zinc-100 dark:border-zinc-800">
        <td className="py-3 pr-4 align-top">
          <input
            type="text"
            name="name"
            form={formId}
            defaultValue={tier.name}
            required
            disabled={!tier.is_active}
            onChange={() => setNameDirty(true)}
            className="rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
          {tier.is_default && (
            <span className="ml-2 rounded bg-zinc-900 px-1.5 py-0.5 text-xs font-medium text-white dark:bg-zinc-50 dark:text-zinc-900">
              Default
            </span>
          )}
          {nameDirty && (
            <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
              Renaming will not update past lessons
            </p>
          )}
        </td>
        <td className="py-3 pr-4 align-top">
          <input
            type="number"
            name="price"
            form={formId}
            defaultValue={tier.price ?? ''}
            step="0.01"
            min="0"
            disabled={!tier.is_active}
            className="w-24 rounded border border-zinc-300 px-2 py-1 text-sm disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </td>
        <td className="py-3 pr-4 align-top text-sm">
          {tier.is_active ? (
            <span className="text-zinc-700 dark:text-zinc-300">Active</span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">Inactive</span>
          )}
          {showError && (
            <p className="mt-1 text-xs text-red-600 dark:text-red-400">
              Cannot deactivate the default tier
            </p>
          )}
        </td>
        <td className="py-3 pr-4 align-top">
          {tier.is_active && (
            <button
              type="submit"
              form={formId}
              className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white hover:bg-zinc-700 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Save
            </button>
          )}
        </td>
        <td className="py-3 align-top">
          <div className="flex flex-wrap gap-2">
            {tier.is_active && !tier.is_default && (
              <form action={setDefaultAction}>
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Set default
                </button>
              </form>
            )}
            {tier.is_active && (
              <DeactivateButton action={deactivateAction} />
            )}
          </div>
        </td>
      </tr>
      <tr className="border-b border-zinc-100 dark:border-zinc-800">
        <td colSpan={5} className="pb-3 pr-4">
          <div className="flex flex-wrap gap-4">
            <div className="flex items-center gap-2">
              <label
                htmlFor={`jumping-${tier.id}`}
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Jumping
              </label>
              <select
                id={`jumping-${tier.id}`}
                name="default_jumping"
                form={formId}
                defaultValue={tier.default_jumping === null ? '' : String(tier.default_jumping)}
                disabled={!tier.is_active}
                className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">— no default</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label
                htmlFor={`exertion-${tier.id}`}
                className="text-xs font-medium text-zinc-600 dark:text-zinc-400"
              >
                Exertion
              </label>
              <select
                id={`exertion-${tier.id}`}
                name="default_exertion_level"
                form={formId}
                defaultValue={tier.default_exertion_level === null ? '' : String(tier.default_exertion_level)}
                disabled={!tier.is_active}
                className="rounded border border-zinc-300 px-2 py-1 text-xs disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-50"
              >
                <option value="">— no default</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4</option>
                <option value="5">5</option>
              </select>
            </div>
          </div>
        </td>
      </tr>
    </>
  )
}
