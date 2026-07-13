'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/Button'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 px-4 text-center">
      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
        Something went wrong
      </p>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        Please try again, or contact your barn manager if the problem continues.
      </p>
      <Button className="mt-1" onClick={reset}>
        Try again
      </Button>
    </div>
  )
}
