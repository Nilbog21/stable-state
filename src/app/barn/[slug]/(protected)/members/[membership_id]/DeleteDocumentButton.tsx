'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'

interface Props {
  // Must be the bound Server Function itself, not a closure wrapping it (#1385): React only emits
  // the pre-hydration `method="POST"` form markup for the former, so a closure here would restore
  // the silent no-op this component was fixed for.
  action: (prevState: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
}

export function DeleteDocumentButton({ action }: Props) {
  const [state, formAction] = useActionState(action, { error: null })

  return (
    <form action={formAction}>
      <Button type="submit" variant="danger" size="sm">
        Delete
      </Button>
      {state.error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  )
}
