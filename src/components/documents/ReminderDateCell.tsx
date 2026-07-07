'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  docId: string
  initialValue: string | null
  action: (docId: string, reminderDate: string | null) => Promise<{ error: string | null }>
}

export function ReminderDateCell({ docId, initialValue, action }: Props) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue ?? '')
  const [error, setError] = useState<string | null>(null)

  async function handleBlur() {
    if (value === (initialValue ?? '')) return
    const result = await action(docId, value || null)
    if (result.error) {
      setError(result.error)
      setValue(initialValue ?? '')
      return
    }
    setError(null)
    router.refresh()
  }

  return (
    <div>
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        className="rounded border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-50"
      />
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  )
}
