'use client'

import { Button } from '@/components/ui/Button'

export function DeactivateButton({ action }: { action: (formData: FormData) => void }) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        size="sm"
        onClick={(e) => {
          if (
            !window.confirm(
              'Deactivate this tier? You can reactivate it later from this page.'
            )
          ) {
            e.preventDefault()
          }
        }}
      >
        Deactivate
      </Button>
    </form>
  )
}
