'use client'

import { useState } from 'react'

export function HorseActivationSection({
  isActive,
  action,
}: {
  isActive: boolean
  action: () => Promise<void>
}) {
  const [confirming, setConfirming] = useState(false)

  if (!isActive) {
    return (
      <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Activation</h2>
        <button
          type="button"
          onClick={() => void action()}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Set Active
        </button>
      </section>
    )
  }

  return (
    <section className="mt-8 border-t border-zinc-200 pt-6 dark:border-zinc-800">
      <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-zinc-500">Activation</h2>
      {confirming ? (
        <div className="flex items-center gap-3">
          <p className="text-sm text-zinc-700 dark:text-zinc-300">Mark this horse as inactive?</p>
          <button
            type="button"
            onClick={() => { setConfirming(false); void action() }}
            className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setConfirming(false)}
            className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
        >
          Set Inactive
        </button>
      )}
    </section>
  )
}
