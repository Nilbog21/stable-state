'use client'

import { Button } from '@/components/ui/Button'

export function DeleteLessonButton({ action }: { action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action}>
      <Button
        type="submit"
        variant="danger"
        onClick={(e) => {
          if (!window.confirm('Permanently delete this lesson? This cannot be undone, and unlike Cancel, no cancellation record, fee, or notification is created.')) {
            e.preventDefault()
          }
        }}
      >
        Delete
      </Button>
    </form>
  )
}
