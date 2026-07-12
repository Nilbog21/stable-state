'use client'

import { Button } from '@/components/ui/Button'

export function RemoveMemberButton({
  action,
  name,
}: {
  action: () => Promise<void>
  name: string
}) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        size="sm"
        onClick={(e) => {
          if (!window.confirm(`This cannot be undone. Remove ${name} from the barn?`)) {
            e.preventDefault()
          }
        }}
      >
        Remove
      </Button>
    </form>
  )
}
