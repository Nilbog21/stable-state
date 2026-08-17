'use client'

import { useActionState } from 'react'
import { Button } from '@/components/ui/Button'

export function RemoveMemberButton({
  action,
  name,
}: {
  // Must be the bound Server Function itself, not a closure wrapping it (#1385): React only emits
  // the pre-hydration `method="POST"` form markup for the former, so a closure here would make
  // Remove a silent no-op in the window before the page hydrates.
  action: (prevState: { error: string | null }, formData: FormData) => Promise<{ error: string | null }>
  name: string
}) {
  const [state, formAction] = useActionState(action, { error: null })

  return (
    // #1549: the action can now refuse — a member who still owns a horse can't be removed until
    // ownership moves. The message is rendered here rather than thrown, because a throw is
    // rethrown during render and `error.tsx` swaps out the whole member page.
    <form action={formAction} className="flex flex-col items-end gap-1">
      <Button
        type="submit"
        variant="danger"
        onClick={(e) => {
          if (!window.confirm(`This cannot be undone. Remove ${name} from the barn and delete any documents associated with them?`)) {
            e.preventDefault()
          }
        }}
      >
        Remove
      </Button>
      {state.error && <p className="max-w-xs text-right text-xs text-red-600 dark:text-red-400">{state.error}</p>}
    </form>
  )
}
