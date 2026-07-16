'use client'

import { Button } from '@/components/ui/Button'

export function EndAgreementButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        onClick={(e) => {
          if (!window.confirm('This cannot be undone. End this agreement?')) {
            e.preventDefault()
          }
        }}
      >
        End Agreement
      </Button>
    </form>
  )
}
