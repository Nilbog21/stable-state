'use client'

import { Button } from '@/components/ui/Button'

export function DeactivateButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        size="sm"
        onClick={(e) => {
          if (!window.confirm('This cannot be undone. Deactivate this tier?')) {
            e.preventDefault()
          }
        }}
      >
        Deactivate
      </Button>
    </form>
  )
}
