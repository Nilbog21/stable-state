'use client'

import { useEffect, useRef, useState } from 'react'
import { unstable_rethrow } from 'next/navigation'
import { createOrResumeDemoBarn } from './actions'

export function DemoLoader() {
  const started = useRef(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    createOrResumeDemoBarn().catch((err: unknown) => {
      // redirect() on success rejects this promise with a Next-internal control error
      // rather than a real failure — rethrow it so Next's own redirect handling takes
      // over instead of flashing this component's failure state.
      unstable_rethrow(err)
      setFailed(true)
    })
  }, [])

  if (failed) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white px-6 text-center dark:bg-black">
        <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Couldn&apos;t start the demo</p>
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          Something went wrong setting up your demo barn. Please try again.
        </p>
        {/* Bare-text link — Button's boxy styling doesn't fit here */}
        <a href="/demo" className="text-sm font-medium text-blue-600 hover:underline dark:text-blue-400">
          Try again
        </a>
      </main>
    )
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white dark:bg-black">
      <span
        className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent text-zinc-400"
        aria-hidden
      />
      <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">Explore Stable State</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">Setting up your demo barn…</p>
    </main>
  )
}
