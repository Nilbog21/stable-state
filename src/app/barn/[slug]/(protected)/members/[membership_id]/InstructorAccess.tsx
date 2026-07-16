'use client'

import { Button } from '@/components/ui/Button'

export function InstructorAccess({
  name,
  canInstruct,
  action,
}: {
  name: string
  canInstruct: boolean
  action: () => Promise<void>
}) {
  return (
    <section className="mb-8">
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        Instructor Access
      </h2>
      <form action={action}>
        <p className="mb-2 text-sm text-zinc-700 dark:text-zinc-300">
          {canInstruct ? 'Can be assigned as an instructor.' : 'Cannot be assigned as an instructor.'}
        </p>
        <Button
          type="submit"
          variant={canInstruct ? 'danger' : 'primary'}
          onClick={(e) => {
            if (
              canInstruct &&
              !window.confirm(`Revoke instructor access for ${name}? They will no longer be assignable to future lessons.`)
            ) {
              e.preventDefault()
            }
          }}
        >
          {canInstruct ? 'Revoke Instructor Access' : 'Grant Instructor Access'}
        </Button>
      </form>
    </section>
  )
}
