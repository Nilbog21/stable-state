'use client'

import { Button } from '@/components/ui/Button'

export function StopSeriesButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        onClick={(e) => {
          if (!window.confirm('This will stop future occurrences of this recurring series. Already-created lessons are not affected. Continue?')) {
            e.preventDefault()
          }
        }}
      >
        Stop Recurring Lessons
      </Button>
    </form>
  )
}
