'use client'

export function DeleteRiderButton({ action }: { action: () => Promise<void> }) {
  return (
    <form action={action}>
      <button
        type="submit"
        onClick={(e) => {
          if (!window.confirm('Remove this rider?')) {
            e.preventDefault()
          }
        }}
        className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
      >
        Delete
      </button>
    </form>
  )
}
