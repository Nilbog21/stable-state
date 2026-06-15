'use client'

export function DeactivateButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        onClick={(e) => {
          if (!window.confirm('This cannot be undone. Deactivate this tier?')) {
            e.preventDefault()
          }
        }}
        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
      >
        Deactivate
      </button>
    </form>
  )
}
