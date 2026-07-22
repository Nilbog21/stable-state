'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  action: (state: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  label: string
}

export function HorsePhotoForm({ action, label }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null })

  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      {state.error && <p role="alert" className="text-xs text-red-600 dark:text-red-400">{state.error}</p>}
      <input
        type="file"
        name="file"
        accept=".jpg,.jpeg,.png"
        required
        className="text-sm text-zinc-700 dark:text-zinc-300 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-100 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-900 hover:file:bg-zinc-200 dark:file:bg-zinc-800 dark:file:text-zinc-50 dark:hover:file:bg-zinc-700"
      />
      <Button type="submit" size="sm" loading={pending}>
        {pending ? 'Uploading…' : label}
      </Button>
    </form>
  )
}
