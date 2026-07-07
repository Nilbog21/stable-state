'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  docId: string
  storagePath: string
  action: (docId: string, storagePath: string) => Promise<{ error: string | null }>
}

export function DeleteDocumentButton({ docId, storagePath, action }: Props) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const result = await action(docId, storagePath)
    if (result.error) {
      setError(result.error)
      return
    }
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit}>
      <button
        type="submit"
        className="rounded border border-red-300 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950"
      >
        Delete
      </button>
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </form>
  )
}
