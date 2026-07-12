'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateCancellationNotesAction } from '@/app/actions/lessons'

export function CancellationNotesField({
  barnSlug,
  lessonId,
  initialNotes,
}: {
  barnSlug: string
  lessonId: string
  initialNotes: string | null
}) {
  const router = useRouter()
  const [notes, setNotes] = useState(initialNotes ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleBlur() {
    if (notes === (initialNotes ?? '')) return
    const result = await updateCancellationNotesAction(lessonId, barnSlug, notes)
    if (result.error) {
      setError(result.error)
      setNotes(initialNotes ?? '')
      return
    }
    setError(null)
    router.refresh()
  }

  return (
    <div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={handleBlur}
        rows={2}
        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
