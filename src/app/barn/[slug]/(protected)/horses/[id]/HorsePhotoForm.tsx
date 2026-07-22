'use client'

import { useActionState, useState } from 'react'
import { Button } from '@/components/ui/Button'

// Vercel hard-caps request bodies at 4.5 MB at the edge, independent of next.config.ts's bodySizeLimit.
const MAX_FILE_SIZE = 4500000

interface Props {
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  label: string
}

export function HorsePhotoForm({ action, label }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null })
  const [fileError, setFileError] = useState<string | null>(null)

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      {state.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      {fileError && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{fileError}</p>}
      <input
        type="file"
        name="file"
        accept=".jpg,.jpeg,.png"
        required
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file && file.size > MAX_FILE_SIZE) {
            setFileError('File exceeds 4.5 MB limit')
            e.target.value = ''
          } else {
            setFileError(null)
          }
        }}
        className="text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
      />
      <Button type="submit" size="sm" loading={pending}>
        {pending ? 'Uploading…' : label}
      </Button>
    </form>
  )
}
