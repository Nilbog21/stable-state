'use client'

export function DeleteLessonButton({ action }: { action: () => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        if (confirm('Delete this lesson? This cannot be undone.')) action()
      }}
      className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white hover:bg-red-700"
    >
      Delete
    </button>
  )
}
