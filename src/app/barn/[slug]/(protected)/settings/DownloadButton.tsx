'use client'

import { useActionState, useEffect } from 'react'
import { Button } from '@/components/ui/Button'

type DownloadState = { error: string | null; url: string | null }

export function DownloadButton({
  action,
  disabled,
  label,
}: {
  action: (state: DownloadState, formData: FormData) => Promise<DownloadState>
  disabled: boolean
  label: string
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, url: null })

  useEffect(() => {
    if (state.url) window.location.href = state.url
  }, [state.url])

  return (
    <form action={formAction}>
      {state.error && (
        <p role="alert" className="mb-1 text-xs text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      <Button type="submit" loading={pending} disabled={disabled}>
        {label}
      </Button>
    </form>
  )
}
